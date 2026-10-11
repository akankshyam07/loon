// Loon's brain as a graph (DESIGN.md §3.12): people, projects, sites, tools, places and preferences pulled out of
// saved facts by plain rules, no model. Each entity gets a domain (one of DOMAINS) and a subdomain (a language for
// code, diet/cuisine for food, a product category for shopping, the project or org name for work and study…).
// brain/memory.js stores the result as nodes and edges next to the facts and walks it during recall.

const DOMAINS = ['work', 'study', 'shopping', 'food', 'code', 'personal', 'health', 'travel'];
const KINDS = ['person', 'project', 'site', 'topic', 'preference', 'place', 'tool', 'org'];
const ME = '@me'; // the user: typed edges ("works at", "prefers") start here; recall never walks through it

// Words that point a fact at a domain. Scores add up with the domains of the entities found in the fact.
const DOMAIN_RULES = {
  code: /\b(code|coding|program(?:ming|mer)?|developer|debug(?:ging)?|repo|github|api|backend|frontend|framework|library|compiler|stack ?trace|bugs?|deploy)\b/gi,
  food: /\b(vegetarian|vegan|pescatarian|allerg\w*|gluten|dairy|lactose|keto|halal|kosher|eat|eating|food|dinner|lunch|breakfast|meals?|recipes?|restaurants?|cuisine|spicy|meat|cook(?:ing)?|snacks?|calories?|protein)\b/gi,
  shopping: /\b(buy|bought|shop(?:ping)?|prices?|budget|brands?|deals?|cheap|expensive|amazon|order(?:ed)?)\b/gi,
  health: /\b(health|doctor|medic\w*|gym|workouts?|exercise|running|sleep|therapy|therapist|asthma|diabet\w*|blood|injur\w*|yoga|weight|fitness)\b/gi,
  travel: /\b(travel(?:ing|ling)?|trips?|flights?|fly(?:ing)?|hotels?|vacation|holiday|visit(?:ing)?|airport|passport|itinerary)\b/gi,
  study: /\b(study|studying|learn(?:ing)?|course|class(?:es)?|exams?|homework|university|college|school|semester|thesis|professor|lectures?|degree|student)\b/gi,
  work: /\b(work(?:ing)?|job|office|boss|manager|colleagues?|coworkers?|meetings?|clients?|career|internship|intern|company|team|deadlines?)\b/gi,
};

// Languages and frameworks, longest first so "Spring Boot" wins over "Spring" and "JavaScript" over "Java".
// The second value is the subdomain: the language family a framework belongs to.
const TECH = [
  ['Spring Boot', 'Java'], ['Spring', 'Java'], ['Hibernate', 'Java'], ['Maven', 'Java'], ['Gradle', 'Java'],
  ['JavaScript', 'JavaScript'], ['TypeScript', 'JavaScript'], ['Node.js', 'JavaScript'], ['Next.js', 'JavaScript'],
  ['React Native', 'JavaScript'], ['React', 'JavaScript'], ['Vue', 'JavaScript'], ['Angular', 'JavaScript'],
  ['Svelte', 'JavaScript'], ['Express', 'JavaScript'], ['Electron', 'JavaScript'], ['jQuery', 'JavaScript'],
  ['Python', 'Python'], ['Django', 'Python'], ['Flask', 'Python'], ['FastAPI', 'Python'], ['pandas', 'Python'],
  ['NumPy', 'Python'], ['PyTorch', 'Python'], ['TensorFlow', 'Python'], ['Jupyter', 'Python'],
  ['Java', 'Java'], ['Kotlin', 'Kotlin'], ['Swift', 'Swift'], ['SwiftUI', 'Swift'], ['Rust', 'Rust'], ['Golang', 'Go'],
  ['C++', 'C++'], ['C#', 'C#'], ['.NET', 'C#'], ['Ruby on Rails', 'Ruby'], ['Rails', 'Ruby'], ['Ruby', 'Ruby'],
  ['PHP', 'PHP'], ['Laravel', 'PHP'], ['Scala', 'Scala'], ['Haskell', 'Haskell'], ['Elixir', 'Elixir'],
  ['Dart', 'Dart'], ['Flutter', 'Dart'], ['SQL', 'SQL'], ['PostgreSQL', 'SQL'], ['MySQL', 'SQL'], ['SQLite', 'SQL'],
  ['MongoDB', 'databases'], ['Redis', 'databases'], ['GraphQL', 'APIs'], ['Docker', 'devops'],
  ['Kubernetes', 'devops'], ['AWS', 'cloud'], ['Azure', 'cloud'], ['GCP', 'cloud'], ['Git', 'tools'],
  ['Tailwind', 'CSS'], ['CSS', 'CSS'], ['HTML', 'HTML'], ['Linux', 'tools'], ['Bash', 'tools'],
].sort((a, b) => b[0].length - a[0].length);

const DIET = ['vegetarian', 'vegan', 'pescatarian', 'gluten-free', 'dairy-free', 'lactose intolerant', 'keto', 'halal', 'kosher', 'paleo', 'low-carb', 'celiac'];
const ALLERGENS = ['peanuts', 'tree nuts', 'nuts', 'shellfish', 'gluten', 'dairy', 'lactose', 'eggs', 'soy', 'sesame', 'fish'];
const CUISINES = ['italian', 'mexican', 'thai', 'indian', 'japanese', 'chinese', 'korean', 'vietnamese', 'french', 'mediterranean', 'greek', 'ethiopian', 'middle eastern'];
const DISHES = ['sushi', 'ramen', 'pizza', 'tacos', 'curry', 'pho', 'burgers', 'pasta', 'dumplings', 'salad', 'cilantro', 'coffee', 'tea'];
const PRODUCTS = {
  electronics: ['headphones', 'earbuds', 'laptop', 'phone', 'monitor', 'keyboard', 'mouse', 'camera', 'tv', 'tablet', 'speaker', 'smartwatch', 'charger'],
  clothing: ['shoes', 'sneakers', 'boots', 'jacket', 'shirt', 'dress', 'jeans', 'hoodie', 'socks'],
  home: ['sofa', 'mattress', 'chair', 'desk', 'lamp', 'rice cooker', 'vacuum', 'blender', 'kettle', 'pillow'],
  beauty: ['shampoo', 'moisturizer', 'sunscreen', 'perfume', 'makeup'],
  books: ['books', 'novels', 'kindle'],
};
const SITE_DOMAINS = [
  [/(^|\.)(amazon|ebay|etsy|walmart|target|bestbuy|ikea|aliexpress|costco)\./, 'shopping'],
  [/(^|\.)(github|gitlab|stackoverflow|npmjs|pypi|developer\.mozilla|leetcode)\./, 'code'],
  [/(^|\.)(coursera|udemy|edx|khanacademy|duolingo|quizlet)\.|\.edu$/, 'study'],
  [/(^|\.)(doordash|ubereats|grubhub|yelp|opentable|allrecipes|deliveroo)\./, 'food'],
  [/(^|\.)(booking|airbnb|expedia|kayak|skyscanner|tripadvisor)\./, 'travel'],
  [/(^|\.)(linkedin|slack|notion|atlassian|indeed|glassdoor)\./, 'work'],
  [/(^|\.)(webmd|mayoclinic|healthline|strava|myfitnesspal)\./, 'health'],
];
const HEALTH = {
  fitness: ['gym', 'yoga', 'running', 'cycling', 'swimming', 'hiking', 'climbing', 'pilates', 'meditation'],
  conditions: ['asthma', 'diabetes', 'migraines', 'adhd', 'anxiety', 'insomnia', 'back pain'],
};
const PEOPLE = {
  family: ['mom', 'mother', 'dad', 'father', 'sister', 'brother', 'wife', 'husband', 'partner', 'son', 'daughter', 'cousin', 'aunt', 'uncle', 'grandma', 'grandpa', 'girlfriend', 'boyfriend'],
  friends: ['friend', 'best friend', 'roommate', 'neighbor'],
  colleagues: ['boss', 'manager', 'colleague', 'coworker', 'teammate', 'mentor', 'client'],
  teachers: ['teacher', 'professor', 'tutor', 'advisor'],
};
const PERSON_DOMAIN = { family: 'personal', friends: 'personal', colleagues: 'work', teachers: 'study' };
// Capitalized words that are never entities on their own.
const STOP_CAPS = new Set(('I Im Ive Id Ill My Me We Our The A An It Its This That These Those He She They You Your And But Or So If When '
  + 'What Why How Who Where Which Please Thanks Hi Hey Yes No Ok Okay Also Just Today Tomorrow Monday Tuesday Wednesday Thursday '
  + 'Friday Saturday Sunday January February March April May June July August September October November December')
  .split(' ').map((w) => w.toLowerCase()));
const ORG_SUFFIX = /\b(inc|corp|corporation|llc|ltd|labs?|university|college|school|institute|bank|company|co|group|studios?|hospital)\.?$/i;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Word boundaries that also work for "C++", "C#", ".NET" and "Node.js".
const termRe = (term, flags = 'i') => new RegExp(`(?<![\\w.#+])${escapeRe(term)}(?![\\w#+]|\\.\\w)`, flags);
const plural = (w) => (w.length > 3 && /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w);

// Lowercased words (plural "s" dropped) for matching node labels against a request: "Node.js", "c++", "amazon.com"
// stay one word.
function words(text) {
  return (String(text).toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#'-]*(?:\.[\p{L}\p{N}]+)*/gu) || []).map(plural);
}

function domainScores(text) {
  const scores = Object.fromEntries(DOMAINS.map((d) => [d, 0]));
  for (const [domain, re] of Object.entries(DOMAIN_RULES)) scores[domain] += (String(text).match(re) || []).length;
  return scores;
}

// The single best domain for a piece of text, ties broken by DOMAINS order; 'personal' when nothing matches.
function pick(scores) {
  let best = 'personal';
  let top = 0;
  for (const d of DOMAINS) if (scores[d] > top) { best = d; top = scores[d]; }
  return best;
}

const domainOf = (text) => pick(domainScores(text));

function siteDomain(host) {
  return SITE_DOMAINS.find(([re]) => re.test(host))?.[1] || null;
}

// The domain a task or site belongs to, for boosting facts from the same area of life ('' when neither says).
function domainForTask(taskId = '', scope = '') {
  if (/^food_/.test(taskId)) return 'food';
  if (/^shop_/.test(taskId)) return 'shopping';
  if (/^(explain_code|find_bug|explain_error|likely_fix|explain_json|make_dto_)/.test(taskId)) return 'code';
  if (/^quiz/.test(taskId)) return 'study';
  return (scope && siteDomain(scope)) || '';
}

// A short noun phrase after a trigger: "Acme", "Acme Corp", "the Loon app". Stops at punctuation and joining words.
function phraseAfter(text, index, { capitalized = true, maxWords = 4 } = {}) {
  const rest = text.slice(index).replace(/^\s*(?:the\s+)?/i, '');
  const out = [];
  for (const w of rest.split(/\s+/)) {
    const clean = w.replace(/[.,;:!?)"']+$/, '');
    if (!clean || /^(and|but|so|because|for|to|with|in|on|at|as|from|since|which|who|where|when|while|now|then|this|next|last)$/i.test(clean)) break;
    if (capitalized && !/^[A-Z0-9]/.test(clean)) break;
    out.push(clean);
    if (out.length >= maxWords || clean !== w) break;
  }
  return out.join(' ');
}

// Entities in one fact: [{ label, kind, domain, subdomain, relation }] where relation (if any) is the typed edge from
// the user ("works at", "prefers"…). projects: names of local projects (brain/projects.js discover) to recognize.
function extract(text, { projects = [] } = {}) {
  const src = String(text || '');
  const scores = domainScores(src);
  const found = new Map(); // lowercased label → entity; earlier rules win
  const add = (label, kind, domain, subdomain, relation = '') => {
    const clean = String(label || '').trim().replace(/\s+/g, ' ');
    const key = clean.toLowerCase();
    if (clean.length < 2 || clean.length > 60 || STOP_CAPS.has(key) || STOP_CAPS.has(plural(key))) return null;
    if (found.has(key)) {
      if (relation && !found.get(key).relation) found.get(key).relation = relation;
      return found.get(key);
    }
    const entity = { label: clean, kind, domain, subdomain: subdomain || 'general', relation };
    found.set(key, entity);
    if (domain) scores[domain] += 1;
    return entity;
  };
  const factDomain = () => pick(scores);
  let m;

  // Typed patterns first: they know what the entity is.
  for (const re of [/\b(?:i|i'm|i am)\s+(?:work(?:ing)?|interning|employed)\s+(?:at|for)\s+/gi, /\b(?:internship|job|role|position)\s+(?:at|with)\s+/gi]) {
    while ((m = re.exec(src))) {
      const org = phraseAfter(src, m.index + m[0].length);
      if (org) add(org, 'org', 'work', org, 'works at');
    }
  }
  for (const re of [/\b(?:i|i'm|i am)\s+(?:study(?:ing)?|a student)\s+at\s+/gi, /\b(?:go to|attend(?:ing)?)\s+(?=[A-Z])/g]) {
    while ((m = re.exec(src))) {
      const org = phraseAfter(src, m.index + m[0].length);
      if (org) add(org, 'org', 'study', org, 'studies at');
    }
  }
  const projRe = /\b(?:working on|building|my (?:side )?project(?: called)?|my app(?: called)?)\s+/gi;
  while ((m = projRe.exec(src))) {
    const name = phraseAfter(src, m.index + m[0].length);
    if (name) add(name, 'project', null, name, 'working on');
  }
  for (const name of projects) {
    if (name && name.length > 2 && termRe(name).test(src)) add(name, 'project', null, name, /working on|building/i.test(src) ? 'working on' : '');
  }
  const courseRe = /\b([A-Z]{2,4}\s?\d{2,4}[A-Z]?)\b|\bmy ([A-Z][\w-]*(?:\s+[A-Z][\w-]*)*) (?:course|class)\b/g;
  while ((m = courseRe.exec(src))) add(m[1] || m[2], 'topic', 'study', m[1] || m[2], 'studying');
  const peopleWords = Object.values(PEOPLE).flat().sort((a, b) => b.length - a.length).map(escapeRe).join('|');
  const personRe = new RegExp(`\\bmy (${peopleWords})(?:'s name is|,| is| named| called)?\\s*([A-Z][a-z]+)?`, 'gi');
  while ((m = personRe.exec(src))) {
    const role = m[1].toLowerCase();
    const group = Object.keys(PEOPLE).find((g) => PEOPLE[g].includes(role));
    const name = m[2] && !STOP_CAPS.has(m[2].toLowerCase()) ? m[2] : null;
    add(name || `your ${role}`, 'person', PERSON_DOMAIN[group], group, role);
  }
  const placeRe = /\b(?:i live in|i'm from|i am from|i'm based in|moving to|trip to|travel(?:ing|ling)? to|visiting|flying to|vacation in|holiday in)\s+/gi;
  while ((m = placeRe.exec(src))) {
    const place = phraseAfter(src, m.index + m[0].length);
    const travel = /trip|travel|visit|flying|vacation|holiday/i.test(m[0]);
    if (place) add(place, 'place', travel ? 'travel' : 'personal', travel ? 'destinations' : 'home', travel ? 'visiting' : 'lives in');
  }

  const name = src.match(/\b(?:my name is|call me)\s+([A-Z][\w'-]+)/i);
  if (name) add(name[1], 'person', 'personal', 'you', 'is called');

  // Known vocabularies. A matched tech name is blanked out so "Spring Boot" doesn't also count as "Spring".
  let rest = src;
  for (const [label, family] of TECH) {
    const re = termRe(label, 'gi');
    if (!re.test(rest)) continue;
    add(label, 'tool', 'code', family, /\blearn/i.test(src) ? 'learning' : '');
    rest = rest.replace(re, (x) => ' '.repeat(x.length));
  }
  const hostRe = /\b(?:https?:\/\/)?((?:[a-z0-9-]+\.)+(?:com|org|net|io|dev|ai|app|edu|gov|co|uk|de|in|me|ly|so|xyz|tv))\b/gi;
  while ((m = hostRe.exec(src))) {
    const host = m[1].toLowerCase().replace(/^www\./, '');
    if (!/^(node|next)\.js$/.test(host)) add(host, 'site', siteDomain(host) || factDomain(), 'sites');
  }
  for (const w of DIET) if (termRe(w).test(src)) add(w, 'preference', 'food', 'diet', 'prefers');
  for (const w of ALLERGENS) if (termRe(w).test(src) && /allerg|intoleran|can'?t eat|avoid|no /i.test(src)) add(w, 'preference', 'food', 'allergies', 'avoids');
  for (const w of CUISINES) if (new RegExp(`\\b${w} (?:food|cuisine|restaurants?|dishes|cooking)\\b`, 'i').test(src)) add(w, 'topic', 'food', 'cuisine');
  for (const w of DISHES) if (termRe(w).test(src)) add(w, 'topic', 'food', 'cuisine');
  for (const [sub, items] of Object.entries(HEALTH)) for (const w of items) if (termRe(w).test(src)) add(w, 'topic', 'health', sub);
  for (const [category, items] of Object.entries(PRODUCTS)) {
    for (const w of items) if (new RegExp(`(?<![\\w])${escapeRe(w)}s?(?!\\w)`, 'i').test(src)) add(w, 'topic', 'shopping', category);
  }

  // Capitalized names: runs of capitalized words, minus a single capitalized word that only starts the sentence.
  const capRe = /[A-Z][\w&'-]*(?:\s+(?:of\s+|&\s+)?[A-Z][\w&'-]*)*/g;
  while ((m = capRe.exec(src))) {
    let parts = m[0].split(/\s+/);
    let start = m.index;
    while (parts.length && STOP_CAPS.has(parts[0].replace(/'/g, '').toLowerCase())) {
      start += parts[0].length + 1;
      parts = parts.slice(1);
    }
    if (!parts.length) continue;
    const label = parts.join(' ').replace(/'s$/, '');
    const sentenceStart = !src.slice(0, start).trim() || /[.!?]\s*$/.test(src.slice(0, start));
    if (sentenceStart && parts.length === 1) continue;
    if ([...found.keys()].some((k) => k.includes(label.toLowerCase()))) continue;
    const domain = factDomain();
    const kind = ORG_SUFFIX.test(label) ? 'org' : domain === 'shopping' ? 'org' : 'topic';
    add(label, kind, domain, kind === 'org' && domain === 'shopping' ? 'brands' : label);
  }

  // "I prefer / love / hate X": a typed edge to what X names, or a new preference node when it names nothing known.
  const prefRe = /\bi (?:really )?(prefer|like|love|enjoy|hate|dislike|can'?t stand|don'?t like|don'?t eat|never eat|avoid)\s+/gi;
  while ((m = prefRe.exec(src))) {
    const negative = /hate|dislike|stand|don|never|avoid/i.test(m[1]);
    const object = phraseAfter(src, m.index + m[0].length, { capitalized: false, maxWords: 4 }).replace(/^(?:to|a|an)\s+/i, '');
    if (!object || /^(it|this|that|them|you|when|how)\b/i.test(object)) continue;
    const inside = [...found.values()].filter((e) => object.toLowerCase().includes(e.label.toLowerCase()));
    if (inside.length) for (const e of inside) e.relation = negative ? 'dislikes' : 'prefers';
    else add(object.toLowerCase(), 'preference', domainOf(object) === 'personal' ? factDomain() : domainOf(object), negative ? 'dislikes' : 'likes', negative ? 'dislikes' : 'prefers');
  }

  const domain = factDomain();
  // Projects: code when the fact names a language or framework, study for coursework, work otherwise.
  const coded = [...found.values()].some((e) => e.kind === 'tool');
  for (const e of found.values()) {
    if (!e.domain) e.domain = coded ? 'code' : domain === 'study' ? 'study' : 'work';
  }
  return { domain, entities: [...found.values()] };
}

// "what do you know about Acme" (memory.about) as markdown.
function formatAbout(found, query) {
  if (!found || (!found.node && !found.facts.length)) return `I don't know anything about "${query}" yet. Tell me "remember that…" and I will.`;
  const lines = [];
  if (found.node) {
    const n = found.node;
    lines.push(`**${n.label}** · ${n.kind} · ${n.domain}${n.subdomain && n.subdomain !== n.label && n.subdomain !== 'general' ? ` › ${n.subdomain}` : ''}`);
    const mine = found.neighbors.filter((x) => x.id === ME);
    const others = found.neighbors.filter((x) => x.id !== ME);
    if (mine.length) lines.push(`- You: ${mine.map((x) => x.relation).join(', ')}`);
    if (others.length) lines.push(`- Connected to: ${others.map((x) => x.label).join(', ')}`);
  }
  if (found.facts.length) lines.push('', '**What I remember**', ...found.facts.map((f) => `- ${f}`));
  lines.push('', "_Edit or delete these in Settings → Loon's brain._");
  return lines.join('\n').trim();
}

module.exports = { DOMAINS, KINDS, ME, TECH, extract, words, domainOf, domainForTask, siteDomain, formatAbout };
