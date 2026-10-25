// Files dropped on the cat (M6): read locally into text the usual chips can work on. No model.
// PDFs via pdf.js, plain text and code directly, CSVs get an instant overview computed in code.
const fs = require('fs');
const path = require('path');

const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.json', '.csv', '.tsv', '.log', '.yaml', '.yml', '.xml', '.html', '.htm',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.java', '.kt', '.go', '.rs', '.rb', '.php', '.c', '.h', '.cpp', '.cs', '.swift', '.sql', '.sh', '.css']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tif', '.tiff']);
const MAX_BYTES = 25 * 1024 * 1024;

function kindOf(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.csv' || ext === '.tsv') return 'csv';
  if (IMAGE_EXT.has(ext)) return 'image';
  if (TEXT_EXT.has(ext)) return 'text';
  if (DOCUMENT_EXT.has(ext)) return 'document';
  return null;
}

// Word, RTF and OpenDocument files through macOS's own textutil: no extra dependency.
const DOCUMENT_EXT = new Set(['.docx', '.doc', '.rtf', '.odt', '.pages']);
function documentText(file) {
  return new Promise((resolve, reject) => {
    require('child_process').execFile('textutil', ['-convert', 'txt', '-stdout', file], { timeout: 20_000, maxBuffer: 20 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout.trim())));
  });
}

async function pdfText(file, maxPages = 60) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    // Rebuild lines from text items: a new line wherever the item says so (hasEOL).
    pages.push(content.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n'));
  }
  return { text: pages.join('\n\n').replace(/\n{3,}/g, '\n\n').trim(), pages: doc.numPages, truncated: doc.numPages > maxPages };
}

function splitCsvLine(line, sep) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"' && quoted) { cur += '"'; i++; } else if (ch === '"') quoted = !quoted;
    else if (ch === sep && !quoted) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

// Shape and per-column stats: numeric columns get min / max / mean, text columns their most common values.
function csvOverview(text, name = 'file.csv') {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return 'This CSV is empty.';
  const sep = (lines[0].match(/\t/g) || []).length > (lines[0].match(/,/g) || []).length ? '\t' : ',';
  const header = splitCsvLine(lines[0], sep);
  const rows = lines.slice(1).map((l) => splitCsvLine(l, sep));
  const fmt = (n) => (Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : String(Math.round(n * 100) / 100));
  const columns = header.slice(0, 12).map((col, i) => {
    const values = rows.map((r) => r[i]).filter((v) => v != null && v !== '');
    const nums = values.map((v) => Number(v.replace(/[$,%]/g, ''))).filter((n) => Number.isFinite(n));
    if (nums.length && nums.length >= values.length * 0.8) {
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      return `| ${col} | number | ${fmt(Math.min(...nums))} – ${fmt(Math.max(...nums))}, avg ${fmt(mean)} |`;
    }
    const counts = new Map();
    for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
    if (counts.size === values.length) return `| ${col} | text | all ${counts.size.toLocaleString()} unique, e.g. ${values[0].slice(0, 30)} |`;
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v, n]) => `${v.slice(0, 20)} (${n})`);
    return `| ${col} | text | ${counts.size} distinct · ${top.join(', ')} |`;
  });
  const missing = rows.filter((r) => r.length < header.length || r.some((c) => c === '')).length;
  return [
    `**${name}**: ${rows.length.toLocaleString()} rows × ${header.length} columns${missing ? ` · ${missing} rows with blanks` : ''}.`,
    `| Column | Type | Values |\n|---|---|---|\n${columns.join('\n')}`,
    header.length > 12 ? `…and ${header.length - 12} more columns.` : '',
  ].filter(Boolean).join('\n\n');
}

// → { kind, name, text, note? } ; images return { kind: 'image' } and are OCR'd by the caller (Tesseract lives in main).
async function readDropped(file) {
  const name = path.basename(file);
  const kind = kindOf(file);
  if (!kind) return { kind: null, name, error: `I can read PDFs, Word documents, images, CSVs and text or code files, not ${path.extname(file) || 'this kind of file'}.` };
  if (!fs.existsSync(file)) return { kind, name, error: `${name} isn't there anymore. It may have been moved or deleted.` };
  const { size } = fs.statSync(file);
  if (size > MAX_BYTES) return { kind, name, error: `${name} is larger than 25 MB.` };
  if (kind === 'image') return { kind, name };
  if (kind === 'pdf') {
    const { text, pages, truncated } = await pdfText(file);
    if (!text) return { kind, name, error: `${name} has no selectable text (it may be scanned). Try ⌥⇧S on a page of it.` };
    return { kind, name, text, note: `${pages} page${pages > 1 ? 's' : ''}${truncated ? ', first 60 read' : ''}` };
  }
  if (kind === 'document') {
    const text = await documentText(file).catch(() => '');
    if (!text) return { kind, name, error: `I couldn't read the text in ${name}. Saving it as a PDF and dropping that usually works.` };
    return { kind, name, text };
  }
  const text = fs.readFileSync(file, 'utf8');
  return { kind, name, text };
}

// "How much did I spend on coffee?", "how many rows are groceries?", "average amount": answered by adding up the CSV
// in code (DESIGN.md §0 rule 1). null when the question isn't one of these or the file has no number column.
function csvAnswer(text, question) {
  const q = question.toLowerCase();
  const op = /\b(average|avg|mean)\b/.test(q) ? 'average' : /\b(how many|count|number of)\b/.test(q) ? 'count' : /\b(how much|total|sum|spent|spend|spending|cost|paid)\b/.test(q) ? 'sum' : null;
  if (!op) return null;
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const sep = (lines[0].match(/\t/g) || []).length > (lines[0].match(/,/g) || []).length ? '\t' : ',';
  const header = splitCsvLine(lines[0], sep);
  const rows = lines.slice(1).map((l) => splitCsvLine(l, sep));
  const num = (v) => Number(String(v ?? '').replace(/[$€£,%\s]/g, ''));
  const numeric = header.map((_, i) => rows.filter((r) => r[i] !== '' && r[i] != null).every((r) => Number.isFinite(num(r[i]))) && rows.some((r) => r[i]));
  const columns = header.map((h, i) => ({ h, i })).filter((c) => numeric[c.i]);
  const column = columns.find((c) => /amount|total|price|cost|spent|value|sum|usd|\$/i.test(c.h)) || columns.find((c) => !/year|id|date|qty|quantity/i.test(c.h)) || null;
  if (!column && op !== 'count') return null;
  const term = q.match(/\b(?:on|for|in|at|are|is|of)\s+([a-z][\w &'-]{1,30}?)\s*\??$/)?.[1].replace(/^(?:the|my|all)\s+/, '').trim();
  const generic = !term || /^(?:total|everything|all|them|it|this|the file|rows?|average|amount)$/.test(term);
  const hits = generic ? rows : rows.filter((r) => r.some((cell, i) => !numeric[i] && cell.toLowerCase().includes(term)));
  if (!generic && !hits.length) return `No rows in this file mention "${term}".`;
  const values = column ? hits.map((r) => num(r[column.i])).filter(Number.isFinite) : [];
  const money = column && rows.some((r) => /[$€£]/.test(r[column.i] || '')) || /\$|usd|amount|price|cost|spent/i.test(column?.h || '') ? '$' : '';
  const fmt = (n) => `${money}${n.toLocaleString('en-US', { minimumFractionDigits: money ? 2 : 0, maximumFractionDigits: 2 })}`;
  const what = generic ? '' : ` for "${term}"`;
  const rowsWord = `${hits.length} row${hits.length === 1 ? '' : 's'}`;
  if (op === 'count') return `**${hits.length}** row${hits.length === 1 ? '' : 's'}${what}.`;
  if (op === 'average') return `Average ${column.h}${what}: **${fmt(values.reduce((a, b) => a + b, 0) / (values.length || 1))}** over ${rowsWord}.`;
  return `**${fmt(values.reduce((a, b) => a + b, 0))}** in ${column.h}${what}, across ${rowsWord}. _Added up from the file, no model._`;
}

module.exports = { readDropped, csvOverview, csvAnswer, kindOf, pdfText };
