// Router and answer self-check (DESIGN.md §2.10). Both are plain code: no model call decides where a request goes
// or whether its answer looks weak.

// Tasks that are harder than their wording suggests (brain/tasks.js ids).
const TASK_WEIGHT = { find_bug: 2, explain_code: 1, likely_fix: 1, explain_error: 1, fact_check: 1, quiz_harder: 1, research_found: 1 };

// Each signal counts once, however often its words appear.
const SIGNALS = [
  { re: /\b(why|how come)\b/i, weight: 1, reason: 'asks why' },
  { re: /\b(compare|comparison|versus|vs\.?|trade-?offs?|pros and cons|difference between|better than|which is better)\b/i, weight: 2, reason: 'comparison' },
  { re: /\b(step[- ]by[- ]step|design|architect(ure)?|plan|strategy|optimi[sz]e|evaluate|analy[sz]e)\b/i, weight: 2, reason: 'reasoning or planning' },
  { re: /\b(solve|prove|proof|derive|equation|probability|integral|derivative|theorem|logic puzzle)\b|\d+\s*[+*/^×÷=]\s*\d+|\d+\s+-\s+\d+/i, weight: 2, reason: 'math or logic' },
];

// ponytail: hand-tuned thresholds over a score of simple features. Ceiling: wording it has never seen (a hard
// question phrased plainly reads as easy). Upgrade path: a tiny learned classifier over the same features, trained on
// the questions the self-check escalated.
const LONG_QUESTION_WORDS = [40, 120];
const LONG_CONTEXT_CHARS = [6000, 16000];
const BIG_CODE_LINES = [30, 150];
const MEDIUM_AT = 2;
const HARD_AT = 4;

const words = (text) => (String(text || '').match(/\S+/g) || []).length;
const codeLines = (text) => String(text || '').split('\n').filter((l) => /[;{}()=]|^\s{2,}\S|^\s*(def|class|function|import|return)\b/.test(l)).length;

// → { level: 'easy' | 'medium' | 'hard', score, reasons[] }. `request` is what the user asked (typed question or the
// task's instruction); `context` is the selection/page text, if any.
function estimate({ taskId = 'ask', request = '', context = '' } = {}) {
  const reasons = [];
  let score = 0;
  const add = (weight, reason) => { score += weight; reasons.push(reason); };

  if (TASK_WEIGHT[taskId]) add(TASK_WEIGHT[taskId], `${taskId} task`);
  const n = words(request);
  if (n > LONG_QUESTION_WORDS[1]) add(2, 'long question');
  else if (n > LONG_QUESTION_WORDS[0]) add(1, 'long question');
  if ((request.match(/\?/g) || []).length >= 2 || /^\s*\d+[.)]\s/m.test(request)) add(1, 'several questions');
  for (const s of SIGNALS) if (s.re.test(request)) add(s.weight, s.reason);
  const code = codeLines(context) + codeLines(request.match(/```[\s\S]*?```/g)?.join('\n'));
  if (code > BIG_CODE_LINES[1]) add(2, 'lots of code');
  else if (code > BIG_CODE_LINES[0]) add(1, 'lots of code');
  const chars = String(context || '').length;
  if (chars > LONG_CONTEXT_CHARS[1]) add(2, 'long context');
  else if (chars > LONG_CONTEXT_CHARS[0]) add(1, 'long context');

  const level = score >= HARD_AT ? 'hard' : score >= MEDIUM_AT ? 'medium' : 'easy';
  return { level, score, reasons };
}

// Picks a model tier from the ones available, weakest first: e.g. ['fast', 'smart', 'cloud'].
function pickTier(level, ladder) {
  if (level === 'hard') return ladder[ladder.length - 1];
  if (level === 'medium' && ladder.includes('smart')) return 'smart';
  return ladder[0];
}

const HEDGE = /\b(i'?m not (sure|certain)|i am not (sure|certain)|i (don'?t|do not) know|i cannot|i can'?t (help|answer|assist|provide|do that)|as an ai|i'?m (just )?an ai|i am unable|i'?m unable|i (don'?t|do not) have enough information)\b/i;
const ASKS_LIST = /\b(steps|list (the|all|some|me|every)|list of|bullets?|bullet points|checklist)\b/i;
const HAS_LIST = /^\s*([-*•]|\d+[.)])\s+\S/m;
const ASKS_CODE = /\b(write|give|show|generate|implement|example)\b[\s\S]*\b(code|snippet|function|script|regex|class|method)\b/i;
const HAS_CODE = /```|^( {4}|\t)\S/m;
const ENDS_CLEANLY = /[.!?)"'`*:\]…]\s*$/;

// Dominant script of the letters in a text, or null when there are too few to tell.
function script(text) {
  const counts = { latin: 0, cjk: 0, cyrillic: 0, arabic: 0, other: 0 };
  for (const ch of String(text || '').replace(/```[\s\S]*?```/g, '')) {
    if (/[a-zA-ZÀ-ɏ]/.test(ch)) counts.latin++;
    else if (/[぀-ヿ㐀-鿿가-힯]/.test(ch)) counts.cjk++;
    else if (/[Ѐ-ӿ]/.test(ch)) counts.cyrillic++;
    else if (/[؀-ۿ]/.test(ch)) counts.arabic++;
    else if (/\p{L}/u.test(ch)) counts.other++;
  }
  const [name, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return count >= 4 ? name : null;
}

const squash = (text) => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Flags a weak answer → [{ id, label }], empty when it looks fine. `request` is what was asked, `typed` says whether a
// person wrote it (only then is its language a signal), `maxTokens` is the answer budget.
function check(answer, { request = '', typed = false, level = 'easy', maxTokens = 400 } = {}) {
  const text = String(answer || '').trim();
  const flags = [];
  const flag = (id, label) => flags.push({ id, label });
  if (!text) return [{ id: 'empty', label: 'first answer was empty' }];

  const n = words(text);
  if (n < 4 && (words(request) >= 8 || level !== 'easy')) flag('short', 'first answer was too short');
  // Only an answer that opens with a hedge; "probably X, but I'm not sure about Y" is honest, not weak.
  if (text.match(HEDGE)?.index <= 12) flag('hedge', 'first answer looked unsure');
  const asked = squash(request);
  if (words(asked) >= 4 && squash(text).includes(asked) && n <= words(asked) * 1.3 + 3) flag('echo', 'first answer just repeated the question');
  const wantsCode = ASKS_CODE.test(request);
  if (wantsCode && !HAS_CODE.test(text)) flag('format', 'first answer had no code');
  else if (!wantsCode && ASKS_LIST.test(request) && !HAS_LIST.test(text)) flag('format', 'first answer skipped the list you asked for');
  if (!ENDS_CLEANLY.test(text) && text.length / 4 >= maxTokens * 0.85) flag('truncated', 'first answer was cut off');
  if (typed) {
    const want = script(request);
    const got = script(text);
    if (want && got && want !== got) flag('language', 'first answer was in the wrong language');
  }
  return flags;
}

module.exports = { estimate, pickTier, check };
