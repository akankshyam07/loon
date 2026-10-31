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
function looseToJson(text) {
  let out = '';
  for (let i = 0; i < text.length; ) {
    const c = text[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      let body = '';
      while (j < text.length && text[j] !== c) {
        if (text[j] === '\\' && j + 1 < text.length) body += text[j++];
        body += text[j++];
      }
      if (c === "'") body = body.replace(/\\'/g, "'").replace(/(^|[^\\])"/g, '$1\\"');
      out += `"${body}"`;
      i = j + 1;
    } else if (text.startsWith('//', i) || text.startsWith('/*', i)) {
      const line = text.startsWith('//', i);
      const end = text.indexOf(line ? '\n' : '*/', i);
      i = end < 0 ? text.length : end + (line ? 0 : 2);
    } else if (c === '}' || c === ']') {
      out = out.replace(/,\s*$/, '') + c;
      i++;
    } else if (/[A-Za-z_$]/.test(c)) {
      const word = /^[\w$]+/.exec(text.slice(i))[0];
      const isKey = /^\s*:/.test(text.slice(i + word.length)) && !/^(true|false|null)$/.test(word);
      out += isKey ? `"${word}"` : word;
      i += word.length;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function parseJson(text) {
  const json = String(text).replace(/^\s*```\w*\s*\n?|\n?\s*```\s*$/g, '');
  try {
    return JSON.parse(json);
  } catch (err) {
    try {
      return JSON.parse(looseToJson(json));
    } catch {
      throw err;
    }
  }
}

async function jsonToDto(json, language = 'java', name = 'Root') {
  const { quicktype, InputData, jsonInputForTargetLanguage } = await import('quicktype-core');
  const { lang, options, label } = DTO_LANGUAGES[language];
  // A top-level array (a typical API response) means "one of these"; Java renders nothing for it, so type the elements.
  const parsed = parseJson(json);
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

// Harper only knows English and "fixes" other languages into nonsense (Hola → Hold), so a text of three or more words
// with no common English word in it is left alone.
const ENGLISH_WORDS = new Set('the a an and or but of to in on at for with is are was were be been am i you he she it we they me my your this that these those not no do does did have has had will would can could should there their from as if so what when'.split(' '));
function looksEnglish(text) {
  const words = String(text).toLowerCase().match(/[a-z']+/g) || [];
  return words.length < 3 || words.some((w) => ENGLISH_WORDS.has(w));
}

// Applies Harper's first suggestion for each problem, re-linting after every change so spans stay valid.
// Chat shorthand like "u" is skipped: Harper turns it into "uh" and then drops it.
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
    if (!first || /^u$/i.test(word) || tried.has(`${start}:${word}`)) return false;
    const to = first.get_replacement_text();
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
