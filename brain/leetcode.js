// Leetcode lookup (M6): "Which companies ask this?" answered from the user's local Leetcode repo
// (one folder per company with all.csv / thirty-days.csv …). Built once into an index; no model, no network.
const fs = require('fs');
const path = require('path');

const WINDOWS = ['thirty-days', 'three-months', 'six-months', 'more-than-six-months', 'all'];

function looksLikeRepo(dir) {
  try {
    return fs.readdirSync(dir).some((d) => fs.existsSync(path.join(dir, d, 'all.csv')));
  } catch {
    return false;
  }
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

const slugOf = (url) => (url.match(/leetcode\.com\/problems\/([\w-]+)/) || [])[1] || null;

class LeetcodeIndex {
  constructor(repoDir, cacheFile) {
    this.repoDir = repoDir;
    this.cacheFile = cacheFile;
    this.index = null;
  }

  repoStamp() {
    return fs.statSync(this.repoDir).mtimeMs;
  }

  // slug → { title, difficulty, companies: [{ company, frequency, recent }] }
  build() {
    try {
      const cached = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
      if (cached.stamp === this.repoStamp() && cached.repo === this.repoDir) return (this.index = cached.index);
    } catch {
      // no cache yet
    }
    const index = {};
    for (const company of fs.readdirSync(this.repoDir)) {
      const dir = path.join(this.repoDir, company);
      if (!fs.existsSync(path.join(dir, 'all.csv'))) continue;
      const recentSlugs = new Set();
      for (const window of WINDOWS) {
        const file = path.join(dir, `${window}.csv`);
        if (!fs.existsSync(file)) continue;
        const [header, ...rows] = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
        const cols = parseCsvLine(header).map((c) => c.trim().toLowerCase());
        const at = (name) => cols.findIndex((c) => c.startsWith(name));
        const [iUrl, iTitle, iDiff, iFreq] = [at('url'), at('title'), at('difficulty'), at('frequency')];
        for (const row of rows) {
          const cells = parseCsvLine(row);
          const slug = slugOf(cells[iUrl] || '');
          if (!slug) continue;
          if (window === 'thirty-days' || window === 'three-months') recentSlugs.add(slug);
          if (window !== 'all') continue;
          index[slug] ??= { title: cells[iTitle], difficulty: cells[iDiff], companies: [] };
          index[slug].companies.push({ company, frequency: parseFloat(cells[iFreq]) || 0, recent: recentSlugs.has(slug) });
        }
      }
    }
    for (const entry of Object.values(index)) entry.companies.sort((a, b) => b.recent - a.recent || b.frequency - a.frequency);
    fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
    fs.writeFileSync(this.cacheFile, JSON.stringify({ repo: this.repoDir, stamp: this.repoStamp(), index }));
    return (this.index = index);
  }

  lookup(urlOrSlug) {
    const slug = slugOf(urlOrSlug) || urlOrSlug;
    const entry = (this.index || this.build())[slug];
    if (!entry) return null;
    const pretty = (c) => c.replace(/(^|-)(\w)/g, (m, dash, ch) => `${dash ? ' ' : ''}${ch.toUpperCase()}`);
    const top = entry.companies.slice(0, 12).map((c) => `${pretty(c.company)}${c.recent ? ' 🔥' : ''}`);
    const more = entry.companies.length > 12 ? ` and ${entry.companies.length - 12} more` : '';
    return {
      text: `**${entry.title}** (${entry.difficulty}) is asked at **${entry.companies.length}** companies.\n\n${top.join(' · ')}${more}\n\n🔥 = asked in the last 3 months. From your local Leetcode repo.`,
      count: entry.companies.length,
    };
  }
}

module.exports = { LeetcodeIndex, looksLikeRepo, slugOf };
