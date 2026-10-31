// Everyday commands without a model (DESIGN.md §3.13): chrono-node reads dates, a few patterns read the intent.
// Anything unmatched falls through to the normal question path.
const chrono = require('chrono-node');

// Pulls the first date/time phrase out of text: { date, text-without-it } or { date: null }.
function extractWhen(text, now = new Date()) {
  text = dayOfMonth(text, now);
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

// chrono does not read "on the 1st" or "the 15th"; rewrite it to the next such day as "Nov 1".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dayOfMonth(text, now) {
  return text.replace(/\b(?:on )?the (\d{1,2})(?:st|nd|rd|th)\b/i, (all, d) => {
    const day = Number(d);
    for (let i = 0; i < 13 && day >= 1; i++) {
      const c = new Date(now.getFullYear(), now.getMonth() + i, day);
      if (c.getDate() === day && (i > 0 || day >= now.getDate())) return `${MONTHS[c.getMonth()]} ${day}`;
    }
    return all;
  });
}

const tidy = (s) => s.replace(/^[\s,:-]+|[\s,.!?]+$/g, '');

// Speech-to-text writes numbers as words ("at five thirty", "in twenty minutes"); chrono needs digits.
const UNITS_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS_WORDS = { twenty: 20, thirty: 30, forty: 40, fifty: 50 };
const NUMBER = new RegExp(`\\b(?:(${Object.keys(TENS_WORDS).join('|')})(?:[-\\s](${Object.keys(UNITS_WORDS).slice(1, 10).join('|')}))?|(${Object.keys(UNITS_WORDS).join('|')}))\\b`, 'gi');
function normalizeSpoken(text) {
  let out = text.replace(/\bo'?clock\b/gi, '').replace(/[.!?]+$/, '');
  out = out.replace(NUMBER, (m, tens, unit, single) => String(tens ? TENS_WORDS[tens.toLowerCase()] + (unit ? UNITS_WORDS[unit.toLowerCase()] : 0) : UNITS_WORDS[single.toLowerCase()]));
  // "at 5 30" → "at 5:30"
  out = out.replace(/\b(at|by|until)\s+(\d{1,2})\s+(\d{2})\b/gi, (m, prep, h, mm) => `${prep} ${h}:${mm}`);
  return out.replace(/\s{2,}/g, ' ').trim();
}

function parseCommand(input, now = new Date()) {
  // Politeness doesn't change the command: "please remind me…", "can you open Spotify", "…, thanks".
  const text = input.trim()
    .replace(/^(?:(?:hey|ok|okay) )?(?:loon[,\s]+)?(?:(?:please|can you|could you|would you|will you)\s+)+/i, '')
    .replace(/[,\s]+(?:please|thanks|thank you)[.!?]*$/i, '')
    .trim();
  let m;
  // Loon has no alarm clock of its own. Timers, alarms and "wake me" become Reminders, which the confirm card names.
  if ((m = text.match(/^(?:set |start )?(?:an? )?(?:timer|countdown)(?: for| of)? (?:in )?(.+)$/i)) || (m = text.match(/^(?:set |start )?(?:an? )?(.+?)[\s-]timer$/i))) {
    // "timer 1h30" and "timer 5" (minutes) are how people type it.
    const length = m[1].replace(/^in /i, '').replace(/^(\d+)h(?:ours?|rs?)?\s*(\d+)(?:m(?:ins?)?)?$/i, '$1 hours $2 minutes').replace(/^(\d+)$/, '$1 minutes');
    const { date } = extractWhen(`in ${length}`, now);
    return date ? { action: 'reminder', title: 'Timer is up', when: date } : null;
  }
  if ((m = text.match(/^(?:set (?:an? )?alarm(?: for| at)?|wake me(?: up)?) (.+)$/i))) {
    const { date } = extractWhen(m[1], now);
    return date ? { action: 'reminder', title: 'Wake up', when: date } : null;
  }
  if ((m = text.match(/^(?:set (?:an? )?)?reminder(?: for| to| about|:)?\s+(.+)$/i))) return parseCommand(`remind me ${m[1]}`, now);
  if ((m = text.match(/^remind me (?:to |about )?(.+)$/i))) {
    const { date, rest } = extractWhen(m[1], now);
    // "remind me tomorrow to buy milk" leaves the "to" in front of the task.
    // "remind me on friday" has no task; a reminder titled "on friday" would be noise.
    const title = tidy(rest.replace(/^to\s+/i, '')) || (date ? 'Reminder' : tidy(m[1]));
    return /^(?:to|about)$/i.test(title) ? null : { action: 'reminder', title, when: date };
  }
  if ((m = text.match(/^(?:add|create|schedule|put|book) (?:an? )?(.+)$/i))) {
    const { date, rest, end } = extractWhen(m[1], now);
    if (date) {
      const title = tidy(rest.replace(/^(?:an? )?event\s+/i, '').replace(/^(?:to|on) (?:my )?calendar\s*/i, '').replace(/\s*(?:to|on) (?:my )?calendar$/i, ''));
      return { action: 'event', title: title || 'Event', start: date, end: end || new Date(date.getTime() + 60 * 60 * 1000) };
    }
  }
  if ((m = text.match(/^open (.+)$/i))) {
    const target = tidy(m[1]);
    const isUrl = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(target);
    return { action: 'open', target: isUrl && !/^https?:/i.test(target) ? `https://${target}` : target, kind: isUrl ? 'url' : 'app' };
  }
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
    return { action: 'recall', query: recallQuery(m[1]) };
  }
  if (/^(?:(?:show|open)(?: me)? )?(?:my )?(?:(?:recent|past|previous) (?:questions|searches|lookups)|history|recent activity)\??$/i.test(text) || /^what (?:was|were) my (?:last|latest|recent|previous) (?:questions?|searches|lookups?)\??$/i.test(text) || /^what (?:have|did) i (?:asked?|looked up|searched)\??$/i.test(text)) return { action: 'recall', query: '' };
  if ((m = text.match(/^(?:did i|have i) (?:ever )?(?:look(?:ed)? up|search(?:ed)?(?: for)?|ask(?:ed)?(?: about)?|read about) (.+?)(?: before)?\??$/i))) {
    return { action: 'recall', query: recallQuery(m[1]) };
  }
  if ((m = text.match(/^run (?:the |my )?(?:shortcut )?(.+?)(?: shortcut)?$/i))) return { action: 'shortcut', name: tidy(m[1]) };
  if ((m = text.match(/^(?:note|take a note|save a note|jot down)[:\s]+(.+)$/i))) return { action: 'note', text: tidy(m[1]) };
  // "remember to buy milk" is a to-do, so it becomes a reminder. A bare "remember to" or "remember me" saves nothing.
  if ((m = text.match(/^(?:remember|(?:do not|don'?t) forget) to\s+(.+)$/i))) return parseCommand(`remind me to ${m[1]}`, now);
  if (/^(?:remember|(?:do not|don'?t) forget)(?: to| me)?[:,]?$/i.test(text)) return null;
  if (/^(?:delete|clear|wipe|erase|reset) (?:all )?(?:of )?(?:my |your |the )?(?:memory|memories)$/i.test(text)) return { action: 'forget', text: 'everything', all: true };
  if ((m = text.match(/^(?:remember|(?:do not|don'?t) forget|keep in mind)(?: this)?[:,]?\s+(?:that )?(.+)$/i)) && tidy(m[1])) return { action: 'remember', text: tidy(m[1]) };
  if ((m = text.match(/^(.+?),?\s+(?:please )?remember (?:that|this|it)$/i))) return { action: 'remember', text: tidy(m[1]) };
  // "forget it" and "forget about it" are idioms, not a request to delete a memory.
  if ((m = text.match(/^forget[:,]?\s+(?:that )?(.+)$/i)) && !/^(?:about )?(?:it|that|this|me not)$/i.test(tidy(m[1]))) {
    return { action: 'forget', text: tidy(m[1]), all: /^(?:about )?(?:everything|all|all of it)\b/i.test(tidy(m[1])) };
  }
  if (/^(?:good morning|(?:what'?s|what is) (?:on )?my (?:day|schedule|agenda)(?: (?:like )?today)?|my day|plan my day|what do i have today)\??$/i.test(text)) return { action: 'today' };
  if ((m = text.match(/^(?:start (?:a )?)?focus(?: mode| timer| session)?(?: for)? (\d+|an?)\s*(m|mins?|minutes?|h|hrs?|hours?)?$/i)) || (m = text.match(/^(?:start |set )?(?:a |an )?(\d+)[\s-]*(m|mins?|minutes?|h|hrs?|hours?)? focus(?: mode| timer| session)?$/i))) {
    const n = /^an?$/i.test(m[1]) ? 1 : Number(m[1]);
    if (/^an?$/i.test(m[1]) && !/^h/i.test(m[2] || '')) return null; // "focus a" is not a duration
    return { action: 'focus', minutes: Math.min(n * (/^h/i.test(m[2] || '') ? 60 : 1), 240) };
  }
  if (/^(?:start (?:a )?focus(?: timer| session)?|pomodoro)$/i.test(text)) return { action: 'focus', minutes: 25 };
  if (/^(?:stop|end|cancel) (?:the )?focus(?: mode| timer| session)?$/i.test(text)) return { action: 'focus', minutes: 0 };
  return null;
}

// History search has no date filter, so "yesterday" or "last week" as a search word only finds nothing. Drop the
// time words and the "you (about)" of "what did I ask you about X".
function recallQuery(raw) {
  return tidy(raw.replace(/\b(?:today|yesterday|recently|lately|earlier|before|(?:last|this) (?:week|month|night|morning|time)|last)\b/gi, ' ')
    .replace(/^\s*(?:you(?: (?:about|on|for))?|about|on|for)\b/i, ' ').replace(/\s+/g, ' '));
}

// Plain-language summary for confirm cards and voice ("Reminder to call mom, today at 5:00 PM").
function describe(command) {
  const at = (d) => d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  switch (command.action) {
    case 'reminder': return `Reminder: ${command.title}${command.when ? `, ${at(command.when)}` : ' (no time)'}`;
    case 'event': return `Calendar event: ${command.title}, ${at(command.start)}`;
    case 'open': return `Open ${command.kind === 'url' ? command.target : `the ${command.target} app`}`;
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
