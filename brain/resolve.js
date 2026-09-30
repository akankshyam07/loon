// Resolver ladder (DESIGN.md §2.10): try the cheapest tier that can answer, stop at the first hit.
// M1 has one task, 'ask'. Tiers: code (instant templates) → cache (exact match) → local LLM.
const fs = require('fs');
const { ResponseCache } = require('./cache');

const PROMPT_VERSION = 'ask-v1';
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

class Resolver {
  constructor({ brain, cacheFile, countsFile }) {
    this.brain = brain;
    this.cache = new ResponseCache(cacheFile);
    this.countsFile = countsFile;
    this.counts = this.loadCounts();
  }

  loadCounts() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.countsFile, 'utf8'));
      if (saved.week === isoWeek()) return saved;
    } catch {
      // first run or unreadable: start a fresh week
    }
    return { week: isoWeek(), tiers: { code: 0, cache: 0, local: 0 } };
  }

  count(tier) {
    if (this.counts.week !== isoWeek()) this.counts = { week: isoWeek(), tiers: { code: 0, cache: 0, local: 0 } };
    this.counts.tiers[tier] = (this.counts.tiers[tier] || 0) + 1;
    fs.writeFileSync(this.countsFile, JSON.stringify(this.counts));
  }

  // onText streams answer text; returns { text, mood, tier }.
  async ask(question, { onText, signal, firstInThread }) {
    const normalized = normalize(question);

    const template = CODE_ANSWERS.find((c) => c.match.test(normalized));
    if (template) {
      const { text, mood } = template.answer();
      onText(text);
      this.count('code');
      return { text, mood, tier: 'code' };
    }

    // Only a thread's first question is cacheable: follow-ups depend on the conversation so far.
    const key = firstInThread ? ResponseCache.key('ask', normalized, this.brain.modelId(), PROMPT_VERSION) : null;
    const hit = key && this.cache.get(key);
    if (hit) {
      onText(hit.text);
      this.count('cache');
      return { ...hit, tier: 'cache' };
    }

    let text = '';
    const parser = createMoodParser((piece) => { text += piece; onText(piece); });
    await this.brain.chat(question, { onText: (chunk) => parser.push(chunk), signal });
    const mood = parser.finish();
    text = text.trim();
    this.count('local');
    if (key && text && !signal?.aborted) this.cache.set(key, { text, mood });
    return { text, mood, tier: 'local' };
  }
}

module.exports = { Resolver, createMoodParser, normalize, isoWeek };
