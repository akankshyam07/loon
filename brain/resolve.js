// Resolver ladder (DESIGN.md §2.10): try the cheapest tier that can answer, stop at the first hit.
// Tiers per task: code (templates, WordNet, offline translator, TextRank) → cache (exact match) → local LLM.
const fs = require('fs');
const { ResponseCache } = require('./cache');
const { TASKS, MAX_CONTEXT_CHARS, buildPrompt } = require('./tasks');
const { define } = require('./define');
const { keySentences, trimForModel } = require('./textrank');
const { languageName } = require('./translate');

const PROMPT_VERSION = 'v2';
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
    match: /^(who|what) are you\??$/,
    answer: () => ({ mood: 'happy', text: "I'm Loon, a small black cat who lives on your screen. I run entirely on your Mac, so nothing you ask leaves it." }),
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

const EMPTY_TIERS = () => ({ code: 0, cache: 0, local: 0 });

class Resolver {
  constructor({ brain, cacheFile, countsFile, translator = null }) {
    this.brain = brain;
    this.translator = translator;
    this.cache = new ResponseCache(cacheFile);
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
  // onText streams answer text; returns { text, mood, tier, detail? }.
  async run(taskId, packet, { onText, signal, firstInThread = true, deeper = false, question } = {}) {
    const task = TASKS[taskId];
    if (!task) throw new Error(`Unknown task: ${taskId}`);
    const tiers = task.tiers || [];
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
      const text = await define(packet.text);
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

    // Instant key points from TextRank, then the model writes the summary under them.
    if (!deeper && !question && tiers.includes('keypoints')) {
      const points = keySentences(packet.text, 4);
      if (points.length) {
        prefix = `**Key points**\n${points.map((p) => `- ${p}`).join('\n')}\n\n**Summary**\n`;
        onText(prefix);
      }
    }

    const prompt = buildPrompt(taskId, { ...packet, text: packet.text && trimForModel(packet.text, MAX_CONTEXT_CHARS) }, { deeper, question });
    // Follow-ups depend on the conversation so far, so only a thread's first turn is cacheable.
    const cacheable = firstInThread && !question;
    const key = cacheable ? ResponseCache.key(taskId, normalize(prompt), String(deeper), this.brain.modelId(), PROMPT_VERSION) : null;
    const hit = key && this.cache.get(key);
    if (hit) {
      onText(hit.text);
      this.count('cache');
      return { text: prefix + hit.text, mood: hit.mood, tier: 'cache' };
    }

    this.lastPrompt = prompt;
    let text = '';
    const parser = createMoodParser((piece) => { text += piece; onText(piece); });
    await this.brain.chat(prompt, { onText: (chunk) => parser.push(chunk), signal, maxTokens: deeper ? 900 : task.maxTokens });
    const mood = parser.finish();
    text = text.trim();
    this.count('local');
    if (key && text && !signal?.aborted) this.cache.set(key, { text, mood });
    return { text: prefix + text, mood, tier: 'local' };
  }
}

module.exports = { Resolver, createMoodParser, normalize, isoWeek };
