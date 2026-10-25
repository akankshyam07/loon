// Typed questions that plain code answers better than any model (DESIGN.md §0 rule 1: code handles numbers):
// arithmetic and percentages, unit conversions, "how many days until …", coin flips and dice.
// quickAnswer(question) → { text, mood, detail } or null (null falls through to the next tier).
const crypto = require('crypto');
const chrono = require('chrono-node');

// ---------- arithmetic: a tiny recursive-descent parser (never eval) ----------

function tokenize(src) {
  const tokens = [];
  const re = /\s*(\d+(?:\.\d+)?|\.\d+|[-+*/^()%])/y;
  let m;
  let at = 0;
  while (at < src.length) {
    re.lastIndex = at;
    if (!(m = re.exec(src))) return null;
    tokens.push(m[1]);
    at = re.lastIndex;
    if (/^\s*$/.test(src.slice(at))) break;
  }
  return tokens;
}

function evaluate(src) {
  const tokens = tokenize(src);
  if (!tokens?.length) return null;
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  function primary() {
    const t = next();
    if (t === '(') {
      const v = expr();
      if (next() !== ')') throw new Error('paren');
      return v;
    }
    if (t === '-') return -factor();
    if (t === '+') return factor();
    if (t === undefined || !/^[\d.]/.test(t)) throw new Error('number');
    let v = Number(t);
    if (peek() === '%') { next(); v /= 100; }
    return v;
  }
  function factor() {
    const base = primary();
    if (peek() === '^') { next(); return base ** factor(); }
    return base;
  }
  function term() {
    let v = factor();
    while (peek() === '*' || peek() === '/') v = next() === '*' ? v * factor() : v / factor();
    return v;
  }
  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') v = next() === '+' ? v + term() : v - term();
    return v;
  }
  try {
    const v = expr();
    return i === tokens.length && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

const num = (s) => Number(String(s).replace(/,/g, ''));

function format(n) {
  if (!Number.isFinite(n)) return null;
  const rounded = Math.abs(n) >= 1e15 || (Math.abs(n) < 1e-6 && n !== 0) ? n.toPrecision(6) : String(Math.round(n * 1e6) / 1e6);
  const [whole, frac] = rounded.split('.');
  if (/e/i.test(rounded)) return rounded;
  return Number(whole).toLocaleString('en-US') + (frac ? `.${frac}` : '');
}

const WORD_OPS = [[/\btimes\b|\bmultiplied by\b|[×x](?=\s*[\d(.])/gi, '*'], [/\bdivided by\b|\bover\b|÷/gi, '/'], [/\bplus\b/gi, '+'], [/\bminus\b/gi, '-'], [/\bto the power of\b|\*\*/gi, '^'], [/\bsquared\b/gi, '^2'], [/\bcubed\b/gi, '^3']];

function math(q) {
  let m;
  const N = '(-?\\d[\\d,]*(?:\\.\\d+)?)';
  if ((m = q.match(new RegExp(`^(?:what(?:'?s| is)\\s+)?${N}\\s*(?:%|percent)\\s+of\\s+\\$?${N}\\??$`)))) {
    const v = (num(m[1]) * num(m[2])) / 100;
    return { text: `${m[1]}% of ${m[2]} is **${format(v)}**.` };
  }
  if ((m = q.match(new RegExp(`^(?:what(?:'?s| is)\\s+)?${N}\\s*(?:%|percent)\\s+off\\s+(?:of\\s+)?\\$?${N}\\??$`)))) {
    const v = num(m[2]) * (1 - num(m[1]) / 100);
    return { text: `${m[1]}% off ${m[2]} is **${format(v)}** (you save ${format(num(m[2]) - v)}).` };
  }
  if ((m = q.match(new RegExp(`^(?:what(?:'?s| is)\\s+(?:a\\s+)?)?${N}\\s*(?:%|percent)\\s+tip\\s+on\\s+\\$?${N}\\??$`)))) {
    const tip = (num(m[1]) * num(m[2])) / 100;
    return { text: `A ${m[1]}% tip on ${m[2]} is **${format(tip)}**, so **${format(num(m[2]) + tip)}** in total.` };
  }
  let body = q.replace(/^(?:what(?:'?s| is)|calculate|compute|solve|how much is)\s+/, '').replace(/\s*=\s*\??$|\?$/g, '').trim();
  for (const [re, op] of WORD_OPS) body = body.replace(re, op);
  if (!/^[\d\s.,+\-*/^()%]+$/.test(body)) return null;
  if (!/\d\s*[-+*/^%]|\)\s*[-+*/^]|^\s*-?\s*\(/.test(body)) return null; // a lone number is not a sum
  if (/\d,\d{1,2}(?!\d)/.test(body)) return null; // "1,5" is ambiguous; let the model ask
  const v = evaluate(body.replace(/,(?=\d{3}\b)/g, ''));
  if (v === null) return null;
  return { text: `${body.replace(/\s+/g, ' ')} = **${format(v)}**` };
}

// ---------- unit conversions ----------

const UNITS = {};
function unit(dim, factor, ...names) { for (const n of names) UNITS[n] = { dim, factor, name: names[0] }; }
unit('length', 1000, 'km', 'kms', 'kilometer', 'kilometers', 'kilometre', 'kilometres');
unit('length', 1, 'm', 'meter', 'meters', 'metre', 'metres');
unit('length', 0.01, 'cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres');
unit('length', 0.001, 'mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres');
unit('length', 1609.344, 'mi', 'mile', 'miles');
unit('length', 0.9144, 'yd', 'yard', 'yards');
unit('length', 0.3048, 'ft', 'foot', 'feet');
unit('length', 0.0254, 'in', 'inch', 'inches');
unit('mass', 1, 'kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms');
unit('mass', 0.001, 'g', 'gram', 'grams', 'gr');
unit('mass', 0.45359237, 'lb', 'lbs', 'pound', 'pounds');
unit('mass', 0.028349523125, 'oz', 'ounce', 'ounces');
unit('mass', 6.35029318, 'st', 'stone', 'stones');
unit('volume', 1, 'l', 'liter', 'liters', 'litre', 'litres');
unit('volume', 0.001, 'ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres');
unit('volume', 3.785411784, 'gal', 'gallon', 'gallons');
unit('volume', 0.946352946, 'qt', 'quart', 'quarts');
unit('volume', 0.473176473, 'pt', 'pint', 'pints');
unit('volume', 0.2365882365, 'cup', 'cups');
unit('volume', 0.0295735295625, 'fl oz', 'floz', 'fluid ounce', 'fluid ounces');
unit('volume', 0.01478676478125, 'tbsp', 'tablespoon', 'tablespoons');
unit('volume', 0.00492892159375, 'tsp', 'teaspoon', 'teaspoons');
unit('speed', 0.44704, 'mph', 'miles per hour');
unit('speed', 1 / 3.6, 'km/h', 'kmh', 'kph', 'kilometers per hour');
unit('speed', 1, 'm/s', 'meters per second');
unit('temp', 0, '°C', 'c', '°c', 'celsius', 'degrees c', 'degrees celsius', 'centigrade');
unit('temp', 0, '°F', 'f', '°f', 'fahrenheit', 'degrees f', 'degrees fahrenheit');
unit('temp', 0, 'K', 'k', 'kelvin', 'kelvins');

const toC = { '°C': (v) => v, '°F': (v) => ((v - 32) * 5) / 9, K: (v) => v - 273.15 };
const fromC = { '°C': (v) => v, '°F': (v) => (v * 9) / 5 + 32, K: (v) => v + 273.15 };

function lookupUnit(raw) {
  const key = raw.trim().replace(/\.$/, '').replace(/\s+/g, ' ');
  return UNITS[key] || UNITS[key.replace(/^degrees? /, 'degrees ')] || null;
}

function convert(value, fromName, toName) {
  let from = lookupUnit(fromName);
  let to = lookupUnit(toName);
  if (!from || !to) return null;
  // "8 oz to ml": ounces of a liquid.
  if (from.name === 'oz' && to.dim === 'volume') from = UNITS['fl oz'];
  if (to.name === 'oz' && from.dim === 'volume') to = UNITS['fl oz'];
  if (from.dim !== to.dim || from.name === to.name) return null;
  const result = from.dim === 'temp' ? fromC[to.name](toC[from.name](value)) : (value * from.factor) / to.factor;
  const plural = (u, v) => (u.dim === 'temp' || /^(?:fl oz|[a-z/]{1,4})$/.test(u.name) ? u.name : `${u.name}${v === 1 ? '' : 's'}`);
  return { text: `${format(value)} ${plural(from, value)} = **${format(result)} ${plural(to, result)}**` };
}

function units(q) {
  let m;
  const N = '(-?\\d[\\d,]*(?:\\.\\d+)?)';
  const U = '(°?\\s?[a-z][a-z/ .]*?)';
  if ((m = q.match(new RegExp(`^(?:convert\\s+|what(?:'?s| is)\\s+)?${N}\\s*${U}\\s+(?:to|in|into|as|=)\\s+${U}\\??$`)))) return convert(num(m[1]), m[2], m[3]);
  if ((m = q.match(new RegExp(`^how many ${U} (?:are |is )?in (?:an? )?${N}?\\s*${U}\\??$`)))) return convert(m[2] ? num(m[2]) : 1, m[3], m[1]);
  return null;
}

// ---------- days until ----------

function nthWeekday(year, month, weekday, n) {
  const d = new Date(year, month, 1);
  d.setDate(1 + ((weekday - d.getDay() + 7) % 7) + (n - 1) * 7);
  return d;
}

const HOLIDAYS = {
  christmas: (y) => new Date(y, 11, 25),
  'christmas eve': (y) => new Date(y, 11, 24),
  "new year's eve": (y) => new Date(y, 11, 31),
  "new year's": (y) => new Date(y, 0, 1),
  'new year': (y) => new Date(y, 0, 1),
  halloween: (y) => new Date(y, 9, 31),
  "valentine's": (y) => new Date(y, 1, 14),
  "valentine's day": (y) => new Date(y, 1, 14),
  'the 4th of july': (y) => new Date(y, 6, 4),
  '4th of july': (y) => new Date(y, 6, 4),
  'independence day': (y) => new Date(y, 6, 4),
  thanksgiving: (y) => nthWeekday(y, 10, 4, 4),
};

function daysUntil(q, now) {
  const m = q.match(/^(?:how many (?:days|sleeps) (?:until|till|til|to|before|left until)|how long (?:until|till|til) |days (?:until|till|til|to) )\s*(.+?)\??$/);
  if (!m) return null;
  const what = m[1].replace(/\s+day$/, (s) => (HOLIDAYS[m[1]] ? s : '')).trim();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = null;
  const holiday = HOLIDAYS[what] || HOLIDAYS[`${what} day`];
  if (holiday) {
    target = holiday(today.getFullYear());
    if (target < today) target = holiday(today.getFullYear() + 1);
  } else {
    const [found] = chrono.parse(what, now, { forwardDate: true });
    if (!found || found.text.length < what.replace(/^(?:the|my)\s+/, '').length - 2) return null; // only when the whole phrase is a date
    const d = found.start.date();
    target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    // forwardDate pushes "oct 25" said on Oct 25 to next year; today is the answer people mean.
    const plain = chrono.parseDate(what, now);
    if (plain && plain.toDateString() === today.toDateString()) target = today;
  }
  const days = Math.round((target - today) / 86400000);
  const when = target.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: target.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  if (days === 0) return { text: `That's **today** (${when}).`, mood: 'happy' };
  if (days < 0) return { text: `That was **${-days} day${days === -1 ? '' : 's'} ago** (${when}).` };
  const weeks = days >= 14 ? ` That's about ${Math.round(days / 7)} weeks.` : '';
  return { text: `**${days} day${days === 1 ? '' : 's'}** until ${when}.${weeks}`, mood: 'happy' };
}

// ---------- chance ----------

function chance(q) {
  let m;
  if (/^(?:flip|toss) (?:a |the )?coin\??$|^heads or tails\??$/.test(q)) {
    return { text: `🪙 **${crypto.randomInt(2) ? 'Heads' : 'Tails'}.**`, mood: 'happy' };
  }
  if ((m = q.match(/^roll (?:a |an |the )?(?:(\d{1,2}) ?)?(?:dice|die|d(\d{1,3}))(?: (?:with )?(\d{1,3}) sides?)?\??$/))) {
    const count = Math.min(Number(m[1]) || 1, 20);
    const sides = Math.max(Number(m[2] || m[3]) || 6, 2);
    const rolls = Array.from({ length: count }, () => 1 + crypto.randomInt(sides));
    const total = rolls.length > 1 ? ` (total **${rolls.reduce((a, b) => a + b, 0)}**)` : '';
    return { text: `🎲 ${rolls.map((r) => `**${r}**`).join(', ')}${total}`, mood: 'happy' };
  }
  if ((m = q.match(/^(?:pick|choose|give me|get) (?:me )?a (?:random )?number (?:between|from) (-?\d+) (?:and|to) (-?\d+)\??$/))) {
    const [lo, hi] = [Number(m[1]), Number(m[2])].sort((a, b) => a - b);
    if (hi - lo > 1e9) return null;
    return { text: `**${lo + crypto.randomInt(hi - lo + 1)}**`, mood: 'happy' };
  }
  return null;
}

function quickAnswer(question, now = new Date()) {
  const q = question.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[!.]+$/, '');
  if (!q || q.length > 200) return null;
  const answer = chance(q) || daysUntil(q, now) || units(q) || math(q);
  return answer ? { mood: 'happy', ...answer } : null;
}

module.exports = { quickAnswer, evaluate, convert };
