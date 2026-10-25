// Shopping Cat (DESIGN.md §3.6): numbers are computed in code, never by a model.
// Extraction order: structured data (JSON-LD / microdata / price meta) → a cached per-domain CSS extractor →
// a page-layout guess (no model) → selectors written once by the model.

// Exact conversion constants to base units (g, ml).
const UNITS = {
  mg: ['g', 0.001], g: ['g', 1], kg: ['g', 1000], oz: ['g', 28.349523125], lb: ['g', 453.59237], lbs: ['g', 453.59237],
  ml: ['ml', 1], cl: ['ml', 10], l: ['ml', 1000], floz: ['ml', 29.5735295625],
};
const MEASURE = /(\d+(?:[.,]\d+)?)\s*(fl\.?\s?oz|mg|kg|g|lbs?|oz|ml|cl|l)\b/gi;

// "12 x 330ml" → 3960 ml · "2 lb 4 oz" → 1020.6 g · "pack of 6" → 6 count. Returns null when nothing parses.
function parseQuantity(text) {
  if (!text) return null;
  const t = String(text).toLowerCase().replace(/×/g, 'x');
  let count = 1;
  const multi = t.match(/(\d+)\s*x\s*\d/) || t.match(/\bpack of (\d+)/) || t.match(/(\d+)\s*[- ]?(?:pack|pk)\b/);
  if (multi) count = Number(multi[1]);
  const measures = [...t.matchAll(MEASURE)].map(([, value, unit]) => {
    const key = unit.replace(/[.\s]/g, '');
    const [base, factor] = UNITS[key] || UNITS[key.replace(/s$/, '')] || [];
    return base ? { base, amount: Number(value.replace(',', '.')) * factor } : null;
  }).filter(Boolean);
  if (measures.length) {
    const base = measures[0].base;
    // Consecutive same-kind measures add up ("2 lb 4 oz"); a multipack multiplies the first one.
    const size = multi && /x/.test(multi[0]) ? measures[0].amount : measures.filter((m) => m.base === base).reduce((sum, m) => sum + m.amount, 0);
    return { amount: size * count, unit: base };
  }
  const pieces = t.match(/(\d+)\s*(?:ct|count|pcs|pieces|pods|tablets|capsules|rolls|bags)\b/);
  if (pieces) return { amount: Number(pieces[1]) * (multi && multi[0] !== pieces[0] ? count : 1), unit: 'count' };
  if (multi) return { amount: count, unit: 'count' };
  return null;
}

function parsePrice(value) {
  if (value == null) return null;
  const m = String(value).replace(/,(?=\d{3}\b)/g, '').match(/(\d+(?:[.,]\d{1,2})?)/);
  return m ? Number(m[1].replace(',', '.')) : null;
}

const CURRENCY_SYMBOL = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', INR: '₹' };

// ---------- structured data ----------
function jsonLdNodes(doc) {
  const out = [];
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(visit);
        out.push(node);
        for (const value of Object.values(node)) visit(value);
      };
      visit(JSON.parse(script.textContent));
    } catch {
      // malformed JSON-LD is common; skip it
    }
  }
  return out;
}

const typeIs = (node, type) => [].concat(node['@type'] || []).includes(type);

function productFromLd(node) {
  const offer = [].concat(node.offers || [])[0] || {};
  const price = parsePrice(offer.price ?? offer.lowPrice);
  if (!node.name || price == null) return null;
  const rating = node.aggregateRating || {};
  return {
    name: String(node.name).trim(),
    price,
    currency: offer.priceCurrency || 'USD',
    rating: rating.ratingValue != null ? Number(rating.ratingValue) : null,
    reviewCount: rating.reviewCount != null ? Number(rating.reviewCount) : rating.ratingCount != null ? Number(rating.ratingCount) : null,
    sizeText: [node.size, node.weight?.value && `${node.weight.value} ${node.weight.unitText || node.weight.unitCode || ''}`, node.name].filter(Boolean).join(' '),
    url: node.url || offer.url || null,
  };
}

function productsFromMicrodata(doc) {
  return [...doc.querySelectorAll('[itemtype*="schema.org/Product"]')].map((el) => {
    const prop = (name) => {
      const node = el.querySelector(`[itemprop="${name}"]`);
      return node ? node.getAttribute('content') || node.textContent.trim() : null;
    };
    const price = parsePrice(prop('price'));
    const name = prop('name');
    if (!name || price == null) return null;
    return { name, price, currency: prop('priceCurrency') || 'USD', rating: parsePrice(prop('ratingValue')), reviewCount: parsePrice(prop('reviewCount')), sizeText: name, url: null };
  }).filter(Boolean);
}

function extractStructured(doc) {
  const fromLd = jsonLdNodes(doc).filter((n) => typeIs(n, 'Product')).map(productFromLd).filter(Boolean);
  const items = fromLd.length ? fromLd : productsFromMicrodata(doc);
  if (!items.length) {
    const meta = (p) => doc.querySelector(`meta[property="${p}"]`)?.getAttribute('content');
    const price = parsePrice(meta('product:price:amount') || meta('og:price:amount'));
    const name = meta('og:title') || doc.querySelector('title')?.textContent;
    if (price != null && name) items.push({ name: name.trim(), price, currency: meta('product:price:currency') || 'USD', rating: null, reviewCount: null, sizeText: name, url: null });
  }
  // De-duplicate products that appear both in a list and on their own.
  const seen = new Set();
  return items.filter((i) => !seen.has(`${i.name}|${i.price}`) && seen.add(`${i.name}|${i.price}`));
}

// ---------- per-domain extractor (CSS selectors) ----------
function applyExtractor(doc, extractor) {
  return [...doc.querySelectorAll(extractor.item)].map((card) => {
    const text = (sel) => (sel ? card.querySelector(sel)?.textContent.replace(/\s+/g, ' ').trim() : null) || null;
    const name = text(extractor.name);
    const price = parsePrice(text(extractor.price));
    if (!name || price == null) return null;
    return { name, price, currency: 'USD', rating: parsePrice(text(extractor.rating)), reviewCount: parsePrice(text(extractor.reviews)), sizeText: name, url: null };
  }).filter(Boolean);
}

const PRICE_TEXT = /[$€£¥₹]\s?\d/;
const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).filter(Boolean).join(' ');
// tag.class, keeping only classes that are valid in a selector without escaping (utility classes like "md:flex" aren't).
const cssStep = (el) => [el.tagName.toLowerCase(), ...String(el.className || '').trim().split(/\s+/).filter((c) => /^-?[_a-z][\w-]*$/i.test(c))].join('.');

// Compact "flat JSON" outline of repeated, price-bearing elements: the input format that makes LLM extraction
// reliable (NEXT-EVAL: flat JSON F1 0.96 vs slimmed HTML 0.10).
function outlineForExtractor(doc) {
  const lines = [];
  for (const el of doc.querySelectorAll('body *')) {
    if (lines.length >= 60) break;
    const own = ownText(el);
    if (!own || !(PRICE_TEXT.test(own) || el.parentElement?.textContent.match(PRICE_TEXT))) continue;
    const path = [];
    for (let n = el; n && n.tagName && n.tagName !== 'BODY' && path.length < 4; n = n.parentElement) path.unshift(cssStep(n));
    lines.push({ path: path.join(' > '), text: own.slice(0, 60) });
  }
  return lines;
}

// The card is the largest ancestor of a price that holds no other price, and the name is the card's longest text
// that is neither a price nor a button ("Add to cart" is never a product name). Tried before the model; a guess
// only counts when it names every product differently.
const CTA = /^(?:add to (?:cart|bag|basket)|buy(?: it)? now|add|buy|shop now|view|details|quick view|in stock|out of stock|sold out)$/i;
// ponytail: tries the first 10 prices only; a page whose first prices sit outside the listing falls through to null.
function guessExtractor(doc) {
  const prices = [...doc.querySelectorAll('body *')].filter((el) => PRICE_TEXT.test(ownText(el))).slice(0, 200);
  const relative = (card, el) => {
    const steps = [];
    for (let n = el; n && n !== card; n = n.parentElement) steps.unshift(cssStep(n));
    return steps.join(' > ');
  };
  for (const price of prices.slice(0, 10)) {
    let card = price;
    while (card.parentElement && card.parentElement.tagName !== 'BODY' && prices.filter((p) => card.parentElement.contains(p)).length === 1) card = card.parentElement;
    if (card === price) continue;
    const names = [...card.querySelectorAll('*')].filter((el) => !el.contains(price) && ownText(el) && !PRICE_TEXT.test(ownText(el)) && el.tagName !== 'BUTTON' && !CTA.test(ownText(el)));
    const name = names.sort((a, b) => ownText(b).length - ownText(a).length)[0];
    if (!name) continue;
    const extractor = { item: cssStep(card), name: relative(card, name), price: relative(card, price) };
    if (validExtractor(doc, extractor) && new Set(applyExtractor(doc, extractor).map((i) => i.name)).size >= 2) return extractor;
  }
  return null;
}

// Why selectors fail, in words the model can act on for its one retry.
function explainExtractor(doc, extractor) {
  if (!extractor?.item) return 'it had no "item" selector';
  let cards;
  try {
    cards = [...doc.querySelectorAll(extractor.item)];
  } catch {
    return `"${extractor.item}" is not a valid CSS selector`;
  }
  let found;
  try {
    found = applyExtractor(doc, extractor).length;
  } catch {
    return `"${extractor.name}" or "${extractor.price}" is not a valid CSS selector`;
  }
  return `"item" matched ${cards.length} element${cards.length === 1 ? '' : 's'} and only ${found} had both a name and a price inside; "item" must match each repeated product card, and "name" and "price" must be inside it`;
}

function validExtractor(doc, extractor) {
  try {
    return extractor?.item && applyExtractor(doc, extractor).length >= 2;
  } catch {
    return false;
  }
}

// ---------- analysis ----------
const UNIT_LABEL = { g: 'per 100 g', ml: 'per 100 ml', count: 'each' };
const UNIT_FACTOR = { g: 100, ml: 100, count: 1 };

function analyze(items, pageText = '') {
  const enriched = items.map((item) => {
    const quantity = parseQuantity(item.sizeText || item.name);
    return { ...item, quantity, unitPrice: quantity ? item.price / quantity.amount : null };
  });
  // Compare unit prices only within the most common unit kind (g vs ml vs count).
  const kinds = {};
  for (const i of enriched) if (i.quantity) kinds[i.quantity.unit] = (kinds[i.quantity.unit] || 0) + 1;
  const unit = Object.entries(kinds).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const comparable = enriched.filter((i) => i.quantity?.unit === unit);

  const byPrice = [...enriched].sort((a, b) => a.price - b.price);
  const cheapest = byPrice[0];
  const bestPerUnit = comparable.length ? [...comparable].sort((a, b) => a.unitPrice - b.unitPrice)[0] : null;
  const score = (i) => i.unitPrice * (i.rating != null && i.rating < 4 ? 1.15 : 1) * (i.reviewCount != null && i.reviewCount < 20 ? 1.1 : 1);
  const bestValue = comparable.length ? [...comparable].sort((a, b) => score(a) - score(b))[0] : cheapest;

  for (const i of enriched) {
    i.warnings = [];
    if (i.sponsored) i.warnings.push('sponsored');
    if (i.reviewCount != null && i.reviewCount < 20) i.warnings.push(`only ${i.reviewCount} reviews`);
    if (i.rating != null && i.rating < 3.5) i.warnings.push(`${i.rating}★`);
    if (i.wasPrice && i.wasPrice > i.price * 1.5) i.warnings.push('suspicious "was" price');
  }
  const pageWarnings = [];
  if (/subscribe\s*(&|and)\s*save|auto[- ]?renew|recurring delivery/i.test(pageText)) pageWarnings.push('Subscription offers on the page: check it is a one-time purchase.');
  if (/\bminimum order\b|\+\s?[$€£]\s?\d+(\.\d{2})?\s*(shipping|delivery)/i.test(pageText)) pageWarnings.push('Shipping or a minimum order changes the real price.');

  const perUnit = comparable.map((i) => i.unitPrice);
  const premium = perUnit.length > 1 ? (Math.max(...perUnit) - Math.min(...perUnit)) / Math.min(...perUnit) : 0;
  const mixedUnits = Object.keys(kinds).length > 1;
  return { items: enriched, unit, cheapest, bestPerUnit, bestValue, premium, pageWarnings, mixedUnits };
}

// Verdict lines keyed on computed facts: the Judgmental personality lives here, not in a model.
function verdict({ items, unit, cheapest, bestValue, premium, mixedUnits }, { judgmental = true } = {}) {
  if (!items.length) return { text: "I couldn't find prices I trust on this page.", mood: 'confused' };
  if (mixedUnits) return { text: `These are different kinds of products (some by weight, some by volume or count), so only total prices compare. ${short(cheapest.name)} is the cheapest at ${money(cheapest)}.`, mood: 'curious' };
  if (items.length === 1) return { text: `One product here: ${short(items[0].name)} at ${money(items[0])}. Add it to your compare basket to weigh it against others.`, mood: 'curious' };
  const expensive = [...items].filter((i) => i.unitPrice != null).sort((a, b) => b.unitPrice - a.unitPrice)[0];
  if (bestValue === cheapest) return { text: `${short(cheapest.name)} is the cheapest *and* the best value. Easy choice.`, mood: 'happy' };
  if (premium > 0.4 && expensive) {
    const sass = judgmental ? " You'd be paying for the logo." : '';
    return { text: `${short(bestValue.name)} is the best value. ${short(expensive.name)} costs ${Math.round(premium * 100)}% more ${UNIT_LABEL[unit]}.${sass}`, mood: judgmental ? 'judgy' : 'focused' };
  }
  return { text: `${short(bestValue.name)} wins ${UNIT_LABEL[unit] || 'on price'}, but it's close.`, mood: 'focused' };
}

const short = (name) => (name.length > 42 ? `${name.slice(0, 40)}…` : name);
const money = (item, value = item.price) => `${CURRENCY_SYMBOL[item.currency] || ''}${value.toFixed(2)}${CURRENCY_SYMBOL[item.currency] ? '' : ` ${item.currency}`}`;

// Markdown table for the bubble: top five by value, with badges.
function renderTable(analysis) {
  const { items, unit, cheapest, bestPerUnit, bestValue, pageWarnings } = analysis;
  const ranked = [...items].sort((a, b) => (a.unitPrice ?? Infinity) - (b.unitPrice ?? Infinity) || a.price - b.price).slice(0, 5);
  const rows = ranked.map((i) => {
    const badges = [i === bestValue && '🏆 value', i === cheapest && '💸 cheapest', i === bestPerUnit && i !== bestValue && '⚖️ per unit'].filter(Boolean);
    const per = i.unitPrice != null && i.quantity.unit === unit ? money(i, i.unitPrice * UNIT_FACTOR[unit]) : '—';
    return `| ${short(i.name)} | ${money(i)} | ${per} | ${[...badges, ...i.warnings].join(', ')} |`;
  });
  const header = `| Item | Price | ${unit ? UNIT_LABEL[unit] : 'Per unit'} | |\n|---|---|---|---|`;
  const warnings = pageWarnings.length ? `\n\n${pageWarnings.map((w) => `⚠️ ${w}`).join('\n')}` : '';
  return `${header}\n${rows.join('\n')}${warnings}`;
}

module.exports = { parseQuantity, parsePrice, extractStructured, applyExtractor, outlineForExtractor, validExtractor, guessExtractor, explainExtractor, analyze, verdict, renderTable, money, short };
