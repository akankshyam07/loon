// Task catalog (DESIGN.md §2.5, §3.2, §3.4): what each chip does and which tiers may answer it.
// Chips in the bubble map 1:1 to these ids.
const { keySentences } = require('./textrank');

// Small models lose track of who is writing to whom and rewrite the received message instead of answering it. Code
// reads the names from the greeting and sign-off, and the reply is started for the model ("Hi Jordan,").
function replyInstruction(text = '') {
  const body = String(text).trim();
  // "…Best, Jordan": a capitalized last word right after a sign-off.
  const signed = body.match(/\b(?:best|thanks|thank you|regards|cheers|sincerely|warmly|talk soon)\b[^\n]{0,15}?[,!.]?\s+([A-Z][a-z]+)\s*[.!]?\s*$/i);
  const sender = signed && /^[A-Z][a-z]+$/.test(signed[1]) ? signed[1] : null;
  const greeted = body.match(/^(?:hi|hello|hey|dear)\s+(\S+)/i)?.[1].replace(/[,.!:]+$/, '');
  const user = greeted && /^[A-Z][a-z]+$/.test(greeted) ? greeted : null;
  const me = user || 'the user';
  return [
    `${user ? `You are writing as ${user}. ` : ''}Below is a message ${me} received${sender ? ` from ${sender}` : ''}.`,
    `Write ${me}'s reply${sender ? ` to ${sender}` : ''}: answer every question and request in it, briefly and warmly, and where ${me} must fill in a detail, write a placeholder such as [price] or [day] instead of guessing it.`,
    `Do not repeat the received message. Start the reply with "Hi ${sender || 'there'}," and reply with only the reply.`,
  ].join(' ');
}

const TASKS = {
  ask: { label: 'Ask', instruction: (p) => p.question, maxTokens: 400 },
  define: { label: 'Define', tiers: ['define'], instruction: (p) => `Define "${p.text}" briefly.`, maxTokens: 200 },
  meaning_here: {
    label: 'Meaning here?',
    instruction: (p) => `What does "${p.text}" mean in this passage? Answer in one or two sentences.`,
    contextText: (p) => p.surrounding || p.text,
    maxTokens: 160,
  },
  translate: { label: 'Translate', tiers: ['translate'], instruction: () => 'Translate this into English. Reply with only the translation.', maxTokens: 500 },
  explain: { label: 'Explain', instruction: () => 'Explain this in plain language.', maxTokens: 320 },
  simplify: { label: 'Simplify', instruction: () => 'Rewrite this so a 12-year-old could understand it. Keep it short.', maxTokens: 320, replaceable: true },
  summarize: { label: 'Summarize', instruction: () => 'Summarize this in 2-3 short bullet points.', maxTokens: 260 },
  rewrite: { label: 'Rewrite', instruction: () => 'Rewrite this to be clearer and more concise. Reply with only the rewritten text.', maxTokens: 500, replaceable: true },
  examples: { label: 'Examples', instruction: () => 'Give two short, concrete examples that illustrate this.', maxTokens: 300 },
  fact_check: {
    label: 'Fact-check',
    instruction: () => 'Is this claim accurate? Say what is well established, what is doubtful, and be clear that you cannot browse the web.',
    maxTokens: 320,
  },
  explain_code: { label: 'Explain code', instruction: () => 'Explain what this code does, step by step, briefly.', maxTokens: 400 },
  find_bug: { label: 'Find bug', instruction: () => 'Point out likely bugs or risky lines in this code, quoting them.', maxTokens: 400 },
  explain_error: { label: 'Explain error', tiers: ['errors'], cacheByFingerprint: true, instruction: () => 'Explain what this error means and its most likely cause, then the most likely fix as short steps.', maxTokens: 420 },
  likely_fix: { label: 'Likely fix', instruction: () => 'Suggest the most likely fix for this error as short steps.', maxTokens: 400 },
  explain_json: { label: 'Explain', instruction: () => 'Explain the structure of this JSON: its main fields and what they likely mean.', maxTokens: 360 },
  // Screenshots (§3.5): the OCR text itself, no model
  extract_text: { label: 'Copy text', tiers: ['ocr-text'] },
  // Files dropped on the cat (M6)
  csv_overview: { label: 'Overview', tiers: ['csv'] },
  // Projects (M6): answered from the user's local Leetcode repo, no model
  leetcode_companies: { label: 'Which companies ask this?', tiers: ['leetcode'] },
  // Developer (§3.8)
  make_dto_java: { label: 'Java DTO', tiers: ['dto'] },
  make_dto_ts: { label: 'TypeScript types', tiers: ['dto'] },
  // Writing (§3.9)
  fix_grammar: { label: 'Fix grammar', tiers: ['grammar'] },
  shorter: { label: 'Shorter', instruction: () => 'Make this shorter while keeping its meaning and tone. Reply with only the rewritten text.', maxTokens: 400, replaceable: true },
  professional: { label: 'Professional', instruction: () => 'Rewrite this in a clear, professional tone. Reply with only the rewritten text.', maxTokens: 500, replaceable: true },
  warmer: { label: 'Warmer', instruction: () => 'Rewrite this to sound warmer and friendlier. Reply with only the rewritten text.', maxTokens: 500, replaceable: true },
  // Shopping (§3.6): the first four never call a model
  shop_value: { label: 'Best value', tiers: ['shopping'], page: true },
  shop_reviews: { label: 'Reviews', tiers: ['reviews'], page: true },
  shop_add: { label: 'Add to compare', tiers: ['basket-add'], page: true },
  shop_basket: { label: 'Compare basket', tiers: ['basket-compare'] },
  shop_clear: { label: 'Clear basket', tiers: ['basket-clear'] },
  shop_take: {
    label: "Loon's take",
    page: true,
    contextFrom: 'shopping',
    instruction: () => 'This comparison table was computed from the page. Give your honest, lightly judgmental take in 2-3 sentences: which one to buy and why. Do not recompute any numbers.',
    maxTokens: 220,
  },
  // Food (§3.7): picks from keywords; numbers only on request, always labelled estimates
  food_lightest: { label: 'Lightest', tiers: ['food'], page: true },
  food_protein: { label: 'Most protein', tiers: ['food'], page: true },
  food_veg: { label: 'Vegetarian', tiers: ['food'], page: true },
  food_estimate: {
    label: 'Estimate calories',
    page: true,
    contextFrom: 'menu',
    estimated: true,
    instruction: () => 'For each menu item, estimate calories, protein, fat and carbs as ranges (for example "550–700 kcal"). These are rough estimates from the description: say so once. One short line per item.',
    maxTokens: 700,
  },
  // Notes, research, study (§3.10–3.11)
  research_found: {
    label: 'What have I found?',
    contextFrom: 'notes',
    instruction: () => 'These are notes the user saved while researching. Summarize what they have found so far in a few bullets, and cite each point with its source link when there is one. Only use what is in the notes.',
    maxTokens: 500,
  },
  quiz: { label: 'Quiz me', tiers: ['quiz'] },
  quiz_harder: {
    label: 'Harder questions',
    instruction: () => 'Write 3 short conceptual questions that test real understanding of this text, each followed by a one-line answer on its own line starting with "Answer:".',
    maxTokens: 400,
  },
  page_summary: { label: 'Summarize page', tiers: ['keypoints'], instruction: () => 'Summarize this page in 3-5 short bullet points.', maxTokens: 380, page: true },
  page_notes: { label: 'Notes', instruction: () => 'Turn this page into concise study notes with short headings and bullets.', maxTokens: 600, page: true },
  page_checklist: { label: 'Checklist', instruction: () => 'Turn this page into a practical checklist of steps or action items.', maxTokens: 500, page: true },
  // Email (CLAUDE.md "Writing assistant": summarize threads, draft replies). The page versions read the open thread;
  // draft_reply works on selected text, e.g. an email selected in Mail with ⌥Space.
  email_summary: {
    label: 'Summarize thread',
    instruction: () => 'Summarize this email thread in short bullets: who wants what, what was decided, and anything the user needs to do or answer.',
    maxTokens: 320,
    page: true,
  },
  email_reply: {
    label: 'Draft reply',
    instruction: (p) => replyInstruction(p.text),
    maxTokens: 320,
    page: true,
  },
  draft_reply: {
    label: 'Draft reply',
    instruction: (p) => replyInstruction(p.text),
    maxTokens: 320,
  },
  page_todo: {
    label: 'What do I do here?',
    instruction: () => 'Based on this page, what is the user supposed to do here? Give the next steps in order, briefly.',
    maxTokens: 360,
    page: true,
  },
  // "Loon sees your screen when you ask" (§3.20): OCR text of the window in front
  screen_summary: { label: 'What’s on my screen?', instruction: () => "Describe what's on the user's screen and what they can do there, briefly.", maxTokens: 320 },
};

// Chips offered for a selection, by the kind the content script detected (DESIGN.md §3.2 table).
const SELECTION_CHIPS = {
  word: ['define', 'meaning_here', 'translate', 'explain'],
  sentence: ['explain', 'simplify', 'translate', 'rewrite', 'examples', 'fact_check'],
  paragraph: ['explain', 'summarize', 'simplify', 'translate', 'rewrite', 'fact_check', 'quiz', 'draft_reply'],
  code: ['explain_code', 'find_bug', 'explain'],
  json: ['explain_json', 'make_dto_java', 'make_dto_ts'],
  stacktrace: ['explain_error', 'likely_fix'],
  editable: ['fix_grammar', 'shorter', 'professional', 'warmer', 'rewrite', 'translate'],
  screenshot: ['extract_text', 'explain', 'summarize', 'translate'],
  csv: ['csv_overview', 'summarize', 'explain'],
  document: ['summarize', 'explain', 'quiz', 'simplify', 'translate'],
};
const PAGE_CHIPS = ['page_summary', 'page_todo', 'page_notes', 'page_checklist', 'quiz'];
// Page chips by page kind (§2.5 modes): picked automatically from what the content script detected.
const MODE_CHIPS = {
  shopping: ['shop_value', 'shop_reviews', 'shop_add', 'shop_basket', 'shop_take', 'page_summary'],
  menu: ['food_lightest', 'food_protein', 'food_veg', 'food_estimate', 'page_summary'],
  leetcode: ['leetcode_companies', 'page_summary', 'quiz'],
  email: ['email_summary', 'email_reply', 'page_checklist'],
};
const pageChipsFor = (kind) => MODE_CHIPS[kind] || PAGE_CHIPS;

// Model-context budget: 24k characters fits an 8k-token local context with room for the answer.
const MAX_CONTEXT_CHARS = 24000;

function contextBlock(packet, text) {
  const window = packet.source === 'screen' ? `app="${String(packet.app || '').replace(/"/g, "'")}" window="${String(packet.title || '').replace(/"/g, "'")}"` : '';
  const attrs = [`source="${packet.source}"`, packet.url ? `url="${packet.url}"` : '', window].filter(Boolean).join(' ');
  return `<context ${attrs}>\n${text}\n</context>`;
}

// Which memory categories a task may use (brain/memory.js TASK_CATEGORIES).
function memoryGroup(taskId) {
  if (/^food_/.test(taskId)) return 'food';
  if (/^shop_/.test(taskId)) return 'shopping';
  if (['rewrite', 'shorter', 'professional', 'warmer', 'fix_grammar'].includes(taskId)) return 'writing';
  if (taskId === 'translate') return 'translate';
  return 'default';
}

// Follow-ups (DESIGN.md §2.10): every tier gets the conversation as plain text in the prompt, so local, plan and API
// answers are interchangeable. Budgets in characters; the newest answer is kept almost whole ("make it shorter" needs
// it), older answers shrink to their first sentences, and the original context to its key sentences.
const FOLLOW_UP_BUDGET = { context: 2000, turns: 2000, maxTurns: 6, latestAnswer: 1200, olderAnswer: 240, question: 300 };

const oneLine = (text) => String(text || '').trim().replace(/\s+/g, ' ');

// The first sentences of a text that fit in max characters (a hard cut when one sentence is already too long).
function clip(text, max) {
  const t = String(text || '').trim().replace(/\n{3,}/g, '\n\n');
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 2);
  const sentences = cut.match(/^[\s\S]*[.!?](?=\s)/)?.[0];
  return `${sentences && sentences.length > max / 3 ? sentences : cut.trimEnd()} …`;
}

// The selection/page text for a follow-up: whole when short, else its key sentences and its beginning, ≤ max chars.
function followUpContext(text, max = FOLLOW_UP_BUDGET.context) {
  if (text.length <= max) return text;
  const keys = keySentences(text, 4).join(' ').slice(0, Math.floor(max / 2));
  return `Key sentences: ${keys}\n\nBeginning: ${text.slice(0, max - keys.length - 30)}`;
}

// turns: [{ question, answer }] oldest first → the newest ones that fit the budget, oldest first.
function historyBlock(turns, budget = FOLLOW_UP_BUDGET) {
  const recent = turns.slice(-budget.maxTurns);
  const entries = [];
  let used = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const latest = i === recent.length - 1;
    const answer = latest ? clip(recent[i].answer, budget.latestAnswer) : clip(oneLine(recent[i].answer), budget.olderAnswer);
    const entry = `User: ${clip(oneLine(recent[i].question), budget.question)}\nLoon: ${answer}`;
    if (!latest && used + entry.length + 2 > budget.turns) break;
    entries.unshift(entry);
    used += entry.length + 2;
  }
  // The first message usually sets the whole thread up ("a trip to Japan in April, $4000"); it stays when older turns
  // are dropped, and it never changes, so the prompt prefix stays reusable.
  if (entries.length < turns.length) entries.unshift(`User (first message): ${clip(oneLine(turns[0].question), budget.question)}\n…`);
  return `Conversation so far (oldest first):\n<conversation>\n${entries.join('\n\n')}\n</conversation>`;
}

// Fixed parts first, volatile parts last (user preferences → instruction → context → memory), so consecutive requests
// share the longest possible token prefix after the system prompt and llama.cpp reuses its KV cache for it. The
// preferences block (brain/personal.js instructionsBlock) changes only when Settings change. No timestamps anywhere.
// A follow-up (history given) keeps that order and grows at the end: preferences → context → conversation → memory →
// the new message, so the turns of one thread share their prefix too.
function buildPrompt(taskId, packet, { deeper = false, question, memory = [], instructions = '', history = [] } = {}) {
  const task = TASKS[taskId];
  const instruction = taskId === 'ask' || question ? question || packet.question : task.instruction(packet);
  const text = task.contextText ? task.contextText(packet) : packet.text;
  const depth = deeper ? '\nGo deeper than usual: give a thorough, well-structured answer.' : '';
  const about = memory.length ? `About the user (they chose to share this; use it only when relevant):\n${memory.map((m) => `- ${m}`).join('\n')}` : '';
  if (history.length) {
    return [instructions, text && contextBlock(packet, text), historyBlock(history), about, `Now answer this follow-up: ${instruction}${depth}`].filter(Boolean).join('\n\n');
  }
  return [instructions, instruction + depth, text && contextBlock(packet, text), about].filter(Boolean).join('\n\n');
}

// Hand-off (§3.17): the same prompt, formatted for pasting into Claude / ChatGPT / Gemini.
function handoffPrompt(taskId, packet, question) {
  const task = TASKS[taskId] || TASKS.explain;
  const instruction = question || (taskId === 'ask' ? packet.question : task.instruction(packet));
  const where = packet.url ? ` (from ${packet.url})` : '';
  return packet.text ? `${instruction}\n\nHere is the text${where}:\n"""\n${packet.text}\n"""` : instruction;
}

module.exports = { replyInstruction, TASKS, SELECTION_CHIPS, PAGE_CHIPS, MODE_CHIPS, pageChipsFor, MAX_CONTEXT_CHARS, FOLLOW_UP_BUDGET, buildPrompt, historyBlock, followUpContext, handoffPrompt, memoryGroup };
