// TextRank (Mihalcea & Tarau 2004): picks a page's key sentences with no model.
// Used for the instant tl;dr, for on-page highlights, and to trim long pages before an LLM call.

const STOPWORDS = new Set(`a about above after again against all am an and any are as at be because been before being below
between both but by can could did do does doing down during each few for from further had has have having he her here hers
him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our out over own
same she should so some such than that the their them then there these they this those through to too under until up very
was we were what when where which while who whom why will with would you your also may one new like get us use used using`
  .split(/\s+/));

const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

function splitSentences(text) {
  return [...segmenter.segment(text.replace(/\s+/g, ' '))]
    .map((s) => s.segment.trim())
    .filter((s) => s.split(' ').length >= 5 && s.length <= 600);
}

function words(sentence) {
  return (sentence.toLowerCase().match(/[a-z0-9À-ɏ]+/g) || []).filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// Returns the top `count` sentences, in their original order.
function keySentences(text, count = 5) {
  const sentences = splitSentences(text).slice(0, 400);
  if (sentences.length <= count) return sentences;
  const bags = sentences.map((s) => new Set(words(s)));
  const n = sentences.length;
  const weights = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (bags[i].size < 2 || bags[j].size < 2) continue;
      let overlap = 0;
      for (const w of bags[i]) if (bags[j].has(w)) overlap++;
      const sim = overlap / (Math.log(bags[i].size) + Math.log(bags[j].size));
      weights[i][j] = weights[j][i] = sim;
    }
  }
  const outSum = weights.map((row) => row.reduce((a, b) => a + b, 0));
  let score = new Float64Array(n).fill(1);
  for (let iter = 0; iter < 30; iter++) {
    const next = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) if (weights[j][i] && outSum[j]) sum += (weights[j][i] / outSum[j]) * score[j];
      next[i] = 0.15 + 0.85 * sum;
    }
    score = next;
  }
  return [...score.keys()]
    .sort((a, b) => score[b] - score[a])
    .slice(0, count)
    .sort((a, b) => a - b)
    .map((i) => sentences[i]);
}

// Trims a long page for a small-context local model: key sentences first, then the start of the text.
function trimForModel(text, maxChars) {
  if (text.length <= maxChars) return text;
  const keys = keySentences(text, 12).join(' ');
  return `Key sentences: ${keys}\n\nBeginning of the page: ${text.slice(0, Math.max(0, maxChars - keys.length - 40))}`;
}

module.exports = { keySentences, splitSentences, trimForModel };
