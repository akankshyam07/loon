// Project awareness (M6): "Where did I leave off?" from git history, open TODO items and recently edited files.
// Read-only by construction: git runs with --no-optional-locks (no index refresh, no lock files), and only folders the
// user allowed in Settings are ever read. No model involved.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.venv', 'venv', '__pycache__', '.idea', '.vscode', 'target', 'coverage']);

const git = (cwd, args) => new Promise((resolve) => {
  execFile('git', ['--no-optional-locks', '-C', cwd, ...args], { timeout: 5000 }, (err, stdout) => resolve(err ? '' : stdout.trim()));
});

// Git repos directly under ~/Desktop (and the folders the user already allowed), for Settings to offer.
function discover(roots = [path.join(os.homedir(), 'Desktop')]) {
  const found = [];
  for (const root of roots) {
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const dir = path.join(root, e.name);
      if (fs.existsSync(path.join(dir, '.git'))) found.push({ name: e.name, path: dir });
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

// Newest files under a project, skipping build output and dependencies; bounded so huge trees stay fast.
function recentFiles(dir, limit = 5) {
  const files = [];
  let budget = 4000;
  const walk = (d, depth) => {
    if (depth > 4 || budget <= 0) return;
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (--budget <= 0) return;
      if (e.name.startsWith('.') || /\.(tsbuildinfo|lock|log|pyc)$|^package-lock\.json$/.test(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(full, depth + 1);
      } else if (e.isFile()) {
        try {
          files.push({ file: path.relative(dir, full), mtime: fs.statSync(full).mtimeMs });
        } catch {
          // vanished mid-walk
        }
      }
    }
  };
  walk(dir, 0);
  return files.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
}

// Unchecked checklist items from TODO-style markdown (and CLAUDE.md, which often holds the plan).
function openTodos(dir, limit = 8) {
  const candidates = [];
  const look = (d) => {
    try {
      for (const f of fs.readdirSync(d)) if (/^(todo.*|tasks?|roadmap|claude)\.md$/i.test(f)) candidates.push(path.join(d, f));
    } catch {
      // no such folder
    }
  };
  look(dir);
  look(path.join(dir, 'docs'));
  const items = [];
  for (const file of candidates.sort()) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*[-*]\s+\[( |~)\]\s+(.+)$/);
      if (m) items.push({ text: m[2].replace(/\s+/g, ' ').trim(), partial: m[1] === '~', file: path.relative(dir, file) });
      if (items.length >= limit) return items;
    }
  }
  return items;
}

function description(dir) {
  try {
    const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
    const title = readme.match(/^#\s+(.+)$/m)?.[1].trim();
    // First prose paragraph (README lines often wrap), skipping badges, images and HTML.
    const paragraph = readme.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !/^(#|!|<|\[|```|\||-|\*)/.test(p));
    const summary = paragraph ? paragraph.replace(/\s+/g, ' ').replace(/\*\*|`/g, '') : '';
    const sentence = summary.match(/^.{20,200}?[.!?](\s|$)/)?.[0].trim() || summary.slice(0, 160);
    return { title: title || path.basename(dir), summary: sentence };
  } catch {
    return { title: path.basename(dir), summary: '' };
  }
}

const ago = (ms) => {
  const s = (Date.now() - ms) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
};

async function snapshot(dir) {
  const [branch, log, status, lastCommitTs] = await Promise.all([
    git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git(dir, ['log', '-n', '5', '--format=%h\u001f%ct\u001f%s']),
    git(dir, ['status', '--porcelain']),
    git(dir, ['log', '-1', '--format=%ct']),
  ]);
  const commits = log ? log.split('\n').map((l) => { const [hash, ts, subject] = l.split('\u001f'); return { hash, when: Number(ts) * 1000, subject }; }) : [];
  const files = recentFiles(dir);
  const lastActivity = Math.max(Number(lastCommitTs || 0) * 1000, files[0]?.mtime || 0);
  return { dir, name: path.basename(dir), ...description(dir), branch, commits, changed: status ? status.split('\n').length : 0, todos: openTodos(dir), files, lastActivity };
}

function render(s) {
  const lines = [`**${s.title}**${s.branch ? ` · \`${s.branch}\`` : ''} · last active ${s.lastActivity ? ago(s.lastActivity) : 'unknown'}`];
  if (s.summary) lines.push(`_${s.summary}_`);
  if (s.commits.length) lines.push(`\n**Recent commits**\n${s.commits.slice(0, 3).map((c) => `- ${c.subject} (${ago(c.when)})`).join('\n')}`);
  if (s.changed) lines.push(`\n✏️ ${s.changed} uncommitted change${s.changed > 1 ? 's' : ''}.`);
  if (s.todos.length) lines.push(`\n**Still open**\n${s.todos.slice(0, 5).map((t) => `- ${t.partial ? '(half done) ' : ''}${t.text}`).join('\n')}`);
  else lines.push('\nNo open TODO items found.');
  if (s.files.length) lines.push(`\n**Last edited**\n${s.files.slice(0, 3).map((f) => `- \`${f.file}\` (${ago(f.mtime)})`).join('\n')}`);
  return lines.join('\n');
}

// Picks a project by (fuzzy) name, or the most recently active one.
function pick(projects, name) {
  if (!name) return null;
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const want = norm(name);
  return projects.find((p) => norm(p.name) === want)
    || projects.find((p) => norm(p.name).startsWith(want) || want.startsWith(norm(p.name)))
    || projects.find((p) => norm(p.name).includes(want) || want.includes(norm(p.name)))
    || null;
}

async function briefing(allowed, name) {
  if (!allowed.length) return { text: 'I can only look at projects you allow. Pick some in Settings → Projects.', mood: 'curious' };
  if (name) {
    const project = pick(allowed.map((p) => ({ name: path.basename(p), path: p })), name);
    if (!project) return { text: `I don't see a project called "${name}" among the ones you allowed.`, mood: 'confused' };
    return { text: render(await snapshot(project.path)), mood: 'focused' };
  }
  const snaps = await Promise.all(allowed.map(snapshot));
  snaps.sort((a, b) => b.lastActivity - a.lastActivity);
  const [latest, ...others] = snaps;
  const rest = others.length ? `\n\n**Other projects**\n${others.slice(0, 5).map((s) => `- ${s.title} · ${s.lastActivity ? ago(s.lastActivity) : '—'}`).join('\n')}` : '';
  return { text: `You were last working on this:\n\n${render(latest)}${rest}`, mood: 'focused' };
}

module.exports = { discover, snapshot, briefing, render, openTodos, recentFiles, pick };
