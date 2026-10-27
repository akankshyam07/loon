// Voice intents (DESIGN.md §3.16): templates first, model last, as in Home Assistant Assist and OpenVoiceOS.
// Order matters: stop words, then yes/no (when a confirmation is pending), then templates, then commands;
// anything left is an ordinary question for the resolver ladder.
const { parseCommand, normalizeSpoken } = require('./commands');

const STOP = /^(stop|cancel|never ?mind|shh+|quiet|be quiet|hush|that's enough|enough)$/i;
const YES = /^(yes|yeah|yep|yup|sure|ok(ay)?|do it|go ahead|confirm|please do|correct|right)( (do it|go ahead|please))*$/i;
const NO = /^(no|nope|nah|don't|do not|cancel|stop|never ?mind|wrong|no thanks|no thank you|not now)$/i;

// Fixed phrases → task/toggle. Alternatives written as regex; matched on the normalized utterance.
const TEMPLATES = [
  { re: /^(explain|what does) (this|that|it|the selection)( to me)?( mean)?$|^what does this mean$/, route: { type: 'task', task: 'explain', needs: 'selection' } },
  { re: /^(simplify( this| that| it)?|make (this|that|it) (simpler|easier))$|^explain (this|that|it) simply$/, route: { type: 'task', task: 'simplify', needs: 'selection' } },
  { re: /^(make (this|that|it) (shorter|more concise)|shorten (this|that|it))$/, route: { type: 'task', task: 'shorter', needs: 'selection' } },
  { re: /^(rewrite|reword) (this|that|it)$/, route: { type: 'task', task: 'rewrite', needs: 'selection' } },
  { re: /^make (this|that|it) (more )?(professional|formal)$/, route: { type: 'task', task: 'professional', needs: 'selection' } },
  { re: /^make (this|that|it) (sound )?(warmer|friendlier|nicer)$/, route: { type: 'task', task: 'warmer', needs: 'selection' } },
  { re: /^(summari[sz]e|sum up) (this|that|it|the selection)$/, route: { type: 'task', task: 'summarize', needs: 'selection' } },
  { re: /^translate (this|that)( to english)?$/, route: { type: 'task', task: 'translate', needs: 'selection' } },
  { re: /^(summari[sz]e|sum up) (this|the) page$|^what'?s on (this|the) page$|^what is this page( about)?$/, route: { type: 'task', task: 'page_summary' } },
  { re: /^what (do|should) i do (here|on this page)$/, route: { type: 'task', task: 'page_todo' } },
  { re: /^(which (one )?is (the )?(cheapest|best value)|what'?s the best (deal|value))( here)?$/, route: { type: 'task', task: 'shop_value' } },
  { re: /^what should i (order|eat)( here)?$|^what'?s the lightest( option)?$/, route: { type: 'task', task: 'food_lightest' } },
  { re: /^(quiz me|test me)( on this( page)?)?$/, route: { type: 'task', task: 'quiz' } },
  { re: /^(what have i found|summari[sz]e my notes)$/, route: { type: 'task', task: 'research_found' } },
  { re: /^(?:(?:turn on |start )focus(?: mode)?(?: on)?|focus mode(?: on)?)$|^go to sleep$/, route: { type: 'toggle', key: 'focus', value: true } },
  { re: /^(turn off |stop )focus( mode)?$|^focus (mode )?off$|^wake up$/, route: { type: 'toggle', key: 'focus', value: false } },
  { re: /^(turn on )?privacy mode( on)?$/, route: { type: 'toggle', key: 'privacy', value: true } },
  { re: /^(turn off )?privacy mode off$|^turn off privacy mode$/, route: { type: 'toggle', key: 'privacy', value: false } },
  { re: /^define:? (?:the word )?(.+)$/, route: { type: 'task', task: 'define', slot: 'text' } },
];

// Numbers stay as words here ("which one is cheapest"); only commands get digits, for chrono's sake.
function normalize(transcript) {
  return transcript
    .toLowerCase()
    .replace(/^(hey |ok |okay )?loon[,\s]+/, '') // wake phrase at the start of an utterance
    .replace(/^(please|can you|could you|would you)\s+/, '')
    .replace(/[,.!?]+/g, ' ')
    .replace(/\s+(please|loon)$/, '')
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

// What is worth saying aloud: prose only (no tables, code or lists), at most two sentences.
function speakable(markdown, maxSentences = 2) {
  const prose = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .split('\n')
    .filter((l) => !/^\s*(\||>|[-*•]\s|\d+\.\s|#)/.test(l))
    .join(' ')
    .replace(/[*_`[\]]/g, '')
    .replace(/\(https?:\/\/\S+\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = prose.match(/[^.!?]+[.!?]+/g) || (prose ? [prose] : []);
  return { text: sentences.slice(0, maxSentences).map((x) => x.trim()).join(' '), truncated: sentences.length > maxSentences || prose.length < markdown.trim().length * 0.6 };
}

module.exports = { route, normalize, createSentenceSplitter, speakable, wakePhrase, TEMPLATES };
