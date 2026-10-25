// Voice intents (DESIGN.md §3.16): templates first, model last, as in Home Assistant Assist and OpenVoiceOS.
// Order matters: stop words, then yes/no (when a confirmation is pending), then templates, then commands;
// anything left is an ordinary question for the resolver ladder.
const { parseCommand, normalizeSpoken } = require('./commands');

const STOP = /^(stop|cancel|never ?mind|shh+|quiet|be quiet|hush|that's enough|enough)$/i;
const YES = /^(yes|yeah|yep|yup|sure|ok(ay)?|do it|go ahead|confirm|please do|correct|right)$/i;
const NO = /^(no|nope|nah|don't|do not|cancel|stop|never ?mind|wrong)$/i;

// Fixed phrases → task/toggle. Alternatives written as regex; matched on the normalized utterance.
const TEMPLATES = [
  { re: /^(explain|what does) (this|that|the selection)( mean)?$|^what does this mean$/, route: { type: 'task', task: 'explain', needs: 'selection' } },
  { re: /^(simplify( this| that)?|make (this|that) simpler)$/, route: { type: 'task', task: 'simplify', needs: 'selection' } },
  { re: /^translate (this|that)( to english)?$/, route: { type: 'task', task: 'translate', needs: 'selection' } },
  { re: /^(summari[sz]e|sum up) (this|the) page$|^what'?s on (this|the) page$|^what is this page( about)?$/, route: { type: 'task', task: 'page_summary' } },
  { re: /^what (do|should) i do (here|on this page)$/, route: { type: 'task', task: 'page_todo' } },
  { re: /^(which (one )?is (the )?(cheapest|best value)|what'?s the best (deal|value))( here)?$/, route: { type: 'task', task: 'shop_value' } },
  { re: /^what should i (order|eat)( here)?$|^what'?s the lightest( option)?$/, route: { type: 'task', task: 'food_lightest' } },
  { re: /^(quiz me|test me)( on this( page)?)?$/, route: { type: 'task', task: 'quiz' } },
  { re: /^(what have i found|summari[sz]e my notes)$/, route: { type: 'task', task: 'research_found' } },
  { re: /^(turn on |start )?focus mode( on)?$|^go to sleep$/, route: { type: 'toggle', key: 'focus', value: true } },
  { re: /^(turn off |stop )focus mode$|^focus mode off$|^wake up$/, route: { type: 'toggle', key: 'focus', value: false } },
  { re: /^(turn on )?privacy mode( on)?$/, route: { type: 'toggle', key: 'privacy', value: true } },
  { re: /^(turn off )?privacy mode off$|^turn off privacy mode$/, route: { type: 'toggle', key: 'privacy', value: false } },
  { re: /^define (.+)$/, route: { type: 'task', task: 'define', slot: 'text' } },
];

// Numbers stay as words here ("which one is cheapest"); only commands get digits, for chrono's sake.
function normalize(transcript) {
  return transcript
    .toLowerCase()
    .replace(/^(hey |ok |okay )?loon[,\s]+/, '') // wake phrase at the start of an utterance
    .replace(/^(please|can you|could you|would you)\s+/, '')
    .replace(/[,.!?]+/g, ' ')
    .replace(/\s+please$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// → { type: 'stop' } | { type: 'yes' } | { type: 'no' } | { type: 'task', task, text? } | { type: 'toggle', key, value }
//   | { type: 'command', command } | { type: 'question', text } | { type: 'empty' }
function route(transcript, { awaitingConfirmation = false, speaking = false } = {}) {
  const text = normalize(transcript || '');
  if (!text) return { type: 'empty' };
  if ((speaking || awaitingConfirmation) && STOP.test(text)) return { type: 'stop' };
  if (awaitingConfirmation) {
    if (YES.test(text)) return { type: 'yes' };
    if (NO.test(text)) return { type: 'no' };
  }
  if (STOP.test(text)) return { type: 'stop' };
  for (const { re, route: r } of TEMPLATES) {
    const m = text.match(re);
    if (m) return r.slot ? { ...r, text: m[1] } : { ...r };
  }
  const command = parseCommand(normalizeSpoken(transcript.replace(/^(hey |ok |okay )?loon[,\s]+/i, '')));
  if (command) return { type: 'command', command };
  return { type: 'question', text: transcript.replace(/^(hey |ok |okay )?loon[,\s]+/i, '').trim() };
}

// Wake phrase check for the opt-in "Hey Loon" mode (the isair/jarvis approach: keyword in a short transcript).
// STT sometimes hears "Loon" as a homophone, so a few are accepted; anything else is discarded unheard.
const WAKE = /^\s*(?:(?:hey|hi|ok|okay)[,\s]+)?(?:loon|lune|loom|lewn|luna)\b[,.!?\s]*/i;
function wakePhrase(transcript) {
  const m = (transcript || '').match(WAKE);
  if (!m) return null;
  return { rest: transcript.slice(m[0].length).trim() };
}

// Splits streamed model text into sentences for sentence-by-sentence speech (GLaDOS / HA voice chapter 11).
function createSentenceSplitter(onSentence) {
  let buffer = '';
  return {
    push(chunk) {
      buffer += chunk;
      let m;
      while ((m = buffer.match(/^([\s\S]*?[.!?])(\s+|$)(?=\S|$)/)) && m[0].length < buffer.length) {
        const sentence = m[1].trim();
        buffer = buffer.slice(m[0].length);
        if (sentence) onSentence(sentence);
      }
    },
    flush() {
      if (buffer.trim()) onSentence(buffer.trim());
      buffer = '';
    },
  };
}

const SPOKEN_UNITS = { mi: 'miles', km: 'kilometers', kg: 'kilograms', lb: 'pounds', lbs: 'pounds', oz: 'ounces', ml: 'milliliters', ft: 'feet', cm: 'centimeters', mm: 'millimeters', g: 'grams', l: 'liters', 'fl oz': 'fluid ounces', 'km/h': 'kilometers per hour', mph: 'miles per hour' };

// What is worth saying aloud: prose only (no tables, code or lists), at most two sentences.
function speakable(markdown, maxSentences = 2) {
  const prose = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .split('\n')
    .filter((l) => !/^\s*(\||>|[-*•]\s|\d+\.\s|#)/.test(l))
    .join(' ')
    .replace(/(\d)\s*\*\s*(?=\d)/g, '$1 times ')
    .replace(/[*_`[\]]/g, '')
    .replace(/\(https?:\/\/\S+\)/g, '')
    .replace(/\p{Extended_Pictographic}\uFE0F?/gu, '')
    .replace(/(\d)\s*\/\s*(?=\d)/g, '$1 divided by ')
    .replace(/(\d)\s*\^\s*(?=\d)/g, '$1 to the power of ')
    .replace(/\s=\s/g, ' is ')
    .replace(/(\d) ?°([CF])\b/g, (m, d, u) => `${d} degrees ${u === 'C' ? 'Celsius' : 'Fahrenheit'}`)
    .replace(/(\d) (mi|km|kg|lbs?|oz|ml|ft|cm|mm|g|l|fl oz|km\/h|mph)\b/g, (m, d, u) => `${d} ${SPOKEN_UNITS[u] || u}`)
    .replace(/\s+/g, ' ')
    .trim();
  // A decimal point is not the end of a sentence ("12.6").
  const sentences = prose.match(/(?:\d\.\d|[^.!?])+(?:[.!?]+|$)/g)?.filter((x) => x.trim()) || [];
  return { text: sentences.slice(0, maxSentences).map((x) => x.trim()).join(' '), truncated: sentences.length > maxSentences || prose.length < markdown.trim().length * 0.6 };
}

module.exports = { route, normalize, createSentenceSplitter, speakable, wakePhrase, TEMPLATES };
