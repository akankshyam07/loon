// Exact-match response cache (DESIGN.md §2.10, tier T0). No semantic matching: zero false hits.
const crypto = require('crypto');
const fs = require('fs');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

class ResponseCache {
  constructor(file, { maxEntries = 500, ttlMs = WEEK_MS } = {}) {
    this.file = file;
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.entries = new Map(); // insertion order doubles as LRU order
    try {
      for (const [key, value] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) this.entries.set(key, value);
    } catch {
      // missing or corrupt cache file: start empty
    }
  }

  static key(...parts) {
    return crypto.createHash('sha256').update(parts.join('\u0000')).digest('hex');
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (Date.now() - entry.savedAt > this.ttlMs) {
      this.entries.delete(key);
      this.scheduleSave();
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    this.entries.delete(key);
    this.entries.set(key, { value, savedAt: Date.now() });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
    this.scheduleSave();
  }

  clear() {
    this.entries.clear();
    this.scheduleSave();
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 1000);
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    fs.writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.entries)));
  }
}

module.exports = { ResponseCache };
