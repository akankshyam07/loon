// Routines (DESIGN.md §3.19): scheduled tasks, all on this Mac. Plain code reads "every weekday at 8:30 summarize my
// calendar" into { schedule, action, payload } (no model), computes the next run in local time (DST-safe), and keeps
// routines in memory.db. main/routines.js runs them.
const crypto = require('crypto');
const chrono = require('chrono-node');
const { parseQuantity, money, short } = require('./shopping');

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ACTIONS = ['notify', 'reminder', 'today', 'briefing', 'weekSummary', 'priceWatch', 'ask'];
const PART_TIMES = { morning: '09:00', afternoon: '14:00', evening: '18:00', night: '21:00' };
const DROP_MIN = 0.01; // ponytail: a 1% floor ignores rounding noise; make it a setting if people want "any cent"

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayNumber = (y, m, d) => Math.round(Date.UTC(y, m, d) / DAY); // whole days, immune to DST
const hm = (time) => time.split(':').map(Number);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- times ----------
const TIME = String.raw`(?:noon|midnight|\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)`;

// "8:30" → "08:30", "12am" → "00:00", "at 10" at night → "22:00". Without am/pm, 1–6 means pm (like commands.js).
function parseTime(raw, part = null) {
  const t = String(raw).toLowerCase().replace(/\./g, '').trim();
  if (t === 'noon') return '12:00';
  if (t === 'midnight') return '00:00';
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (h > 23 || min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3] === 'pm' ? 12 : 0);
  } else if (h <= 12) {
    if (part === 'night' && h === 12) h = 0;
    else if (part === 'night' && h < 4) { /* 1–3 at night are after midnight */ }
    else if (['afternoon', 'evening', 'night'].includes(part) && h < 12) h += 12;
    else if (part !== 'morning' && h < 7) h += 12;
  }
  return `${pad(h)}:${pad(min)}`;
}

function formatTime(time) {
  const [h, m] = hm(time);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, ' ');
}

// ---------- schedules ----------
// { type: 'once', at }                                    one run at epoch ms
// { type: 'daily', time, days, every?, anchor?, monthDay? } at time on matching days (every N days from anchor;
//                                                          monthDay: that date, or the month's last day if shorter)
// { type: 'interval', minutes, window, days }             every N minutes inside window (null = all day)
const DAY_WORD = String.raw`(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?s?`;
const DAY_LIST = new RegExp(String.raw`\b(?:every|each|on)\s+(${DAY_WORD}(?:\s*(?:,|and|&)\s*${DAY_WORD})*)\b`, 'i');
const DAY_PLURAL = new RegExp(String.raw`\b((?:mon|tues|wednes|thurs|fri|satur|sun)days(?:\s*(?:,|and|&)\s*(?:mon|tues|wednes|thurs|fri|satur|sun)days)*)\b`, 'i');
const dayIndex = (word) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(word.toLowerCase().slice(0, 3));
const RECURRING = /\b(?:every|each|daily|nightly|hourly|weekdays?|weekends?|weekly|monthly|(?:mon|tues|wednes|thurs|fri|satur|sun)days)\b/i;

// Cuts the first match out of state.text (so what's left is the action) and returns it.
function take(state, re) {
  const m = state.text.match(re);
  if (m) state.text = `${state.text.slice(0, m.index)} ${state.text.slice(m.index + m[0].length)}`;
  return m;
}

const countWord = (w) => (!w || /^(?:an?|one)$/i.test(w) ? 1 : /^other$/i.test(w) ? 2 : /^half an?$/i.test(w) ? 0.5 : Number(w));
const unitMinutes = (u) => (/^h/i.test(u) ? 60 : 1);

// Reads the schedule out of text: { schedule, rest } (schedule null when nothing recurring was found).
// allowOnce: also accept a plain date ("tomorrow at 9") as a one-off, for the confirm card's When field.
function parseSchedule(input, now = new Date(), { allowOnce = false } = {}) {
  const state = { text: ` ${String(input).replace(/[()]/g, ' ')} ` };
  const at = now.getTime();
  const done = (schedule) => ({ schedule, rest: tidyRest(state.text) });

  // "in 20 minutes …": a one-off timer.
  const inMatch = !RECURRING.test(state.text) && take(state, /^\s*in\s+(\d+|an?|one|half an?)\s+(minutes?|mins?|hours?|hrs?)\b,?/i);
  if (inMatch) return done({ type: 'once', at: at + countWord(inMatch[1]) * unitMinutes(inMatch[2]) * MINUTE });

  let part = null;
  const window = take(state, new RegExp(String.raw`\b(?:between|from)\s+(${TIME})\s+(?:and|to|until|-|–)\s+(${TIME})`, 'i'));
  const interval = take(state, /\bevery\s+(\d+|other|an?|one|half an?)?\s*(minutes?|mins?|hours?|hrs?)\b/i) || take(state, /\b(hourly)\b/i);
  const monthDay = take(state, /\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)?\s+of\s+(?:every|each|the)\s+month\b/i)
    || take(state, /\b(?:every|each)\s+month\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b/i)
    || take(state, /\bmonthly\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  const everyN = take(state, /\bevery\s+(other|second|\d+)\s+days?\b/i);
  let days = null;
  if (take(state, /\b(?:every\s+|on\s+)?(?:weekdays?|work\s?days?)\b/i)) days = WEEKDAYS;
  else if (take(state, /\b(?:every\s+|on\s+)?weekends?\b/i)) days = WEEKEND;
  else {
    const list = take(state, DAY_LIST) || take(state, DAY_PLURAL);
    if (list) days = [...new Set(list[1].split(/\s*(?:,|and|&)\s*/).map(dayIndex).filter((d) => d >= 0))].sort();
  }
  const weekly = take(state, /\b(?:every\s+week|weekly)\b/i);
  const daily = take(state, /\b(?:every|each)\s+(day|morning|afternoon|evening|night)\b/i) || take(state, /\b(daily|nightly)\b/i);
  if (daily) part = { nightly: 'night', daily: null, day: null }[daily[1].toLowerCase()] ?? daily[1].toLowerCase();
  const partWord = take(state, /\b(?:in\s+the\s+|at\s+)?(morning|afternoon|evening|night)s?\b/i);
  if (partWord && !part) part = partWord[1].toLowerCase();
  const timeMatch = take(state, new RegExp(String.raw`\bat\s+(${TIME})(?![\w:])`, 'i')) || take(state, /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon|midnight)\b/i);
  const time = timeMatch ? parseTime(timeMatch[1], part) : PART_TIMES[part] || '09:00';

  const recurring = window || interval || monthDay || everyN || days || weekly || daily;
  if (!recurring) {
    if (!allowOnce) return { schedule: null, rest: tidyRest(input) };
    const [found] = chrono.parse(String(input), now, { forwardDate: true });
    if (!found) return { schedule: null, rest: tidyRest(input) };
    const { extractWhen } = require('./commands');
    return { schedule: { type: 'once', at: extractWhen(found.text, now).date.getTime() }, rest: '' };
  }
  if (!time) return { schedule: null, rest: tidyRest(state.text) };
  if (interval || window) {
    const minutes = !interval || /hourly/i.test(interval[0]) ? 60 : Math.round(countWord(interval[1]) * unitMinutes(interval[2]));
    let span = null;
    if (window) {
      const start = parseTime(window[1]);
      let end = parseTime(window[2]);
      if (!start || !end) return { schedule: null, rest: tidyRest(state.text) };
      // "between 10 and 6": 6 already reads as 6pm; "between 9pm and 11" needs the end moved past the start.
      if (end <= start && !/[ap]\.?m/i.test(window[2]) && Number(end.slice(0, 2)) < 12) end = `${pad(Number(end.slice(0, 2)) + 12)}${end.slice(2)}`;
      if (end <= start) return { schedule: null, rest: tidyRest(state.text) }; // ponytail: no windows across midnight yet
      span = { start, end };
    }
    if (!(minutes >= 5)) return { schedule: null, rest: tidyRest(state.text) };
    return done({ type: 'interval', minutes, window: span, days: days || ALL_DAYS });
  }
  if (monthDay) {
    const d = Number(monthDay[1]);
    if (d < 1 || d > 31) return { schedule: null, rest: tidyRest(state.text) };
    return done({ type: 'daily', time, days: ALL_DAYS, monthDay: d });
  }
  if (everyN) {
    const every = /^(?:other|second)$/i.test(everyN[1]) ? 2 : Number(everyN[1]);
    const [h, m] = hm(time);
    const first = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
    if (first.getTime() <= at) first.setDate(first.getDate() + 1);
    return done({ type: 'daily', time, days: ALL_DAYS, every: Math.max(1, every), anchor: isoDay(first) });
  }
  return done({ type: 'daily', time, days: days || (weekly && !daily ? [now.getDay()] : ALL_DAYS) });
}

function tidyRest(text) {
  return String(text).replace(/\s{2,}/g, ' ').replace(/^[\s,;:-]*(?:(?:and|at|on|every|each|then)\b[\s,]*)*/i, '').replace(/[\s,;:-]*(?:\b(?:and|at|on|every|each)\b[\s,;:-]*)*$/i, '').trim();
}

function lastDayOfMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}

function dayMatches(s, y, m, d) {
  const date = new Date(y, m, d);
  if (!(s.days || ALL_DAYS).includes(date.getDay())) return false;
  if (s.monthDay) return d === Math.min(s.monthDay, lastDayOfMonth(y, m));
  if (s.every > 1 && s.anchor) {
    const [ay, am, ad] = s.anchor.split('-').map(Number);
    const diff = dayNumber(y, m, d) - dayNumber(ay, am - 1, ad);
    return diff >= 0 && diff % s.every === 0;
  }
  return true;
}

function timesOf(s) {
  if (s.type === 'daily') return [hm(s.time)];
  const [sh, sm] = hm(s.window?.start || '00:00');
  const [eh, em] = hm(s.window?.end || '23:59');
  const out = [];
  for (let t = sh * 60 + sm; t <= eh * 60 + em; t += s.minutes) out.push([Math.floor(t / 60), t % 60]);
  return out;
}

// The first run strictly after `after` (epoch ms), or null. Wall-clock times are built with the local Date
// constructor, so "9:00" stays 9:00 across DST changes (a time in the spring-forward gap runs an hour later).
function nextRun(s, after) {
  if (!s) return null;
  if (s.type === 'once') return s.at > after ? s.at : null;
  const from = new Date(after);
  const times = timesOf(s);
  for (let i = 0; i <= 400; i++) {
    const y = from.getFullYear();
    const m = from.getMonth();
    const d = from.getDate() + i;
    const day = new Date(y, m, d);
    if (!dayMatches(s, day.getFullYear(), day.getMonth(), day.getDate())) continue;
    for (const [h, min] of times) {
      const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, min).getTime();
      if (t > after) return t;
    }
  }
  return null;
}

function joinWords(list) {
  return list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
}

function describeDays(days) {
  const set = [...days].sort().join();
  if (set === ALL_DAYS.join()) return 'every day';
  if (set === WEEKDAYS.join()) return 'weekdays';
  if (set === WEEKEND.join()) return 'weekends';
  return `every ${joinWords(days.map((d) => DAY_NAMES[d]))}`;
}

const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;

// Plain words that parseSchedule reads back to the same schedule (the confirm card and Settings edit this text).
function describeSchedule(s) {
  if (!s) return '';
  if (s.type === 'once') {
    return new Date(s.at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(/\s/g, ' ');
  }
  if (s.type === 'interval') {
    const every = s.minutes % 60 === 0 ? (s.minutes === 60 ? 'every hour' : `every ${s.minutes / 60} hours`) : `every ${s.minutes} minutes`;
    const span = s.window ? ` between ${formatTime(s.window.start)} and ${formatTime(s.window.end)}` : '';
    const days = (s.days || ALL_DAYS).length === 7 ? '' : ` on ${describeDays(s.days)}`;
    return `${every}${span}${days}`;
  }
  const at = ` at ${formatTime(s.time)}`;
  if (s.monthDay) return `the ${ordinal(s.monthDay)} of every month${at}`;
  if (s.every > 1) return `${s.every === 2 ? 'every other day' : `every ${s.every} days`}${at}`;
  return `${describeDays(s.days || ALL_DAYS)}${at}`;
}

// ---------- actions ----------
const PRICE_WATCH = /\b(?:check|watch|track|monitor)\b.*\bprices?\b|\bprice (?:watch|drop|check)\b|\bwhen (?:this|it|the price) (?:drops|goes down|falls|gets cheaper)\b|\b(?:below|under|less than) \$\d/i;
const TARGET = /\b(?:below|under|less than)\s*\$?(\d+(?:\.\d{1,2})?)/i;
const ACTION_RULES = [
  ['weekSummary', /\b(?:summari[sz]e|recap|review)\b.*\b(?:week|worked on|did)\b|\bweek(?:ly)?\s+(?:summary|recap|review)\b|\bwhat i (?:worked on|did)\b/i],
  ['today', /\bbrief me\b|\b(?:morning|daily)\s+brief(?:ing)?\b|\b(?:my|the)\s+(?:day|calendar|schedule|agenda)\b|\bplan (?:for )?(?:my |the )?day\b|\bwhat'?s on (?:my )?(?:calendar|schedule|agenda)\b|\bgood morning\b/i],
  ['briefing', /\b(?:catch me up|where (?:did )?i (?:leave|left) off|briefing|my projects)\b/i],
  ['priceWatch', PRICE_WATCH],
];

// The action part of a routine: { action, payload, understood }.
function parseAction(rest, { pageUrl = null } = {}) {
  const text = rest.trim().replace(/^(?:to|and|then)\s+/i, '');
  let m;
  if ((m = text.match(/^remind me (?:to |about |of )?(.+)$/i))) return { action: 'reminder', payload: { message: tidyMessage(m[1]) }, understood: true };
  if ((m = text.match(/^(?:tell|ask) me to (.+)$/i))) return { action: 'notify', payload: { message: `Time to ${tidyMessage(m[1])}` }, understood: true };
  for (const [action, re] of ACTION_RULES) {
    if (!re.test(text)) continue;
    if (action === 'priceWatch') {
      const below = text.match(TARGET);
      return { action, payload: { url: pageUrl || '', ...(below ? { below: Number(below[1]) } : {}) }, understood: Boolean(pageUrl) };
    }
    if (action === 'briefing') {
      const project = text.match(/\b(?:on|in|with)\s+(?:my\s+|the\s+)?(.+?)(?:\s+project)?$/i);
      return { action, payload: { project: project ? project[1] : '' }, understood: true };
    }
    return { action, payload: {}, understood: true };
  }
  if ((m = text.match(/^(?:say|tell me|show me|notify me|ping me)(?: that| with)?[:\s]+(.+)$/i)) && !/^(?:what|how|why|when|where|who|which|if|about)\b/i.test(m[1])) {
    return { action: 'notify', payload: { message: cap(tidyMessage(m[1])) }, understood: true };
  }
  if ((m = text.match(/^(?:ask(?: you)?|run|answer)[:\s]+["“]?(.+?)["”]?$/i))) return { action: 'ask', payload: { question: m[1] }, understood: true };
  if (/\?$|^(?:what|how|why|when|where|who|which|is|are|does|do|can|should|tell me|give me|show me|summari[sz]e|explain)\b/i.test(text)) {
    return { action: 'ask', payload: { question: text.replace(/^tell me\s+/i, '') }, understood: true };
  }
  return { action: 'notify', payload: { message: cap(tidyMessage(text)) }, understood: false };
}

const tidyMessage = (s) => String(s).trim().replace(/^[\s,:-]+|[\s,.!?:;-]+$/gu, '').replace(/[\s,]+$/u, '');

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function labelFor(action, payload = {}) {
  switch (action) {
    case 'reminder': return cap(payload.message || 'Reminder');
    case 'notify': return (payload.message || 'Message').slice(0, 60);
    case 'today': return 'My day';
    case 'briefing': return payload.project ? `Catch-up · ${payload.project}` : 'Catch-up';
    case 'weekSummary': return 'Week summary';
    case 'priceWatch': return `Price watch${hostOf(payload.url) ? ` · ${hostOf(payload.url)}` : ''}${payload.below != null ? ` · under $${payload.below}` : ''}`;
    case 'ask': return (payload.question || 'Question').slice(0, 60);
    default: return 'Routine';
  }
}

// "every weekday at 8:30 summarize my calendar" → a routine draft, or null when the text isn't a routine.
// Drafts with understood: false still become a confirm card, with whatever was read filled in.
function parseRoutine(input, { now = new Date(), pageUrl = null } = {}) {
  const text = String(input).trim().replace(/[.!]+$/, '');
  // Questions about schedules ("what runs every day at 9?") stay questions.
  if (/^(?:what|how|why|when|where|who|which|is|are|does|do|can|could|should|would|explain|define)\b/i.test(text)) return null;
  let { schedule, rest } = parseSchedule(text, now);
  let leftover = rest;
  // "Watch this price" / "tell me when this drops below $30" name no schedule: a price watch checks every 6 hours.
  if (!schedule && PRICE_WATCH.test(text) && /\b(?:this|it|the price|this page)\b/i.test(text)) {
    schedule = { type: 'interval', minutes: 360, window: null, days: ALL_DAYS };
    leftover = text;
  }
  if (!schedule) {
    // "every blue moon tell me…": clearly meant as a routine, so it gets a card to fix; anything else isn't one.
    const m = text.match(/^(?:every|each)\b.*?\b((?:tell|remind) me\b.*)$/i);
    if (!m) return null;
    leftover = m[1];
  }
  if (/^(?:add|create|schedule|put|book)\b/i.test(leftover)) return null; // calendar events (brain/commands.js)
  const { action, payload, understood } = parseAction(leftover, { pageUrl });
  return { label: labelFor(action, payload), schedule, action, payload, understood: understood && Boolean(schedule) };
}

// ---------- confirm-card fields ----------
const DO_WORDS = { notify: 'tell me', reminder: 'remind me', today: 'my day', briefing: 'catch me up', weekSummary: 'week summary', priceWatch: 'price watch', ask: 'ask' };
const MESSAGE_KEY = { notify: 'message', reminder: 'message', ask: 'question', priceWatch: 'url', briefing: 'project' };

function actionFromWord(word) {
  const w = String(word || '').toLowerCase().trim();
  if (!w) return null;
  if (ACTIONS.includes(word)) return word;
  if (/remind/.test(w)) return 'reminder';
  if (/week|recap/.test(w)) return 'weekSummary';
  if (/day|calendar|agenda|schedule/.test(w)) return 'today';
  if (/catch|brief|project/.test(w)) return 'briefing';
  if (/price|deal/.test(w)) return 'priceWatch';
  if (/ask|question|answer/.test(w)) return 'ask';
  if (/tell|notify|say|message|ping/.test(w)) return 'notify';
  return null;
}

// The editable fields for a draft (the bubble's confirm card and Settings both use these).
function fieldsFor(draft) {
  const key = MESSAGE_KEY[draft.action];
  return [
    { name: 'Name', value: draft.label || '' },
    { name: 'When', value: describeSchedule(draft.schedule), required: true },
    { name: 'Do', value: DO_WORDS[draft.action] || '', required: true },
    { name: 'Details', value: key ? draft.payload?.[key] || '' : '' },
  ];
}

// Applies edited fields to a draft; throws with a plain reason when something can't be used.
function applyFields(draft, fields = [], now = new Date()) {
  const get = (name) => fields.find((f) => f.name === name)?.value?.trim() ?? null;
  const next = { ...draft, payload: { ...(draft.payload || {}) } };
  const when = get('When');
  if (when !== null && when !== describeSchedule(draft.schedule)) {
    next.schedule = parseSchedule(when, now, { allowOnce: true }).schedule;
    if (!next.schedule) throw new Error(`I couldn't read "${when}" as a time. Try "every weekday at 8:30" or "in 20 minutes"`);
  }
  if (!next.schedule) throw new Error('A routine needs a time, like "every morning at 9"');
  const doWord = get('Do');
  if (doWord !== null) {
    const action = actionFromWord(doWord);
    if (!action) throw new Error(`I don't know how to "${doWord}". Try: remind me, tell me, my day, week summary, catch me up, price watch or ask`);
    if (action !== next.action) next.payload = {};
    next.action = action;
  }
  const details = get('Details');
  const key = MESSAGE_KEY[next.action];
  if (key && details !== null) next.payload[key] = details;
  if (['notify', 'reminder'].includes(next.action) && !next.payload.message) throw new Error('What should I say? Fill in Details');
  if (next.action === 'ask' && !next.payload.question) throw new Error('Which question should I ask? Fill in Details');
  if (next.action === 'priceWatch' && !/^https?:\/\//i.test(next.payload.url || '')) throw new Error('A price watch needs the product page link in Details (open the page in Chrome and ask again)');
  const name = get('Name');
  next.label = (name || labelFor(next.action, next.payload)).slice(0, 80);
  return next;
}

// ---------- commands: list / pause / resume / delete ----------
const COMMAND_STOP = new Set(['the', 'my', 'a', 'an', 'routine', 'routines', 'please', 'that', 'this', 'one', 'for', 'me']);
const ACTION_WORDS = {
  reminder: 'reminder remind', notify: 'reminder message notify', today: 'day calendar agenda plan morning',
  weekSummary: 'week weekly summary recap', briefing: 'briefing catch projects', priceWatch: 'price watch deal', ask: 'question ask',
};

function parseRoutineCommand(input) {
  const text = String(input).trim().replace(/[.!?]+$/, '');
  if (/^(?:(?:show|list|see|view)(?: me)?(?: all)?(?: of)? my routines|(?:what are )?my routines|(?:show|list) (?:all )?routines|what routines do i have)$/i.test(text)) return { action: 'routines' };
  let m;
  // "Stop the morning briefing" pauses it: easy to undo, unlike delete.
  if ((m = text.match(/^(pause|resume|unpause|disable|enable|turn off|turn on|switch off|switch on|mute|unmute|stop|restart) (.+)$/i))
    && !(/^(?:stop|restart)$/i.test(m[1]) && /^(?:the |my |all )?(?:focus|timers?)\b/i.test(m[2]))) { // "stop focus" / "stop the timer" are commands
    return { action: 'routinePause', on: /^(?:resume|unpause|enable|turn on|switch on|unmute|restart)$/i.test(m[1]), query: m[2] };
  }
  if ((m = text.match(/^(?:delete|remove) (.+)$/i))) return { action: 'routineDelete', query: m[1] };
  return null;
}

// Best routines for "the Friday summary": words that start a word of the name, schedule or kind. Ties all return.
// When the query has specific words ("gym"), one of them must hit: "the gym reminder" is not "Drink water".
const KIND_WORDS = new Set(Object.values(ACTION_WORDS).join(' ').split(' '));
function matchRoutines(routines, query) {
  const words = (String(query).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => !COMMAND_STOP.has(w));
  if (!words.length) return [];
  const specific = words.some((w) => !KIND_WORDS.has(w));
  const scored = routines.map((r) => {
    const hay = `${r.label} ${describeSchedule(r.schedule)} ${ACTION_WORDS[r.action] || ''}`.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    const hit = words.filter((w) => hay.some((h) => h === w || (w.length >= 3 && h.length >= 3 && (h.startsWith(w) || w.startsWith(h)))));
    return { r, hits: specific && hit.every((w) => KIND_WORDS.has(w)) ? 0 : hit.length };
  }).filter((x) => x.hits);
  const best = Math.max(0, ...scored.map((x) => x.hits));
  return scored.filter((x) => x.hits === best).map((x) => x.r);
}

const mentionsRoutine = (text) => /\b(?:routines?|reminders?)\b/i.test(text);

// ---------- price watch ----------
// Picks the watched product from a page's products and compares with the last run, unit price when both have one.
// below: the user's target price; crossing it alerts once, like a drop does.
function priceCheck(items, previous = null, name = '', below = null) {
  const item = (name && items.find((i) => i.name === name)) || items[0];
  if (!item || item.price == null) return null;
  const q = parseQuantity(item.sizeText || item.name);
  const current = { name: item.name, price: item.price, currency: item.currency || 'USD', unitPrice: q ? item.price / q.amount : null, unit: q?.unit || null };
  let drop = false;
  let before = null;
  let after = null;
  if (previous && previous.currency === current.currency) {
    const byUnit = previous.unit && previous.unit === current.unit && previous.unitPrice && current.unitPrice;
    before = byUnit ? previous.unitPrice : previous.price;
    after = byUnit ? current.unitPrice : current.price;
    drop = after < before * (1 - DROP_MIN);
  }
  const hitTarget = below != null && current.price <= below && !(previous && previous.price <= below);
  if (hitTarget) return { current, drop: true, text: `**Under your ${money({ ...current, price: below })} target:** ${short(current.name)} is ${money(current)} now.` };
  const text = drop
    ? `**Price drop:** ${short(current.name)} is ${money(current)} now, down from ${money(previous)} (${Math.round((1 - after / before) * 100)}% less${previous.unit && previous.unit === current.unit && current.unitPrice ? ' per unit' : ''}).`
    : `${short(current.name)}: ${money(current)}${previous ? ` (was ${money(previous)})` : ' (first check)'}.`;
  return { current, drop, text };
}

// ---------- week summary (code only: history episodes + project briefings) ----------
function formatWeek(episodes, { now = Date.now(), projects = '' } = {}) {
  const from = new Date(now - 7 * DAY);
  const range = `${from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(now).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const lines = [`**Your week** · ${range}`, ''];
  if (!episodes.length) lines.push('A quiet week: nothing in your history.');
  else {
    const byDay = {};
    const bySite = {};
    for (const e of episodes) {
      const day = DAY_NAMES[new Date(e.at).getDay()];
      byDay[day] = (byDay[day] || 0) + 1;
      if (e.scope) bySite[e.scope] = (bySite[e.scope] || 0) + 1;
    }
    const busiest = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0][0];
    lines.push(`- ${episodes.length} thing${episodes.length > 1 ? 's' : ''} asked or looked up, most on ${busiest}.`);
    const sites = Object.entries(bySite).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (sites.length) lines.push(`- Mostly on ${sites.map(([s, n]) => `${s} (${n})`).join(', ')}.`);
    const titles = [...new Set(episodes.map((e) => e.title.replace(/\s+/g, ' ').slice(0, 70)))].slice(0, 5);
    lines.push('', '**Topics**', ...titles.map((t) => `- ${t}`));
  }
  if (projects) lines.push('', projects);
  return lines.join('\n').trim();
}

// ---------- store (tables live in memory.db, created by brain/memory.js) ----------
const RUNS_KEPT = 50;
class RoutineStore {
  constructor(memory, { now = () => Date.now() } = {}) {
    this.memory = memory;
    this.now = now;
  }

  get db() {
    return this.memory.db; // read each time: the selftest swaps memory's database
  }

  row(r) {
    if (!r) return null;
    return {
      id: r.id, label: r.label, action: r.action, schedule: JSON.parse(r.schedule), payload: JSON.parse(r.payload), state: JSON.parse(r.state),
      enabled: Boolean(r.enabled), created: r.created, nextRun: r.next_run, lastRun: r.last_run, lastResult: r.last_result, lastStatus: r.last_status,
    };
  }

  list() {
    return this.db.prepare('SELECT * FROM routines ORDER BY created').all().map((r) => this.row(r));
  }

  get(id) {
    return this.row(this.db.prepare('SELECT * FROM routines WHERE id = ?').get(id));
  }

  create({ label, action, schedule, payload = {} }) {
    if (!ACTIONS.includes(action)) throw new Error(`Unknown routine action: ${action}`);
    const id = crypto.randomUUID();
    const t = this.now();
    this.db.prepare('INSERT INTO routines (id, label, action, schedule, payload, state, enabled, created, next_run) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)')
      .run(id, label, action, JSON.stringify(schedule), JSON.stringify(payload), '{}', t, nextRun(schedule, t));
    return this.get(id);
  }

  // patch: any of label, action, schedule, payload, state, enabled, nextRun, lastRun, lastResult, lastStatus.
  update(id, patch) {
    const columns = { label: 'label', action: 'action', schedule: 'schedule', payload: 'payload', state: 'state', enabled: 'enabled', nextRun: 'next_run', lastRun: 'last_run', lastResult: 'last_result', lastStatus: 'last_status' };
    const sets = [];
    const values = [];
    for (const [key, value] of Object.entries(patch)) {
      if (!columns[key]) continue;
      sets.push(`${columns[key]} = ?`);
      values.push(['schedule', 'payload', 'state'].includes(key) ? JSON.stringify(value) : key === 'enabled' ? (value ? 1 : 0) : value ?? null);
    }
    if (sets.length) this.db.prepare(`UPDATE routines SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
    return this.get(id);
  }

  remove(id) {
    this.db.prepare('DELETE FROM routine_runs WHERE routine_id = ?').run(id);
    this.db.prepare('DELETE FROM routines WHERE id = ?').run(id);
  }

  logRun(id, { due = null, status, note = '' }) {
    this.db.prepare('INSERT INTO routine_runs (routine_id, at, due, status, note) VALUES (?, ?, ?, ?, ?)').run(id, this.now(), due, status, String(note).slice(0, 200));
    this.db.prepare('DELETE FROM routine_runs WHERE routine_id = ? AND id NOT IN (SELECT id FROM routine_runs WHERE routine_id = ? ORDER BY id DESC LIMIT ?)').run(id, id, RUNS_KEPT);
  }

  runs(id, limit = 10) {
    return this.db.prepare('SELECT at, due, status, note FROM routine_runs WHERE routine_id = ? ORDER BY id DESC LIMIT ?').all(id, limit);
  }
}

module.exports = {
  ACTIONS, ALL_DAYS, WEEKDAYS, WEEKEND, parseTime, formatTime, parseSchedule, nextRun, describeSchedule, parseAction, parseRoutine, labelFor,
  fieldsFor, applyFields, actionFromWord, parseRoutineCommand, matchRoutines, mentionsRoutine, priceCheck, formatWeek, RoutineStore, hostOf,
};
