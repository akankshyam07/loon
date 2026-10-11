// Memory (DESIGN.md §3.12), in one local SQLite file (Node's built-in node:sqlite, FTS5 full-text index):
// - facts: what the user explicitly confirmed ("remember that…"). A few pinned facts are the always-on profile;
//   the rest are retrieved per request by BM25 over the request text, boosted by site/app scope, recency and use.
// - episodes: a short local history of what was asked and answered (never on private pages or in Privacy mode),
//   searchable with "what did I look up about…". Older than HISTORY_DAYS is dropped.
// Storing and retrieving never calls a chat model, so memory works even when the model doesn't. With the optional
// embedder (brain/embed.js), facts also carry a vector and recall fuses BM25 with meaning (Reciprocal Rank Fusion).
const crypto = require('crypto');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { cosine, toBytes, fromBytes } = require('./embed');

const CATEGORY_RULES = [
  ['diet', /\b(vegetarian|vegan|pescatarian|allerg|gluten|dairy|lactose|keto|halal|kosher|protein|calorie|diet|eat|nuts?)\b/i],
  ['tone', /\b(tone|formal|casual|emoji|exclamation|write|writing|sign (?:off|emails)|british|american spelling)\b/i],
  ['budget', /\b(budget|spend|cheap|under \$|price|afford)\b/i],
  ['project', /\b(working on|project|repo|codebase|app|thesis|course|class)\b/i],
  ['language', /\b(speak|native|translate|language|spanish|french|german|hindi|chinese|japanese)\b/i],
];

// Which memory categories each task may see even when no words match.
const TASK_CATEGORIES = {
  food: ['diet'],
  writing: ['tone'],
  shopping: ['budget', 'preference'],
  translate: ['language'],
  default: ['preference', 'project', 'language'],
};

// Facts about who the user is go in every prompt, like a tiny profile.
const PROFILE = /\b(my name is|call me|i live in|i work (?:at|as|in)|my pronouns|i study)\b/i;

const STOPWORDS = new Set('the and for are but not you your with this that what which who how why when where can could would should does did have has had was were will from into about there their them they then than just like some more most very also please tell give make show its it’s it\'s i\'m me my our out get got let any all one two'.split(' '));
const HISTORY_DAYS = 90;
const DAY = 24 * 60 * 60 * 1000;
const BUDGET_CHARS = 1200; // memory never crowds out the actual question
// BGE small scores related request/fact pairs ~0.6-0.75 and unrelated ones ~0.4-0.5.
const VECTOR_MIN = 0.58;
const RRF_K = 60; // the usual Reciprocal Rank Fusion constant
const BACKFILL = 32; // facts embedded per request until every old fact has a vector

function categorize(text) {
  return CATEGORY_RULES.find(([, re]) => re.test(text))?.[0] || 'preference';
}

// "Which laptop is cheapest?" → "laptop"* OR "cheapest"*. Prefix match so "peanut" finds "peanuts"; quoted so
// FTS5 syntax characters in user text can't break the query.
function ftsQuery(text) {
  const words = [...new Set((String(text).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter((w) => !STOPWORDS.has(w)))];
  return words.slice(0, 12).map((w) => `"${w}"*`).join(' OR ');
}

// Where a memory or request belongs: the site (without www.) or the app it came from, '' when neither.
function scopeOf(packet = {}) {
  try {
    if (packet.url) return new URL(packet.url).hostname.replace(/^www\./, '');
  } catch { /* not a URL */ }
  return packet.app && packet.app !== 'voice' ? String(packet.app) : '';
}

class Memory {
  // file: path to memory.db. legacyJson: the old memory.json, imported once and renamed.
  // embedder: optional (brain/embed.js); without it memory is BM25 only.
  constructor(file, { legacyJson = null, now = () => Date.now(), embedder = null } = {}) {
    this.now = now;
    this.embedder = embedder;
    this.open(file);
    if (legacyJson) this.importLegacy(legacyJson);
  }

  // Also used by the selftest to swap in a temporary database.
  open(file) {
    this.db?.close();
    this.file = file;
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS facts (
        id TEXT PRIMARY KEY, text TEXT NOT NULL, category TEXT NOT NULL, scope TEXT NOT NULL DEFAULT '',
        pinned INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'user',
        created INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, uses INTEGER NOT NULL DEFAULT 0);
      CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(text, scope, content='facts', content_rowid='rowid', tokenize='porter unicode61');
      CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
        INSERT INTO facts_fts(rowid, text, scope) VALUES (new.rowid, new.text, new.scope); END;
      CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
        INSERT INTO facts_fts(facts_fts, rowid, text, scope) VALUES ('delete', old.rowid, old.text, old.scope); END;
      CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE OF text, scope ON facts BEGIN
        INSERT INTO facts_fts(facts_fts, rowid, text, scope) VALUES ('delete', old.rowid, old.text, old.scope);
        INSERT INTO facts_fts(rowid, text, scope) VALUES (new.rowid, new.text, new.scope); END;
      CREATE TABLE IF NOT EXISTS episodes (
        id INTEGER PRIMARY KEY, at INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, text TEXT NOT NULL, scope TEXT NOT NULL DEFAULT '');
      CREATE VIRTUAL TABLE IF NOT EXISTS episodes_fts USING fts5(title, text, scope, content='episodes', content_rowid='id', tokenize='porter unicode61');
      CREATE TRIGGER IF NOT EXISTS episodes_ai AFTER INSERT ON episodes BEGIN
        INSERT INTO episodes_fts(rowid, title, text, scope) VALUES (new.id, new.title, new.text, new.scope); END;
      CREATE TRIGGER IF NOT EXISTS episodes_ad AFTER DELETE ON episodes BEGIN
        INSERT INTO episodes_fts(episodes_fts, rowid, title, text, scope) VALUES ('delete', old.id, old.title, old.text, old.scope); END;
    `);
    // Databases from before embeddings get the column added in place; NULL means "not embedded yet".
    if (!this.db.prepare('PRAGMA table_info(facts)').all().some((c) => c.name === 'vec')) this.db.exec('ALTER TABLE facts ADD COLUMN vec BLOB');
    this.db.prepare('DELETE FROM episodes WHERE at < ?').run(this.now() - HISTORY_DAYS * DAY);
  }

  // Stores a fact's vector in the background. The text check skips a vector made for text edited since.
  embedFact(id, text) {
    if (!this.embedder?.available()) return Promise.resolve();
    return this.embedder.embed(text).then((vec) => {
      if (vec) this.db.prepare('UPDATE facts SET vec = ? WHERE id = ? AND text = ?').run(toBytes(vec), id, text);
    }).catch(() => {}); // database closed meanwhile: the fact is backfilled next time
  }

  // Called before recall: embeds the request (so recall can use it without waiting) and a few facts that have
  // no vector yet. A no-op without the embedder.
  async warm(query = '') {
    if (!this.embedder?.available()) return;
    if (query) await this.embedder.embed(query);
    const missing = this.db.prepare('SELECT id, text FROM facts WHERE vec IS NULL LIMIT ?').all(BACKFILL);
    for (const f of missing) await this.embedFact(f.id, f.text);
  }

  importLegacy(jsonFile) {
    let entries;
    try {
      entries = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    } catch {
      return;
    }
    for (const e of entries) this.add(e.text, e.source, { created: Date.parse(e.createdAt) || this.now() });
    fs.renameSync(jsonFile, `${jsonFile}.imported`);
  }

  // ---------- facts ----------
  all() {
    return this.db.prepare('SELECT id, text, category, scope, pinned, source, created FROM facts ORDER BY created').all()
      .map((r) => ({ ...r, pinned: Boolean(r.pinned), createdAt: new Date(r.created).toISOString() }));
  }

  add(text, source = 'user', { scope = '', pinned = null, created = this.now() } = {}) {
    const clean = text.trim();
    this.db.prepare('DELETE FROM facts WHERE lower(text) = lower(?)').run(clean);
    const entry = { id: crypto.randomUUID(), text: clean, category: categorize(clean), scope, pinned: pinned ?? PROFILE.test(clean), source };
    this.db.prepare('INSERT INTO facts (id, text, category, scope, pinned, source, created) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(entry.id, entry.text, entry.category, scope, entry.pinned ? 1 : 0, source, created);
    this.embedFact(entry.id, entry.text);
    return entry;
  }

  update(id, text) {
    this.db.prepare('UPDATE facts SET text = ?, category = ?, vec = NULL WHERE id = ?').run(text.trim(), categorize(text), id);
    this.embedFact(id, text.trim());
  }

  pin(id, pinned) {
    this.db.prepare('UPDATE facts SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id);
  }

  remove(id) {
    this.db.prepare('DELETE FROM facts WHERE id = ?').run(id);
  }

  // "forget that I'm vegetarian" → removes facts that share most of those words.
  forget(text) {
    const FILLER = new Set(['that', 'the', 'not', 'any', 'more', 'anymore', 'forget', 'about', 'please', 'this', 'what']);
    const words = [...new Set((text.toLowerCase().match(/[a-z]{3,}/g) || []).filter((w) => !FILLER.has(w)))];
    const removed = this.all().filter((e) => {
      const hits = words.filter((w) => e.text.toLowerCase().includes(w)).length;
      return hits && hits >= Math.ceil(words.length / 2);
    });
    for (const e of removed) this.remove(e.id);
    return removed;
  }

  clear() {
    this.db.exec('DELETE FROM facts');
  }

  // The facts for one request, best first, within BUDGET_CHARS:
  //   1. pinned profile facts, 2. facts that match the request, 3. the task's categories.
  // Matches are BM25 over words, fused by rank (RRF) with vector similarity when the request was embedded (warm()).
  // Ranking boosts: same site/app scope ×2, used in the last week ×1.3; facts unused for 6 months sink.
  recall({ query = '', group = 'default', scope = '', limit = 8 } = {}) {
    const now = this.now();
    const picked = new Map();
    const take = (rows) => { for (const r of rows) if (!picked.has(r.id)) picked.set(r.id, r); };
    take(this.db.prepare('SELECT id, text FROM facts WHERE pinned = 1 ORDER BY created').all());
    const boost = (r, s) => {
      if (scope && r.scope === scope) s *= 2;
      const last = Math.max(r.used, r.created);
      if (now - last < 7 * DAY) s *= 1.3;
      else if (now - last > 180 * DAY) s *= 0.5;
      return s;
    };
    const lists = [];
    const match = ftsQuery(query);
    if (match) {
      const rows = this.db.prepare(`SELECT f.id, f.text, f.scope, f.used, f.created, bm25(facts_fts) AS rank
        FROM facts_fts JOIN facts f ON f.rowid = facts_fts.rowid WHERE facts_fts MATCH ? ORDER BY rank LIMIT 30`).all(match);
      lists.push(rows.map((r) => ({ r, s: boost(r, -r.rank) })).sort((a, b) => b.s - a.s).map((x) => x.r)); // bm25: more negative = better
    }
    const queryVec = query && this.embedder?.cached?.(query);
    if (queryVec) {
      // Scans every embedded fact (~35 ms at 5,000 worst case); add an ANN index if memory grows that big.
      const rows = this.db.prepare('SELECT id, text, scope, used, created, vec FROM facts WHERE vec IS NOT NULL').all()
        .map((r) => ({ r, sim: cosine(queryVec, fromBytes(r.vec)) }))
        .filter((x) => x.sim >= VECTOR_MIN);
      lists.push(rows.map((x) => ({ r: x.r, s: boost(x.r, x.sim) })).sort((a, b) => b.s - a.s).slice(0, 30).map((x) => x.r));
    }
    // Reciprocal Rank Fusion: a fact high in either list ranks high; one with only a single list still counts.
    const fused = new Map();
    for (const list of lists) {
      list.forEach((r, i) => {
        const f = fused.get(r.id) || { r, s: 0 };
        f.s += 1 / (RRF_K + i + 1);
        fused.set(r.id, f);
      });
    }
    take([...fused.values()].sort((a, b) => b.s - a.s).map((f) => f.r));
    const categories = TASK_CATEGORIES[group] || TASK_CATEGORIES.default;
    take(this.db.prepare(`SELECT id, text FROM facts WHERE category IN (${categories.map(() => '?').join(',')}) AND (scope = '' OR scope = ?)
      ORDER BY used DESC, created DESC`).all(...categories, scope));

    const out = [];
    let chars = 0;
    for (const r of picked.values()) {
      if (out.length >= limit || chars + r.text.length > BUDGET_CHARS) break;
      out.push({ id: r.id, text: r.text });
      chars += r.text.length;
    }
    const mark = this.db.prepare('UPDATE facts SET used = ?, uses = uses + 1 WHERE id = ?');
    for (const r of out) mark.run(now, r.id);
    return out;
  }

  forGroup(group, query = '', scope = '') {
    return this.recall({ group, query, scope }).map((r) => r.text);
  }

  // ---------- episodes (history) ----------
  logEpisode({ kind = 'ask', title, text = '', scope = '' }) {
    if (!title) return;
    this.db.prepare('INSERT INTO episodes (at, kind, title, text, scope) VALUES (?, ?, ?, ?, ?)')
      .run(this.now(), kind, String(title).slice(0, 200), String(text).slice(0, 600), scope);
  }

  // Newest first when there's no query; otherwise BM25 with a gentle preference for recent episodes.
  searchEpisodes(query = '', limit = 5) {
    const match = ftsQuery(query);
    if (!match) return this.db.prepare('SELECT at, kind, title, text, scope FROM episodes ORDER BY at DESC LIMIT ?').all(limit);
    const now = this.now();
    return this.db.prepare(`SELECT e.at, e.kind, e.title, e.text, e.scope, bm25(episodes_fts, 3.0, 1.0, 1.0) AS rank
      FROM episodes_fts JOIN episodes e ON e.id = episodes_fts.rowid WHERE episodes_fts MATCH ? ORDER BY rank LIMIT 30`).all(match)
      .map((r) => ({ ...r, score: -r.rank / (1 + (now - r.at) / (30 * DAY)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ rank, score, ...r }) => r);
  }

  historyCount() {
    return this.db.prepare('SELECT count(*) AS n FROM episodes').get().n;
  }

  clearHistory() {
    this.db.exec('DELETE FROM episodes');
  }

  close() {
    this.db.close();
  }
}

module.exports = { Memory, categorize, ftsQuery, scopeOf, TASK_CATEGORIES };
