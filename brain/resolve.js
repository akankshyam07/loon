// Resolver ladder (DESIGN.md §2.10): try the cheapest tier that can answer, stop at the first hit.
// Tiers per task: code (templates, WordNet, offline translator, TextRank) → cache (exact, then same meaning) → model.
// brain/router.js picks the model: fast local, smart local, or the cloud tier when the user turned on "Smarter answers"
// (§3.17): their Claude/ChatGPT plan via the official CLI, or their own API key. A weak answer gets one automatic upgrade.
const fs = require('fs');
const path = require('path');
const { ResponseCache } = require('./cache');
const { TASKS, MAX_CONTEXT_CHARS, buildPrompt, historyBlock, followUpContext, memoryGroup } = require('./tasks');
const { define } = require('./define');
const { scopeOf } = require('./memory');
const { domainForTask } = require('./graph');
const { cleanPersonal, instructionsBlock, maxTokensFor, sensesFor } = require('./personal');
const { keySentences, trimForModel } = require('./textrank');
const { languageName } = require('./translate');
const { fingerprint } = require('./errors');
const shopping = require('./shopping');
const food = require('./food');
const { redact } = require('./redact');
const { SYSTEM_PROMPT } = require('./ai');
const { estimate, pickTier, check, thinkingFor, EscalationLog } = require('./router');

const PROMPT_VERSION = 'v2';
const QUICK_LABEL = '_Quick take from your Mac while your plan thinks…_\n\n';
const MOODS = ['happy', 'curious', 'judgy', 'sleepy', 'suspicious', 'focused', 'protective', 'confused'];

// T1: answers that need no model. Time/date change, so these never go in the cache.
const CODE_ANSWERS = [
  {
    match: /^(what('?s| is) the )?(current )?time( is it)?( now)?\??$|^what time is it\??$/,
    answer: () => ({ mood: 'happy', text: `It's ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` }),
  },
  {
    match: /^(what('?s| is) (the |today'?s )?date|what day is (it|today))( today)?\??$/,
    answer: () => ({ mood: 'happy', text: `It's ${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}.` }),
  },
  {
    match: /^(what can you do|help|what do you do|how do (i|you) use (you|this))\??$/,
    answer: () => ({
      mood: 'happy',
      text: [
        "Here's what I can do, all on your Mac:",
        '- **Highlight text** in Chrome: define, translate, explain, rewrite',
        '- **"Summarize this page"**, shopping tables, menu picks, error help',
        '- **"Remind me to… at 5"**, "add … Friday 3pm", "open Spotify", "find my resume"',
        '- **"Where did I leave off?"** on projects you allow in Settings',
        '- **⌥⇧S** read a screenshot · **⌥⇧V** talk to me · **drop a file** on me',
        '- **⌥⇧T** or **"where is the … button?"**: I point at it on your screen, and follow along with video tutorials',
        '- **"Remember that…"** so I get to know you (Settings to edit)',
      ].join('\n'),
    }),
  },
  {
    match: /^(who|what) are you\??$/,
    answer: () => ({ mood: 'happy', text: "I'm Loon, a small black cat who lives on your screen. I run on your Mac, and nothing you ask leaves it unless you switch on Smarter answers in Settings." }),
  },
];

function normalize(text) {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - yearStart) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

function couldBeMoodTag(head) {
  const start = head.trimStart().toLowerCase();
  const tag = '[mood:';
  return start.length <= tag.length ? tag.startsWith(start) : start.startsWith(tag);
}

// Streams model text while pulling the leading "[mood:x]" tag (and any <think> block) out of it.
function createMoodParser(onText) {
  let head = '';
  let decided = false;
  let mood = null;
  let inThink = false;
  const emit = (text) => {
    if (inThink || text.includes('<think>')) {
      inThink = !text.includes('</think>');
      text = text.split('</think>').pop();
      if (inThink) return;
    }
    if (text) onText(text);
  };
  return {
    push(chunk) {
      if (decided) return emit(chunk);
      head += chunk;
      const tag = head.match(/^\s*(?:<think>[\s\S]*?<\/think>\s*)?\[mood:\s*([a-z]+)\s*\]\s*/i);
      if (tag) {
        mood = MOODS.includes(tag[1].toLowerCase()) ? tag[1].toLowerCase() : null;
        decided = true;
        const rest = head.slice(tag[0].length);
        if (rest) emit(rest);
      } else if (!head.includes('<think>') && (head.length > 60 || !couldBeMoodTag(head))) {
        decided = true;
        emit(head.trimStart());
      }
    },
    finish() {
      if (!decided && head) emit(head.trimStart());
      return mood;
    },
  };
}

// Qwen3 thinking must never reach the bubble or the cache, whatever the runtime streamed.
const stripThink = (text) => String(text || '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '');

const EMPTY_TIERS = () => ({ code: 0, cache: 0, local: 0 }); // plus cloud (plan CLI) and api (own key) once used

class Resolver {
  constructor({ brain, cacheFile, countsFile, translator = null, skills = null, memory = null, notes = null, embedder = null, settings = {}, cli = require('./cli-provider'), api = null }) {
    this.brain = brain;
    this.cli = cli;
    this.api = api; // { route(settings) } from brain/api-provider.js; null = no API backend
    this.memory = memory;
    this.notes = notes;
    this.settings = settings;
    this.translator = translator;
    this.skills = skills;
    this.cache = new ResponseCache(cacheFile, { embedder });
    this.escalations = new EscalationLog(path.join(path.dirname(cacheFile), 'escalations.json'), { embedder });
    this.countsFile = countsFile;
    this.counts = this.loadCounts();
    this.lastPrompt = null; // exactly what the model saw last, for the "[view]" footer and tests
  }

  loadCounts() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.countsFile, 'utf8'));
      if (saved.week === isoWeek()) return saved;
    } catch {
      // first run or unreadable: start a fresh week
    }
    return { week: isoWeek(), tiers: EMPTY_TIERS() };
  }

  count(tier) {
    if (this.counts.week !== isoWeek()) this.counts = { week: isoWeek(), tiers: EMPTY_TIERS() };
    this.counts.tiers[tier] = (this.counts.tiers[tier] || 0) + 1;
    fs.writeFileSync(this.countsFile, JSON.stringify(this.counts));
  }

  // Typed question with no screen context (M1 path).
  ask(question, opts) {
    return this.run('ask', { source: 'typed', question }, opts);
  }

  // Runs a task (brain/tasks.js) on a context packet, cheapest tier first.
  // onText streams answer text; returns { text, mood, tier, target, detail? } (target: fast | smart | cloud for a model
  // answer, so the next follow-up can stay on it).
  // history: the bubble thread's earlier turns [{ question, answer, target }] for a follow-up (main/companion.js), empty
  // on a thread's first turn. A follow-up prefers the tier that answered the previous turn (sticky, never downgraded).
  // domain: the context mode's area of life (brain/modes.js), boosting those memories when the task names none.
  async run(taskId, packet, { onText, onRestart = () => {}, signal, firstInThread = true, deeper = false, question, sensitive = false, history = [], domain = '' } = {}) {
    const task = TASKS[taskId];
    if (!task) throw new Error(`Unknown task: ${taskId}`);
    const tiers = task.tiers || [];
    // Privacy mode (§3.15): no memory in prompts, no cache reads or writes.
    const privacy = Boolean(this.settings.privacy);
    const request = question || packet.question || String(packet.text || '').slice(0, 500);
    if (!privacy) await this.memory?.warm?.(request); // embeds the request so recall can match by meaning
    const scope = scopeOf(packet);
    const recalled = privacy || !this.memory ? [] : this.memory.recall({ group: memoryGroup(taskId), query: request, scope, domain: domainForTask(taskId, scope) || domain });
    const memory = recalled.map((r) => r.text);
    this.lastMemory = recalled; // [{ id, text }]: the bubble's "Forget what you used" lists these
    // Custom instructions and reply style (Settings): a fixed block right after the system prompt; length also sets
    // the token cap and how many dictionary senses a definition shows.
    const personal = cleanPersonal(this.settings.personal);
    const instructions = instructionsBlock(personal, { privacy });
    let prefix = '';

    if (taskId === 'ask' && !packet.text) {
      const template = CODE_ANSWERS.find((c) => c.match.test(normalize(packet.question)));
      if (template) {
        const { text, mood } = template.answer();
        onText(text);
        this.count('code');
        return { text, mood, tier: 'code' };
      }
    }

    if (!deeper && !question && tiers.includes('define')) {
      const text = await define(packet.text, { maxSenses: sensesFor(personal.length) });
      if (text) {
        onText(text);
        this.count('code');
        return { text, mood: 'curious', tier: 'code', detail: 'WordNet dictionary' };
      }
    }

    if (!deeper && !question && tiers.includes('translate') && this.translator) {
      try {
        const result = await this.translator.translate(packet.text);
        if (result?.sameLanguage) {
          const text = `This already looks like ${languageName(result.from)}.`;
          onText(text);
          this.count('code');
          return { text, mood: 'curious', tier: 'code', detail: 'language check' };
        }
        if (result) {
          onText(result.text);
          this.count('code');
          return { text: result.text, mood: 'happy', tier: 'code', detail: `offline translator · ${result.fromName} → ${result.toName}` };
        }
      } catch (err) {
        console.warn('[translate] falling back to the local model:', err.message);
      }
    }

    // M3 code tiers: shopping, reviews, basket, food, known errors, DTOs, grammar.
    if (!deeper && !question && this.skills) {
      for (const tier of tiers.filter((t) => !['define', 'translate', 'keypoints'].includes(t))) {
        const result = await this.skills.run(tier, taskId, packet, { memory, judgmental: this.settings.judgmental !== false });
        if (!result) continue;
        onText(result.text);
        // Honest labels: a one-time model call (e.g. writing a site extractor) counts as on-device, not instant.
        this.count(result.usedModel ? 'local' : 'code');
        return { ...result, tier: result.usedModel ? 'local' : 'code' };
      }
    }

    // Some model tasks work on computed data instead of raw page text (the model never recomputes numbers).
    if (task.contextFrom === 'shopping' && this.skills) {
      const { items } = await this.skills.products(packet);
      packet = { ...packet, text: items.length ? shopping.renderTable(shopping.analyze(items, packet.text)) : packet.text };
    } else if (task.contextFrom === 'notes' && this.notes) {
      const entries = this.notes.entries(60);
      if (!entries.length) {
        const text = "You haven't saved any notes yet. Tap \u201cSave to notes\u201d under any answer to start.";
        onText(text);
        return { text, mood: 'curious', tier: 'code', detail: 'notes' };
      }
      packet = { ...packet, source: 'notes', text: entries.map((e) => `- ${e.heading}: ${e.body.replace(/\s+/g, ' ').slice(0, 400)}${e.source ? ` (${e.source})` : ''}`).join('\n') };
    } else if (task.contextFrom === 'menu') {
      const items = food.extractMenu(packet.text || '');
      if (items.length) packet = { ...packet, text: items.map((i) => `- ${i.name}${i.description ? `: ${i.description}` : ''}`).join('\n') };
    }

    // Instant key points from TextRank, then the model writes the summary under them.
    if (!deeper && !question && tiers.includes('keypoints')) {
      const points = keySentences(packet.text, 4);
      if (points.length) {
        prefix = `**Key points**\n${points.map((p) => `- ${p}`).join('\n')}\n\n**Summary**\n`;
        onText(prefix);
      }
    }

    // The cloud tier is opt-in ("Smarter answers": plan CLI or own API key). Privacy mode and sensitive pages turn it off.
    // The API key route is only used when picked; it is never a fallback for the plan CLI or the other way round.
    const offline = privacy || sensitive;
    const cli = !offline && ['claude', 'codex'].includes(this.settings.cloudCli) ? this.settings.cloudCli : null;
    const api = !offline && this.settings.cloudCli === 'api' && this.api ? this.api.route(this.settings) : null;
    const cloud = Boolean(cli || api);
    const viaCloud = cloud && deeper;
    // Plan-first ("Answer with: Your plan", the default once a plan CLI is set up): medium and hard questions go to the
    // plan, easy ones stay on the fast local model. "This Mac" keeps the plan for hard questions and "Go deeper" only.
    const planFirst = Boolean(cli) && this.settings.answerWith !== 'mac';
    // A follow-up carries the conversation in the prompt (the same text for every tier) and a shorter copy of the
    // context; "Go deeper" keeps the whole context, since it redoes the task on it.
    const followUp = history.length > 0;
    const contextText = packet.text && (followUp && !deeper ? followUpContext(packet.text) : trimForModel(packet.text, MAX_CONTEXT_CHARS));
    const prompt = buildPrompt(taskId, { ...packet, text: contextText }, { deeper, question, memory, instructions, history });
    // A first turn caches as before (not a typed question about a selection). A follow-up is only cacheable under a key
    // that includes its conversation, so it can never get a first turn's answer, and never by meaning.
    const thread = followUp ? ResponseCache.key(historyBlock(history)) : null;
    const cacheable = !privacy && (followUp || (firstInThread && !question));
    // Errors cache by fingerprint so the same error with different paths/values reuses one answer.
    const identity = task.cacheByFingerprint ? fingerprint(packet.text || '').hash : normalize(prompt);
    // Routed and upgraded answers share the plain key, so a question that needed a stronger tier is instant next time.
    // Cache keys name the provider and model, never the key.
    const model = !viaCloud ? this.brain.modelId() : api ? `api:${api.provider}:${api.model(true)}` : `cli:${cli}`;
    const key = cacheable ? ResponseCache.key(taskId, identity, String(deeper), model, PROMPT_VERSION, ...(thread ? [`thread:${thread}`] : [])) : null;
    // A typed question may also match an earlier one with the same meaning, never across different context or memory.
    const similar = key && !followUp && packet.question && !task.cacheByFingerprint
      ? { group: ResponseCache.key(taskId, packet.text || '', memory.join('\n'), String(deeper), model, PROMPT_VERSION, ...(instructions ? [instructions] : [])), question: packet.question }
      : null;
    const exact = key && this.cache.get(key);
    const hit = exact || (similar && await this.cache.findSimilar(similar));
    if (hit) {
      onText(hit.text);
      this.count('cache');
      return { text: prefix + hit.text, mood: hit.mood, tier: 'cache', target: hit.target, detail: exact ? undefined : 'remembered a similar question', estimated: Boolean(task.estimated), replaceText: task.replaceable ? hit.text : undefined };
    }

    // Router (§2.10): model tiers weakest first; "Go deeper" keeps its own rule (plan if on, else the smart model).
    // Plan-first skips the slower smart local model; it stays the fallback for hard questions when the plan fails.
    const local = ['fast', this.brain.hasSmart?.() && 'smart'].filter(Boolean);
    const ladder = planFirst ? ['fast', 'cloud'] : [...local, cloud && 'cloud'].filter(Boolean);
    const typed = taskId === 'ask' || Boolean(question);
    const asked = typed ? question || packet.question : task.instruction(packet);
    const route = deeper ? null : estimate({ taskId, request: asked, context: packet.text });
    // kNN escalation memory: typed first turns only (a chip's instruction alone says nothing, and neither does "why?" out
    // of its thread), never in Privacy mode.
    const learn = typed && !privacy && !followUp;
    const maxTokens = deeper ? 900 : maxTokensFor(task.maxTokens, personal.length);

    this.lastPrompt = prompt;
    let streamed = false;
    const thinking = thinkingFor({ taskId, route });
    let quick = null; // the instant local answer shown while the plan works (Settings: "Quick take")
    const attempt = async (target) => {
      let text = '';
      let confidence = null;
      const parser = createMoodParser((piece) => { streamed = true; text += piece; onText(piece); });
      const onChunk = (chunk) => { quick?.stop(); parser.push(chunk); };
      // Redaction already ran on screen context (main/context.js); this pass also covers typed text and memory
      // before anything leaves the Mac.
      // The API's hard model is for "Go deeper" and hard questions; upgrades and fallbacks use the normal one.
      const hard = target === 'cloud' && Boolean(deeper || route?.level === 'hard');
      if (target === 'cloud') {
        const request = { system: SYSTEM_PROMPT, prompt: redact(prompt).text, onText: onChunk, signal };
        if (api) await api.ask({ ...request, hard });
        // Normal questions get the plan's fast model, hard ones and "Go deeper" its strongest; a warm process waits.
        else await this.cli.ask(cli, { ...request, level: hard ? 'hard' : 'medium', models: this.settings.planModels?.[cli], warm: planFirst });
      } else await this.brain.chat(prompt, { onText: onChunk, signal, maxTokens, smart: target === 'smart', thinking, onConfidence: (c) => { confidence = c; } });
      return { text: stripThink(text).trim(), mood: parser.finish(), target, confidence, hard };
    };
    // Clears the streamed answer so a different one can take its place.
    const restart = () => {
      onRestart();
      streamed = false;
      if (prefix) onText(prefix);
    };

    // Quick take: streams the fast local answer under a label; the plan's first words replace it. Local only, so
    // it is shown even when the plan is slow, and it is never cached or counted.
    const startQuick = () => {
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      let shown = false;
      const q = { live: true };
      q.stop = ({ clear = true } = {}) => {
        if (!q.live) return;
        q.live = false;
        cancel();
        signal?.removeEventListener('abort', cancel);
        if (shown && clear) restart();
      };
      const parser = createMoodParser((piece) => {
        if (!q.live) return;
        if (!shown) onText(QUICK_LABEL);
        shown = true;
        onText(piece);
      });
      this.brain.chat(prompt, { onText: (c) => parser.push(c), signal: controller.signal, maxTokens }).catch(() => {});
      return q;
    };

    let target = deeper ? (viaCloud ? 'cloud' : 'smart') : pickTier(route.level, ladder, { planFirst });
    let note = route && target !== 'fast' ? `routed: ${route.level === 'hard' ? 'hard' : 'trickier'} question` : '';
    // Sticky tier: a follow-up stays on the tier that answered the previous turn ("and in Python?" after a plan answer
    // reads as easy, but belongs on the plan), unless the router rates it harder or that tier is unavailable now.
    const previous = followUp && !deeper && history[history.length - 1].target;
    if (previous && ladder.includes(previous) && ladder.indexOf(previous) > ladder.indexOf(target)) {
      target = previous;
      note = 'follow-up: same model as the last answer';
    }
    const stronger = ladder[ladder.indexOf(target) + 1];
    const preRouted = Boolean(route && stronger && learn && await this.escalations.likelyHard(asked));
    if (preRouted) {
      target = stronger;
      note = 'routed: similar questions needed a stronger model';
    }
    if (planFirst && target === 'cloud' && !deeper && this.settings.quickTake) quick = startQuick();
    let answer;
    let fallback = false;
    try {
      answer = await attempt(target);
    } catch (err) {
      // A failed local model falls back to the plan; a routed (not chosen) plan call falls back to the Mac
      // (plan-first: the smart model for hard questions, else the fast one).
      const backup = planFirst ? (route?.level === 'hard' ? local[local.length - 1] : 'fast') : ladder[ladder.length - 2];
      const other = target === 'cloud' ? !deeper && backup : cloud && 'cloud';
      quick?.stop({ clear: false });
      if (!other || signal?.aborted || streamed) throw err;
      console.warn(`[resolve] ${target} model failed, using ${other}:`, err.message);
      fallback = true;
      note = '';
      if (target === 'cloud') {
        // Honest label: say the plan didn't answer and why (login, model, rate limit, offline), then answer locally.
        note = 'your plan didn’t answer, so this came from your Mac';
        prefix = `_Your plan didn’t answer (${String(err.message || 'unknown error').replace(/\s+/g, ' ').slice(0, 200)}), so this one is from your Mac._\n\n${prefix}`;
        restart(); // clears any quick take and key points, then shows the notice with them
      }
      target = other;
      answer = await attempt(target);
    }
    quick?.stop();

    // Self-check: a weak answer gets one automatic try on the next tier up. Never twice, never after a fallback.
    const next = ladder[ladder.indexOf(answer.target) + 1];
    const checkOpts = { request: asked, typed, level: route?.level, maxTokens: maxTokens || 400, taskId };
    let flags = deeper || fallback ? [] : check(answer.text, { ...checkOpts, confidence: answer.confidence });
    const upgrading = Boolean(flags.length && next && !signal?.aborted);
    if (upgrading) {
      const first = answer;
      restart();
      try {
        answer = await attempt(next);
        note = `upgraded: ${flags[0].label}`;
        flags = check(answer.text, { ...checkOpts, confidence: answer.confidence });
      } catch (err) {
        if (signal?.aborted) throw err;
        console.warn('[resolve] upgrade failed, keeping the first answer:', err.message);
        restart();
        onText(first.text);
        answer = first;
      }
    }

    const tier = answer.target === 'cloud' ? 'cloud' : 'local';
    this.count(tier === 'cloud' && api ? 'api' : tier); // "via your API key" is counted apart from "your plan"
    // "Go deeper" and a self-check upgrade both mean this question wanted a stronger tier. A pre-routed answer says
    // nothing about the weaker tier, so it leaves the log as it was.
    if (learn && !preRouted && !fallback && !signal?.aborted) this.escalations.record(asked, deeper || upgrading).catch(() => {});
    // Fallback answers and answers that still look weak are not cached.
    if (key && answer.text && !signal?.aborted && !fallback && !flags.length) this.cache.set(key, { text: answer.text, mood: answer.mood, target: answer.target }, similar);
    const planModel = tier === 'cloud' && !api && this.cli.modelFor?.(cli, answer.hard ? 'hard' : 'medium', this.settings.planModels?.[cli]);
    const detail = [tier === 'cloud' && (api ? api.label(answer.hard) : this.cli.label(cli)), planModel, note].filter(Boolean).join(' · ') || undefined;
    const { text, mood } = answer;
    return { text: prefix + text, mood, tier, target: answer.target, detail, smart: answer.target === 'smart', estimated: Boolean(task.estimated), replaceText: task.replaceable ? text : undefined, difficulty: route?.level || (deeper ? 'deeper' : undefined) };
  }
}

module.exports = { Resolver, createMoodParser, normalize, isoWeek };
