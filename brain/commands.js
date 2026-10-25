// Everyday commands without a model (DESIGN.md §3.13): chrono-node reads dates, a few patterns read the intent.
// Anything unmatched falls through to the normal question path.
const chrono = require('chrono-node');

// Pulls the first date/time phrase out of text: { date, text-without-it } or { date: null }.
function extractWhen(text, now = new Date()) {
  const [found] = chrono.parse(text, now, { forwardDate: true });
  if (!found) return { date: null, rest: text.trim() };
  const rest = (text.slice(0, found.index) + text.slice(found.index + found.text.length))
    .replace(/\s+(at|on|by|for|in)\s*$/i, '')
    .replace(/^\s*(at|on|by|for|in)\s+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const date = found.start.date();
  const DAY = 24 * 60 * 60 * 1000;
  // "at 5" with no am/pm means 5pm, the next sensible waking-hours time. chrono may already have pushed 5am to
  // tomorrow, so after switching to pm, pull it back to today if today's 5pm is still ahead.
  if (!found.start.isCertain('meridiem') && found.start.isCertain('hour') && date.getHours() < 7) {
    date.setHours(date.getHours() + 12);
    if (!found.start.isCertain('day') && date.getTime() - DAY > now.getTime()) date.setTime(date.getTime() - DAY);
  }
  // "morning" is 6am in chrono; 9am is a kinder reminder time.
  if (/morning/i.test(found.text) && !found.start.isCertain('hour')) date.setHours(9, 0, 0, 0);
  if (date < now && !found.start.isCertain('day')) date.setTime(date.getTime() + DAY);
  return { date, rest, end: found.end ? found.end.date() : null };
}

const tidy = (s) => s.replace(/^[\s,:-]+|[\s,.!?]+$/g, '');

// Speech-to-text writes numbers as words ("at five thirty", "in twenty minutes"); chrono needs digits.
const UNITS_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS_WORDS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const NUMBER = new RegExp(`\\b(?:(${Object.keys(TENS_WORDS).join('|')})(?:[-\\s](${Object.keys(UNITS_WORDS).slice(1, 10).join('|')}))?|(${Object.keys(UNITS_WORDS).join('|')}))\\b`, 'gi');
function normalizeSpoken(text) {
  let out = text.replace(/\bo'?clock\b/gi, '').replace(/[.!?]+$/, '');
  out = out.replace(NUMBER, (m, tens, unit, single) => String(tens ? TENS_WORDS[tens.toLowerCase()] + (unit ? UNITS_WORDS[unit.toLowerCase()] : 0) : UNITS_WORDS[single.toLowerCase()]));
  // "a hundred" / "2 hundred and 50" → 100 / 250
  out = out.replace(/\b(a|\d{1,2}) hundred(?:(?: and)? (\d{1,2}))?\b/gi, (m, n, rest) => String((n.toLowerCase() === 'a' ? 1 : Number(n)) * 100 + (Number(rest) || 0)));
  // "at 5 30" → "at 5:30"
  out = out.replace(/\b(at|by|until)\s+(\d{1,2})\s+(\d{2})\b/gi, (m, prep, h, mm) => `${prep} ${h}:${mm}`);
  return out.replace(/\s{2,}/g, ' ').trim();
}

function parseCommand(input, now = new Date()) {
  const text = input.trim();
  let m;
  // "Remind me what our budget was" is a question about the chat, not a reminder.
  if ((m = text.match(/^remind me (?:to |about )?(.+)$/i)) && !/^(?:what|who|whom|where|when|why|how|which|whether|if)\b/i.test(m[1])) {
    const { date, rest } = extractWhen(m[1], now);
    return { action: 'reminder', title: tidy(rest) || tidy(m[1]), when: date };
  }
  if ((m = text.match(/^(?:add|create|schedule|put|book) (?:an? )?(.+)$/i))) {
    const { date, rest, end } = extractWhen(m[1], now);
    if (date) {
      const title = tidy(rest.replace(/^(?:an? )?event\s+/i, '').replace(/^(?:to|on) (?:my )?calendar\s*/i, '').replace(/\s*(?:to|on) (?:my )?calendar$/i, ''));
      return { action: 'event', title: title || 'Event', start: date, end: end || new Date(date.getTime() + 60 * 60 * 1000) };
    }
  }
  // Loon has no live data (it stays offline), so weather becomes a forecast page to open, behind the usual confirm card.
  if ((m = text.match(/^(?:(?:what'?s|what is|how'?s|how is) the (?:weather|forecast)(?: like)?|weather|forecast|(?:is it|will it)(?: going to)? (?:rain|snow)(?:ing)?)(?: (today|tonight|tomorrow|now|this week(?:end)?))?(?: (?:in|for) ([a-z][a-z .'-]+?))?(?: (today|tonight|tomorrow|now|this week(?:end)?))?\??$/i))) {
    const query = ['weather', m[2], m[1] || m[3]].filter(Boolean).join(' ');
    return { action: 'open', target: `https://www.google.com/search?q=${encodeURIComponent(query)}`, kind: 'url', label: `Open a forecast (I stay offline, so no live weather here): ${query}` };
  }
  if ((m = text.match(/^open (.+)$/i))) {
    const target = tidy(m[1]);
    const isUrl = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(target);
    return { action: 'open', target: isUrl && !/^https?:/i.test(target) ? `https://${target}` : target, kind: isUrl ? 'url' : 'app' };
  }
  // Notes come before "find …", which searches files.
  if (/^(?:show|list|open|see)(?: me)? (?:all )?my (?:saved )?notes\??$|^my notes\??$/i.test(text)) return { action: 'notes', query: '' };
  if ((m = text.match(/^(?:what (?:did|have) i (?:note|noted|write|written|jot(?:ted)?(?: down)?|save|saved)|(?:find|search|show|check)(?: me)? (?:in )?my notes|what(?:'s| is) in my notes) (?:about |on |for |down about )?(.+?)\??$/i))) return { action: 'notes', query: tidy(m[1]) };
  if ((m = text.match(/^(?:find|search for|look for|where is|where's)(?: my)? (.+?)(?: files?)?\??$/i))) {
    return { action: 'find', query: tidy(m[1]) };
  }
  if ((m = text.match(/^(?:where did i leave off|what was i (?:working on|doing)|catch me up)(?: (?:in|on|with) (.+?))?\??$/i))) {
    return { action: 'briefing', project: m[1] ? tidy(m[1]) : null };
  }
  if (/^(?:show |list )?my projects\??$/i.test(text)) return { action: 'briefing', project: null };
  if (/^what do you (?:know|remember) about me\??$/i.test(text)) return { action: 'recall', facts: true };
  if ((m = text.match(/^what do you (?:know|remember) about (?:my |the )?(.+?)\??$/i))) return { action: 'recall', about: tidy(m[1]) };
  if (/^what (?:did|have) i (?:ask(?:ed)?|look(?:ed)? up|search(?:ed)?(?: for)?|do(?:ne)?) (?:today|recently|lately)\??$/i.test(text)) return { action: 'recall', query: '' };
  if ((m = text.match(/^(?:what did i (?:ask|look up|search(?: for)?|read|learn|find out)|when did i (?:ask|look up|read)|find my (?:question|search)) (?:about |on |for )?(.+?)\??$/i))) {
    return { action: 'recall', query: tidy(m[1]) };
  }
  if ((m = text.match(/^run (?:the |my )?(?:shortcut )?(.+?)(?: shortcut)?$/i))) return { action: 'shortcut', name: tidy(m[1]) };
  if ((m = text.match(/^(?:note|take a note|save a note|jot down)[:\s]+(.+)$/i))) return { action: 'note', text: tidy(m[1]) };
  if ((m = text.match(/^remember (?:that )?(.+)$/i))) return { action: 'remember', text: tidy(m[1]) };
  if ((m = text.match(/^forget (?:that )?(.+)$/i))) return { action: 'forget', text: tidy(m[1]) };
  if (/^(?:good morning|(?:what'?s|what is) (?:on )?my (?:day|schedule|agenda)(?: (?:like )?today)?|my day|plan my day|what do i have today)\??$/i.test(text)) return { action: 'today' };
  if ((m = text.match(/^(?:start (?:a )?)?focus(?: mode| timer| session)?(?: for)? (\d+)\s*(m|mins?|minutes?|h|hrs?|hours?)$/i))) {
    return { action: 'focus', minutes: Math.min(Number(m[1]) * (/^h/i.test(m[2]) ? 60 : 1), 240) };
  }
  if (/^(?:start (?:a )?focus(?: timer| session)?|pomodoro)$/i.test(text)) return { action: 'focus', minutes: 25 };
  if (/^(?:stop|end|cancel) (?:the )?focus(?: mode| timer| session)?$/i.test(text)) return { action: 'focus', minutes: 0 };
  // Timers ring inside Loon (no other app is touched), so they start without a confirm card.
  const DURATION = '(\\d+(?:\\.\\d+)?)[- ]?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)';
  const seconds = (n, u) => Math.round(Number(n) * (/^h/i.test(u) ? 3600 : /^m/i.test(u) ? 60 : 1));
  if ((m = text.match(new RegExp(`^(?:set |start )?(?:a |an |the )?timer (?:for |of )?${DURATION}(?: (?:for|called|named|to) (.+))?$`, 'i')))
    || (m = text.match(new RegExp(`^(?:set |start )?(?:a |an )?${DURATION} timer(?: (?:for|called|named|to) (.+))?$`, 'i')))) {
    return { action: 'timer', seconds: Math.min(seconds(m[1], m[2]), 24 * 3600), label: m[3] ? tidy(m[3]) : null };
  }
  if (/^(?:stop|cancel|clear|end) (?:the |my |all )?timers?$/i.test(text)) return { action: 'timer', seconds: 0 };
  if (/^(?:how (?:long|much time) (?:is )?left(?: on (?:the |my )?timer)?|timer status|check (?:the |my )?timer)\??$/i.test(text)) return { action: 'timer', seconds: null };
  return null;
}

// Plain-language summary for confirm cards and voice ("Reminder to call mom, today at 5:00 PM").
function describe(command) {
  const at = (d) => d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  switch (command.action) {
    case 'reminder': return `Reminder: ${command.title}${command.when ? `, ${at(command.when)}` : ' (no time)'}`;
    case 'event': return `Calendar event: ${command.title}, ${at(command.start)}`;
    case 'open': if (command.label) return command.label;
      return `Open ${command.kind === 'url' ? command.target : `the ${command.target} app`}`;
    case 'find': return `Find files matching "${command.query}"`;
    case 'briefing': return command.project ? `Catch up on ${command.project}` : 'Catch up on your projects';
    case 'shortcut': return `Run the Shortcut "${command.name}"`;
    case 'note': return `Save a note: ${command.text}`;
    case 'remember': return `Remember: ${command.text}`;
    case 'forget': return `Forget memories about "${command.text}"`;
    default: return command.action;
  }
}

module.exports = { parseCommand, extractWhen, describe, normalizeSpoken };
