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

// Edit distance where swapping two neighbouring letters is one edit ("recieve" → "receive").
function typoDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// Harper lists spelling fixes in no useful order ("probly" → poly, probably). The closest to what was typed wins,
// then the longer shared start, then Harper's order.
function bestSuggestion(lint, typed) {
  const options = lint.suggestions();
  if (lint.lint_kind() !== 'Spelling' || options.length < 2) return options[0];
  const word = typed.toLowerCase();
  const prefix = (s) => { let n = 0; while (n < s.length && s[n] === word[n]) n++; return n; };
  return options
    .map((o, i) => ({ o, i, text: o.get_replacement_text().toLowerCase() }))
    .sort((x, y) => typoDistance(word, x.text) - typoDistance(word, y.text) || prefix(y.text) - prefix(x.text) || x.i - y.i)[0].o;
}

// Applies the best suggestion for each problem, re-linting after every change so spans stay valid.
async function fixGrammar(text) {
  const harper = await linter();
  let fixed = text;
  const changes = [];
  for (let i = 0; i < 40; i++) {
    const lint = (await harper.lint(fixed)).find((l) => l.suggestions().length);
    if (!lint) break;
    const span = lint.span();
    const before = fixed.slice(span.start, span.end);
    const next = await harper.applySuggestion(fixed, lint, bestSuggestion(lint, before));
    if (next === fixed) break;
    changes.push(`${before} → ${next.slice(span.start, span.end + (next.length - fixed.length)) || '∅'}`);
    fixed = next;
  }
  return { fixed, changes };
}

module.exports = { jsonToDto, fixGrammar, typoDistance, DTO_LANGUAGES };
