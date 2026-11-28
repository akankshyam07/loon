// "What time is it in Tokyo" is a lookup, not a language question: the model cannot know the time, so code answers.
const ZONES = {
  'new york': 'America/New_York', nyc: 'America/New_York', boston: 'America/New_York', miami: 'America/New_York', toronto: 'America/Toronto',
  chicago: 'America/Chicago', 'mexico city': 'America/Mexico_City', denver: 'America/Denver',
  'los angeles': 'America/Los_Angeles', la: 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles', seattle: 'America/Los_Angeles', vancouver: 'America/Vancouver',
  'sao paulo': 'America/Sao_Paulo', 'buenos aires': 'America/Argentina/Buenos_Aires',
  london: 'Europe/London', dublin: 'Europe/Dublin', lisbon: 'Europe/Lisbon', paris: 'Europe/Paris', berlin: 'Europe/Berlin', madrid: 'Europe/Madrid',
  rome: 'Europe/Rome', amsterdam: 'Europe/Amsterdam', zurich: 'Europe/Zurich', stockholm: 'Europe/Stockholm', athens: 'Europe/Athens', istanbul: 'Europe/Istanbul', moscow: 'Europe/Moscow',
  cairo: 'Africa/Cairo', lagos: 'Africa/Lagos', nairobi: 'Africa/Nairobi', johannesburg: 'Africa/Johannesburg', dubai: 'Asia/Dubai',
  mumbai: 'Asia/Kolkata', delhi: 'Asia/Kolkata', 'new delhi': 'Asia/Kolkata', kolkata: 'Asia/Kolkata', india: 'Asia/Kolkata', bangalore: 'Asia/Kolkata',
  bangkok: 'Asia/Bangkok', singapore: 'Asia/Singapore', 'hong kong': 'Asia/Hong_Kong', shanghai: 'Asia/Shanghai', beijing: 'Asia/Shanghai', taipei: 'Asia/Taipei',
  seoul: 'Asia/Seoul', tokyo: 'Asia/Tokyo', japan: 'Asia/Tokyo', manila: 'Asia/Manila', sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne', auckland: 'Pacific/Auckland',
  honolulu: 'Pacific/Honolulu', utc: 'UTC', gmt: 'UTC',
};
const ASK = /^(?:what(?:'s| is)? (?:the )?)?(?:current |local )?time (?:is it )?(?:in|at) ([a-z][a-z .]*?)(?: now| today)?$/;

function worldTime(key, now = new Date()) {
  const place = ASK.exec(key)?.[1].trim();
  const zone = place && ZONES[place.replace(/^the /, '')];
  if (!zone) return null;
  const opts = { timeZone: zone };
  const time = now.toLocaleTimeString([], { ...opts, hour: 'numeric', minute: '2-digit' });
  const day = now.toLocaleDateString([], { ...opts, weekday: 'long' });
  const sameDay = day === now.toLocaleDateString([], { weekday: 'long' });
  const name = place.replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/^(Nyc|La|Utc|Gmt)$/, (m) => m.toUpperCase());
  return `It's ${time}${sameDay ? '' : ` on ${day}`} in ${name}.`;
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const FAR = /^(?:what (?:day|date) (?:is it|will it be)|what(?:'s| is) the date) (?:in|after) (\d{1,4}|a|one) (day|week)s?(?: from now| from today)?$|^what (?:day|date) (?:is it|will it be) (\d{1,4}|a|one) (day|week)s? from (?:now|today)$/;
const UNTIL = /^(?:how (?:many days|long)|days) (?:is it |are there )?(?:until|till|to|before) (?:next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const HOLIDAYS = { christmas: [11, 25], 'christmas eve': [11, 24], halloween: [9, 31], "new year's day": [0, 1], 'new years day': [0, 1], 'new year': [0, 1], 'new years': [0, 1], "valentine's day": [1, 14], 'valentines day': [1, 14], valentines: [1, 14] };
const UNTIL_DATE = /^(?:how (?:many days|long)|days) (?:is it |are there )?(?:until|till|to|before) (?:the )?(?:([a-z]+) (\d{1,2})(?:st|nd|rd|th)?|(\d{1,2})(?:st|nd|rd|th)? (?:of )?([a-z]+)|([a-z' ]+))$/;

// A month and day, or a fixed-date holiday, as [month, day] or null when it is not a real date.
function calendarDate(month, day, holiday) {
  if (holiday) return HOLIDAYS[holiday.trim()] || null;
  const m = MONTHS.indexOf(String(month).slice(0, 3));
  const d = Number(day);
  if (m < 0 || d < 1 || d > 31 || !/^(?:[a-z]{3}|january|february|march|april|june|july|august|september|october|november|december)$/.test(month)) return null;
  return new Date(2024, m, d).getMonth() === m ? [m, d] : null;
}

// "How many days until Friday" and "what day is it in 10 days" depend on today's date, which the model does not have.
function dateMath(key, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const far = FAR.exec(key);
  if (far) {
    const n = far[1] || far[3];
    const unit = far[2] || far[4];
    const count = /^\d/.test(n) ? Number(n) : 1;
    const target = new Date(today);
    target.setDate(today.getDate() + count * (unit === 'week' ? 7 : 1));
    return `${count} ${unit}${count === 1 ? '' : 's'} from now is ${target.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}.`;
  }
  const until = UNTIL.exec(key);
  if (until) {
    const name = until[1];
    const days = (DAYS.indexOf(name) - today.getDay() + 7) % 7 || 7;
    return `${days} day${days === 1 ? '' : 's'} until ${name.replace(/^./, (c) => c.toUpperCase())}.`;
  }
  const date = UNTIL_DATE.exec(key);
  const when = date && calendarDate(date[1] || date[4], date[2] || date[3], date[5]);
  if (when) {
    let target = new Date(today.getFullYear(), when[0], when[1]);
    if (target < today) target = new Date(today.getFullYear() + 1, when[0], when[1]);
    const days = Math.round((target - today) / 864e5);
    const label = target.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    return days === 0 ? `That's today, ${label}.` : `${days} day${days === 1 ? '' : 's'} until ${label}.`;
  }
  return null;
}

module.exports = { worldTime, dateMath };
