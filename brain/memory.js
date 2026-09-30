// Memory (DESIGN.md §3.12): only what the user explicitly confirms. Small enough (tens of entries) that each task
// simply gets every entry in the categories it declares; no retrieval system needed.
const crypto = require('crypto');
const fs = require('fs');

const CATEGORY_RULES = [
  ['diet', /\b(vegetarian|vegan|pescatarian|allerg|gluten|dairy|lactose|keto|halal|kosher|protein|calorie|diet|eat|nuts?)\b/i],
  ['tone', /\b(tone|formal|casual|emoji|exclamation|write|writing|sign (?:off|emails)|british|american spelling)\b/i],
  ['budget', /\b(budget|spend|cheap|under \$|price|afford)\b/i],
  ['project', /\b(working on|project|repo|codebase|app|thesis|course|class)\b/i],
  ['language', /\b(speak|native|translate|language|spanish|french|german|hindi|chinese|japanese)\b/i],
];

// Which memory categories each task may see.
const TASK_CATEGORIES = {
  food: ['diet'],
  writing: ['tone'],
  shopping: ['budget', 'preference'],
  translate: ['language'],
  default: ['preference', 'project', 'language'],
};

function categorize(text) {
  return CATEGORY_RULES.find(([, re]) => re.test(text))?.[0] || 'preference';
}

class Memory {
  constructor(file) {
    this.file = file;
  }

  all() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return [];
    }
  }

  write(entries) {
    fs.writeFileSync(this.file, JSON.stringify(entries, null, 2));
  }

  add(text, source = 'user') {
    const entry = { id: crypto.randomUUID(), text: text.trim(), category: categorize(text), createdAt: new Date().toISOString(), source };
    this.write([...this.all().filter((e) => e.text.toLowerCase() !== entry.text.toLowerCase()), entry]);
    return entry;
  }

  update(id, text) {
    this.write(this.all().map((e) => (e.id === id ? { ...e, text, category: categorize(text) } : e)));
  }

  remove(id) {
    this.write(this.all().filter((e) => e.id !== id));
  }

  // "forget that I'm vegetarian" → removes entries that share most of those words.
  forget(text) {
    const FILLER = new Set(['that', 'the', 'not', 'any', 'more', 'anymore', 'forget', 'about', 'please', 'this', 'what']);
    const words = [...new Set((text.toLowerCase().match(/[a-z]{3,}/g) || []).filter((w) => !FILLER.has(w)))];
    const keep = [];
    const removed = [];
    for (const e of this.all()) {
      const hits = words.filter((w) => e.text.toLowerCase().includes(w)).length;
      (hits && hits >= Math.ceil(words.length / 2) ? removed : keep).push(e);
    }
    this.write(keep);
    return removed;
  }

  clear() {
    this.write([]);
  }

  forGroup(group) {
    const categories = TASK_CATEGORIES[group] || TASK_CATEGORIES.default;
    return this.all().filter((e) => categories.includes(e.category)).map((e) => e.text);
  }
}

module.exports = { Memory, categorize, TASK_CATEGORIES };
