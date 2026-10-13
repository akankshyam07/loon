// Memory as a folder you can open (DESIGN.md §3.12.4): a readable, Obsidian-compatible Markdown copy of the facts in
// memory.db, in ~/Documents/Loon/Memory by default. SQLite stays the source of truth; the folder follows it, and edits
// the user makes in the files flow back on the next sync (launch, file change, or any memory change).
//
// Layout: "About me.md" (pinned facts), one file per category ("Preferences.md", "Food.md"…), and People/<name>.md and
// Projects/<name>.md for graph nodes, each holding the facts about that person or project with [[wikilinks]] to
// related nodes. Every fact is one list line ending in its Obsidian block id ("- I'm vegetarian ^<fact id>") and lives
// in exactly one file, so an edit has one meaning.
//
// Sync rules, conservative on purpose (never lose what the user wrote):
// - edited line, Loon's copy unchanged since the last write → the fact takes the file's text
// - edited line, Loon's copy changed too → both kept (the file's text becomes a new fact) and listed in "Needs a look.md"
// - deleted line, Loon's copy unchanged → the fact is removed; changed in Loon meanwhile → kept
// - new line (no id) → a new fact with source 'file', unpinned (pinned when written in "About me.md")
// - a line moved into or out of "About me.md" pins or unpins it; other moves are undone (facts are filed by topic)
// - every file gone at once (folder moved or deleted) → nothing is deleted, the folder is written again
// .loon-state.json remembers what Loon last wrote (hashes and texts), which is how a user edit is told apart.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ABOUT = 'About me.md';
const README = 'README.md';
const REVIEW = 'Needs a look.md';
const STATE = '.loon-state.json';
const CATEGORY_FILES = {
  preference: 'Preferences.md',
  diet: 'Food.md',
  tone: 'Writing.md',
  budget: 'Shopping.md',
  project: 'Work and projects.md',
  language: 'Languages.md',
};
const NODE_FOLDERS = { person: 'People', project: 'Projects' };
const INTRO = {
  about: 'Loon keeps these in mind for every answer. One memory per line. Edit, add or delete lines and Loon follows.',
  category: 'One memory per line. Edit, add or delete lines and Loon follows.',
  node: 'What Loon remembers about this. One memory per line. Edit, add or delete lines and Loon follows.',
};
const MAX_LINE = 500;
const DEBOUNCE_MS = 700;

const norm = (text) => String(text || '').replace(/\s+/g, ' ').trim();
const hash = (text) => crypto.createHash('sha1').update(text).digest('hex');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fileSafe = (label) => label.replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
const unlink = (text) => text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1');

// Turns the first mention of each linked node into a [[wikilink]], keeping the fact's own spelling as the alias.
function linkify(text, labels) {
  let out = text;
  for (const label of labels) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}\\[|])${escapeRe(label)}(?![\\p{L}\\p{N}\\]|])`, 'iu');
    out = out.replace(re, (m) => (m === label ? `[[${label}]]` : `[[${label}|${m}]]`));
  }
  return out;
}

// One Markdown file → [{ id, text }] for its memory lines (id null for a line the user added).
function parseFile(content) {
  const lines = content.split(/\r?\n/);
  let i = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, n) => n > 0 && l.trim() === '---');
    i = end > 0 ? end + 1 : 0;
  }
  const intros = new Set(Object.values(INTRO));
  const out = [];
  for (const raw of lines.slice(i)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('Related: ') || intros.has(line)) continue;
    let body = line.replace(/^[-*+]\s+(?:\[[ xX]\]\s+)?/, '');
    const id = body.match(/\s\^([A-Za-z0-9-]+)$/)?.[1] || null;
    if (id) body = body.slice(0, -(id.length + 2));
    const text = norm(unlink(body)).slice(0, MAX_LINE);
    if (text) out.push({ id, text });
  }
  return out;
}

class MemoryFiles {
  // enabled(): false in Privacy mode or with the Settings toggle off; then nothing is read or written.
  constructor({ dir, memory, notesDir = '', enabled = () => true }) {
    this.dir = dir;
    this.memory = memory;
    this.notesDir = notesDir;
    this.enabled = enabled;
    this.syncing = false;
    this.timer = null;
    this.watcher = null;
  }

  abs(rel) {
    return path.join(this.dir, rel);
  }

  readState() {
    try {
      const s = JSON.parse(fs.readFileSync(this.abs(STATE), 'utf8'));
      return { files: s.files || {}, facts: s.facts || {}, flags: s.flags || [], flagsWritten: Boolean(s.flagsWritten) };
    } catch {
      return { files: {}, facts: {}, flags: [], flagsWritten: false };
    }
  }

  // Memory files on disk (the top level, People/ and Projects/), README and the review list excluded.
  scan() {
    const out = [];
    for (const sub of ['', ...Object.values(NODE_FOLDERS)]) {
      let names = [];
      try {
        names = fs.readdirSync(this.abs(sub));
      } catch { continue; }
      for (const name of names) {
        const rel = sub ? path.join(sub, name) : name;
        if (!name.endsWith('.md') || (!sub && (name === README || name === REVIEW))) continue;
        try {
          if (fs.statSync(this.abs(rel)).isFile()) out.push(rel);
        } catch { /* vanished meanwhile */ }
      }
    }
    return out;
  }

  // Debounced, so a burst of changes (or the watcher seeing Loon's own writes) becomes one sync.
  schedule() {
    if (this.syncing || !this.enabled()) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        this.sync();
        this.watch(); // the folder may have just been created
      } catch (err) {
        console.warn('[memory-files] sync failed:', err.message);
      }
    }, DEBOUNCE_MS);
  }

  // Reads the user's edits back into memory.db, then rewrites the folder from it. Returns what changed.
  sync() {
    const report = { updated: 0, added: 0, removed: 0, conflicts: 0, written: 0 };
    if (!this.enabled()) return report;
    this.syncing = true;
    try {
      const state = this.readState();
      if (state.flagsWritten && !fs.existsSync(this.abs(REVIEW))) state.flags = []; // the user dismissed the review list
      this.importEdits(state, report);
      this.exportAll(state, report);
    } finally {
      this.syncing = false;
    }
    return report;
  }

  importEdits(state, report) {
    const present = this.scan();
    const known = Object.keys(state.files);
    const missing = known.filter((rel) => !present.includes(rel));
    if (known.length && missing.length === known.length) return; // folder moved or wiped: write it again, delete nothing
    const contents = new Map(present.map((rel) => [rel, fs.readFileSync(this.abs(rel), 'utf8')]));
    const changed = new Set([...present.filter((rel) => state.files[rel] !== hash(contents.get(rel))), ...missing]);
    if (!changed.size) return;

    const seen = new Map(); // fact id → { rel, text }, first occurrence wins
    const fresh = []; // [{ rel, text }] lines without a usable id
    for (const rel of present) {
      for (const line of parseFile(contents.get(rel))) {
        if (line.id && !seen.has(line.id)) seen.set(line.id, { rel, text: line.text });
        else if (changed.has(rel)) fresh.push({ rel, text: line.text });
      }
    }
    const flag = (text) => {
      state.flags.push(text);
      report.conflicts++;
    };
    const keepFileVersion = (text, rel) => {
      this.memory.add(text, 'file', { pinned: rel === ABOUT });
      report.added++;
    };

    for (const [id, { rel, text }] of seen) {
      if (!changed.has(rel)) continue;
      const last = state.facts[id];
      const fact = this.memory.get(id);
      if (!fact) {
        // Deleted in Loon since. An untouched line just goes; an edited one is kept.
        if (!last || text !== last.text) {
          keepFileVersion(text, rel);
          flag(`"${text}" was deleted in Loon after you edited it in ${rel}. I kept your version.`);
        }
        continue;
      }
      const current = norm(fact.text);
      if (text !== current) {
        if (last && current === last.text) {
          this.memory.update(id, text);
          report.updated++;
        } else {
          keepFileVersion(text, rel);
          flag(`You changed "${last?.text || current}" to "${text}" in ${rel}, and Loon has "${current}". I kept both.`);
        }
      }
      if (last && last.rel !== rel) {
        if (rel === ABOUT && !fact.pinned) this.memory.pin(id, true);
        else if (last.rel === ABOUT && rel !== ABOUT && fact.pinned) this.memory.pin(id, false);
      }
    }

    for (const { rel, text } of fresh) {
      if (this.memory.all().some((f) => norm(f.text).toLowerCase() === text.toLowerCase())) continue;
      keepFileVersion(text, rel);
    }

    for (const [id, last] of Object.entries(state.facts)) {
      if (!changed.has(last.rel) || seen.has(id)) continue;
      const fact = this.memory.get(id);
      if (fact && norm(fact.text) === last.text) {
        this.memory.remove(id);
        report.removed++;
      }
    }
  }

  // The whole folder as { rel → content } plus which fact ended up in which file.
  render() {
    const { facts, links, edges } = this.memory.mirrorData();
    const byFact = new Map();
    const nodes = new Map(); // node id → { label, rel }
    for (const l of links) {
      if (!byFact.has(l.fact_id)) byFact.set(l.fact_id, []);
      byFact.get(l.fact_id).push(l);
      const folder = NODE_FOLDERS[l.kind];
      if (folder && !nodes.has(l.id) && fileSafe(l.label)) nodes.set(l.id, { id: l.id, label: l.label, kind: l.kind, rel: path.join(folder, `${fileSafe(l.label)}.md`) });
    }
    const groups = new Map(); // rel → { kind, id, title, intro, node?, facts: [] }
    const group = (rel, info) => {
      if (!groups.has(rel)) groups.set(rel, { ...info, rel, facts: [] });
      return groups.get(rel);
    };
    const homes = {};
    for (const f of facts) {
      const linked = byFact.get(f.id) || [];
      const nodeLink = linked.find((l) => l.kind === 'person' && nodes.has(l.id)) || linked.find((l) => l.kind === 'project' && nodes.has(l.id));
      let g;
      if (f.pinned) g = group(ABOUT, { kind: 'about-me', id: 'about-me', title: 'About me', intro: INTRO.about });
      else if (nodeLink) {
        const node = nodes.get(nodeLink.id);
        g = group(node.rel, { kind: node.kind, id: node.id, title: node.label, intro: INTRO.node, node });
      } else {
        const rel = CATEGORY_FILES[f.category] || CATEGORY_FILES.preference;
        g = group(rel, { kind: 'category', id: f.category, title: rel.replace(/\.md$/, ''), intro: INTRO.category });
      }
      g.facts.push({ id: f.id, text: norm(f.text), nodeIds: linked.map((l) => l.id).filter((id) => nodes.has(id) && id !== g.node?.id) });
      homes[f.id] = { rel: g.rel, text: norm(f.text) };
    }
    // Only nodes that ended up with a file of their own get linked, so no [[link]] points nowhere.
    const withFiles = new Set([...groups.values()].filter((g) => g.node).map((g) => g.node.id));
    const files = {};
    for (const [rel, g] of groups) {
      const lines = ['---', 'loon: memory', `kind: ${g.kind}`, `id: ${JSON.stringify(g.id)}`, `facts: [${g.facts.map((f) => f.id).join(', ')}]`, '---', `# ${g.title}`, '', g.intro, ''];
      for (const f of g.facts) lines.push(`- ${linkify(f.text, f.nodeIds.filter((id) => withFiles.has(id)).map((id) => nodes.get(id).label))} ^${f.id}`);
      if (g.node) {
        const related = edges.filter((e) => e.src === g.node.id || e.dst === g.node.id)
          .map((e) => (e.src === g.node.id ? e.dst : e.src))
          .filter((other, i, all) => withFiles.has(other) && all.indexOf(other) === i)
          .slice(0, 12)
          .map((other) => `[[${nodes.get(other).label}]]`);
        if (related.length) lines.push('', `Related: ${related.join(' · ')}`);
      }
      files[rel] = `${lines.join('\n')}\n`;
    }
    return { files, homes, empty: !facts.length };
  }

  readme() {
    const notes = this.notesDir ? `Your notes are plain Markdown too, one file per day, in ${this.notesDir}.` : '';
    return `# Loon's memory

This folder is a readable copy of what Loon remembers about you. Open it in any editor or as an Obsidian vault.

- **About me.md** holds the pinned memories Loon keeps in mind for every answer.
- **Preferences.md**, **Food.md**, **Writing.md** and the other top-level files hold the rest, sorted by topic.
- **People/** and **Projects/** have one file per person or project, linked to each other with [[wikilinks]].

Each memory is one line. Edit a line, delete it, or add a new one, and Loon picks up the change within a second while
it runs, or the next time it starts. A new line becomes a new memory. Moving a line into or out of About me.md pins or
unpins it. Loon files everything else by topic, so other moves are undone. The \`^\` code at the end of a line is how
Loon knows which memory it is, so leave it in place.

If you and Loon both change the same memory, Loon keeps both and lists them in "Needs a look.md".

Loon's own database stays the source of truth. History is not copied here. In Privacy mode nothing is written, and
"Forget everything" in Settings also clears this folder. Turn the copy off in Settings → Memory.

${notes}
`.replace(/\n{3,}/g, '\n\n');
  }

  write(rel, content) {
    const file = this.abs(rel);
    try {
      if (fs.readFileSync(file, 'utf8') === content) return false;
    } catch { /* new file */ }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, file);
    return true;
  }

  exportAll(state, report) {
    const { files, homes, empty } = this.render();
    if (empty && !Object.keys(state.files).length && !fs.existsSync(this.dir)) return; // nothing to show yet
    fs.mkdirSync(this.dir, { recursive: true });
    for (const [rel, content] of Object.entries(files)) if (this.write(rel, content)) report.written++;
    // Files Loon wrote before that now hold nothing (their facts moved or were deleted). Their lines were imported above.
    for (const rel of Object.keys(state.files)) {
      if (files[rel]) continue;
      fs.rmSync(this.abs(rel), { force: true });
      if (path.dirname(rel) !== '.') this.removeIfEmpty(path.dirname(rel));
    }
    this.write(README, this.readme());
    if (state.flags.length) this.write(REVIEW, `# Needs a look\n\nLoon kept both versions of these. Delete the one you don't want in its file, then delete this file.\n\n${state.flags.map((f) => `- ${f}`).join('\n')}\n`);
    const next = {
      files: Object.fromEntries(Object.entries(files).map(([rel, content]) => [rel, hash(content)])),
      facts: homes,
      flags: state.flags,
      flagsWritten: state.flags.length > 0,
    };
    fs.writeFileSync(this.abs(STATE), JSON.stringify(next));
  }

  removeIfEmpty(rel) {
    try {
      if (!fs.readdirSync(this.abs(rel)).length) fs.rmdirSync(this.abs(rel));
    } catch { /* not there */ }
  }

  // "Forget everything": removes what Loon wrote here (files the user added themselves stay).
  clear() {
    clearTimeout(this.timer);
    this.timer = null;
    const state = this.readState();
    for (const rel of [...Object.keys(state.files), README, REVIEW, STATE]) fs.rmSync(this.abs(rel), { force: true });
    for (const folder of Object.values(NODE_FOLDERS)) this.removeIfEmpty(folder);
    this.removeIfEmpty('');
  }

  // fs.watch (recursive on macOS) → a debounced sync, so edits in an editor land in memory.db within a second.
  watch() {
    if (this.watcher || !this.enabled() || !fs.existsSync(this.dir)) return;
    try {
      this.watcher = fs.watch(this.dir, { recursive: true }, (_event, name) => {
        if (!name || name.endsWith(STATE) || name.endsWith('.tmp')) return;
        this.schedule();
      });
      this.watcher.on('error', () => this.unwatch());
    } catch {
      this.watcher = null;
    }
  }

  unwatch() {
    this.watcher?.close();
    this.watcher = null;
    clearTimeout(this.timer);
    this.timer = null;
  }
}

module.exports = { MemoryFiles, parseFile, linkify, CATEGORY_FILES, ABOUT, README, REVIEW };
