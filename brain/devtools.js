// Deterministic writing/dev helpers (DESIGN.md §3.8–3.9): JSON → DTO with quicktype, grammar fixes with Harper.
// Both are open source and run locally; neither is a model.

const DTO_LANGUAGES = {
  java: { lang: 'java', options: { 'just-types': 'true', 'array-type': 'list' }, label: 'Java' },
  typescript: { lang: 'typescript', options: { 'just-types': 'true' }, label: 'TypeScript' },
  kotlin: { lang: 'kotlin', options: { framework: 'just-types' }, label: 'Kotlin' },
};

async function jsonToDto(json, language = 'java', name = 'Root') {
  const { quicktype, InputData, jsonInputForTargetLanguage } = await import('quicktype-core');
  const { lang, options, label } = DTO_LANGUAGES[language];
  const input = jsonInputForTargetLanguage(lang);
  await input.addSource({ name, samples: [json] });
  const inputData = new InputData();
  inputData.addInput(input);
  const result = await quicktype({ inputData, lang, rendererOptions: options });
  const code = result.lines.join('\n').replace(/^\/\/ .*\n\n?/m, '').replace(/^package io\.quicktype;\n\n?/m, '').trim();
  return `**${label} types**\n\`\`\`${lang}\n${code}\n\`\`\``;
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
  for (let i = 0; i < 40; i++) {
    const lint = (await harper.lint(fixed)).find((l) => l.suggestions().length && !/^u$/i.test(fixed.slice(l.span().start, l.span().end)));
    if (!lint) break;
    const span = lint.span();
    const before = fixed.slice(span.start, span.end);
    const next = await harper.applySuggestion(fixed, lint, lint.suggestions()[0]);
    if (next === fixed) break;
    changes.push(`${before} → ${next.slice(span.start, span.end + (next.length - fixed.length)) || '∅'}`);
    fixed = next;
  }
  return { fixed, changes };
}

module.exports = { jsonToDto, fixGrammar, DTO_LANGUAGES };
