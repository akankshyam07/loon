// Everyday commands without a model (DESIGN.md §3.13): chrono-node reads dates, a few patterns read the intent.
// Anything unmatched falls through to the normal question path.
const chrono = require('chrono-node');

// Pulls the first date/time phrase out of text: { date, text-without-it } or { date: null }.
function extractWhen(text, now = new Date(), { morning = false } = {}) {
  text = dayOfMonth(text, now)
    .replace(/\b(?:end of (?:the )?(?:work ?)?day|eod|close of business|cob)\b/gi, 'at 5pm')
    .replace(/\b(\d+)\s*secs?\b/gi, '$1 seconds')
    .replace(/\b(\d+) and a half (hour|minute|day|week)/gi, '$1.5 $2')
    .replace(/\ban? (hour|minute|day|week) and a half\b/gi, '1.5 $1s');
  // "the 5pm meeting at 4:30" holds two times; the one after a preposition is the reminder time.
  const parsed = chrono.parse(text, now, { forwardDate: true });
  const found = parsed.find((r) => /^(?:at|on|by|in|for)\s/i.test(r.text) || /\b(?:at|on|by|in|for)\s+$/i.test(text.slice(0, r.index))) || parsed[0];
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
  // An alarm for "6:45" is never 6:45pm, so alarms skip this, and neither is "midnight".
  if (!morning && !/midnight/i.test(found.text) && !found.start.isCertain('meridiem') && found.start.isCertain('hour') && date.getHours() < 7) {
    date.setHours(date.getHours() + 12);
    if (!found.start.isCertain('day') && !found.start.isCertain('weekday') && date.getTime() - DAY > now.getTime()) date.setTime(date.getTime() - DAY);
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

// Politeness doesn't change the command: "please remind me…", "can you open Spotify", "…, thanks".
function stripPoliteness(input) {
  return String(input).trim()
    .replace(/^(?:(?:hey|ok|okay) )?loon[,\s]+(?=\S)/i, '')
    .replace(/^(?:(?:hey|ok|okay) )?(?:loon[,\s]+)?(?:(?:please|pls|plz|can you|could you|would you|will you)\s+)+/i, '')
    .replace(/[,\s]+(?:please|pls|plz|thanks|thank you)[.!?]*$/i, '')
    .trim();
}

function parseCommand(input, now = new Date()) {
  const text = stripPoliteness(input);
  let m;
  // Loon has no alarm clock of its own. Timers, alarms and "wake me" become Reminders, which the confirm card names.
  if ((m = text.match(/^(?:set |start )?(?:an? )?(?:timer|countdown)(?: for| of)? (?:in )?(.+)$/i)) || (m = text.match(/^(?:set |start )?(?:an? )?(.+?)[\s-]timer(?: for (.+))?$/i))) {
    // "timer 1h30" and "timer 5" (minutes) are how people type it.
    const length = m[1].replace(/^in /i, '').replace(/^(\d+):(\d{2})$/, '$1 minutes $2 seconds').replace(/^(\d+)h(?:ours?|rs?)?\s*(\d+)(?:m(?:ins?)?)?$/i, '$1 hours $2 minutes').replace(/^(\d+)$/, '$1 minutes');
    const { date } = extractWhen(`in ${length}`, now);
    return date ? { action: 'reminder', title: m[2] ? `Timer is up for ${tidy(m[2])}` : 'Timer is up', when: date } : null;
  }
  if ((m = text.match(/^(?:set (?:an? )?alarm(?: for| at)?|wake me(?: up)?) (.+)$/i))) {
    const { date } = extractWhen(m[1], now, { morning: true });
    return date ? { action: 'reminder', title: 'Wake up', when: date } : null;
  }
  if ((m = text.match(/^(?:(?:set|create|add|make)(?: me)? (?:an? )?)?reminder(?: for| to| about|:)?\s+(.+)$/i))) return parseCommand(`remind me ${m[1]}`, now);
  // "show me what I asked about css" and "remind me what we discussed about docker" want the history too.
  if ((m = text.match(/^(?:show|tell|remind|find)(?: me)?(?: of)? what (?:i|we) (?:asked|searched(?: for)?|looked up|read|talked|chatted|discussed|said)(?: about| on| for)? (.+?)\??$/i)) || (m = text.match(/^what did (?:we|i) (?:say|talk|chat|discuss)(?: about| on) (.+?)\??$/i))) return { action: 'recall', query: recallQuery(m[1]) };
  if ((m = text.match(/^(?:did we|have we) (?:ever )?(?:talk(?:ed)?|chat(?:ted)?|discuss(?:ed)?) (?:about |on )?(.+?)(?: before)?\??$/i))) return { action: 'recall', query: recallQuery(m[1]) };
  if ((m = text.match(/^(?:anything|something|stuff) (?:about|on) (.+?) in (?:my |the )?history\??$/i))) return { action: 'recall', query: recallQuery(m[1]) };
  if (/^what (?:were|are) we (?:talking|chatting|discussing)(?: about)?(?: (?:today|yesterday|earlier|lately|recently|last (?:week|month)))?\??$/i.test(text)) return { action: 'recall', query: '' };
  // "remind me what I asked" wants the history, not a reminder titled "what I asked".
  if (/^remind me (?:of )?what i (?:asked|searched(?: for)?|looked up)(?: you)?\??$/i.test(text)) return { action: 'recall', query: '' };
  // "in 10 minutes remind me to stretch" puts the time first. Only a head that is purely a time counts.
  if ((m = text.match(/^(.+?),?\s+remind ?me (?:to |about )?(.+)$/i)) && !extractWhen(m[1], now).rest && extractWhen(m[1], now).date) return parseCommand(`remind me to ${m[2]} ${m[1]}`, now);
  if ((m = text.match(/^remind ?me (?:to |about )?(.+)$/i))) {
    const { date, rest } = extractWhen(m[1], now);
    // "remind me tomorrow to buy milk" and "next friday about the dentist" leave the "to"/"about" in front of the task.
    // "remind me on friday" has no task; a reminder titled "on friday" would be noise.
    const title = tidy(rest.replace(/^(?:to|about)\s+/i, '')) || (date ? 'Reminder' : tidy(m[1]));
    // A time already gone ("yesterday", "last friday") would fire at once or never; leave it blank so the card shows "no time".
    return /^(?:to|about)$/i.test(title) ? null : { action: 'reminder', title, when: date && date > now ? date : null };
  }
  if ((m = text.match(/^(?:add|create|schedule|put|book) (?:an? )?(.+)$/i))) {
    const { date, rest, end } = extractWhen(m[1], now);
    if (date) {
      const title = tidy(rest.replace(/^(?:an? )?event\s+/i, '').replace(/^(?:to|on) (?:my )?calendar\s*/i, '').replace(/\s*(?:to|on) (?:my )?calendar$/i, ''));
      return { action: 'event', title: title || 'Event', start: date, end: end || new Date(date.getTime() + 60 * 60 * 1000) };
    }
  }
  if (/^(?:(?:show|open|pull up)(?: me)? )?(?:my )?(?:(?:recent|past|previous) (?:questions|searches|lookups|history)|history|recent activity)\??$/i.test(text) || /^(?:(?:what(?:'?s| is| was| were| are)?|show me|show|pull up) )?(?:my (?:(?:last|latest|recent|previous)(?: \d+)? )?|(?:last|latest|recent|previous)(?: \d+)? )(?:questions?|searches|lookups?|history)\??$/i.test(text) || /^(?:what(?:'?s| is| was) )?(?:my |the )?(?:last|latest|previous) (?:thing i (?:asked(?: you)?|searched(?: for)?|looked up)|search|question|lookup)\??$/i.test(text) || /^(?:show me |tell me )?what (?:(?:have|did) )?i (?:been )?(?:ask(?:ed)?|asking|look(?:ed|ing)? up|search(?:ed|ing)?|google[d]?|googling)(?: you| for)*(?: (?:so far|lately|recently|earlier|today|yesterday|last (?:week|month|time)))?\??$/i.test(text) || /^what (?:did|have) we (?:talk(?:ed)?|chat(?:ted)?|discuss(?:ed)?)(?: about)?(?: (?:today|yesterday|earlier|lately|recently|last (?:week|month)))?\??$/i.test(text)) return { action: 'recall', query: '' };
  if ((m = text.match(/^(?:open|launch) (.+)$/i))) {
    // "the Calculator app" is a name macOS doesn't know. Files like "notes.txt" and "Node.js" are not websites.
    const target = tidy(m[1]).replace(/^(["'“‘])(.+)["'”’]$/, '$2').replace(/^(?:the|my) /i, '').replace(/ app$/i, '');
    // Two-step requests ("open youtube and search cats") are not an app name, so the chat gets them.
    if (!target || /(?:,| and| then| &) (?:then )?(?:search|go|message|text|play|type|write|send|find|look|click|show|make|create|start|open|launch|take|ask|check)\b/i.test(target)) return null;
    if (/^(?:https?:\/\/)?(?:localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?:\/\S*)?$/i.test(target) && (/localhost|:\d/i.test(target) || /^https?:/i.test(target))) return { action: 'open', target: /^https?:/i.test(target) ? target : `http://${target}`, kind: 'url' };
    if ( /^(?:it|that|this|them)(?: \w+)?$/i.test(target)) return null;
    // Not app names: "a new tab", "the file report.pdf", "the link", and two apps in one request. The chat explains what Loon can open.
    if (/^(?:an? |file |link$|app$|page$|website$|site$)| (?:and|&) /i.test(target)) return null;
    const folder = target.match(/^(?:~\/|(?:my )?(?:the )?)(downloads|documents|desktop|pictures|movies|music|applications)(?: folder)?$/i);
    if (folder) return { action: 'open', target: `~/${folder[1][0].toUpperCase()}${folder[1].slice(1).toLowerCase()}`.replace('~/Applications', '/Applications'), kind: 'folder' };
    // Paths and file names aren't apps either, and Loon doesn't open files it can't name safely.
    if (/^[/~]|^[\w. -]+\.(?:js|ts|txt|md|py|json|java|pdf|png|jpe?g|csv|zip|docx?|xlsx?|html?|dmg|sh|app)$/i.test(target)) return null;
    const isUrl = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#]\S*)?$/i.test(target) && (/^https?:|[/?#]|^www\./i.test(target) || !/\.(?:js|ts|txt|md|py|json|java|pdf|png|jpe?g|csv|zip|docx?|xlsx?|html?)$|^v?\d+(?:\.\d+)+$/i.test(target) || /^\d+(?:\.\d+){3}$/.test(target));
    return { action: 'open', target: isUrl && !/^https?:/i.test(target) ? `https://${target}` : target, kind: isUrl ? 'url' : 'app' };
  }
  if ((m = text.match(/^(?:(?:search|look (?:through|in)|find in|pull up)(?: my)? history(?: for)?|(?:(?:show|pull up)(?: me)? )?(?:my )?history (?:for|on|about)) (.+?)\??$/i)) || (m = text.match(/^(?:find|search for|look for) (.+?) in (?:my )?history\??$/i))) return { action: 'recall', query: recallQuery(m[1]) };
  if ((m = text.match(/^(?:(?:show|find|look up|pull up)(?: me)? )?(?:(?:my |all my )(?:past|previous|recent) (?:searches|questions|lookups)|everything i (?:asked|searched|looked up)) (?:about|for|on) (.+?)\??$/i))) return { action: 'recall', query: recallQuery(m[1]) };
  if (!/^find my (?:question|search)\b/i.test(text) && (m = text.match(/^(?:find|search for|look for|where is|where's)(?: my)? (.+?)(?: files?)?\??$/i))) {
    return { action: 'find', query: tidy(m[1]) };
  }
  if ((m = text.match(/^(?:where did i leave off|what was i (?:working on|doing)|catch me up)(?: (?:in|on|with) (.+?))?\??$/i))) {
    return { action: 'briefing', project: m[1] ? tidy(m[1]) : null };
  }
  if (/^(?:show |list )?my projects\??$/i.test(text)) return { action: 'briefing', project: null };
  if (/^what do (?:you|u) (?:know|remember) about me\??$/i.test(text) || /^what do (?:you|u) remember\??$/i.test(text) || /^(?:what(?:'?s| is) (?:in|saved in|stored in) (?:your|my) memor(?:y|ies)|(?:show|list|open) (?:me )?(?:my |your )?(?:memory|memories|saved facts)|what (?:have|did) you (?:saved?|stored?|remembered?)(?: about me)?)\??$/i.test(text)) return { action: 'recall', facts: true };
  if ((m = text.match(/^(?:what do you (?:know|remember) about (?:my |the )?|do you (?:remember|know) (?:my |the ))(.+?)\??$/i))) return { action: 'recall', about: tidy(m[1]) };
  if (/^what (?:did|have) i (?:ask(?:ed)?|look(?:ed)? up|search(?:ed)?(?: for)?|do(?:ne)?) (?:today|recently|lately)\??$/i.test(text)) return { action: 'recall', query: '' };
  if ((m = text.match(/^(?:what (?:did|have) i (?:ask(?:ed)?|look(?:ed)? up|search(?:ed)?(?: for)?|read|learn(?:ed)?|find out)|when did i (?:ask|look up|read)|find my (?:question|search)) (?:about |on |for )?(.+?)\??$/i))) {
    return { action: 'recall', query: recallQuery(m[1]) };
  }
  if ((m = text.match(/^(?:did i|have i) (?:ever )?(?:look(?:ed)? up|search(?:ed)?(?: for)?|ask(?:ed)?(?: about)?|read about) (.+?)(?: before)?\??$/i))) {
    return { action: 'recall', query: recallQuery(m[1]) };
  }
  if ((m = text.match(/^run (?:the |my )?(?:shortcut )?(.+?)(?: shortcut)?$/i))) return { action: 'shortcut', name: tidy(m[1]) };
  // A bare "note" needs a cue ("note: ...", "note that ..."), so "note taking tips" still goes to the model.
  if ((m = text.match(/^(?:(?:take|save|make|add) (?:a |this )?note|jot (?:this )?down|write (?:this )?down|note(?= *:| that\b| this\b| to self\b))(?:\s+(?:of|that|this|to self))?[:\s]+(.+)$/i)) && !/^(?:that|this|of|to self)$/i.test(tidy(m[1])) && tidy(m[1])) return { action: 'note', text: tidy(m[1]) };
  // "remember to buy milk" is a to-do, so it becomes a reminder. A bare "remember to" or "remember me" saves nothing.
  if ((m = text.match(/^(?:remember|(?:do not|don'?t|never) forget) to\s+(.+)$/i))) return parseCommand(`remind me to ${m[1]}`, now);
  if (/^(?:remember|(?:do not|don'?t|never) forget)(?: to| me| that| this)?[:,]?$/i.test(text)) return null;
  if (/^(?:delete|remove|erase|forget|clear|wipe) (?:absolutely )?(?:everything|all|what) (?:that )?you (?:know|remember|have saved|saved)(?: (?:about|on) me)?$/i.test(text)) return { action: 'forget', text: 'everything', all: true };
  if ((m = text.match(/^(?:delete|remove|erase|clear) (?:the |my |your )?(?:memory|memories|saved facts?) (?:about|of|on) (.+)$/i)) && tidy(m[1])) return { action: 'forget', text: tidy(m[1]), all: false };
  if (/^(?:delete|clear|wipe|erase|reset) (?:all )?(?:of )?(?:my |your |the )?(?:memory|memories)$/i.test(text)) return { action: 'forget', text: 'everything', all: true };
  if ((m = text.match(/^(?:remember|(?:do not|don'?t|never) forget|keep (?:that |this |it )?in mind|(?:save|add|put|store) (?:this |it )?(?:to|in|into) (?:my |your )?memory)(?: this)?[:,]?\s+(?:that )?(.+)$/i)) && tidy(m[1]) && !/^(?:nothing|it|everything|all of (?:it|this))$/i.test(tidy(m[1]))) return { action: 'remember', text: tidy(m[1]) };
  if ((m = text.match(/^(.+?),?\s+(?:please )?remember (?:that|this|it)$/i)) && !/^(?:do not|don'?t|never|stop)$/i.test(tidy(m[1]))) return { action: 'remember', text: tidy(m[1]) };
  // "forget it" and "forget about it" are idioms, not a request to delete a memory.
  if ((m = text.match(/^forget[:,]?\s+(?:that )?(.+)$/i)) && !/^(?:about )?(?:it|that|this|me not)$/i.test(tidy(m[1]))) {
    const all = /^(?:about )?(?:everything|all|all of it|it all)$/i.test(tidy(m[1]));
    // "forget everything about pork" is one topic, not a wipe.
    const topic = tidy(m[1]).replace(/^(?:(?:everything|all) )?about (?=\S)/i, '');
    return { action: 'forget', text: all ? tidy(m[1]) : topic, all };
  }
  if (/^(?:good morning|(?:what'?s|what is) (?:on )?my (?:day|schedule|agenda)(?: (?:like )?today)?|my day|plan my day|what do i have today)\??$/i.test(text)) return { action: 'today' };
  if ((m = text.match(/^(?:start (?:a )?)?focus(?: mode| timer| session)?(?: for)? (\d+(?:\.\d+)?|an?)\s*(m|mins?|minutes?|h|hrs?|hours?)?$/i)) || (m = text.match(/^(?:start |set )?(?:a |an )?(\d+(?:\.\d+)?)[\s-]*(m|mins?|minutes?|h|hrs?|hours?)? focus(?: mode| timer| session)?$/i))) {
    const n = /^an?$/i.test(m[1]) ? 1 : Number(m[1]);
    if (/^an?$/i.test(m[1]) && !/^h/i.test(m[2] || '')) return null; // "focus a" is not a duration
    return { action: 'focus', minutes: Math.min(Math.round(n * (/^h/i.test(m[2] || '') ? 60 : 1)), 240) };
  }
  if (/^(?:start (?:a )?)?focus(?: mode| timer| session)?$|^pomodoro$/i.test(text)) return { action: 'focus', minutes: 25 };
  if (/^(?:stop|end|cancel) (?:the )?focus(?: mode| timer| session)?$/i.test(text)) return { action: 'focus', minutes: 0 };
  return null;
}

// History search has no date filter, so "yesterday" or "last week" as a search word only finds nothing. Drop the
// time words and the "you (about)" of "what did I ask you about X".
function recallQuery(raw) {
  return tidy(raw.replace(/\p{Extended_Pictographic}/gu, ' ').replace(/\b(?:today|yesterday|recently|lately|earlier|before|(?:last|this) (?:week|month|night|morning|time)|last)\b/gi, ' ').replace(/\s+/g, ' ')
    .replace(/^\s*(?:(?:you|u|loon)(?: (?:about|on|for))?|about|on|for)\b/i, ' ').replace(/\s+/g, ' '));
}

// Plain-language summary for confirm cards and voice ("Reminder to call mom, today at 5:00 PM").
function describe(command) {
  const at = (d) => d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  switch (command.action) {
    case 'reminder': return `Reminder: ${command.title}${command.when ? `, ${at(command.when)}` : ' (no time)'}`;
    case 'event': return `Calendar event: ${command.title}, ${at(command.start)}`;
    case 'open': return `Open ${command.kind === 'url' ? command.target : command.kind === 'folder' ? `your ${command.target.replace(/^.*\//, '')} folder` : `the ${command.target} app`}`;
    case 'find': return `Find files matching "${command.query}"`;
    case 'briefing': return command.project ? `Catch up on ${command.project}` : 'Catch up on your projects';
    case 'shortcut': return `Run the Shortcut "${command.name}"`;
    case 'note': return `Save a note: ${command.text}`;
    case 'remember': return `Remember: ${command.text}`;
    case 'forget': return `Forget memories about "${command.text}"`;
    default: return command.action;
  }
}

module.exports = { parseCommand, extractWhen, describe, normalizeSpoken, stripPoliteness };
