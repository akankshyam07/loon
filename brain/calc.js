// Arithmetic, percentages and unit conversions: numbers are code's job, so these never reach the model.
const LEAD = /^(?:(?:what(?:'s| is)|how much is|calculate|calc|compute|convert)\s+)?/;

const UNITS = {
  length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254 },
  mass: { kg: 1, g: 0.001, mg: 1e-6, lb: 0.45359237, oz: 0.028349523125 },
  volume: { l: 1, ml: 0.001, gal: 3.785411784, qt: 0.946352946, pt: 0.473176473, cup: 0.2365882365, floz: 0.0295735295625, tbsp: 0.01478676478125, tsp: 0.00492892159375 },
  time: { sec: 1, min: 60, hr: 3600, day: 86400, wk: 604800, yr: 31536000 },
};
const ALIASES = {
  m: 'm', meter: 'm', meters: 'm', metre: 'm', metres: 'm', km: 'km', kilometer: 'km', kilometers: 'km', kilometre: 'km', kilometres: 'km',
  cm: 'cm', centimeter: 'cm', centimeters: 'cm', mm: 'mm', mile: 'mi', miles: 'mi', mi: 'mi', yard: 'yd', yards: 'yd', yd: 'yd',
  foot: 'ft', feet: 'ft', ft: 'ft', inch: 'in', inches: 'in', in: 'in',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg', g: 'g', gram: 'g', grams: 'g', mg: 'mg',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb', oz: 'oz', ounce: 'oz', ounces: 'oz',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l', ml: 'ml', gallon: 'gal', gallons: 'gal', gal: 'gal',
  quart: 'qt', quarts: 'qt', pint: 'pt', pints: 'pt', cup: 'cup', cups: 'cup', tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  second: 'sec', seconds: 'sec', sec: 'sec', secs: 'sec', minute: 'min', minutes: 'min', min: 'min', mins: 'min',
  hour: 'hr', hours: 'hr', hr: 'hr', hrs: 'hr', day: 'day', days: 'day', week: 'wk', weeks: 'wk', year: 'yr', years: 'yr',
  c: 'C', celsius: 'C', f: 'F', fahrenheit: 'F', k: 'K', kelvin: 'K',
};

function fmt(n) {
  if (!Number.isFinite(n)) return null;
  const s = Math.abs(n) >= 1e9 || (n !== 0 && Math.abs(n) < 1e-4) ? n.toPrecision(6) : String(Math.round(n * 1e4) / 1e4);
  const [int, frac] = s.split('.');
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? `.${frac}` : '');
}

// Recursive descent over + - * / ^ and parentheses; no eval.
function evaluate(src) {
  const tokens = src.match(/\d+(?:\.\d+)?|[-+*/^()]/g);
  if (!tokens || tokens.join('').length !== src.replace(/\s+/g, '').length) return null;
  let i = 0;
  const peek = () => tokens[i];
  const expr = () => {
    let v = term();
    while (peek() === '+' || peek() === '-') v = tokens[i++] === '+' ? v + term() : v - term();
    return v;
  };
  const term = () => {
    let v = power();
    while (peek() === '*' || peek() === '/') v = tokens[i++] === '*' ? v * power() : v / power();
    return v;
  };
  const power = () => {
    const base = unary();
    return peek() === '^' ? (i++, base ** power()) : base;
  };
  const unary = () => {
    if (peek() === '-') { i++; return -unary(); }
    if (peek() === '(') {
      i++;
      const v = expr();
      if (tokens[i++] !== ')') throw new Error('paren');
      return v;
    }
    const n = parseFloat(tokens[i++]);
    if (Number.isNaN(n)) throw new Error('num');
    return n;
  };
  try {
    const v = expr();
    return i === tokens.length ? v : null;
  } catch { return null; }
}

function convert(value, from, to) {
  const temp = (u) => u === 'C' || u === 'F' || u === 'K';
  if (temp(from) && temp(to)) {
    const c = from === 'C' ? value : from === 'F' ? (value - 32) * 5 / 9 : value - 273.15;
    return to === 'C' ? c : to === 'F' ? c * 9 / 5 + 32 : c + 273.15;
  }
  for (const table of Object.values(UNITS)) {
    if (from in table && to in table) return value * table[from] / table[to];
  }
  return null;
}

// Returns the answer text, or null when the question isn't plain math.
function calc(question) {
  const q = question.toLowerCase().replace(/[’‘]/g, "'").replace(/(\d),(?=\d{3}\b)/g, '$1').replace(/[\s?!.=]+$/, '').trim();
  const lead = q.match(LEAD)[0];
  // "15% of $80" is money: drop the symbol to calculate, put it back on the answer
  const words = q.match(/\b(dollars|bucks|euros)$/);
  const money = q.match(/[$€£]/) || (words && [words[1] === 'euros' ? '€' : '$']);
  const cash = (n) => (money ? money[0] + n.toFixed(2).replace(/\B(?=(\d{3})+\.)/g, ',') : fmt(n));
  const body = q.slice(lead.length).replace(/[$€£]\s*(?=\d)/g, '').replace(/\s*(?:dollars|euros|bucks)$/, '')
    .replace(/^how many (\w+) (?:are |is )?(?:in|per) (?:(?:a|an|one) |(\d+(?:\.\d+)?) )?(\w+)$/, (_, to, n, from) => `${n || 1} ${from} to ${to}`).replace(/^to\s+/, '').replace(/°|\s+degrees?(?=\s+[cfk]\b|\s+(?:celsius|fahrenheit|kelvin))/g, '').replace(/\bpercent\b/g, '%')
    .replace(/(\d)\s*(?:times|multiplied by)\s*(?=[\d(])/g, '$1*').replace(/(\d)\s*plus\s*(?=[\d(])/g, '$1+')
    .replace(/(\d)\s*minus\s*(?=[\d(])/g, '$1 - ').replace(/(\d)\s*(?:divided by|over)\s*(?=[\d(])/g, '$1/')
    .replace(/(\d)\s*to the power of\s*(?=[\d(])/g, '$1^').replace(/(\d)\s*squared\b/g, '$1^2').trim();

  let m = body.match(/^(\d+(?:\.\d+)?)\s*%\s*of\s+(\d+(?:\.\d+)?)$/);
  if (m) return `${cash(m[1] * m[2] / 100)}.`;

  // "tip on 45 at 18%" and "18% tip on 45"
  m = body.match(/^(?:(?:a|the)\s+)?(?:(\d+(?:\.\d+)?)\s*%\s*)?tip\s+(?:on|for)\s+(\d+(?:\.\d+)?)(?:\s+at\s+(\d+(?:\.\d+)?)\s*%)?$/);
  if (m && (m[1] || m[3])) {
    const [bill, tip] = [parseFloat(m[2]), m[2] * (m[1] || m[3]) / 100];
    const sym = money ? money[0] : '';
    const two = (n) => sym + n.toFixed(2).replace(/\B(?=(\d{3})+\.)/g, ',');
    return `Tip ${two(tip)}, total ${two(bill + tip)}.`;
  }

  // "percent change from 50 to 75"
  m = body.match(/^(?:(?:the\s+)?%\s*(?:change|increase|decrease|difference)\s+)?(?:from|between)\s+(\d+(?:\.\d+)?)\s+(?:to|and)\s+(\d+(?:\.\d+)?)$/);
  if (m && /%\s*(?:change|increase|decrease|difference)/.test(body)) {
    if (!+m[1]) return 'That starts from zero, so a percent change has no answer.';
    const pct = (m[2] - m[1]) / m[1] * 100;
    return `${pct >= 0 ? 'Up' : 'Down'} ${fmt(Math.abs(pct))}% (${fmt(+m[1])} to ${fmt(+m[2])}).`;
  }

  m = body.match(/^(half|a third|a quarter|one third|one quarter) of (\d+(?:\.\d+)?)$/);
  if (m) return `${cash(m[2] / { half: 2, 'a third': 3, 'one third': 3, 'a quarter': 4, 'one quarter': 4 }[m[1]])}.`;

  m = body.match(/^(?:sqrt\s*\(?|square root of\s+)(\d+(?:\.\d+)?)\)?$/);
  if (m) return `√${m[1]} = ${fmt(Math.sqrt(m[1]))}`;

  m = body.match(/^(\d+(?:\.\d+)?)\s*cubed$/);
  if (m) return `${m[1]}^3 = ${fmt(m[1] ** 3)}`;

  m = body.match(/^(\d+(?:\.\d+)?)\s*%\s*off\s+(\d+(?:\.\d+)?)$/);
  if (m) return `${cash(m[2] * (1 - m[1] / 100))} after ${m[1]}% off.`;

  m = body.match(/^(-?\d+(?:\.\d+)?)\s*([a-z]+)\s+(?:to|in|into|as)\s+([a-z]+)$/);
  if (m && ALIASES[m[2]] && ALIASES[m[3]]) {
    const [value, from, to] = [parseFloat(m[1]), ALIASES[m[2]], ALIASES[m[3]]];
    const out = convert(value, from, to);
    const text = out === null ? null : fmt(out);
    if (text) return `${fmt(value)} ${m[2]} is about ${text} ${m[3]}.`;
  }

  const expression = body.replace(/[x×]/g, '*').replace(/÷/g, '/');
  if (/^[\d\s.+\-*/^()]+$/.test(expression) && /\d\s*[-+*/^]+\s*[\d(]|\d\s*\)/.test(expression)) {
    // "555-1234" is a phone number unless asked as a question or spaced out
    if (!lead && !/[+*/^]| - /.test(expression)) return null;
    const v = evaluate(expression);
    if (v !== null && !Number.isFinite(v) && /\/\s*0+(?![\d.])/.test(expression)) return 'That divides by zero, which has no answer.';
    const text = v === null ? null : fmt(v);
    if (text) return `${body.replace(/\*/g, '×')} = ${money ? cash(v) : text}`;
  }
  return null;
}

module.exports = { calc };
