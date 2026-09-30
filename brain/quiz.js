// Study Cat (DESIGN.md §3.11): cloze cards from a page's key sentences, graded in code. No model.
const { keySentences } = require('./textrank');
const { grade } = require('../renderer/lib/grade');

const STOP = new Set(`about above after again against because before being below between could doing during every
further having here itself might other ought ourselves should their theirs themselves there these those through under
until where which while whom would yours yourself also many much more most some such than that then this very what when
with from into only just like make made were been does have will your they them said everything something anything
nothing everyone someone anyone thing things really always usually often`.split(/\s+/));

// Picks the most informative word in a sentence: a capitalized name mid-sentence, a number, else the longest
// uncommon word that also appears elsewhere in the text (so it is about the topic, not a random adjective).
function pickAnswer(sentence, frequency, used) {
  const words = sentence.match(/[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'-]+|\d[\d,.]*/g) || [];
  const top = Math.max(...frequency.values());
  const scored = words.slice(1).map((w) => {
    const lower = w.toLowerCase();
    if (STOP.has(lower) || w.length < 4 || used.has(lower)) return null;
    const freq = frequency.get(lower) || 0;
    // Topical (appears again) but not the page's main word, which would make every card trivial.
    let score = w.length + (freq > 1 ? 3 : 0) - (freq >= top * 0.6 ? 12 : 0);
    if (/^[A-Z]/.test(w)) score += 6;
    if (/^\d/.test(w)) score += 5;
    return { w, score };
  }).filter(Boolean);
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.w || null;
}

function makeQuiz(text, count = 3) {
  const frequency = new Map();
  for (const w of text.toLowerCase().match(/[a-zà-ɏ'-]{4,}/g) || []) frequency.set(w, (frequency.get(w) || 0) + 1);
  const used = new Set();
  return keySentences(text, count + 2)
    .map((sentence) => {
      const answer = pickAnswer(sentence, frequency, used);
      if (!answer) return null;
      used.add(answer.toLowerCase());
      return { prompt: sentence.replace(answer, '_____'), answer };
    })
    .filter(Boolean)
    .slice(0, count);
}

module.exports = { makeQuiz, grade };
