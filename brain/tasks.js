// Task catalog (DESIGN.md §2.5, §3.2, §3.4): what each chip does and which tiers may answer it.
// Chips in the bubble map 1:1 to these ids.

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
  simplify: { label: 'Simplify', instruction: () => 'Rewrite this so a 12-year-old could understand it. Keep it short.', maxTokens: 320 },
  summarize: { label: 'Summarize', instruction: () => 'Summarize this in 2-3 short bullet points.', maxTokens: 260 },
  rewrite: { label: 'Rewrite', instruction: () => 'Rewrite this to be clearer and more concise. Reply with only the rewritten text.', maxTokens: 500 },
  examples: { label: 'Examples', instruction: () => 'Give two short, concrete examples that illustrate this.', maxTokens: 300 },
  fact_check: {
    label: 'Fact-check',
    instruction: () => 'Is this claim accurate? Say what is well established, what is doubtful, and be clear that you cannot browse the web.',
    maxTokens: 320,
  },
  explain_code: { label: 'Explain code', instruction: () => 'Explain what this code does, step by step, briefly.', maxTokens: 400 },
  find_bug: { label: 'Find bug', instruction: () => 'Point out likely bugs or risky lines in this code, quoting them.', maxTokens: 400 },
  explain_error: { label: 'Explain error', instruction: () => 'Explain what this error means and its most likely cause.', maxTokens: 360 },
  likely_fix: { label: 'Likely fix', instruction: () => 'Suggest the most likely fix for this error as short steps.', maxTokens: 400 },
  explain_json: { label: 'Explain', instruction: () => 'Explain the structure of this JSON: its main fields and what they likely mean.', maxTokens: 360 },
  page_summary: { label: 'Summarize page', tiers: ['keypoints'], instruction: () => 'Summarize this page in 3-5 short bullet points.', maxTokens: 380, page: true },
  page_notes: { label: 'Notes', instruction: () => 'Turn this page into concise study notes with short headings and bullets.', maxTokens: 600, page: true },
  page_checklist: { label: 'Checklist', instruction: () => 'Turn this page into a practical checklist of steps or action items.', maxTokens: 500, page: true },
  page_todo: {
    label: 'What do I do here?',
    instruction: () => 'Based on this page, what is the user supposed to do here? Give the next steps in order, briefly.',
    maxTokens: 360,
    page: true,
  },
};

// Chips offered for a selection, by the kind the content script detected (DESIGN.md §3.2 table).
const SELECTION_CHIPS = {
  word: ['define', 'meaning_here', 'translate', 'explain'],
  sentence: ['explain', 'simplify', 'translate', 'rewrite', 'examples', 'fact_check'],
  paragraph: ['explain', 'summarize', 'simplify', 'translate', 'rewrite', 'fact_check'],
  code: ['explain_code', 'find_bug', 'explain'],
  json: ['explain_json', 'explain'],
  stacktrace: ['explain_error', 'likely_fix'],
  editable: ['rewrite', 'simplify', 'translate'],
};
const PAGE_CHIPS = ['page_summary', 'page_todo', 'page_notes', 'page_checklist'];

// Model-context budget: 24k characters fits an 8k-token local context with room for the answer.
const MAX_CONTEXT_CHARS = 24000;

function contextBlock(packet, text) {
  const attrs = [`source="${packet.source}"`, packet.url ? `url="${packet.url}"` : ''].filter(Boolean).join(' ');
  return `<context ${attrs}>\n${text}\n</context>`;
}

// Full user message for a task on a packet: instruction first, then the (already redacted) context.
function buildPrompt(taskId, packet, { deeper = false, question } = {}) {
  const task = TASKS[taskId];
  const instruction = taskId === 'ask' || question ? question || packet.question : task.instruction(packet);
  const text = task.contextText ? task.contextText(packet) : packet.text;
  const depth = deeper ? '\nGo deeper than usual: give a thorough, well-structured answer.' : '';
  if (!text) return instruction + depth;
  return `${instruction}${depth}\n\n${contextBlock(packet, text)}`;
}

// Hand-off (§3.17): the same prompt, formatted for pasting into Claude / ChatGPT / Gemini.
function handoffPrompt(taskId, packet, question) {
  const task = TASKS[taskId] || TASKS.explain;
  const instruction = question || (taskId === 'ask' ? packet.question : task.instruction(packet));
  const where = packet.url ? ` (from ${packet.url})` : '';
  return packet.text ? `${instruction}\n\nHere is the text${where}:\n"""\n${packet.text}\n"""` : instruction;
}

module.exports = { TASKS, SELECTION_CHIPS, PAGE_CHIPS, MAX_CONTEXT_CHARS, buildPrompt, handoffPrompt };
