// Connected local apps (M6): keeps the user's connectors, their parsed OpenAPI operations (cached briefly), and
// which operation can receive a page ("Send to …"). Only localhost apps; reads run directly, writes need ✓.
const crypto = require('crypto');
const c = require('../brain/connectors');

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

module.exports = { ConnectorHub };
