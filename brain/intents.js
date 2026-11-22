// Voice intents (DESIGN.md §3.16): templates first, model last, as in Home Assistant Assist and OpenVoiceOS.
// Order matters: stop words, then yes/no (when a confirmation is pending), then templates, then commands;
// anything left is an ordinary question for the resolver ladder.
const { parseCommand, normalizeSpoken } = require('./commands');

const STOP = /^(stop( talking| speaking)?|cancel|never ?mind|shh+|quiet|be quiet|go quiet|mute|mute (it|yourself)|silence|no more talking|hush|shut up|that's enough|that is enough|enough|ok(ay)? (stop|enough)|stop it)$/i;
const YES = /^((yes|yeah|yep|yup|sure|thing|ok(ay)?|absolutely|definitely|of course|do it|go ahead|go for it|send it|confirm|please do|please|correct|right)( |$))+$/i;
const NO = /^(oh )?((no|nope|nah)( (no|nope|nah|don't|do not|stop|cancel|never ?mind|thanks|thank you|not now))*|don't|do not|(don't|do not) do it|wrong|not now|cancel|stop|never ?mind)$/i;

// Fixed phrases → task/toggle. Alternatives written as regex; matched on the normalized utterance.
const TEMPLATES = [
  { re: /^(explain|what does) (this|that|it|the selection)( to me)?( mean)?$|^what does this mean$|^break (this|that|it) down$|^help me understand (this|that|it)$|^i (don'?t|do not) (get|understand) (this|that|it)$/, route: { type: 'task', task: 'explain', needs: 'selection' } },
  { re: /^(simplify( this| that| it)?( for me)?|simpler|make (this|that|it) (simpler|easier|easier to (read|understand)))$|^explain (this|that|it) (to me )?simply$|^eli5( (this|that|it))?$|^explain( this| that| it)?( to me)? like i'?m (5|five)$|^dumb (this|that|it) down$/, route: { type: 'task', task: 'simplify', needs: 'selection' } },
  { re: /^(shorter|shorten|briefer|(more )?concise|less wordy|short and sweet|be (more )?(concise|brief|short|shorter|briefer)|keep (this|that|it) (short|brief)|make (this|that|it) short and sweet|say (this|that|it) (shorter|more briefly)|make (this|that|it) ((a (bit|little)|way|much) )?(shorter|short|briefer|brief|more concise|concise|less wordy|less verbose)|(shorten|tighten|trim)( up)? (this|that|it)( up)?( (a (bit|little)|some))?|cut (this|that|it) (down|short))( for me)?$/, route: { type: 'task', task: 'shorter', needs: 'selection' } },
  { re: /^(rewrite|reword|rephrase)$|^(rewrite|reword|rephrase|paraphrase|improve|polish) (this|that|it)( for me)?$|^improve (my|the) (writing|text)$|^(rewrite|reword|rephrase) (this|that|it) better$|^(clean|tidy)( up)? (this|that|it)( up)?$|^write (this|that|it) better$|^(polish|improve) my (writing|text)$|^make (this|that|it) (sound |flow )?(more )?natural(ly)?$|^make (this|that|it) flow better$|^make (this|that|it) (sound )?(better|clearer|clear)$|^say (this|that|it) (differently|another way|better)$|^paraphrase$/, route: { type: 'task', task: 'rewrite', needs: 'selection' } },
  { re: /^make (this|that|it) (sound )?((a (bit|little) |slightly |much )?more )?(professional|formal|polite)$|^(sound )?more (professional|formal|polite)$|^sound (professional|formal|polite)$|^(write|say) (this|that|it) (more )?(professionally|formally|politely)$|^(rewrite|reword|rephrase)( (this|that|it))? (more |to be more |to sound more |in a |in an? more )?(professionally|formally|politely|professional|formal|polite)( tone)?$/, route: { type: 'task', task: 'professional', needs: 'selection' } },
  { re: /^(make (this|that|it) (sound )?((a (bit|little) )?more |a (bit|little) )?|(rewrite|reword|rephrase) (this|that|it) (to be |to sound |in a )?)(warmer|friendlier|nicer|friendly|warm|nice)( tone)?$|^say (this|that|it) (warmer|friendlier|nicer)$|^(sound )?(warmer|friendlier|nicer|more friendly)$/, route: { type: 'task', task: 'warmer', needs: 'selection' } },
  { re: /^(make (this|that|it) (sound )?(more |a bit more |a little more )?|(rewrite|reword|rephrase|write|say) (this|that|it) (to be |to sound |in a )?(more )?)(casual|casually|informal|informally|relaxed|chill|less formal)( tone)?$|^make (this|that|it) (sound )?less formal$|^(more casual|less formal|more informal)$/, route: { type: 'task', task: 'casual', needs: 'selection' } },
  { re: /^(fix|correct|proofread|check) (the |my )?(grammar|grammer|spelling|typos)( and (grammar|grammer|spelling|typos))?( (in|of) (this|that|it))?$|^(fix|correct|proofread) (this|that|it)( for me)?$|^fix my english$|^make (this|that|it) grammatically correct$|^proofread( (this|that|it|my (text|writing)))?$|^check (this|that|it) for (typos|spelling|grammar|mistakes|errors)( mistakes| errors)?$|^spell[ -]?check( (this|that|it))?$|^run a spell[ -]?check$|^fix (any |the |all )?(mistakes|errors)( in (this|that|it))?$|^check for (mistakes|errors)$/, route: { type: 'task', task: 'fix_grammar', needs: 'selection' } },
  { re: /^(summari[sz]e|sum up|sum) (this|that|it|the selection)( up)?( for me)?$|^(give me |what'?s |what is )the gist( of (this|that|it))?$|^gist( of (this|that|it))?$|^summari[sz]e$|^tl;?dr( (this|that|it))?$|^(give|show) me (a |the )?(quick |short )?(summary|tl;?dr)( of (this|that|it))?$/, route: { type: 'task', task: 'summarize', needs: 'selection' } },
  { re: /^(give me |show me )?(some )?examples( of (this|that|it))?$|^(give|show) (me )?an example$/, route: { type: 'task', task: 'examples', needs: 'selection' } },
  { re: /^translate( (this|that|it|the selection|selection|(this |that |the )?(word|text|sentence|paragraph)))?( for me)?( (to|into) english)?$|^(what does (this|that|it) say|what'?s (this|that)|what is (this|that)|how (do|would) you say (this|that|it)|say (this|that|it)|put (this|that|it)|give me (this|that|it)) in english$|^(this|that|it) in english( please)?$|^in english$|^make (this|that|it) english$|^english( version)?$/, route: { type: 'task', task: 'translate', needs: 'selection' } },
  { re: /^fact[- ]?check( this| that| it)?( for me)?$|^(is|are) (this|that|it) (true|accurate|correct|right|real|legit)$|^check (this|that) claim$/, route: { type: 'task', task: 'fact_check', needs: 'selection' } },
  { re: /^(explain|walk me through) (this|that|the) code( to me)?$|^what does (this|that|the) code do$/, route: { type: 'task', task: 'explain_code', needs: 'selection' } },
  { re: /^(explain|what does) (this|that|the) error( to me)?( mean)?$|^what'?s (this|that|the) error$|^what is (this|that|the) error$|^why (am i getting|do i get|did i get) (this|that|the) error$/, route: { type: 'task', task: 'explain_error', needs: 'selection' } },
  { re: /^find (the |any )?bugs? in (this|that|it)$|^what'?s wrong with (this|that) code$|^what is wrong with (this|that) code$|^is there a bug in (this|that|it)$/, route: { type: 'task', task: 'find_bug', needs: 'selection' } },
  { re: /^how (do|can|should) i fix (this|that|it)( error)?$|^(fix|how to fix) (this|that) error$/, route: { type: 'task', task: 'likely_fix', needs: 'selection' } },
  { re: /^(turn|make) (this|the) (page|article) into (study )?notes$|^(take|make) notes (on|from|of) (this|the) (page|article)$/, route: { type: 'task', task: 'page_notes' } },
  { re: /^(turn|make) (this|the) (page|article) into (a )?(check ?list|to-?do list)$|^(make|give me) a (check ?list|to-?do list) (from|of|for) (this|the) (page|article)$|^make this page a check ?list$/, route: { type: 'task', task: 'page_checklist' } },
  { re: /^(summari[sz]e|sum up) (the |these )?reviews$|^what do (people|reviewers|customers) say( (in|about) (the|these) reviews| about (this|it))?$|^are (the|these) reviews (good|any good|ok)$/, route: { type: 'task', task: 'shop_reviews' } },
  { re: /^(summari[sz]e|sum up|explain) (this|the) (page|article|web ?page|web ?site|site)( to me| for me)?$|^summari[sz]e (page|article)$|^tl;?dr (this|the) (page|article)$|^what'?s this (page|article)$|^what'?s on (this|the) page$|^what is this page( about)?$|^tell me what this page is about$/, route: { type: 'task', task: 'page_summary' } },
  { re: /^what (do|should) i do (here|on this page)$/, route: { type: 'task', task: 'page_todo' } },
  { re: /^(which (one ?(is|'s)|is) (the )?(cheapest|best (value|deal))( one| option)?|which (one )?is (the )?cheaper|what('?s| is) (the )?(cheapest|best (deal|value))( one| option)?)( here)?$/, route: { type: 'task', task: 'shop_value' } },
  { re: /^what should i (order|eat)( here)?$|^what'?s the lightest( option)?$/, route: { type: 'task', task: 'food_lightest' } },
  { re: /^(quiz me|test me)( on this( page)?)?$/, route: { type: 'task', task: 'quiz' } },
  { re: /^(what have i found|summari[sz]e my notes)$/, route: { type: 'task', task: 'research_found' } },
  { re: /^(?:(?:turn on |start )focus(?: mode)?(?: on)?|focus mode(?: on)?)$|^go to sleep$|^((turn|switch) on |enable )?(do not|don'?t) disturb( me| mode)?$/, route: { type: 'toggle', key: 'focus', value: true } },
  { re: /^(turn off |stop |exit |disable |end |leave )focus( mode)?$|^un-?focus$|^(turn )?focus (mode )?off$|^wake up$/, route: { type: 'toggle', key: 'focus', value: false } },
  { re: /^((turn|switch) on |enable )?priv(acy|ate) mode( on)?$|^(turn|switch) priv(acy|ate) mode on$|^go private$/, route: { type: 'toggle', key: 'privacy', value: true } },
  { re: /^(turn )?priv(acy|ate) mode off$|^(turn off|switch off|disable|exit|leave|end|stop) priv(acy|ate) mode$/, route: { type: 'toggle', key: 'privacy', value: false } },
  { re: /^define:? (?:the word )?(.+)$/, route: { type: 'task', task: 'define', slot: 'text' } },
];

// Numbers stay as words here ("which one is cheapest"); only commands get digits, for chrono's sake.
// Fillers and the wake phrase can come in any order ("um, hey loon, so like explain this").
const LEAD_IN = /^(?:(?:(?:hey |ok |okay )?loon|um+|uh+|er+|hmm+|so|well|like|just|actually)[,\s]+)+/i;

function normalize(transcript) {
  return transcript
    .toLowerCase()
    .replace(LEAD_IN, '')
    .replace(/^((please|pls|plz|can you|can u|could you|could u|would you|will you|like|just)[,\s]+)+/, '')
    .replace(/[,.!?]+|\p{Extended_Pictographic}/gu, ' ')
    .replace(/\s+(please|pls|plz|loon)$/, '')
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
  // "simplify this paragraph" means the same as "simplify this"; the selection is what gets edited.
  const key = text.replace(/\b(this|that) (paragraph|sentence|text|passage|message|email|section|selection)\b/g, '$1').replace(/\ba (lot|ton) (shorter|simpler)\b/, '$2').replace(/ in (a )?(simple|plain|easy)( english| words| terms| language)?$/, ' simply');
  for (const { re, route: r } of TEMPLATES) {
    const m = key.match(re);
    if (m) return r.slot ? { ...r, text: m[1] } : { ...r };
  }
  const spoken = transcript.replace(LEAD_IN, '');
  const command = parseCommand(normalizeSpoken(spoken));
  if (command) return { type: 'command', command };
  return { type: 'question', text: spoken.trim() };
}

// The task a typed ask means when it is a fixed edit of the selection ("fix my grammar", "make it shorter"), else null.
// The edit then runs as the chip would, with its code and cache tiers, instead of as a free question to the model.
function selectionTask(text) {
  const r = route(text);
  return r.type === 'task' && r.needs === 'selection' ? r.task : null;
}

// Wake phrase check for the opt-in "Hey Loon" mode (the isair/jarvis approach: keyword in a short transcript).
// STT sometimes hears "Loon" as a homophone, so a few are accepted; anything else is discarded unheard.
const WAKE = /^\s*(?:(?:hey|hi|ok|okay)[,\s]+)?(?:loon|lune|loom|lewn|luna)\b[,.!?\s]*/i;
function wakePhrase(transcript) {
  const m = (transcript || '').match(WAKE);
  if (!m) return null;
  return { rest: transcript.slice(m[0].length).trim() };
}

// A full stop after these (or after a single letter, as in U.S. and e.g.) does not end a sentence.
const ABBREVIATION = /(?:^|[\s.])(?:Mr|Mrs|Ms|Dr|Prof|St|vs|etc|approx|[A-Za-z])\.$/;

// Splits streamed model text into sentences for sentence-by-sentence speech (GLaDOS / HA voice chapter 11).
function createSentenceSplitter(onSentence) {
  let buffer = '';
  return {
    push(chunk) {
      buffer += chunk;
      const re = /[.!?]+\s+/g;
      let m;
      let start = 0;
      while ((m = re.exec(buffer))) {
        const end = m.index + m[0].length;
        const sentence = buffer.slice(start, m.index + m[0].trimEnd().length);
        if (ABBREVIATION.test(sentence) || end >= buffer.length) continue;
        start = end;
        if (sentence.trim()) onSentence(sentence.trim());
      }
      buffer = buffer.slice(start);
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
    .replace(/\]\(https?:\/\/[^)\s]*\)/g, '')
    .replace(/[*_`[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = [];
  for (const part of prose.split(/(?<=[.!?])\s+/)) {
    if (sentences.length && ABBREVIATION.test(sentences[sentences.length - 1])) sentences[sentences.length - 1] += ` ${part}`;
    else if (part) sentences.push(part);
  }
  return { text: sentences.slice(0, maxSentences).map((x) => x.trim()).join(' '), truncated: sentences.length > maxSentences || prose.length < markdown.trim().length * 0.6 };
}

module.exports = { route, selectionTask, normalize, createSentenceSplitter, speakable, wakePhrase, TEMPLATES };
