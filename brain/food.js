// Food Cat (DESIGN.md §3.7): picks from keywords, no model. Numbers only when the user asks ("Estimate calories"),
// and those are labelled estimated. Allergens are never promised.

// "$9", "€11,50", "14.00 €" or a bare "13.50" at the end of the line
const PRICE = /([$€£])\s?(\d+(?:[.,]\d{2})?)|(\d+(?:[.,]\d{2})?)\s?([€£])|\s(\d+[.,]\d{2})\s*$/;
// Promos, fees and add-ons share the line shape of a dish but are not dishes. "gluten-free" is a dish.
const NOT_A_DISH = /\b(off|(?<!-)free|delivery|tax|tip|service charge|discount|coupon|minimum|surcharge)\b|^\s*(add|extra|\+)/i;
const HEAVY = { fried: 3, 'deep-fried': 4, crispy: 2, battered: 3, breaded: 2, creamy: 2, cream: 2, cheese: 1.5, cheesy: 2, alfredo: 3, aioli: 2, mayo: 2, butter: 1.5, bacon: 2, sausage: 2, loaded: 2, smothered: 2, gravy: 2, carbonara: 3, ranch: 1.5, fries: 2, 'double': 1.5, pastry: 2, 'pork belly': 3 };
const LIGHT = { grilled: -2, steamed: -3, baked: -1, roasted: -1, poached: -2, salad: -2, broth: -2, 'raw': -1, sashimi: -2, vinaigrette: -1, greens: -1, vegetable: -1, veggie: -1, lean: -2 };
const PROTEIN = /\b(chicken|turkey|salmon|tuna|shrimp|prawns?|beef|steak|pork|tofu|tempeh|egg whites?|eggs?|lentils?|chickpeas?|beans|edamame|greek yogurt|cod|fish|seitan)\b/gi;
const MEAT = /\b(chicken|turkey|beef|steak|pork|bacon|ham|sausage|salami|pepperoni|lamb|veal|venison|duck|prosciutto|chorizo|meatballs?|(?:ham|cheese)?burger|hot dogs?|brisket|pastrami|ribs|anchov(y|ies)|fish|salmon|tuna|shrimp|prawns?|cod|crab|lobster|clams?|mussels|oysters?|scallops?|squid|calamari|octopus|gelatin)\b/i;
// "veggie burger" and friends name a meat dish on purpose without meat
const MEAT_FREE = /\b(veggie|vegetarian|vegan|plant-based|meatless|impossible|beyond)\s+(?:(?:meat|beef)\s+)?(?:(?:ham|cheese)?burgers?|sausages?|hot dogs?|meatballs?|bacon|chicken|ribs)\b/gi;
const TIPS = [
  [/\bdressing\b/i, 'Ask for the dressing on the side.'],
  [/\baioli|mayo\b/i, 'Skip or halve the aioli/mayo.'],
  [/\bfries\b/i, 'Swap the fries for a side salad.'],
  [/\bcream(y)? sauce|alfredo|carbonara\b/i, 'Ask for a tomato or olive-oil sauce instead of cream.'],
  [/\bcheese\b/i, 'Ask for light cheese.'],
  [/\bfried|crispy|battered\b/i, 'Ask if it can be grilled instead of fried.'],
  [/\bbun|bread|brioche\b/i, 'Lettuce wrap instead of the bun.'],
];

// Menu items from plain text: a line with a price, optionally followed by a description line.
function extractMenu(text) {
  const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(PRICE);
    if (!m || NOT_A_DISH.test(lines[i])) continue;
    // "Soup $6 | Bowl $8": the dish is the text before the first price
    const name = (lines[i].match(new RegExp(PRICE.source, 'g')).length > 1 ? lines[i].slice(0, m.index) : lines[i].replace(PRICE, '')).replace(/[.·…\-–|]+\s*$/, '').replace(/^[.·…\-–|\s]+/, '').replace(/\s{2,}/g, ' ').trim();
    if (!name || name.length > 80) continue;
    const next = lines[i + 1];
    const description = next && !PRICE.test(next) && next.length > 15 ? next : '';
    items.push({ name, price: Number((m[2] || m[3] || m[5]).replace(',', '.')), currency: m[1] || m[4] || '$', description });
  }
  return items;
}

function score(item) {
  const text = `${item.name} ${item.description}`.toLowerCase();
  let heaviness = 0;
  const reasons = [];
  for (const [word, weight] of Object.entries({ ...HEAVY, ...LIGHT })) {
    if (new RegExp(`\\b${word}\\b`).test(text)) {
      heaviness += weight;
      reasons.push(word);
    }
  }
  const proteins = [...new Set((text.match(PROTEIN) || []).map((p) => p.toLowerCase()))];
  return { ...item, heaviness, reasons, proteins, likelyVegetarian: !MEAT.test(text.replace(MEAT_FREE, '').replace(/\b[a-z]+-free\b/g, '')), tips: TIPS.filter(([re]) => re.test(text)).map(([, tip]) => tip) };
}

const GOALS = {
  lightest: { title: 'Lightest picks', sort: (a, b) => a.heaviness - b.heaviness },
  protein: { title: 'Probably highest protein', sort: (a, b) => b.proteins.length - a.proteins.length || a.heaviness - b.heaviness, filter: (i) => i.proteins.length },
  vegetarian: { title: 'Likely vegetarian', sort: (a, b) => a.heaviness - b.heaviness, filter: (i) => i.likelyVegetarian },
};

function recommend(items, goal = 'lightest', { count = 3, vegetarianOnly = false, judgmental = true } = {}) {
  const { title, sort, filter } = GOALS[goal];
  const picks = items.map(score).filter(filter || (() => true)).filter((i) => !vegetarianOnly || i.likelyVegetarian).sort(sort).slice(0, count);
  if (!picks.length) return { text: `Nothing on this menu looks ${goal === 'vegetarian' ? 'vegetarian' : 'like a match'}.`, mood: 'confused' };
  const lines = picks.map((p) => {
    const why = p.reasons.length ? ` (${p.reasons.join(', ')})` : '';
    const protein = goal === 'protein' ? ` · protein from ${p.proteins.join(', ')}` : '';
    const tip = p.tips[0] ? `\n  _Tip: ${p.tips[0]}_` : '';
    return `- **${p.name}**${p.price ? ` ${p.currency || '$'}${p.price.toFixed(2)}` : ''}${why}${protein}${tip}`;
  });
  const note = goal === 'vegetarian' ? '\n\nBased on ingredients listed; ask the restaurant about allergens and hidden meat stocks.' : '\n\nFrom menu wording only: no numbers here. Tap "Estimate calories" for rough estimates.';
  const heavy = items.map(score).sort((a, b) => b.heaviness - a.heaviness)[0];
  const quip = judgmental && goal === 'lightest' && heavy && heavy.heaviness >= 5 && (!vegetarianOnly || heavy.likelyVegetarian) ? `\n\nTiny warning: ${heavy.name} is probably doing crimes.` : '';
  const filtered = vegetarianOnly && goal !== 'vegetarian' ? '\n\n_Only vegetarian picks, because you asked me to remember that._' : '';
  return { text: `**${title}**\n${lines.join('\n')}${note}${filtered}${quip}`, mood: quip ? 'judgy' : 'happy' };
}

module.exports = { extractMenu, score, recommend };
