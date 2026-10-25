// Notes (DESIGN.md §3.10): plain markdown the user owns, one file per day, readable in Obsidian or any editor.
const fs = require('fs');
const path = require('path');

const STOPWORDS = new Set(['the', 'and', 'what', 'when', 'where', 'who', 'why', 'how', 'did', 'does', 'was', 'were', 'are', 'for', 'about', 'with', 'from', 'that', 'this', 'have', 'has', 'can', 'you', 'your', 'note', 'notes', 'noted', 'saved', 'find', 'show', 'tell', 'any', 'all', 'mine', 'there']);

class Notes {
  constructor(dir) {
    this.dir = dir;
  }

  fileFor(date = new Date()) {
    const day = date.toISOString().slice(0, 10);
    return path.join(this.dir, `${day}.md`);
  }

  // Appends one entry; returns the file path so the UI can reveal it.
  save({ title, text, url, question }) {
    fs.mkdirSync(this.dir, { recursive: true });
    const now = new Date();
    const file = this.fileFor(now);
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const header = fs.existsSync(file) ? '' : `# Loon notes · ${now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}\n`;
    const heading = title || question || 'Note';
    const source = url ? `\nSource: <${url}>\n` : '';
    fs.appendFileSync(file, `${header}\n## ${time} · ${heading.slice(0, 80)}\n\n${text.trim()}\n${source}`);
    return file;
  }

  files() {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().reverse().map((f) => path.join(this.dir, f));
  }

  // Entries (heading, body, source) newest first, from the last `days` days.
  entries(days = 30) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const out = [];
    for (const file of this.files()) {
      const day = new Date(path.basename(file, '.md'));
      if (day.getTime() < cutoff - 24 * 60 * 60 * 1000) break;
      const blocks = fs.readFileSync(file, 'utf8').split(/\n(?=## )/).slice(1);
      for (const block of blocks.reverse()) {
        const [headingLine, ...rest] = block.split('\n');
        const body = rest.join('\n');
        const source = body.match(/^Source: <(.+)>$/m)?.[1] || null;
        out.push({ day: path.basename(file, '.md'), heading: headingLine.replace(/^## /, ''), body: body.replace(/^Source: <.+>$/m, '').trim(), source });
      }
    }
    return out;
  }

  // Entries matching the query's words, best first. hits counts matched words; of is how many words the query had,
  // so callers can ask for "most of them". Question words never count ("what did I note about…").
  search(query, days = 365) {
    const words = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}']+/gu) || [])].filter((w) => w.length > 2 && !STOPWORDS.has(w));
    return this.entries(days)
      .map((e) => ({ ...e, of: words.length, hits: words.filter((w) => `${e.heading} ${e.body}`.toLowerCase().includes(w)).length }))
      .filter((e) => e.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 8);
  }
}

module.exports = { Notes };
