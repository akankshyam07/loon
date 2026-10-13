// MCP client (DESIGN.md §3.13.2): plain JSON-RPC 2.0 over stdio (newline-delimited) or Streamable HTTP, no SDK.
// Loon is only a client: it lists a server's tools and calls them. It offers servers no capabilities (no sampling, no
// roots), answers their ping and refuses every other request. Tools become op-like records so the OpenAPI connector
// routing (brain/connectors.js rank/fill/route) picks them by name and keywords without a model.
// Tool output and descriptions come from outside Loon: they are shown as data and, when a model sees them, wrapped like
// page context (`untrusted`), never as instructions.
const { spawn: realSpawn } = require('child_process');
const { EventEmitter } = require('events');
const { words } = require('./connectors');

const PROTOCOL_VERSION = '2025-06-18';
const CALL_TIMEOUT_MS = 30_000;
const SETUP_TIMEOUT_MS = 15_000;
const MAX_RESULT_CHARS = 4000;

// Streamable HTTP servers: this Mac over http, anything else only over https.
function checkUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error("That isn't a valid URL.");
  }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  if (u.protocol === 'https:' || (u.protocol === 'http:' && local)) return u.toString();
  throw new Error('Only https:// URLs, or http:// on this Mac (localhost), can be added.');
}

// Environment variables that should live in the Keychain-encrypted store rather than settings.json.
const looksSecret = (name, value) => /(key|token|secret|passw|pwd|auth|credential|cookie|session|private|pat)$|^(api|auth)_/i.test(name)
  || /^(sk|pk|rk|ghp|gho|github_pat|xox[abprs])[-_]/.test(String(value)) || /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(String(value));

class McpError extends Error {}

class McpClient extends EventEmitter {
  // transport 'stdio': command, args, env. transport 'http': url, headers.
  constructor({ transport = 'stdio', command, args = [], env = {}, url, headers = {}, spawn = realSpawn, fetch = globalThis.fetch } = {}) {
    super();
    Object.assign(this, { transport, command, args, env, url, headers, spawnImpl: spawn, fetchImpl: fetch });
    this.seq = 0;
    this.pending = new Map(); // id → { resolve, reject, timer, abort }
    this.ready = false;
    this.connecting = null;
    this.child = null;
    this.session = null; // Mcp-Session-Id from a Streamable HTTP server
    this.serverInfo = null;
  }

  connect() {
    if (this.ready) return Promise.resolve();
    this.connecting ??= (async () => {
      if (this.transport === 'stdio') this.startProcess();
      else checkUrl(this.url);
      const init = await this.request('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'Loon', version: '0.1.0' } }, { timeoutMs: SETUP_TIMEOUT_MS });
      this.serverInfo = init?.serverInfo || null;
      this.protocol = init?.protocolVersion || PROTOCOL_VERSION;
      this.notify('notifications/initialized');
      this.ready = true;
    })().catch((err) => {
      this.close();
      throw err;
    }).finally(() => { this.connecting = null; });
    return this.connecting;
  }

  startProcess() {
    if (!this.command) throw new McpError('No command to start.');
    const child = this.spawnImpl(this.command, this.args, { stdio: ['pipe', 'pipe', 'pipe'], env: this.env });
    this.child = child;
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          this.receive(JSON.parse(line));
        } catch { /* not JSON-RPC (a stray log line): ignored */ }
      }
    });
    child.stderr?.resume(); // drained, never logged: servers print tokens there sometimes
    const gone = (reason) => {
      if (this.child !== child) return;
      this.child = null;
      this.ready = false;
      this.failAll(new McpError(reason));
      this.emit('exit', reason);
    };
    child.on('error', (err) => gone(err.code === 'ENOENT' ? `Couldn't start "${this.command}" (not found).` : `The tool server failed to start (${err.message}).`));
    child.on('exit', (code, signal) => gone(`The tool server stopped${signal ? ` (${signal})` : code != null ? ` (exit code ${code})` : ''}.`));
    child.stdin.on('error', () => {}); // EPIPE after a crash: the exit handler reports it
  }

  failAll(err) {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
      this.pending.delete(id);
    }
  }

  receive(message) {
    for (const msg of Array.isArray(message) ? message : [message]) {
      if (msg?.method && msg.id != null) {
        // A request from the server. Loon offers nothing but ping.
        this.send(msg.method === 'ping' ? { jsonrpc: '2.0', id: msg.id, result: {} } : { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Loon does not support this.' } }).catch(() => {});
        continue;
      }
      const p = msg?.id != null && this.pending.get(msg.id);
      if (!p) continue; // notifications (progress, logs, list_changed) and late replies
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new McpError(String(msg.error.message || 'The tool server returned an error.').slice(0, 300)));
      else p.resolve(msg.result);
    }
  }

  async send(msg, signal) {
    if (this.transport === 'stdio') {
      if (!this.child) throw new McpError('The tool server is not running.');
      this.child.stdin.write(`${JSON.stringify(msg)}\n`);
      return;
    }
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      redirect: 'error', // a redirect could leave this Mac or https
      signal,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(this.session && { 'mcp-session-id': this.session }),
        ...(this.protocol && { 'mcp-protocol-version': this.protocol }),
        ...this.headers,
      },
      body: JSON.stringify(msg),
    });
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.session = sid;
    if (msg.id == null || !msg.method) return; // a notification or a reply: 202, no body
    if (!res.ok) throw new McpError(`The tool server answered HTTP ${res.status}.`);
    if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
      let buffer = '';
      for await (const chunk of res.body) {
        buffer += Buffer.from(chunk).toString('utf8');
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop();
        for (const event of events) {
          const data = event.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
          if (data) {
            try {
              this.receive(JSON.parse(data));
            } catch { /* not JSON */ }
          }
        }
        if (!this.pending.has(msg.id)) return;
      }
    } else {
      this.receive(await res.json());
    }
  }

  notify(method, params) {
    this.send({ jsonrpc: '2.0', method, ...(params && { params }) }).catch(() => {});
  }

  // Times out (and tells the server to stop) after timeoutMs; an aborted signal cancels the same way.
  request(method, params, { timeoutMs = CALL_TIMEOUT_MS, signal } = {}) {
    if (signal?.aborted) return Promise.reject(new McpError('Cancelled.'));
    const id = ++this.seq;
    const http = this.transport === 'http' ? new AbortController() : null;
    return new Promise((resolve, reject) => {
      const stop = (reason) => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        clearTimeout(entry.timer);
        http?.abort();
        if (method !== 'initialize') this.notify('notifications/cancelled', { requestId: id, reason });
        reject(new McpError(reason === 'timeout' ? `The tool took longer than ${Math.round(timeoutMs / 1000)} s, so I stopped it.` : 'Cancelled.'));
      };
      const entry = { resolve, reject, timer: setTimeout(() => stop('timeout'), timeoutMs) };
      this.pending.set(id, entry);
      signal?.addEventListener('abort', () => stop('cancelled'), { once: true });
      this.send({ jsonrpc: '2.0', id, method, ...(params && { params }) }, http?.signal).catch((err) => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        clearTimeout(entry.timer);
        reject(err instanceof McpError ? err : new McpError(`Couldn't reach the tool server (${err.message}).`));
      });
    });
  }

  async listTools() {
    await this.connect();
    const tools = [];
    let cursor;
    for (let page = 0; page < 20; page++) {
      const result = await this.request('tools/list', cursor ? { cursor } : {}, { timeoutMs: SETUP_TIMEOUT_MS });
      tools.push(...(result?.tools || []));
      cursor = result?.nextCursor;
      if (!cursor) break;
    }
    return tools.filter((t) => t && typeof t.name === 'string');
  }

  async callTool(name, args = {}, { signal, timeoutMs } = {}) {
    await this.connect();
    return this.request('tools/call', { name, arguments: args }, { signal, timeoutMs });
  }

  close() {
    this.ready = false;
    this.protocol = null;
    this.failAll(new McpError('The tool server was closed.'));
    const child = this.child;
    this.child = null;
    if (child) {
      child.stdin.end();
      child.kill();
    }
    if (this.transport === 'http' && this.session) {
      this.fetchImpl(this.url, { method: 'DELETE', redirect: 'error', headers: { 'mcp-session-id': this.session } }).catch(() => {});
      this.session = null;
    }
  }
}

// Read-only: the server's readOnlyHint, or the user's "auto-allow" for that tool. Everything else asks first.
const isReadOnly = (tool, prefs = {}) => Boolean(prefs.autoAllow || (tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint !== true));

// MCP tools → records connectors.rank/fill/route understand.
function toOps(tools, prefs = {}) {
  return tools.map((t) => {
    const schema = t.inputSchema || {};
    const required = new Set(schema.required || []);
    const label = t.title || t.annotations?.title || t.name.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    const description = String(t.description || '').split(/\s+/).slice(0, 16).join(' ');
    return {
      id: t.name,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      read: isReadOnly(t, prefs[t.name]),
      params: Object.entries(schema.properties || {}).map(([name, p]) => ({ name, in: 'body', required: required.has(name), type: Array.isArray(p?.type) ? p.type[0] : p?.type || 'string', description: String(p?.description || '').slice(0, 200) })),
      keywords: words(`${t.name.replace(/[_-]+/g, ' ')} ${label} ${description}`),
      hints: words(isReadOnly(t, prefs[t.name]) ? 'list show find search view get read' : 'add create save send new update delete remove'),
    };
  });
}

// A tool named outright in the request ("run search_issues for loon"), as a whole word.
function namedTool(request, tools) {
  const lower = String(request || '').toLowerCase();
  return tools.filter((t) => t.name.length > 3 && new RegExp(`(^|[^\\w-])${t.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w-])`).test(lower))
    .sort((a, b) => b.name.length - a.name.length)[0] || null;
}

// Confirm-card strings → the types the tool's schema asks for. Empty optional fields are left out.
function coerceArgs(fields = []) {
  const args = {};
  for (const f of fields) {
    const v = typeof f.value === 'string' ? f.value.trim() : f.value;
    if (v == null || v === '') continue;
    if (f.type === 'integer' || f.type === 'number') {
      const n = Number(v);
      if (Number.isNaN(n)) throw new Error(`${f.name} should be a number.`);
      args[f.name] = n;
    } else if (f.type === 'boolean') args[f.name] = v === true || /^(true|yes|1)$/i.test(String(v));
    else if (f.type === 'object' || f.type === 'array') {
      try {
        args[f.name] = typeof v === 'string' ? JSON.parse(v) : v;
      } catch {
        throw new Error(`${f.name} should be JSON.`);
      }
    } else args[f.name] = String(v);
  }
  return args;
}

// tools/call result → readable markdown (text items; other kinds named), capped.
function renderToolResult(result) {
  const parts = (result?.content || []).map((c) => {
    if (c?.type === 'text') return String(c.text ?? '');
    if (c?.type === 'resource') return c.resource?.text != null ? String(c.resource.text) : `(resource ${c.resource?.uri || ''})`;
    if (c?.type === 'resource_link') return `(link ${c.uri || ''})`;
    return `(${c?.type || 'unknown'} content)`;
  });
  if (!parts.length && result?.structuredContent) parts.push('```\n' + JSON.stringify(result.structuredContent, null, 2) + '\n```');
  const text = parts.join('\n\n').trim() || 'Done.';
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n\n…(cut, ${text.length - MAX_RESULT_CHARS} more characters)` : text;
}

// How a tool's output reaches a model: inside a context block the system prompt says never to obey.
function untrusted(text, server, tool, max = 1000) {
  const clean = String(text || '').replace(/<\/?context[^>]*>/gi, '').slice(0, max);
  const attr = (s) => String(s).replace(/["<>\n]/g, '');
  return `<context source="tool" server="${attr(server)}" tool="${attr(tool)}">\n${clean}\n</context>`;
}

// The local model's fallback pick, grammar-constrained to one of the listed names (or none). Arguments are not left
// to the model: they're filled from the request by code and shown on the confirm card.
function pickSchema(tools) {
  return { type: 'object', properties: { tool: { enum: [...tools.map((t) => t.name), 'none'] } }, required: ['tool'] };
}

function pickPrompt(request, tools) {
  const list = tools.map((t) => `- ${t.name}: ${String(t.description || t.title || '').replace(/\s+/g, ' ').slice(0, 140)}`).join('\n');
  return `Pick the one tool that does what the user asks, or "none" if no tool fits. Reply with JSON only.\n\n${untrusted(list, 'tool list', 'descriptions', 4000)}\n\nUser request: ${request}`;
}

module.exports = { McpClient, McpError, checkUrl, looksSecret, isReadOnly, toOps, namedTool, coerceArgs, renderToolResult, untrusted, pickSchema, pickPrompt, PROTOCOL_VERSION };
