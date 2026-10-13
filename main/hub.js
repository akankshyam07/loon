// Connected local apps (M6): keeps the user's connectors, their parsed OpenAPI operations (cached briefly), and
// which operation can receive a page ("Send to …"). Only localhost apps; reads run directly, writes need ✓.
const crypto = require('crypto');
const c = require('../brain/connectors');
const mcp = require('../brain/mcp');

const CACHE_MS = 60_000;

class ConnectorHub {
  constructor({ settings, save }) {
    this.settings = settings;
    this.save = save;
    this.cache = new Map(); // id → { at, ops }
    this.senders = new Map(); // id → op id that takes a url
  }

  list() {
    return (this.settings.connectors || []).filter((x) => x.enabled !== false);
  }

  get(id) {
    return (this.settings.connectors || []).find((x) => x.id === id);
  }

  async ops(connector) {
    const hit = this.cache.get(connector.id);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.ops;
    const found = await c.fetchSpec(connector.baseUrl, 2000);
    if (!found) throw new Error(`${connector.name} isn't running (no API at ${connector.baseUrl}).`);
    const ops = c.parseSpec(found.spec);
    this.cache.set(connector.id, { at: Date.now(), ops });
    const sender = c.pageSenders(ops)[0];
    if (sender) this.senders.set(connector.id, sender.id);
    else this.senders.delete(connector.id);
    return ops;
  }

  // Refreshes every connector quietly so "Send to …" chips are ready; apps that aren't running are skipped.
  async refresh() {
    await Promise.all(this.list().map((x) => this.ops(x).catch(() => null)));
  }

  discover(ports) {
    return c.discover(ports);
  }

  add({ name, baseUrl }) {
    if (!c.isLocal(baseUrl)) throw new Error('Only apps on this computer can be connected.');
    const first = name.split(/\s+/)[0].toLowerCase();
    const connector = { id: crypto.randomUUID(), name, aliases: first !== name.toLowerCase() ? [first] : [], baseUrl, enabled: true };
    this.settings.connectors = [...(this.settings.connectors || []).filter((x) => x.baseUrl !== baseUrl), connector];
    this.save();
    this.refresh();
    return connector;
  }

  remove(id) {
    this.settings.connectors = (this.settings.connectors || []).filter((x) => x.id !== id);
    this.cache.delete(id);
    this.senders.delete(id);
    this.save();
  }

  async call(id, opId, values) {
    const connector = this.get(id);
    if (!connector) throw new Error('That app is no longer connected.');
    const op = (await this.ops(connector)).find((o) => o.id === opId);
    if (!op) throw new Error(`${connector.name} no longer has "${opId}".`);
    return c.renderResult(await c.call(connector, op, values));
  }

  // A command for the confirm card / direct run: { action: 'api', connectorId, opId, read, label, fields }.
  static command(connector, op, values = {}) {
    return {
      action: 'api',
      connectorId: connector.id,
      connectorName: connector.name,
      opId: op.id,
      read: op.read,
      label: op.label,
      fields: op.params.map((p) => ({ name: p.name, required: p.required, value: values[p.name] ?? '' })),
    };
  }
}

// MCP servers (DESIGN.md §3.13.2): the user's list in settings.mcpServers, one live client per server (started on first
// use, restarted after a crash), their tools, and per-tool choices (enabled, auto-allow). Environment variables that
// look like secrets are kept in the Keychain-encrypted store (`secrets`, an api-provider KeyStore), never in
// settings.json. Calls run only from actions.execute, which writes the audit log.
const TOOLS_CACHE_MS = 5 * 60_000;
const NAME = /^[\w .-]{1,40}$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
// What a stdio server inherits from Loon: enough to find node/npx/uvx, nothing else from Loon's own environment.
const BASE_ENV = ['HOME', 'USER', 'LOGNAME', 'LANG', 'TMPDIR', 'SHELL'];
const EXTRA_PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';

class McpHub {
  constructor({ settings, save, secrets, createClient = (config) => new mcp.McpClient(config) }) {
    this.settings = settings;
    this.save = save;
    this.secrets = secrets;
    this.createClient = createClient;
    this.clients = new Map(); // server id → McpClient
    this.toolCache = new Map(); // server id → { at, tools }
    this.errors = new Map(); // server id → last error message
  }

  all() {
    return this.settings.mcpServers || [];
  }

  list() {
    return this.all().filter((s) => s.enabled !== false);
  }

  get(id) {
    return this.all().find((s) => s.id === id);
  }

  // Validates what Settings sent. env: { NAME: value }; secret-looking values go to the encrypted store.
  add({ name, transport, command, args, url, env } = {}) {
    const clean = String(name || '').trim();
    if (!NAME.test(clean)) throw new Error('Give the server a short name (letters, numbers, spaces, - . _).');
    const server = { id: crypto.randomUUID(), name: clean, aliases: [], transport: transport === 'http' ? 'http' : 'stdio', enabled: true, tools: {}, env: {}, secretEnv: [] };
    const first = clean.split(/\s+/)[0].toLowerCase();
    if (first !== clean.toLowerCase()) server.aliases.push(first);
    if (server.transport === 'http') server.url = mcp.checkUrl(String(url || '').trim());
    else {
      server.command = String(command || '').trim();
      if (!server.command || /[\n\0]/.test(server.command)) throw new Error('Enter the command that starts the server, like npx or uvx.');
      server.args = (Array.isArray(args) ? args : []).map((a) => String(a)).filter((a) => a && !/[\n\0]/.test(a)).slice(0, 40);
    }
    const secretValues = {};
    for (const [key, value] of Object.entries(env && typeof env === 'object' ? env : {})) {
      if (!ENV_NAME.test(key)) throw new Error(`"${key}" isn't a valid environment variable name.`);
      if (mcp.looksSecret(key, value)) {
        server.secretEnv.push(key);
        secretValues[key] = String(value);
      } else server.env[key] = String(value).slice(0, 2000);
    }
    for (const [key, value] of Object.entries(secretValues)) this.secrets.put(`${server.id}:${key}`, value);
    this.settings.mcpServers = [...this.all(), server];
    this.save();
    return server;
  }

  remove(id) {
    const server = this.get(id);
    if (!server) return;
    this.disconnect(id);
    for (const key of server.secretEnv || []) this.secrets.remove(`${id}:${key}`);
    this.settings.mcpServers = this.all().filter((s) => s.id !== id);
    this.toolCache.delete(id);
    this.errors.delete(id);
    this.save();
  }

  setTool(id, tool, { enabled, autoAllow } = {}) {
    const server = this.get(id);
    if (!server) return;
    const prefs = { ...server.tools?.[tool] };
    if (typeof enabled === 'boolean') prefs.enabled = enabled;
    if (typeof autoAllow === 'boolean') prefs.autoAllow = autoAllow;
    server.tools = { ...server.tools, [tool]: prefs };
    this.save();
  }

  config(server) {
    if (server.transport === 'http') return { transport: 'http', url: server.url };
    const env = { PATH: `${process.env.PATH || ''}:${EXTRA_PATH}` };
    for (const key of BASE_ENV) if (process.env[key]) env[key] = process.env[key];
    Object.assign(env, server.env);
    for (const key of server.secretEnv || []) {
      const value = this.secrets.get(`${server.id}:${key}`);
      if (value != null) env[key] = value;
    }
    return { transport: 'stdio', command: server.command, args: server.args || [], env };
  }

  client(server) {
    let client = this.clients.get(server.id);
    if (!client) {
      client = this.createClient(this.config(server));
      client.on('exit', (reason) => {
        if (this.clients.get(server.id) === client) this.clients.delete(server.id); // next use starts it again
        this.errors.set(server.id, reason);
      });
      this.clients.set(server.id, client);
    }
    return client;
  }

  disconnect(id) {
    this.clients.get(id)?.close();
    this.clients.delete(id);
  }

  // Every tool the server offers (enabled or not), cached for a few minutes.
  async tools(server, { force = false } = {}) {
    const hit = this.toolCache.get(server.id);
    if (hit && !force && Date.now() - hit.at < TOOLS_CACHE_MS) return hit.tools;
    try {
      const tools = await this.client(server).listTools();
      this.toolCache.set(server.id, { at: Date.now(), tools });
      this.errors.delete(server.id);
      return tools;
    } catch (err) {
      this.disconnect(server.id);
      this.errors.set(server.id, err.message);
      throw err;
    }
  }

  // The tools the user left on, from the cache only (no server is started just to look).
  cachedTools(server) {
    return (this.toolCache.get(server.id)?.tools || []).filter((t) => server.tools?.[t.name]?.enabled !== false);
  }

  async enabledTools(server) {
    return (await this.tools(server)).filter((t) => server.tools?.[t.name]?.enabled !== false);
  }

  // → { text, isError }. The tool must still exist and be enabled; arguments come from the (edited) confirm card.
  async call(id, toolName, args, { signal } = {}) {
    const server = this.get(id);
    if (!server || server.enabled === false) throw new Error('That tool server is no longer set up.');
    const tool = (await this.enabledTools(server)).find((t) => t.name === toolName);
    if (!tool) throw new Error(`${server.name} has no enabled tool called "${toolName}".`);
    const result = await this.client(server).callTool(toolName, args, { signal });
    return { text: mcp.renderToolResult(result), isError: Boolean(result?.isError) };
  }

  // A command for the confirm card / direct run. read: may run without ✓ (readOnlyHint or the user's auto-allow).
  static command(server, op, values = {}) {
    return {
      action: 'mcp',
      serverId: server.id,
      serverName: server.name,
      connectorName: server.name, // the bubble's choice buttons title confirm cards with this
      tool: op.id,
      read: op.read,
      label: op.label,
      fields: op.params.map((p) => ({ name: p.name, required: p.required, type: p.type, value: values[p.name] ?? '' })),
    };
  }

  // For Settings: no secret values, only which variables are stored encrypted.
  snapshot() {
    return this.all().map((s) => ({
      id: s.id,
      name: s.name,
      transport: s.transport,
      where: s.transport === 'http' ? s.url : [s.command, ...(s.args || [])].join(' '),
      envNames: [...Object.keys(s.env || {}), ...(s.secretEnv || []).map((k) => `${k} (encrypted)`)],
      running: Boolean(this.clients.get(s.id)?.ready),
      error: this.errors.get(s.id) || '',
      tools: (this.toolCache.get(s.id)?.tools || []).map((t) => ({
        name: t.name,
        description: String(t.description || '').replace(/\s+/g, ' ').slice(0, 160),
        readOnly: t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint !== true,
        enabled: s.tools?.[t.name]?.enabled !== false,
        autoAllow: Boolean(s.tools?.[t.name]?.autoAllow),
      })),
    }));
  }

  closeAll() {
    for (const id of this.clients.keys()) this.disconnect(id);
  }
}

module.exports = { ConnectorHub, McpHub };
