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

module.exports = { worldTime };
