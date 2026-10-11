// Response cache (DESIGN.md §2.10, tier T0). Exact match first (zero false hits). With the optional embedder
// (brain/embed.js), a typed question can also reuse the answer to an earlier question with the same meaning,
// but only within one "group" (same task, same screen context, same memory, same model) and only when the two
// questions differ by added or dropped words, never by swapped ones (see sameGist).
const crypto = require('crypto');
const fs = require('fs');
const { cosine, toBase64, fromBase64 } = require('./embed');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Measured with BGE small: paraphrases score 0.92-0.97, but so do "closure in JavaScript / in Python" (0.94)
// and "5 miles to km / 5 km to miles" (0.99). The threshold keeps unrelated questions out; sameGist does the rest.
const SIMILAR_MIN = 0.92;

const FILLER = new Set(('a an the is are was were be do does did i me my you your it its this that of in on at to for with by from '
  + 'and or what whats which who how many much can could would should please tell explain describe define mean meaning '
  + 'give show me about some any there here').split(' '));
const DIRECTION = /\b(to|from|into|than|per|over|under|before|after)\b/i;
const NEGATION = /\b(not|no|never|without|isn'?t|aren'?t|don'?t|doesn'?t|can'?t|won'?t|vs|versus)\b/i;

function contentWords(text) {
  return (String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
    .filter((w) => !FILLER.has(w))
    .map((w) => (w.length > 3 ? w.replace(/(?<!s)s$/, '') : w));
}

// Two questions ask the same thing only if one adds or drops words relative to the other: "explain JavaScript
// closures" ≈ "what is a closure in JavaScript?". A swapped word (JavaScript → Python, bad → good, 5 → 6), a
// negation on one side, or shared words in another order around a direction word (miles to km → km to miles)
// means a different question.
function sameGist(a, b) {
  if (NEGATION.test(a) !== NEGATION.test(b)) return false;
  const wa = contentWords(a);
  const wb = contentWords(b);
  const onlyA = wa.filter((w) => !wb.includes(w));
  const onlyB = wb.filter((w) => !wa.includes(w));
  if (onlyA.length && onlyB.length) return false;
  if (!DIRECTION.test(a) && !DIRECTION.test(b)) return true;
  const order = (words, other) => [...new Set(words.filter((w) => other.includes(w)))].join(' ');
  return order(wa, wb) === order(wb, wa);
}

class ResponseCache {
  constructor(file, { maxEntries = 500, ttlMs = WEEK_MS, embedder = null } = {}) {
    this.file = file;
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.embedder = embedder;
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

  // similar: { group, question } makes the entry findable by meaning later; its vector is added once embedded.
  set(key, value, similar = null) {
    const entry = { value, savedAt: Date.now() };
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
    this.scheduleSave();
    if (!similar || !this.embedder?.available()) return;
    this.embedder.embed(similar.question).then((vec) => {
      if (!vec || this.entries.get(key) !== entry) return;
      Object.assign(entry, { group: similar.group, question: similar.question, vec: toBase64(vec) });
      this.scheduleSave();
    });
  }

  // The answer to an earlier question in the same group with the same meaning, or null.
  // A linear scan decoding ≤500 vectors (~1 ms); keep decoded vectors in memory if the cache grows.
  async findSimilar({ group, question }) {
    if (!this.embedder?.available()) return null;
    const vec = await this.embedder.embed(question);
    if (!vec) return null;
    let best = null;
    let bestScore = SIMILAR_MIN;
    for (const [key, entry] of this.entries) {
      if (entry.group !== group || !entry.vec || Date.now() - entry.savedAt > this.ttlMs) continue;
      const score = cosine(vec, fromBase64(entry.vec));
      if (score >= bestScore && sameGist(question, entry.question)) [best, bestScore] = [key, score];
    }
    return best ? this.get(best) : null;
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

module.exports = { ResponseCache, sameGist, SIMILAR_MIN };
