// Memory (DESIGN.md §3.12), in one local SQLite file (Node's built-in node:sqlite, FTS5 full-text index):
// - facts: what the user explicitly confirmed ("remember that…"). A few pinned facts are the always-on profile;
//   the rest are retrieved per request by BM25 over the request text, boosted by site/app scope, recency and use.
// - episodes: a short local history of what was asked and answered (never on private pages or in Privacy mode),
//   searchable with "what did I look up about…". Older than HISTORY_DAYS is dropped.
// Storing and retrieving never calls a chat model, so memory works even when the model doesn't. With the optional
// embedder (brain/embed.js), facts also carry a vector and recall fuses BM25 with meaning (Reciprocal Rank Fusion).
// - nodes/edges: the brain graph (brain/graph.js). Entities found in each fact by plain rules become nodes, facts
//   link to them (fact_nodes), and recall walks 1–2 hops from what the request mentions as a third ranked list.
// - conversations: each bubble thread's turns (for History → Continue), linked to its episodes by `session`.
// - feedback: 👍/👎 per answer with task, tier, difficulty and reply length (answer text only if the user opted in).
const crypto = require('crypto');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { cosine, toBytes, fromBytes } = require('./embed');
const graph = require('./graph');
const { normalizeFact } = require('./personal');

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
const HOP_DECAY = 0.5; // a neighbor counts half as much as the node it was reached from, times its edge strength
const DOMAIN_BOOST = 1.5; // facts from the same area of life as the task or site
const DUPLICATE_MIN = 0.95; // cosine at which two facts say the same thing (consolidation)
const TURN_CHARS = 2000; // per stored answer in a conversation; follow-ups use at most 1,200 of the latest one
const MAX_TURNS = 20;
const MAX_FEEDBACK = 2000;

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
  // projectNames: local project names (brain/projects.js discover) the graph should recognize in facts.
  constructor(file, { legacyJson = null, now = () => Date.now(), embedder = null, projectNames = () => [] } = {}) {
    this.now = now;
    this.embedder = embedder;
    this.projectNames = projectNames;
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
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY, label TEXT NOT NULL, kind TEXT NOT NULL, domain TEXT NOT NULL, subdomain TEXT NOT NULL DEFAULT '',
        created INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, uses INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS edges (
        src TEXT NOT NULL, dst TEXT NOT NULL, relation TEXT NOT NULL, weight REAL NOT NULL DEFAULT 1, created INTEGER NOT NULL,
        PRIMARY KEY (src, dst, relation));
      CREATE INDEX IF NOT EXISTS edges_dst ON edges(dst);
      CREATE TABLE IF NOT EXISTS fact_nodes (
        fact_id TEXT NOT NULL, node_id TEXT NOT NULL, relation TEXT NOT NULL DEFAULT '', PRIMARY KEY (fact_id, node_id));
      CREATE INDEX IF NOT EXISTS fact_nodes_node ON fact_nodes(node_id);
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY, started INTEGER NOT NULL, updated INTEGER NOT NULL, title TEXT NOT NULL, scope TEXT NOT NULL DEFAULT '',
        turns TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY, at INTEGER NOT NULL, vote INTEGER NOT NULL, task TEXT NOT NULL, tier TEXT NOT NULL DEFAULT '',
        difficulty TEXT NOT NULL DEFAULT '', length TEXT NOT NULL DEFAULT '', chars INTEGER NOT NULL DEFAULT 0, answer TEXT NOT NULL DEFAULT '');
    `);
    // Older databases get new columns in place: vec NULL means "not embedded yet", linked 0 "not in the graph yet".
    const columns = this.db.prepare('PRAGMA table_info(facts)').all().map((c) => c.name);
    if (!columns.includes('vec')) this.db.exec('ALTER TABLE facts ADD COLUMN vec BLOB');
    if (!columns.includes('linked')) this.db.exec('ALTER TABLE facts ADD COLUMN linked INTEGER NOT NULL DEFAULT 0');
    const episodeColumns = this.db.prepare('PRAGMA table_info(episodes)').all().map((c) => c.name);
    if (!episodeColumns.includes('session')) this.db.exec("ALTER TABLE episodes ADD COLUMN session TEXT NOT NULL DEFAULT ''");
    this.db.prepare(`INSERT OR IGNORE INTO nodes (id, label, kind, domain, subdomain, created) VALUES (?, 'You', 'person', 'personal', 'you', ?)`).run(graph.ME, this.now());
    this.pruneHistory();
    for (const f of this.db.prepare('SELECT id, text FROM facts WHERE linked = 0').all()) this.linkFact(f.id, f.text);
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
    for (const old of this.db.prepare('SELECT id FROM facts WHERE lower(text) = lower(?)').all(clean)) this.remove(old.id);
    const entry = { id: crypto.randomUUID(), text: clean, category: categorize(clean), scope, pinned: pinned ?? PROFILE.test(clean), source };
    this.db.prepare('INSERT INTO facts (id, text, category, scope, pinned, source, created) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(entry.id, entry.text, entry.category, scope, entry.pinned ? 1 : 0, source, created);
    this.linkFact(entry.id, entry.text);
    this.embedFact(entry.id, entry.text);
    this.onAdd?.(entry); // main.js: the "Loon remembered…" toast, whichever path saved the fact
    return entry;
  }

  update(id, text) {
    this.db.prepare('UPDATE facts SET text = ?, category = ?, vec = NULL WHERE id = ?').run(text.trim(), categorize(text), id);
    this.linkFact(id, text.trim());
    this.embedFact(id, text.trim());
  }

  pin(id, pinned) {
    this.db.prepare('UPDATE facts SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id);
  }

  remove(id) {
    this.unlinkFact(id);
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
    this.db.exec(`DELETE FROM facts; DELETE FROM fact_nodes; DELETE FROM edges; DELETE FROM nodes WHERE id != '${graph.ME}'`);
  }

  // Merges facts that say the same thing (same normalized text, or cosine ≥ 0.95 when both have vectors) within the
  // same scope. The newest wording survives and inherits pin and use counts; nothing else is touched. No model call:
  // only vectors already stored are compared. Returns how many facts were merged away.
  // ponytail: O(n²) vector comparison, fine to a few thousand facts; bucket by FTS terms first if memory grows past that.
  consolidate() {
    const facts = this.db.prepare('SELECT id, text, scope, pinned, created, used, uses, vec FROM facts ORDER BY created DESC, rowid DESC').all()
      .map((f) => ({ ...f, key: normalizeFact(f.text), v: fromBytes(f.vec) }));
    const gone = new Set();
    for (const keep of facts) {
      if (gone.has(keep.id)) continue;
      const dupes = facts.filter((f) => f !== keep && !gone.has(f.id) && f.scope === keep.scope
        && (f.key === keep.key || (keep.v && f.v && cosine(keep.v, f.v) >= DUPLICATE_MIN)));
      if (!dupes.length) continue;
      const all = [keep, ...dupes];
      this.db.prepare('UPDATE facts SET pinned = ?, used = ?, uses = ? WHERE id = ?')
        .run(all.some((f) => f.pinned) ? 1 : 0, Math.max(...all.map((f) => f.used)), all.reduce((n, f) => n + f.uses, 0), keep.id);
      for (const f of dupes) {
        gone.add(f.id);
        this.remove(f.id);
      }
    }
    return gone.size;
  }

  // ---------- graph ----------
  // Puts a fact's entities in the graph: a node each, co-occurrence edges between them ('related', weight = number
  // of facts they share) and typed edges from the user ("works at", "prefers"). Relinking replaces the old links.
  linkFact(id, text) {
    this.unlinkFact(id);
    const now = this.now();
    let projects = [];
    try {
      projects = this.projectNames() || [];
    } catch { /* projects folder unreadable: no project names */ }
    const addNode = this.db.prepare('INSERT INTO nodes (id, label, kind, domain, subdomain, created) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING');
    const link = this.db.prepare('INSERT OR IGNORE INTO fact_nodes (fact_id, node_id, relation) VALUES (?, ?, ?)');
    const bump = this.db.prepare('INSERT INTO edges (src, dst, relation, weight, created) VALUES (?, ?, ?, 1, ?) ON CONFLICT(src, dst, relation) DO UPDATE SET weight = weight + 1');
    const ids = [];
    for (const e of graph.extract(text, { projects }).entities) {
      const nodeId = e.label.toLowerCase();
      if (nodeId === graph.ME || ids.includes(nodeId)) continue;
      addNode.run(nodeId, e.label, e.kind, e.domain, e.subdomain, now);
      link.run(id, nodeId, e.relation || '');
      if (e.relation) bump.run(graph.ME, nodeId, e.relation, now);
      ids.push(nodeId);
    }
    ids.sort();
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) bump.run(ids[i], ids[j], 'related', now);
    this.db.prepare('UPDATE facts SET linked = 1 WHERE id = ?').run(id);
  }

  unlinkFact(id) {
    const rows = this.db.prepare('SELECT node_id, relation FROM fact_nodes WHERE fact_id = ?').all(id);
    if (!rows.length) return;
    const drop = this.db.prepare('UPDATE edges SET weight = weight - 1 WHERE src = ? AND dst = ? AND relation = ?');
    for (const r of rows) if (r.relation) drop.run(graph.ME, r.node_id, r.relation);
    const ids = rows.map((r) => r.node_id).sort();
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) drop.run(ids[i], ids[j], 'related');
    this.db.prepare('DELETE FROM fact_nodes WHERE fact_id = ?').run(id);
    this.db.exec(`DELETE FROM edges WHERE weight <= 0;
      DELETE FROM nodes WHERE id != '${graph.ME}' AND id NOT IN (SELECT node_id FROM fact_nodes)`);
  }

  // Nodes whose label words all appear in the text ("what should I study for Acme" → Acme). Never the user node.
  mentioned(text) {
    const words = new Set(graph.words(text));
    if (!words.size) return [];
    return this.db.prepare('SELECT id, label FROM nodes WHERE id != ?').all(graph.ME).filter((n) => {
      const label = graph.words(n.label);
      return label.length && label.every((w) => words.has(w));
    });
  }

  // Walks up to two hops out from the mentioned nodes (never through the user node, which would link everything)
  // and scores each fact by the nodes it's linked to: 1 per mentioned node, then ×0.5 × edge strength per hop.
  graphFacts(query) {
    const seeds = this.mentioned(query);
    if (!seeds.length) return [];
    const score = new Map(seeds.map((n) => [n.id, 1]));
    const neighbors = this.db.prepare('SELECT src, dst, weight FROM edges WHERE (src = ? OR dst = ?) AND src != ? AND dst != ?');
    let frontier = seeds.map((n) => n.id);
    for (let hop = 0; hop < 2 && frontier.length; hop++) {
      const next = [];
      for (const id of frontier) {
        for (const e of neighbors.all(id, id, graph.ME, graph.ME)) {
          const other = e.src === id ? e.dst : e.src;
          const s = score.get(id) * HOP_DECAY * (e.weight / (e.weight + 1));
          if (s <= (score.get(other) || 0)) continue;
          if (!score.has(other)) next.push(other);
          score.set(other, s);
        }
      }
      frontier = next.slice(0, 50);
    }
    const facts = new Map();
    const linked = this.db.prepare('SELECT f.id, f.text, f.scope, f.used, f.created FROM fact_nodes fn JOIN facts f ON f.id = fn.fact_id WHERE fn.node_id = ?');
    for (const [id, s] of score) {
      for (const r of linked.all(id)) {
        const f = facts.get(r.id) || { ...r, s: 0 };
        f.s += s;
        facts.set(r.id, f);
      }
    }
    const touch = this.db.prepare('UPDATE nodes SET used = ?, uses = uses + 1 WHERE id = ?');
    for (const n of seeds) touch.run(this.now(), n.id);
    return [...facts.values()];
  }

  // For Settings → Loon's brain: the most used nodes (the user node always) and the strongest edges between them.
  graph({ limit = 500, edgeLimit = 1500 } = {}) {
    const nodes = this.db.prepare(`SELECT n.id, n.label, n.kind, n.domain, n.subdomain, n.uses, count(fn.fact_id) AS facts
      FROM nodes n LEFT JOIN fact_nodes fn ON fn.node_id = n.id GROUP BY n.id ORDER BY n.id = ? DESC, n.uses + count(fn.fact_id) DESC LIMIT ?`).all(graph.ME, limit);
    const ids = new Set(nodes.map((n) => n.id));
    const edges = this.db.prepare('SELECT src, dst, relation, weight FROM edges ORDER BY weight DESC').all()
      .filter((e) => ids.has(e.src) && ids.has(e.dst)).slice(0, edgeLimit);
    return { nodes, edges, domains: graph.DOMAINS };
  }

  nodeFacts(nodeId) {
    const node = this.db.prepare('SELECT id, label, kind, domain, subdomain, uses FROM nodes WHERE id = ?').get(nodeId);
    if (!node) return null;
    const facts = nodeId === graph.ME
      ? this.db.prepare(`SELECT DISTINCT f.id, f.text, f.created FROM fact_nodes fn JOIN facts f ON f.id = fn.fact_id WHERE fn.relation != '' ORDER BY f.created`).all()
      : this.db.prepare('SELECT f.id, f.text, fn.relation FROM fact_nodes fn JOIN facts f ON f.id = fn.fact_id WHERE fn.node_id = ? ORDER BY f.created').all(nodeId);
    return { node, facts };
  }

  // Forgets a node and its links. The facts themselves stay (they're deleted one by one); the node comes back only
  // if one of its facts is edited and still mentions it.
  removeNode(nodeId) {
    if (nodeId === graph.ME) return;
    this.db.prepare('DELETE FROM edges WHERE src = ? OR dst = ?').run(nodeId, nodeId);
    this.db.prepare('DELETE FROM fact_nodes WHERE node_id = ?').run(nodeId);
    this.db.prepare('DELETE FROM nodes WHERE id = ?').run(nodeId);
  }

  // "what do you know about Acme": the best matching node with its neighbors and facts, or the facts that mention
  // those words when no node matches. graph.formatAbout turns it into an answer.
  about(text) {
    const want = String(text).toLowerCase().replace(/^(?:the|my)\s+/, '').trim();
    const count = this.db.prepare('SELECT count(*) AS n FROM fact_nodes WHERE node_id = ?');
    const exact = this.db.prepare('SELECT id, label FROM nodes WHERE id = ? AND id != ?').get(want, graph.ME);
    const best = exact || this.mentioned(want).sort((a, b) => count.get(b.id).n - count.get(a.id).n)[0];
    if (!best) {
      const match = ftsQuery(want);
      const facts = match ? this.db.prepare('SELECT f.text FROM facts_fts JOIN facts f ON f.rowid = facts_fts.rowid WHERE facts_fts MATCH ? ORDER BY bm25(facts_fts) LIMIT 8').all(match) : [];
      return { node: null, neighbors: [], facts: facts.map((r) => r.text) };
    }
    this.db.prepare('UPDATE nodes SET used = ?, uses = uses + 1 WHERE id = ?').run(this.now(), best.id);
    const { node, facts } = this.nodeFacts(best.id);
    const neighbors = this.db.prepare(`SELECT n.id, n.label, e.relation FROM edges e JOIN nodes n ON n.id = (CASE WHEN e.src = ? THEN e.dst ELSE e.src END)
      WHERE e.src = ? OR e.dst = ? ORDER BY e.weight DESC LIMIT 9`).all(best.id, best.id, best.id);
    return { node, neighbors, facts: facts.slice(0, 8).map((f) => f.text) };
  }

  // The facts for one request, best first, within BUDGET_CHARS:
  //   1. pinned profile facts, 2. facts that match the request, 3. the task's categories.
  // Matches are BM25 over words, fused by rank (RRF) with vector similarity when the request was embedded (warm()).
  // Ranking boosts: same site/app scope ×2, used in the last week ×1.3; facts unused for 6 months sink.
  // A third ranked list comes from the graph walk (graphFacts); domain (graph.domainForTask) boosts facts from the
  // same area of life ×1.5.
  recall({ query = '', group = 'default', scope = '', domain = '', limit = 8 } = {}) {
    const now = this.now();
    const picked = new Map();
    const take = (rows) => { for (const r of rows) if (!picked.has(r.id)) picked.set(r.id, r); };
    take(this.db.prepare('SELECT id, text FROM facts WHERE pinned = 1 ORDER BY created').all());
    const boost = (r, s) => {
      if (scope && r.scope === scope) s *= 2;
      if (domain && graph.domainOf(r.text) === domain) s *= DOMAIN_BOOST;
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
    const walked = query ? this.graphFacts(query) : [];
    if (walked.length) lists.push(walked.map((r) => ({ r, s: boost(r, r.s) })).sort((a, b) => b.s - a.s).slice(0, 30).map((x) => x.r));
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

  forGroup(group, query = '', scope = '', domain = '') {
    return this.recall({ group, query, scope, domain }).map((r) => r.text);
  }

  // ---------- episodes (history) ----------
  // session: the conversation (bubble thread) this answer belongs to, '' for none.
  logEpisode({ kind = 'ask', title, text = '', scope = '', session = '' }) {
    if (!title) return;
    this.db.prepare('INSERT INTO episodes (at, kind, title, text, scope, session) VALUES (?, ?, ?, ?, ?, ?)')
      .run(this.now(), kind, String(title).slice(0, 200), String(text).slice(0, 600), scope, session);
  }

  pruneHistory() {
    const cutoff = this.now() - HISTORY_DAYS * DAY;
    this.db.prepare('DELETE FROM episodes WHERE at < ?').run(cutoff);
    this.db.prepare('DELETE FROM conversations WHERE updated < ?').run(cutoff);
  }

  // ---------- conversations (History → Continue) ----------
  // One row per bubble thread; turns are [{ question, answer, tier, target }], answers clipped, newest MAX_TURNS kept.
  saveTurn(id, { question, answer, tier = '', target }, { scope = '' } = {}) {
    if (!id || !question || !answer) return;
    const now = this.now();
    const row = this.db.prepare('SELECT turns FROM conversations WHERE id = ?').get(id);
    const turn = { question: String(question).slice(0, 300), answer: String(answer).slice(0, TURN_CHARS), tier, ...(target ? { target } : {}) };
    if (!row) {
      this.db.prepare('INSERT INTO conversations (id, started, updated, title, scope, turns) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, now, now, turn.question.slice(0, 200), scope, JSON.stringify([turn]));
      return;
    }
    const turns = [...JSON.parse(row.turns), turn].slice(-MAX_TURNS);
    this.db.prepare('UPDATE conversations SET updated = ?, turns = ? WHERE id = ?').run(now, JSON.stringify(turns), id);
  }

  // Newest first; with a query, conversations whose answers or questions match (BM25 over episodes, best first).
  conversations({ query = '', limit = 50 } = {}) {
    const summary = (r) => ({ id: r.id, title: r.title, scope: r.scope, started: r.started, updated: r.updated, count: JSON.parse(r.turns).length });
    const match = ftsQuery(query);
    if (!match) return this.db.prepare('SELECT * FROM conversations ORDER BY updated DESC LIMIT ?').all(limit).map(summary);
    const ids = [...new Set(this.db.prepare(`SELECT e.session FROM episodes_fts JOIN episodes e ON e.id = episodes_fts.rowid
      WHERE episodes_fts MATCH ? AND e.session != '' ORDER BY bm25(episodes_fts, 3.0, 1.0, 1.0) LIMIT 200`).all(match).map((r) => r.session))];
    const get = this.db.prepare('SELECT * FROM conversations WHERE id = ?');
    return ids.map((id) => get.get(id)).filter(Boolean).slice(0, limit).map(summary);
  }

  conversation(id) {
    const r = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(String(id));
    return r ? { id: r.id, title: r.title, scope: r.scope, started: r.started, updated: r.updated, turns: JSON.parse(r.turns) } : null;
  }

  deleteConversation(id) {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(String(id));
    this.db.prepare('DELETE FROM episodes WHERE session = ?').run(String(id));
  }

  // ---------- feedback (👍/👎) ----------
  // Metadata only; `answer` is '' unless the user opted in to keeping answer text with their ratings.
  recordFeedback({ vote, task = 'ask', tier = '', difficulty = '', length = '', chars = 0, answer = '' }) {
    this.db.prepare('INSERT INTO feedback (at, vote, task, tier, difficulty, length, chars, answer) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(this.now(), vote > 0 ? 1 : -1, String(task), String(tier), String(difficulty || ''), String(length || ''), Math.max(0, chars | 0), String(answer).slice(0, 2000));
    this.db.prepare('DELETE FROM feedback WHERE id NOT IN (SELECT id FROM feedback ORDER BY id DESC LIMIT ?)').run(MAX_FEEDBACK);
  }

  recentFeedback(limit = 20) {
    return this.db.prepare('SELECT at, vote, task, tier, difficulty, length, chars FROM feedback ORDER BY id DESC LIMIT ?').all(limit);
  }

  // Calibration for the router later: per task (and per tier/difficulty) how often answers got 👍.
  feedbackStats() {
    const rows = this.db.prepare(`SELECT task, tier, difficulty, sum(vote > 0) AS up, sum(vote < 0) AS down FROM feedback GROUP BY task, tier, difficulty`).all();
    const byTask = {};
    for (const r of rows) {
      const t = byTask[r.task] ||= { up: 0, down: 0, cells: [] };
      t.up += r.up;
      t.down += r.down;
      t.cells.push({ tier: r.tier, difficulty: r.difficulty, up: r.up, down: r.down });
    }
    for (const t of Object.values(byTask)) t.acceptance = t.up / (t.up + t.down);
    return byTask;
  }

  clearFeedback() {
    this.db.exec('DELETE FROM feedback');
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
    this.db.exec('DELETE FROM episodes; DELETE FROM conversations');
  }

  close() {
    this.db.close();
  }
}

module.exports = { Memory, categorize, ftsQuery, scopeOf, TASK_CATEGORIES, HISTORY_DAYS };
