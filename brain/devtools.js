// Deterministic writing/dev helpers (DESIGN.md §3.8–3.9): JSON → DTO with quicktype, grammar fixes with Harper.
// Both are open source and run locally; neither is a model.

const DTO_LANGUAGES = {
  java: { lang: 'java', options: { 'just-types': 'true', 'array-type': 'list' }, label: 'Java' },
  typescript: { lang: 'typescript', options: { 'just-types': 'true' }, label: 'TypeScript' },
  kotlin: { lang: 'kotlin', options: { framework: 'just-types' }, label: 'Kotlin' },
};

function keysOf(value) {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]);
}

// JSON copied from a README, chat or JS source often sits in a ``` fence, or is a JS object literal: trailing commas,
// single quotes, unquoted keys, comments. The retry rewrites those outside of strings so JSON.parse can take it.
// NaN, Infinity and undefined have no JSON form; the field is kept as null so the other fields still convert.
const PYTHON_LITERALS = { True: 'true', False: 'false', None: 'null', NaN: 'null', Infinity: 'null', undefined: 'null' };

function looseToJson(text) {
  let out = '';
  for (let i = 0; i < text.length; ) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '“' || c === '”') {
      // Word processors and chat apps turn straight quotes into curly ones, which open and close with either glyph.
      const curly = c === '“' || c === '”';
      const closes = (ch) => (curly ? ch === '“' || ch === '”' : ch === c);
      let j = i + 1;
      let body = '';
      while (j < text.length && !closes(text[j])) {
        if (text[j] === '\\' && j + 1 < text.length) body += text[j++];
        body += text[j++];
      }
      if (c !== '"') body = body.replace(/\\'/g, "'").replace(/(^|[^\\])"/g, '$1\\"');
      out += `"${body}"`;
      i = j + 1;
    } else if (text.startsWith('//', i) || text.startsWith('/*', i)) {
      const line = text.startsWith('//', i);
      const end = text.indexOf(line ? '\n' : '*/', i);
      i = end < 0 ? text.length : end + (line ? 0 : 2);
    } else if (c === '}' || c === ']') {
      out = out.replace(/,\s*$/, '') + c;
      i++;
    } else if (text.startsWith('-Infinity', i)) {
      out += 'null';
      i += 9;
    } else if (/[A-Za-z_$]/.test(c)) {
      const word = /^[\w$]+/.exec(text.slice(i))[0];
      const isKey = /^\s*:/.test(text.slice(i + word.length)) && !/^(true|false|null)$/.test(word);
      out += isKey ? `"${word}"` : PYTHON_LITERALS[word] ?? word;
      i += word.length;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

// Tries the text as JSON, then as a JS/Python literal, then with prose cut off before the first and after the last
// bracket ("Here is the response: {...} hope that helps"), then as JSON lines (one object per line, becomes an array).
function parseJson(text) {
  const json = String(text).replace(/^\s*```\w*\s*\n?|\n?\s*```\s*$/g, '');
  const attempt = (s) => {
    try {
      return { value: JSON.parse(s) };
    } catch {
      try {
        return { value: JSON.parse(looseToJson(s)) };
      } catch {
        return null;
      }
    }
  };
  const whole = attempt(json);
  if (whole) return whole.value;
  const start = json.search(/[{[]/);
  const end = Math.max(json.lastIndexOf('}'), json.lastIndexOf(']'));
  const inner = start >= 0 && end > start ? attempt(json.slice(start, end + 1)) : null;
  if (inner) return inner.value;
  const lines = json.split('\n').map((l) => l.trim()).filter(Boolean);
  const rows = lines.length > 1 ? lines.map(attempt) : [];
  if (rows.length && rows.every((r) => r && r.value && typeof r.value === 'object')) return rows.map((r) => r.value);
  JSON.parse(json);
}

// JSON.parse turns 10.0 into the integer 10, so a price would become `long`. Only types are generated, so a written
// decimal point is kept by giving the sample a fraction. Strings are skipped so quoted text is left alone.
const keepDecimals = (text) => String(text).replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?<![\w.])(-?\d+)\.0+(?![\w.])/g, (m, int) => (int === undefined ? m : `${int}.5`));

async function jsonToDto(json, language = 'java', name = 'Root') {
  const { quicktype, InputData, jsonInputForTargetLanguage } = await import('quicktype-core');
  const { lang, options, label } = DTO_LANGUAGES[language];
  // A top-level array (a typical API response) means "one of these"; Java renders nothing for it, so type the elements.
  const parsed = parseJson(keepDecimals(json));
  const samples = Array.isArray(parsed) ? parsed : [parsed];
  const objects = samples.filter((v) => v && typeof v === 'object' && !Array.isArray(v));
  if (!objects.length) return "That JSON has no fields (just plain values), so there are no types to make from it.";
  // Plain getters only bind to JSON keys that are already simple lowercase words. Any other key (first-name, created_at,
  // userId) needs Jackson's @JsonProperty or Spring Boot silently leaves the field null.
  const needsNames = lang === 'java' && keysOf(parsed).some((k) => !/^[a-z][a-z0-9]*$/.test(k));
  const input = jsonInputForTargetLanguage(lang);
  await input.addSource({ name, samples: objects.map((v) => JSON.stringify(v)) });
  const inputData = new InputData();
  inputData.addInput(input);
  const result = await quicktype({ inputData, lang, rendererOptions: needsNames ? { framework: 'jackson', 'array-type': 'list' } : options });
  const code = result.lines.join('\n').replace(/^\/\/ Converter\.java[\s\S]*?(?=^\/\/ \w+\.java$)/m, '').replace(/^\/\/ .*\n\n?/m, '').replace(/^package io\.quicktype;\n\n?/gm, '').trim();
  const each = Array.isArray(parsed) ? ' (one per item in the array)' : '';
  return `**${label} types**${each}\n\`\`\`${lang}\n${code}\n\`\`\``;
}

let linterPromise = null;
function linter() {
  linterPromise ??= (async () => {
    const [{ LocalLinter }, { binaryInlined }] = await Promise.all([import('harper.js'), import('harper.js/binaryInlined')]);
    const instance = new LocalLinter({ binary: binaryInlined });
    await instance.setup();
    return instance;
  })();
  return linterPromise;
}

// Words that are not typos, so a spelling "fix" would damage them: code identifiers (useState), stretched words (sooo)
// and vowel-less abbreviations (tmrw → thaw).
const NOT_A_TYPO = /[a-z][A-Z]|(.)\1\1|^[^aeiouyAEIOUY]+$/;
// Spellings that only differ by regional convention (colour/color, cancelled/canceled, organise/organize, centre/center).
const dialectKey = (w) => w.toLowerCase().replace(/ou/g, 'o').replace(/ll/g, 'l').replace(/is(e|ing|ation)/g, 'iz$1').replace(/yse/g, 'yze').replace(/re\b/g, 'er');
const CHAT_SHORTHAND = new Set('u ur ok k lol omg ty thx pls plz idk imo brb sec ya'.split(' '));

// Harper only knows English and "fixes" other languages into nonsense (Hola → Hold), so a text of three or more words
// with no common English word in it is left alone.
const ENGLISH_WORDS = new Set('the a an and or but of to in on at for with is are was were be been am i you he she it we they me my your this that these those not no do does did have has had will would can could should there their from as if so what when'.split(' '));
function looksEnglish(text) {
  const words = String(text).toLowerCase().match(/[a-z']+/g) || [];
  return words.length < 3 || words.some((w) => ENGLISH_WORDS.has(w));
}

function editDistance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

// Applies Harper's first suggestion for each problem, re-linting after every change so spans stay valid.
// Chat shorthand is skipped: Harper turns "u" into "uh", "thx" into "the" and "lol" into "loll".
async function fixGrammar(text) {
  if (!looksEnglish(text)) return { fixed: text, changes: [], notEnglish: true };
  const harper = await linter();
  let fixed = text;
  const changes = [];
  // Some of Harper's suggestions are wrong or undo each other, so a span is tried once and a few kinds are skipped:
  // an already capitalized word "fixed" to ALL CAPS (Sam → SAM) and a word cut to one letter (im → i, which loses the "am").
  const tried = new Set();
  const usable = (l) => {
    const { start, end } = l.span();
    const word = fixed.slice(start, end);
    const first = l.suggestions()[0];
    if (!first || CHAT_SHORTHAND.has(word.toLowerCase()) || tried.has(`${start}:${word}`)) return false;
    const to = first.get_replacement_text();
    // An unknown name has no near match ("Akankshya" → "Changsha"), and en dashes in phone numbers are style, not errors.
    // Expanding an initialism (ASAP → As soon as possible) is a style opinion, not a fix.
    if (l.lint_kind() === 'Formatting' || (l.lint_kind() === 'Miscellaneous' && /^[A-Z]{2,}$/.test(word))) return false;
    // An all-caps abbreviation (EOD, PDF) is not a misspelling, and a dialect spelling is the user's choice.
    if (l.lint_kind() === 'Spelling' && (/^[A-Z]{2,}s?$/.test(word) || (word.toLowerCase() !== to.toLowerCase() && dialectKey(word) === dialectKey(to)))) return false;
    if (['Spelling', 'Typo'].includes(l.lint_kind()) && NOT_A_TYPO.test(word)) return false;
    if (l.lint_kind() === 'Spelling' && editDistance(word.toLowerCase(), to.toLowerCase()) > Math.max(2, Math.ceil(word.length / 3))) return false;
    return !(/^[A-Z][a-z]/.test(word) && to === word.toUpperCase()) && !(word.length > 1 && to.length === 1);
  };
  for (let i = 0; i < 40; i++) {
    const lint = (await harper.lint(fixed)).find(usable);
    if (!lint) break;
    const span = lint.span();
    const before = fixed.slice(span.start, span.end);
    tried.add(`${span.start}:${before}`);
    const next = await harper.applySuggestion(fixed, lint, lint.suggestions()[0]);
    if (next === fixed) break;
    changes.push(`${before} → ${next.slice(span.start, span.end + (next.length - fixed.length)) || '∅'}`);
    fixed = next;
  }
  return { fixed, changes };
}

module.exports = { jsonToDto, parseJson, fixGrammar, DTO_LANGUAGES };
