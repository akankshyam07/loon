// Personalization (DESIGN.md §3.12.1): custom instructions, reply style, "Remember this?" suggestions and feedback
// like "shorter please". All plain code: no model reads or writes any of it.

const PERSONAL_DEFAULTS = { about: '', style: '', length: 'normal', tone: 'playful', emoji: true, language: '' };
const LIMITS = { about: 600, style: 600, language: 30 };
const CHOICES = { length: ['short', 'normal', 'detailed'], tone: ['playful', 'plain', 'formal'] };
const LANGUAGES = ['english', 'spanish', 'french', 'german', 'italian', 'portuguese', 'dutch', 'swedish', 'polish', 'russian', 'ukrainian',
  'turkish', 'arabic', 'hebrew', 'hindi', 'bengali', 'odia', 'tamil', 'telugu', 'urdu', 'chinese', 'mandarin', 'japanese', 'korean',
  'vietnamese', 'thai', 'indonesian', 'greek', 'czech'];

const clip = (value, max) => String(value ?? '').replace(/\s+\n/g, '\n').trim().slice(0, max);

// Settings come from disk and from the Settings window: keep only known keys, valid choices and capped text.
function cleanPersonal(input = {}) {
  const p = { ...PERSONAL_DEFAULTS, ...(input && typeof input === 'object' ? input : {}) };
  return {
    about: clip(p.about, LIMITS.about),
    style: clip(p.style, LIMITS.style),
    length: CHOICES.length.includes(p.length) ? p.length : PERSONAL_DEFAULTS.length,
    tone: CHOICES.tone.includes(p.tone) ? p.tone : PERSONAL_DEFAULTS.tone,
    emoji: p.emoji !== false,
    language: clip(p.language, LIMITS.language).replace(/[^\p{L} ]/gu, ''),
  };
}

// The per-user block that follows the fixed system prompt. It changes only when the user edits Settings, so every
// request shares it as a cached prefix. '' when everything is at its default. Privacy mode leaves out "About you"
// (it's personal data, like memory) but keeps the reply style.
function instructionsBlock(input, { privacy = false } = {}) {
  const p = cleanPersonal(input);
  const lines = [];
  if (p.about && !privacy) lines.push(`About the user: ${p.about}`);
  if (p.style) lines.push(`How to reply: ${p.style}`);
  if (p.length === 'short') lines.push('Keep replies very short: one to three sentences.');
  if (p.length === 'detailed') lines.push('Give fuller, more detailed answers with examples when useful.');
  if (p.tone === 'plain') lines.push('Tone: plain and neutral, no jokes.');
  if (p.tone === 'formal') lines.push('Tone: formal and professional, no jokes.');
  if (!p.emoji) lines.push('Do not use emoji.');
  if (p.language) lines.push(`Reply in ${p.language}.`);
  return lines.length ? `User preferences (set by the user in Settings; follow them over the defaults):\n${lines.map((l) => `- ${l}`).join('\n')}` : '';
}

// Reply length also steers the cheap tiers: the model's token cap and how many dictionary senses to show.
function maxTokensFor(base, length) {
  if (!base) return base;
  return length === 'short' ? Math.round(base * 0.6) : length === 'detailed' ? Math.round(base * 1.6) : base;
}
const sensesFor = (length) => ({ short: 1, detailed: 6 }[length] || 4);

// ---------- feedback: "shorter please", "less emoji", "be more formal" ----------
const FEEDBACK = [
  [/^(?:be |make (?:it|them|your (?:answers|replies)) |keep (?:it|them|answers|replies) |give (?:me )?)?(?:shorter|more concise|concise|briefer|brief|less wordy|less verbose|short(?: answers| replies)?|(?:that was |that's |thats |it's |its |answers are |you're |youre |way )?too (?:long|wordy|verbose)|tl;?dr|less text|fewer words)(?: answers| replies)?$/,
    (p) => ({ length: p.length === 'detailed' ? 'normal' : 'short' })],
  [/^(?:be |give (?:me )?|i want |i need )?(?:more detail(?:ed|s)?|longer(?: answers| replies)?|more thorough|(?:that was |that's |thats |it's |its |answers are |way )?too short|go into more detail|detailed(?: answers| replies)?|more in[- ]depth)(?: answers| replies)?$/,
    (p) => ({ length: p.length === 'short' ? 'normal' : 'detailed' })],
  [/^(?:(?:use |with )?(?:less|fewer|no)|stop using|stop with the|without|don'?t use|drop the|too many) emojis?$/, () => ({ emoji: false })],
  [/^(?:use|more|add|with) emojis?$/, () => ({ emoji: true })],
  [/^(?:be |sound )?(?:more )?(?:formal|professional)$|^too (?:casual|informal|silly)$/, () => ({ tone: 'formal' })],
  [/^(?:be )?(?:more serious|less playful|less silly|less cute|no jokes|fewer jokes|less jokes|stop joking|plainer|plain)$|^too (?:playful|silly|cute)$/, () => ({ tone: 'plain' })],
  [/^(?:be )?(?:more (?:playful|fun|casual|cute)|less formal|less serious)$|^too (?:formal|serious|stiff)$/, () => ({ tone: 'playful' })],
];
const NOTES = {
  length: { short: 'shorter from now on', normal: 'back to normal-length answers', detailed: 'more detail from now on' },
  tone: { formal: 'more formal from now on', plain: 'fewer jokes from now on', playful: 'a bit more playful from now on' },
  emoji: { false: 'no more emoji', true: 'emoji are back' },
};

// A whole message that is feedback about Loon's replies → { patch, note }, else null. Matched on the full message
// so "make this shorter" (a rewrite request) or "tell me more" (a follow-up) never change settings.
function parseFeedback(text, current = PERSONAL_DEFAULTS) {
  const raw = String(text || '').toLowerCase();
  if (!raw.trim() || raw.length > 80) return null;
  const t = raw.replace(/[!.?]+\s*$/, '')
    .replace(/\b(?:please|pls|plz|loon|hey|ok(?:ay)?|can you|could you|would you|try to|a bit|a little|much|kinda|slightly|from now on|going forward|in (?:the )?future|always)\b/g, ' ')
    .replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim();
  const p = cleanPersonal(current);
  for (const [re, patchFor] of FEEDBACK) {
    if (!re.test(t)) continue;
    const patch = patchFor(p);
    const [key, value] = Object.entries(patch)[0];
    return { patch, note: `Got it, ${NOTES[key][String(value)]}. Change it in Settings.` };
  }
  const lang = t.match(/^(?:reply|answer|respond|talk|speak|write)(?: to me)? in ([a-z]+)(?: only)?$/);
  if (lang && LANGUAGES.includes(lang[1])) {
    const language = lang[1] === 'english' ? '' : lang[1][0].toUpperCase() + lang[1].slice(1);
    return { patch: { language }, note: `Got it, ${language ? `I'll reply in ${language}` : 'back to English'} from now on. Change it in Settings.` };
  }
  return null;
}

// ---------- "Remember this?" ----------
const LEAD_IN = /^(?:(?:btw|by the way|fyi|also|oh|and|but|well|so|ok(?:ay)?|just so you know|for (?:context|reference|the record)|note that|actually|hey loon|loon)[,:]?\s+)+/i;
const STATEMENTS = [
  /^(?:i'?m|i am) (?:a |an )?(?:vegetarian|vegan|pescatarian|lactose[- ]intolerant|gluten[- ]free|celiac|diabetic|kosher|halal|left[- ]handed|colou?r ?blind)\b/i,
  /^(?:i'?m|i am) allergic to \w/i,
  /^(?:i'?m|i am) (?:a |an )(?:student|developer|software engineer|engineer|designer|teacher|nurse|doctor|manager|product manager|data scientist|data analyst|researcher|writer|lawyer|accountant|freelancer|intern|parent|programmer)\b/i,
  /^(?:i'?m|i am) (?:from|based in|learning|studying|working on|training for) \S/i,
  /^i (?:really )?(?:prefer|love|hate|dislike|can'?t stand|don'?t like|do not like|don'?t eat|do not eat|never eat|avoid|like) (?!(?:it|this|that|these|those|them|you|to know|when you|how you)\b)\S/i,
  /^my (?:name|pronouns|birthday|(?:favou?rite|fave) \w+|(?:wife|husband|partner|boyfriend|girlfriend|dog|cat|kid|son|daughter|boss|manager)(?:'s name)?) (?:is|are) \S/i,
  /^call me [a-z]/i,
  /^i (?:work|intern) (?:at|for|as|in) \S/i,
  /^i (?:live|study|go to school) (?:in|at) \S/i,
  /^i (?:speak|study) [a-z]/i,
];

// The first stated preference or fact in a typed message, ready to save in the user's own words ("I'm vegetarian"),
// or null. Questions, hypotheticals ("if I were vegan") and negated statements are skipped. Never saves anything.
function suggestMemory(text) {
  for (const sentence of String(text || '').split(/(?<=[.!?])\s+|\n+/)) {
    const s = sentence.trim().replace(LEAD_IN, '');
    const clause = s.split(/\s*[,;:]\s*|\s+(?:so|but|because|which|what|can you|could you|please|any)\s+/i)[0].trim();
    if (!clause || /\?$/.test(clause) || clause.length < 4 || clause.length > 140 || clause.split(/\s+/).length > 20) continue;
    if (!STATEMENTS.some((re) => re.test(clause))) continue;
    const fact = clause.replace(/[.!]+$/, '').replace(/\bi\b/g, 'I').replace(/\bi'(m|ve|d|ll)\b/gi, "I'$1");
    return fact[0].toUpperCase() + fact.slice(1);
  }
  return null;
}

// "I'm vegetarian" → "you're vegetarian", for the chip: "Remember that you're vegetarian?"
function secondPerson(fact) {
  const callMe = fact.match(/^call me (.+)$/i);
  if (callMe) return `you go by ${callMe[1]}`;
  return fact.replace(/\bI'm\b/gi, "you're").replace(/\bI am\b/gi, 'you are').replace(/\bI've\b/gi, "you've").replace(/\bI'd\b/gi, "you'd")
    .replace(/\bmy\b/gi, 'your').replace(/\bmine\b/gi, 'yours').replace(/\bme\b/gi, 'you').replace(/\bI\b/g, 'you');
}

// Same key for "I'm vegetarian." and "i'm  vegetarian" (dismissed suggestions, duplicate checks, consolidation).
const normalizeFact = (text) => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

// "What Loon knows about you": pinned facts plus the custom instructions, in a fixed order. Fact lines can be edited
// or unpinned in Settings; setting lines point at the field they come from.
function profileSummary(facts = [], input = {}) {
  const p = cleanPersonal(input);
  const lines = facts.filter((f) => f.pinned).map((f) => ({ source: 'fact', id: f.id, text: f.text }));
  if (p.about) lines.push({ source: 'setting', key: 'about', text: p.about });
  const style = [
    p.length !== 'normal' && `${p.length} replies`,
    p.tone !== 'playful' && `${p.tone} tone`,
    !p.emoji && 'no emoji',
    p.language && `in ${p.language}`,
  ].filter(Boolean);
  if (style.length) lines.push({ source: 'setting', key: 'style', text: `Likes ${style.join(', ')}.` });
  if (p.style) lines.push({ source: 'setting', key: 'style', text: p.style });
  return lines;
}

// ---------- 👍/👎: reply-style nudges ----------
// Long/short by stored answer length (characters, never the text). A nudge is only ever a chip the user can accept;
// nothing here changes a setting.
const LONG_ANSWER = 600;
const SHORT_ANSWER = 200;
const NUDGE_WINDOW = 10; // the most recent ratings
const NUDGE_MIN_DOWNS = 3;

// recent: newest first [{ vote, chars }]. dismissed: nudge keys the user said no to. → { key, label, patch } or null.
function styleNudge(recent = [], input = {}, dismissed = []) {
  const p = cleanPersonal(input);
  const window = recent.slice(0, NUDGE_WINDOW);
  const downs = (test) => window.filter((r) => r.vote < 0 && test(r.chars)).length;
  const ups = (test) => window.filter((r) => r.vote > 0 && test(r.chars)).length;
  const long = (c) => c > LONG_ANSWER;
  const short = (c) => c > 0 && c < SHORT_ANSWER;
  const candidates = [
    p.length !== 'short' && downs(long) >= NUDGE_MIN_DOWNS && downs(long) > ups(long) * 2
      && { key: `length:short:${p.length}`, label: 'Shorter answers by default?', patch: { length: p.length === 'detailed' ? 'normal' : 'short' } },
    p.length !== 'detailed' && downs(short) >= NUDGE_MIN_DOWNS && downs(short) > ups(short) * 2
      && { key: `length:detailed:${p.length}`, label: 'More detailed answers by default?', patch: { length: p.length === 'short' ? 'normal' : 'detailed' } },
  ];
  return candidates.find((c) => c && !dismissed.includes(c.key)) || null;
}

// ---------- "Remember this" on an answer ----------
const plain = (text) => String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/[*_`#>|]+/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();

// The selected sentence when there is one, else the answer's first sentence, as a proposed memory (the user edits it
// on the confirm card before anything is saved). '' when there's nothing usable.
function factFromAnswer(answer, selection = '') {
  const bullet = /^(?:[-•✦*]|\d+[.)])(?:\s+(?:[-•✦*]|\d+[.)]))*\s+/;
  const source = plain(selection).replace(bullet, '') || plain(answer).replace(bullet, '').split(/(?<=[.!?])\s+/)[0] || '';
  return source.length > 200 ? `${source.slice(0, 199).replace(/\s+\S*$/, '')}…` : source;
}

// ---------- "Save this chat" ----------
// turns: [{ question, answer }] → a markdown transcript for the notes folder.
function chatMarkdown(turns = []) {
  return turns.map((t) => `**You:** ${String(t.question).trim()}\n\n${String(t.answer).trim()}`).join('\n\n---\n\n');
}

// Up to 3 facts the user stated in the thread's questions (suggestMemory, deduplicated), skipping ones already known
// or dismissed. Never saved here; the bubble shows them as a tick list.
function chatFacts(turns = [], { known = [], dismissed = [] } = {}) {
  const skip = new Set([...known, ...dismissed].map(normalizeFact));
  const out = [];
  for (const t of turns) {
    const fact = suggestMemory(t.question);
    if (!fact || skip.has(normalizeFact(fact))) continue;
    skip.add(normalizeFact(fact));
    out.push(fact);
    if (out.length === 3) break;
  }
  return out;
}

// ---------- "Get to know you" onboarding ----------
const ROLES = {
  student: { fact: "I'm a student", mode: 'study' },
  dev: { fact: "I'm a developer", mode: 'dev' },
  design: { fact: "I'm a designer", mode: null },
  work: { fact: 'I mostly use my Mac for work', mode: 'work' },
  other: { fact: '', mode: null },
};
const DIETS = { vegetarian: "I'm vegetarian", vegan: "I'm vegan", pescatarian: "I'm pescatarian", gluten_free: "I'm gluten-free", halal: 'I eat halal', kosher: 'I keep kosher', lactose: "I'm lactose intolerant" };
const tidy = (text, max = 80) => String(text || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const list = (text) => tidy(text, 200).split(/\s*(?:,|;|\band\b)\s*/i).map((x) => x.replace(/[.!]+$/, '').trim()).filter(Boolean).slice(0, 6);
const joinList = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0] || '');

// answers: { name, role, length, tone, diets: [], allergies, interests } (every one optional) → what the review screen
// shows: { facts: [text] (saved pinned), personal: patch for cleanPersonal, role }. Plain code, no model.
function onboardingResult(answers = {}) {
  const facts = [];
  const name = tidy(answers.name, 40).replace(/[^\p{L}\p{N} .'-]/gu, '');
  if (name) facts.push(`Call me ${name}`);
  const role = Object.hasOwn(ROLES, answers.role) ? answers.role : '';
  if (role && ROLES[role].fact) facts.push(ROLES[role].fact);
  for (const d of answers.diets || []) if (Object.hasOwn(DIETS, d)) facts.push(DIETS[d]);
  const allergies = list(answers.allergies);
  if (allergies.length) facts.push(`I'm allergic to ${joinList(allergies)}`);
  const interests = list(answers.interests);
  if (interests.length) facts.push(`I'm interested in ${joinList(interests)}`);
  const personal = {};
  if (CHOICES.length.includes(answers.length)) personal.length = answers.length;
  if (CHOICES.tone.includes(answers.tone)) personal.tone = answers.tone;
  return { facts, personal, role };
}

module.exports = {
  PERSONAL_DEFAULTS, LIMITS, cleanPersonal, instructionsBlock, maxTokensFor, sensesFor, parseFeedback, suggestMemory, secondPerson, normalizeFact, profileSummary,
  styleNudge, factFromAnswer, chatMarkdown, chatFacts, onboardingResult, ROLES, DIETS,
};
