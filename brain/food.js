// Food Cat (DESIGN.md §3.7): picks from keywords, no model. Numbers only when the user asks ("Estimate calories"),
// and those are labelled estimated. Allergens are never promised.

const PRICE = /[$€£]\s?(\d+(?:\.\d{2})?)/;
const CALORIES = /\b(\d{2,4})\s*(?:k?cals?|calories)\b/i;
const HEAVY = { fried: 3, 'deep-fried': 4, crispy: 2, battered: 3, breaded: 2, creamy: 2, cream: 2, cheese: 1.5, cheesy: 2, alfredo: 3, aioli: 2, mayo: 2, butter: 1.5, bacon: 2, sausage: 2, loaded: 2, smothered: 2, gravy: 2, carbonara: 3, ranch: 1.5, fries: 2, 'double': 1.5, pastry: 2, 'pork belly': 3 };
const LIGHT = { grilled: -2, steamed: -3, baked: -1, roasted: -1, poached: -2, salad: -2, broth: -2, 'raw': -1, sashimi: -2, vinaigrette: -1, greens: -1, vegetable: -1, veggie: -1, lean: -2 };
const PROTEIN = /\b(chicken|turkey|salmon|tuna|shrimp|prawns?|beef|steak|pork|tofu|tempeh|egg whites?|eggs?|lentils?|chickpeas?|beans|edamame|greek yogurt|cod|fish|seitan)\b/gi;
const MEAT = /\b(chicken|turkey|beef|steak|pork|bacon|ham|sausage|salami|pepperoni|lamb|veal|venison|duck|prosciutto|chorizo|meatballs?|burger|anchov(y|ies)|fish|salmon|tuna|shrimp|prawns?|cod|crab|lobster|clams?|mussels|oysters?|scallops?|squid|calamari|octopus|gelatin)\b/i;
// Meat that isn't fish or seafood, for pescatarians.
const LAND_MEAT = /\b(chicken|turkey|beef|steak|pork|bacon|ham|sausage|salami|pepperoni|lamb|veal|venison|duck|prosciutto|chorizo|meatballs?|burger|gelatin)\b/i;
// The menu's own labels beat guessing from ingredients: "(V)", "(VG)", "(GF)", "gluten-free".
const MARKED_VEGAN = /\(\s*vg\s*\)|\bvegan\b/i;
const MARKED_VEGETARIAN = /\(\s*v\s*\)|\bvegetarian\b/i;
const MARKED_GLUTEN_FREE = /\(\s*gf\s*\)|\bgluten[- ]free\b/i;
// Animal products a vegan skips; an item the menu itself calls vegan wins ("vegan ranch").
const NOT_VEGAN = /\b(cheese|parmesan|feta|mozzarella|cheddar|ricotta|goat cheese|cream|creamy|butter|egg|eggs|mayo|aioli|ranch|yogurt|honey|milk|ghee|caesar)\b/i;

// Allergies and intolerances the user saved ("allergic to nuts", "I'm celiac"). Conservative on purpose: a dish is
// skipped when its listed ingredients mention the allergen or a common source of it, and the answer always says to
// tell the staff, because menus leave things out.
const ALLERGENS = [
  { label: 'nuts', said: /\b(?:tree )?nuts?\b|\bpeanuts?\b|\balmonds?\b|\bcashews?\b/i, re: /\b(nuts?|almonds?|cashews?|peanuts?|pecans?|walnuts?|pistachios?|hazelnuts?|macadamia|pine nuts?|praline|pesto|satay|marzipan)\b/i },
  { label: 'gluten', said: /\bgluten\b|\bc[oe]liac\b|\bwheat\b/i, re: /\b(bread|breads|focaccia|buns?|brioche|pasta|noodles?|ramen|udon|flour|croutons?|tortillas?|wheat|barley|rye|soy sauce|breaded|battered|tempura|seitan|couscous|pita|wraps?|dumplings?|crust|pastry|beer|miso)\b/i },
  { label: 'dairy', said: /\bdairy\b|\blactose\b|\bmilk\b/i, re: /\b(cheese|cheesy|parmesan|feta|mozzarella|cheddar|ricotta|burrata|cream|creamy|butter|milk|yogurt|ranch|caesar|ghee|alfredo)\b/i },
  { label: 'shellfish', said: /\bshellfish\b|\bshrimp\b|\bprawns?\b/i, re: /\b(shrimp|prawns?|crab|lobster|clams?|mussels|oysters?|scallops?|crawfish)\b/i },
  { label: 'eggs', said: /\beggs?\b/i, re: /\b(eggs?|mayo|mayonnaise|aioli|caesar|hollandaise|meringue)\b/i },
  { label: 'soy', said: /\bsoy\b/i, re: /\b(soy|tofu|edamame|miso|tempeh)\b/i },
  { label: 'fish', said: /\bfish\b/i, re: /\b(fish|salmon|tuna|cod|anchov(?:y|ies)|sardines?|halibut|tilapia|trout)\b/i },
];

// [{ label, re }] for every allergy or intolerance in the saved memory.
function allergiesFrom(memory = []) {
  const found = [];
  for (const fact of memory) {
    if (!/\ballerg|\bintoleran|\bc[oe]liac\b|\bcan'?t (?:have|eat)\b|\b(?:no|avoid|without)\b|-free\b/i.test(fact)) continue;
    for (const a of ALLERGENS) if (a.said.test(fact) && !found.includes(a)) found.push(a);
  }
  return found;
}

// "vegan" | "vegetarian" | null, from what the user asked Loon to remember.
function dietFrom(memory = []) {
  const text = memory.join(' ');
  if (/\bnot (?:a )?(?:vegetarian|vegan)\b/i.test(text)) return null;
  if (/\bvegan\b|plant[- ]based/i.test(text)) return 'vegan';
  if (/\bpesc[ae]tarian\b|\b(?:only|just) (?:eat )?(?:fish|seafood)\b|\bfish but (?:no|not) meat\b/i.test(text)) return 'pescatarian';
  if (/\bvegetarian\b|\b(?:don'?t|do not|never|can'?t) eat (?:any )?meat\b|\bno meat\b|\bmeat[- ]free\b/i.test(text)) return 'vegetarian';
  return null;
}

const TIPS = [
  [/\bdressing\b/i, 'Ask for the dressing on the side.'],
  [/\baioli|mayo\b/i, 'Skip or halve the aioli/mayo.'],
  [/\bfries\b/i, 'Swap the fries for a side salad.'],
  [/\bcream(y)? sauce|alfredo|carbonara\b/i, 'Ask for a tomato or olive-oil sauce instead of cream.'],
  [/\bcheese\b/i, 'Ask for light cheese.'],
  [/\bfried|crispy|battered\b/i, 'Ask if it can be grilled instead of fried.'],
  [/\bbun|bread|brioche\b/i, 'Lettuce wrap instead of the bun.'],
];

const isDescription = (line) => line.length > 25 || line.includes(',');
// Section headings for things that aren't a meal: "lightest" shouldn't answer "a side of bread".
const EXTRAS_SECTION = /^(?:sides?|side dishes|drinks?|beverages|desserts?|sweets|extras|add[- ]ons|sauces|dips|kids(?: menu)?|breads?)$/i;

// Menu items from plain text. Two layouts: "Name ..... $12" with the description on the next line, or the name and
// description on their own lines above a lone price. Printed calories ("640 cal") on the price line or the line
// after it are kept.
function extractMenu(text) {
  const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const items = [];
  let used = -1; // last line that belongs to an item already
  let extras = false; // inside a sides / drinks / desserts section
  for (let i = 0; i < lines.length; i++) {
    if (!PRICE.test(lines[i]) && lines[i].length < 30) {
      if (EXTRAS_SECTION.test(lines[i])) extras = true;
      else if (/^[A-Z][\w &'-]*$/.test(lines[i]) && !lines[i + 1]?.match(PRICE) && /^[A-Z]/.test(lines[i + 1] || '')) extras = false; // another heading
    }
    const m = lines[i].match(PRICE);
    if (!m) continue;
    let name = lines[i].replace(PRICE, '').replace(CALORIES, '').replace(/[.·…\-–|]+\s*$/, '').replace(/^[.·…\-–|\s]+/, '').trim();
    let description = '';
    let last = i;
    if (name) {
      const next = lines[i + 1];
      if (next && !PRICE.test(next) && !CALORIES.test(next) && next.length > 15) {
        description = next;
        last = i + 1;
      }
    } else {
      const above = lines.slice(Math.max(used + 1, i - 2), i).filter((l) => !PRICE.test(l) && !CALORIES.test(l));
      if (!above.length) continue;
      // Two lines above: name + description, unless the second is short (then the first was a section heading).
      if (above.length === 2 && isDescription(above[1])) [name, description] = above;
      else name = above[above.length - 1];
      if (isDescription(name) && !description) continue; // a description with no name: not an item we can name
    }
    if (!name || name.length > 80) continue;
    const calorieLine = [lines[i], lines[last + 1]].find((l) => l && CALORIES.test(l) && !PRICE.test(l.replace(lines[i], '')));
    const calories = calorieLine ? Number(calorieLine.match(CALORIES)[1]) : null;
    if (calorieLine && calorieLine !== lines[i]) last += 1;
    items.push({ name, price: Number(m[1]), description, ...(calories ? { calories } : {}), ...(extras ? { extra: true } : {}) });
    used = last;
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
  let proteins = [...new Set((text.match(PROTEIN) || []).map((p) => p.toLowerCase()))];
  if (proteins.some((p) => /salmon|tuna|cod/.test(p))) proteins = proteins.filter((p) => p !== 'fish'); // "fish" + "salmon" is one protein
  return { ...item, heaviness, reasons, proteins, likelyVegetarian: MARKED_VEGETARIAN.test(text) || MARKED_VEGAN.test(text) || !MEAT.test(text),
    likelyVegan: MARKED_VEGAN.test(text) || (!MEAT.test(text) && !NOT_VEGAN.test(text)), likelyPescatarian: MARKED_VEGETARIAN.test(text) || MARKED_VEGAN.test(text) || !LAND_MEAT.test(text), markedGlutenFree: MARKED_GLUTEN_FREE.test(text), tips: TIPS.filter(([re]) => re.test(text)).map(([, tip]) => tip) };
}

const GOALS = {
  lightest: { title: 'Lightest picks', sort: (a, b) => (a.calories && b.calories ? a.calories - b.calories : a.heaviness - b.heaviness) },
  protein: { title: 'Probably highest protein', sort: (a, b) => b.proteins.length - a.proteins.length || a.heaviness - b.heaviness, filter: (i) => i.proteins.length },
  vegetarian: { title: 'Likely vegetarian', sort: (a, b) => a.heaviness - b.heaviness, filter: (i) => i.likelyVegetarian },
};

function recommend(items, goal = 'lightest', { count = 3, vegetarianOnly = false, veganOnly = false, pescatarianOnly = false, avoid = [], judgmental = true } = {}) {
  const { title, sort, filter } = GOALS[goal];
  const picks = items.map(score).filter(filter || (() => true)).filter((i) => (!vegetarianOnly || i.likelyVegetarian) && (!veganOnly || i.likelyVegan))
    .filter((i) => !pescatarianOnly || i.likelyPescatarian)
    .filter((i) => !avoid.some((a) => a.re.test(`${i.name} ${i.description}`) && !(a.label === 'gluten' && i.markedGlutenFree)))
    .sort((a, b) => Boolean(a.extra) - Boolean(b.extra) || sort(a, b)).slice(0, count);
  if (!picks.length) {
    const skipping = avoid.length ? ` once I skip anything that mentions ${avoid.map((a) => a.label).join(' or ')}. Ask the staff what they can make for you` : '';
    return { text: `Nothing on this menu looks ${goal === 'vegetarian' ? 'vegetarian' : 'like a match'}${skipping}.`, mood: 'confused' };
  }
  const lines = picks.map((p) => {
    const why = p.calories ? ` · ${p.calories} cal` : p.reasons.length ? ` (${p.reasons.join(', ')})` : '';
    const protein = goal === 'protein' ? ` · protein from ${p.proteins.join(', ')}` : '';
    const tip = p.tips[0] ? `\n  _Tip: ${p.tips[0]}_` : '';
    return `- **${p.name}**${p.price ? ` $${p.price.toFixed(2)}` : ''}${why}${protein}${tip}`;
  });
  const listed = picks.every((p) => p.calories);
  const note = goal === 'vegetarian' ? '\n\nBased on ingredients listed; ask the restaurant about allergens and hidden meat stocks.'
    : listed && goal === 'lightest' ? '\n\nCalories as printed on the menu.'
      : listed ? '\n\nProtein guessed from the ingredients; calories as printed on the menu.'
      : '\n\nFrom menu wording only: no numbers here. Tap "Estimate calories" for rough estimates.';
  const heavy = items.map(score).sort((a, b) => b.heaviness - a.heaviness)[0];
  const quip = judgmental && goal === 'lightest' && heavy && heavy.heaviness >= 5 && (!vegetarianOnly || heavy.likelyVegetarian) ? `\n\nTiny warning: ${heavy.name} is probably doing crimes.` : '';
  const allergy = avoid.length ? `\n\n**Skipping anything that mentions ${avoid.map((a) => a.label).join(' or ')}**, going by the menu's wording. Menus leave things out, so tell the staff about your allergy.` : '';
  const filtered = pescatarianOnly ? '\n\n_No meat, fish is fine, because you asked me to remember that._' : veganOnly ? '\n\n_Only vegan picks (no meat, dairy or eggs listed), because you asked me to remember that._'
    : vegetarianOnly && goal !== 'vegetarian' ? '\n\n_Only vegetarian picks, because you asked me to remember that._' : '';
  return { text: `**${title}**\n${lines.join('\n')}${note}${allergy}${filtered}${quip}`, mood: quip ? 'judgy' : 'happy' };
}

module.exports = { extractMenu, score, recommend, dietFrom, allergiesFrom };
