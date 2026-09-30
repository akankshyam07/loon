// Review summaries without a model (DESIGN.md §3.6): aspect lexicon + sentiment lexicon + TextRank quotes,
// in the spirit of Hu & Liu (2004) aspect-based opinion summarization.
const { keySentences } = require('./textrank');

const ASPECTS = {
  quality: /\b(quality|well[- ]made|sturdy|flimsy|cheaply made|build)\b/i,
  durability: /\b(broke|broken|lasted|durable|fell apart|stopped working|months? later)\b/i,
  size: /\b(size|sizing|fit|fits|too small|too big|runs small|runs large)\b/i,
  comfort: /\b(comfortable|comfy|uncomfortable|soft|itchy)\b/i,
  battery: /\b(battery|charge|charging)\b/i,
  taste: /\b(taste|tastes|flavou?r|delicious|bland)\b/i,
  smell: /\b(smell|scent|odou?r)\b/i,
  shipping: /\b(shipping|delivery|arrived|package|packaging)\b/i,
  price: /\b(price|value|worth|expensive|cheap|overpriced)\b/i,
  service: /\b(customer service|support|refund|return(ed)?)\b/i,
};
const POSITIVE = /\b(love|loved|great|excellent|perfect|amazing|good|nice|happy|recommend|sturdy|durable|comfortable|delicious|fast|worth|well[- ]made|soft|best)\b/gi;
const NEGATIVE = /\b(bad|poor|terrible|awful|broke|broken|flimsy|disappointed|disappointing|return(ed)?|refund|waste|cheaply|leak(s|ed)?|slow|late|itchy|bland|overpriced|stopped working|fell apart|small|worst|never again)\b/gi;

// reviews: [{ text, rating? }] → markdown summary
function summarizeReviews(reviews) {
  const usable = reviews.filter((r) => r.text && r.text.trim().length > 10);
  if (!usable.length) return null;
  const tally = {};
  for (const { text } of usable) {
    // Short sentences matter in reviews ("Shipping was fast."), so split more loosely than TextRank does.
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      const pos = (sentence.match(POSITIVE) || []).length;
      const neg = (sentence.match(NEGATIVE) || []).length;
      if (pos === neg) continue;
      for (const [aspect, re] of Object.entries(ASPECTS)) {
        if (!re.test(sentence)) continue;
        tally[aspect] ??= { pos: 0, neg: 0 };
        tally[aspect][pos > neg ? 'pos' : 'neg']++;
      }
    }
  }
  const ranked = Object.entries(tally).sort((a, b) => b[1].pos + b[1].neg - (a[1].pos + a[1].neg));
  const pros = ranked.filter(([, t]) => t.pos > t.neg).map(([a, t]) => `${a} (${t.pos})`);
  const cons = ranked.filter(([, t]) => t.neg > t.pos).map(([a, t]) => `${a} (${t.neg})`);
  const mixed = ranked.filter(([, t]) => t.neg === t.pos).map(([a]) => a);
  const ratings = usable.map((r) => r.rating).filter((r) => typeof r === 'number');
  const stars = ratings.length ? `Average ${(ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)}★ from ${ratings.length} ratings. ` : '';
  const quotes = keySentences(usable.map((r) => r.text).join(' '), 2);
  return [
    `${stars}Based on ${usable.length} visible review${usable.length > 1 ? 's' : ''}.`,
    pros.length ? `👍 **People like:** ${pros.join(', ')}` : '',
    cons.length ? `👎 **Complaints:** ${cons.join(', ')}` : '',
    mixed.length ? `🤷 **Mixed:** ${mixed.join(', ')}` : '',
    quotes.length ? quotes.map((q) => `> ${q}`).join('\n') : '',
  ].filter(Boolean).join('\n\n');
}

// Pulls visible reviews from a DOM: JSON-LD Review objects first, then common review markup.
function extractReviews(doc) {
  const out = [];
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(visit);
        if ([].concat(node['@type'] || []).includes('Review') && node.reviewBody) {
          out.push({ text: String(node.reviewBody), rating: node.reviewRating ? Number(node.reviewRating.ratingValue) : undefined });
        }
        Object.values(node).forEach(visit);
      };
      visit(JSON.parse(script.textContent));
    } catch {
      // ignore malformed JSON-LD
    }
  }
  if (out.length) return out;
  for (const el of doc.querySelectorAll('[itemprop="review"], [data-hook="review"], .review, .reviews li, [class*="review-text"]')) {
    const text = (el.querySelector('[itemprop="reviewBody"], .review-text, p') || el).textContent.replace(/\s+/g, ' ').trim();
    const rating = Number(el.querySelector('[itemprop="ratingValue"]')?.getAttribute('content')) || undefined;
    if (text) out.push({ text, rating });
  }
  return out;
}

module.exports = { summarizeReviews, extractReviews };
