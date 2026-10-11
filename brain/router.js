// Router and answer self-check (DESIGN.md §2.10). Both are plain code: no model call decides where a request goes
// or whether its answer looks weak.
const fs = require('fs');
const { cosine, toBase64, fromBase64 } = require('./embed');

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

// Token confidence (local llama.cpp answers only): the probability the model gave each token it picked, after the
// top-k/top-p cut, so values run high. Measured on Qwen3 4B (temp 0.7, top-p 0.8): ordinary answers, right or wrong,
// sit at mean log-prob -0.02 to -0.15 with 0-8% of tokens below LOW_TOKEN_P. So the limits only catch an answer the
// model was visibly unsure of while writing.
// ponytail: borrowed, conservative thresholds. Calibrate them from logged cases (log-probs + whether the self-check
// or "Go deeper" escalated) once a few hundred exist.
const LOW_TOKEN_P = 0.5;
const MIN_CONFIDENCE_TOKENS = 8;
const CONFIDENCE_LIMITS = {
  factual: { meanLogProb: -0.6, lowShare: 0.25 }, // a wrong fact is the costly failure, so this trips first
  default: { meanLogProb: -0.8, lowShare: 0.3 },
};
const FACTUAL_TASKS = new Set(['ask', 'fact_check', 'meaning_here', 'define', 'explain_error', 'likely_fix']);
// Rewrites and open-ended writing have many fine word choices, so low confidence there says nothing about quality:
// these tasks never escalate on confidence alone.
const NO_CONFIDENCE_TASKS = new Set(['rewrite', 'shorter', 'professional', 'warmer', 'simplify', 'translate', 'examples', 'quiz_harder', 'shop_take', 'food_estimate']);

// Per-token probabilities → { meanLogProb, lowShare, tokens }, or null when there are too few to mean anything.
function confidenceStats(probabilities) {
  const ps = (probabilities || []).filter((p) => Number.isFinite(p));
  if (ps.length < MIN_CONFIDENCE_TOKENS) return null;
  const meanLogProb = ps.reduce((sum, p) => sum + Math.log(Math.max(p, 1e-9)), 0) / ps.length;
  return { meanLogProb, lowShare: ps.filter((p) => p < LOW_TOKEN_P).length / ps.length, tokens: ps.length };
}

function unsure(confidence, taskId) {
  if (!confidence || NO_CONFIDENCE_TASKS.has(taskId)) return false;
  const limit = CONFIDENCE_LIMITS[FACTUAL_TASKS.has(taskId) ? 'factual' : 'default'];
  return confidence.meanLogProb < limit.meanLogProb || confidence.lowShare > limit.lowShare;
}

// Qwen3 thinks before answering only where it pays for its latency: hard questions, comparisons, debugging.
const DEBUG_TASKS = new Set(['find_bug', 'likely_fix', 'explain_error']);
function thinkingFor({ taskId = 'ask', route = null } = {}) {
  if (!route) return false;
  return route.level === 'hard' || route.reasons.includes('comparison') || DEBUG_TASKS.has(taskId);
}

const squash = (text) => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Flags a weak answer → [{ id, label }], empty when it looks fine. `request` is what was asked, `typed` says whether a
// person wrote it (only then is its language a signal), `maxTokens` is the answer budget.
// `confidence` is confidenceStats() of the answer when the runtime gave token probabilities, else null (skipped).
function check(answer, { request = '', typed = false, level = 'easy', maxTokens = 400, taskId = 'ask', confidence = null } = {}) {
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
  if (unsure(confidence, taskId)) flag('confidence', 'the model was unsure of its first answer');
  return flags;
}

// kNN escalation memory: vectors of typed questions with whether they needed a stronger tier (self-check upgrade or
// "Go deeper"). When most close neighbours of a new question escalated, it starts one tier up. Needs the optional
// embedder; without it every call is a no-op.
const NEIGHBOR_MIN = 0.8;
const SAME_QUESTION = 0.97;
const NEIGHBORS = 5;
const MIN_NEIGHBORS = 2;
const MAX_ESCALATION_ENTRIES = 1000;

class EscalationLog {
  constructor(file, { embedder = null } = {}) {
    this.file = file;
    this.embedder = embedder;
    try {
      this.entries = JSON.parse(fs.readFileSync(file, 'utf8')).map((e) => ({ ...e, vec: fromBase64(e.vec) })).filter((e) => e.vec);
    } catch {
      this.entries = []; // first run or unreadable
    }
  }

  async vector(question) {
    return this.embedder?.available() ? this.embedder.embed(question) : null;
  }

  // ponytail: linear scan over ≤1000 vectors (~1 ms); an index only if this ever grows past that.
  nearest(vec) {
    return this.entries.map((e) => ({ e, score: cosine(vec, e.vec) })).filter((n) => n.score >= NEIGHBOR_MIN)
      .sort((a, b) => b.score - a.score).slice(0, NEIGHBORS);
  }

  // Records the outcome; the same question asked again replaces its old entry (so "Go deeper" flips it).
  async record(question, escalated) {
    const vec = await this.vector(question);
    if (!vec) return;
    const same = this.nearest(vec).find((n) => n.score >= SAME_QUESTION);
    if (same) this.entries.splice(this.entries.indexOf(same.e), 1);
    this.entries.push({ vec, escalated: Boolean(escalated) });
    if (this.entries.length > MAX_ESCALATION_ENTRIES) this.entries.shift();
    this.save();
  }

  // True when most of the close neighbours (and at least MIN_NEIGHBORS) escalated.
  async likelyHard(question) {
    const vec = await this.vector(question);
    if (!vec) return false;
    const near = this.nearest(vec);
    return near.length >= MIN_NEIGHBORS && near.filter((n) => n.e.escalated).length > near.length / 2;
  }

  clear() {
    this.entries = [];
    this.save();
  }

  save() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.entries.map((e) => ({ vec: toBase64(e.vec), escalated: e.escalated }))));
    } catch (err) {
      console.warn('[router] could not save the escalation log:', err.message);
    }
  }
}

module.exports = { estimate, pickTier, check, confidenceStats, thinkingFor, EscalationLog };
