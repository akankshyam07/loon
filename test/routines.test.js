// Routines (DESIGN.md §3.19): parsing, schedule math, the scheduler's policies and the commands. Fake clock, no network.
process.env.TZ = 'America/New_York'; // a zone with DST, so the DST checks mean something
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const R = require('../brain/routines');
const { createRoutines, inQuiet } = require('../main/routines');
const { Memory } = require('../brain/memory');
const { Actions } = require('../main/actions');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'loon-routines-'));
const NOW = new Date('2026-10-12T08:00:00'); // a Monday
const PAGE = 'https://shop.example.com/p/oats';
const at = (s) => new Date(s).getTime();
const MIN = 60 * 1000;

test('routines: ~20 phrasings parse in code, and their wording reads back to the same schedule', () => {
  const cases = [
    ['every morning at 9 tell me my day', 'today', 'every day at 9:00 AM'],
    ['every weekday at 8:30 summarize my calendar', 'today', 'weekdays at 8:30 AM'],
    ['remind me to drink water every 2 hours (between 10 and 6)', 'reminder', 'every 2 hours between 10:00 AM and 6:00 PM'],
    ['every Friday at 5 summarize what I worked on this week', 'weekSummary', 'every Friday at 5:00 PM'],
    ['every Monday check the price of this page', 'priceWatch', 'every Monday at 9:00 AM'],
    ['every night at 10 tell me to sleep 😴', 'notify', 'every day at 10:00 PM'],
    ['every day at 12am tell me to take my meds', 'notify', 'every day at 12:00 AM'],
    ['every day at 12pm tell me lunch time', 'notify', 'every day at 12:00 PM'],
    ['every night at 12 remind me to lock the door', 'reminder', 'every day at 12:00 AM'],
    ['every other day at 7 remind me to water the plants', 'reminder', 'every other day at 7:00 AM'],
    ['on weekends at 10am catch me up on Loon', 'briefing', 'weekends at 10:00 AM'],
    ['every mon, wed and fri at 6:30pm remind me to go to the gym', 'reminder', 'every Monday, Wednesday and Friday at 6:30 PM'],
    ['remind me to stretch every hour', 'reminder', 'every hour'],
    ['every half an hour remind me to blink', 'reminder', 'every 30 minutes'],
    ['on the 31st of every month at 9 remind me to pay rent', 'reminder', 'the 31st of every month at 9:00 AM'],
    ['every 3 days remind me to back up my laptop', 'reminder', 'every 3 days at 9:00 AM'],
    ['every evening at 8 ask what should I study next?', 'ask', 'every day at 8:00 PM'],
    ['every week on thursday at noon tell me to order groceries', 'notify', 'every Thursday at 12:00 PM'],
    ['hourly remind me to stand up between 9am and 5pm on weekdays', 'reminder', 'every hour between 9:00 AM and 5:00 PM on weekdays'],
    ['every weekday morning remind me to check email', 'reminder', 'weekdays at 9:00 AM'],
  ];
  for (const [text, action, wording] of cases) {
    const d = R.parseRoutine(text, { now: NOW, pageUrl: PAGE });
    assert.ok(d, text);
    assert.strictEqual(d.action, action, text);
    assert.strictEqual(d.understood, true, text);
    assert.strictEqual(R.describeSchedule(d.schedule), wording, text);
    const { anchor, ...want } = d.schedule;
    const { anchor: _a, ...back } = R.parseSchedule(wording, NOW).schedule; // Settings and the confirm card edit this text
    assert.deepStrictEqual(back, want, `round trip: ${wording}`);
  }
  const water = R.parseRoutine('remind me to drink water every 2 hours (between 10 and 6)', { now: NOW });
  assert.deepStrictEqual([water.label, water.payload, water.schedule.window], ['Drink water', { message: 'drink water' }, { start: '10:00', end: '18:00' }]);
  assert.deepStrictEqual(R.parseRoutine('every night at 10 tell me to sleep 😴', { now: NOW }).payload, { message: 'Time to sleep 😴' });
  assert.deepStrictEqual(R.parseRoutine('every Monday check the price of this page', { now: NOW, pageUrl: PAGE }).payload, { url: PAGE });
  assert.strictEqual(R.parseRoutine('every Monday check the price of this page', { now: NOW }).understood, false); // no page open
  assert.strictEqual(R.parseRoutine('on weekends at 10am catch me up on Loon', { now: NOW }).payload.project, 'Loon');
  assert.strictEqual(R.describeSchedule(R.parseRoutine('everyday at 8 remind me to take meds', { now: NOW }).schedule), 'every day at 8:00 AM'); // one-word spelling
  const empty = R.parseRoutine('every day at 9 remind me to', { now: NOW }); // the card asks what to say, not a reminder called "To"
  assert.deepStrictEqual([empty.payload.message, empty.understood], ['', false]);

  // one-offs: "in 20 minutes"
  const stretch = R.parseRoutine('in 20 minutes remind me to stretch', { now: NOW });
  assert.deepStrictEqual([stretch.action, stretch.schedule], ['reminder', { type: 'once', at: NOW.getTime() + 20 * MIN }]);
  assert.strictEqual(R.parseRoutine('in an hour tell me to call back', { now: NOW }).schedule.at, NOW.getTime() + 60 * MIN);
  // edge cases: 12am/12pm, every other day's anchor, a window crossing midnight is refused
  assert.strictEqual(R.parseTime('12am'), '00:00');
  assert.strictEqual(R.parseTime('12pm'), '12:00');
  assert.strictEqual(R.parseTime('5'), '17:00');
  assert.strictEqual(R.parseTime('10', 'night'), '22:00');
  assert.strictEqual(R.parseTime('7:15', 'morning'), '07:15');
  assert.strictEqual(R.parseTime('13:00'), '13:00');
  assert.strictEqual(R.parseTime('13pm'), null);
  assert.strictEqual(R.parseRoutine('every other day at 7 remind me to water the plants', { now: NOW }).schedule.anchor, '2026-10-13'); // 7am today has passed
  assert.strictEqual(R.parseSchedule('every hour between 10pm and 2am', NOW).schedule, null);
  // not routines: plain reminders (Apple Reminders), questions, calendar events
  for (const text of ['remind me to call mom at 5', 'remind me to stretch in 20 minutes', 'what happens every day at 9?', 'summarize every paragraph', 'explain this every time', 'schedule standup every Monday at 10']) {
    assert.strictEqual(R.parseRoutine(text, { now: NOW }), null, text);
  }
  // clearly a routine but no readable time: still a card, with what was understood
  const moon = R.parseRoutine('every blue moon tell me hi', { now: NOW });
  assert.deepStrictEqual([moon.schedule, moon.understood, moon.action, moon.payload.message], [null, false, 'notify', 'Hi']);
});

test('routines: next run across DST changes, month ends, short months and intervals', () => {
  const daily9 = R.parseSchedule('every day at 9am', NOW).schedule;
  // spring forward (Mar 8, 2026): still 9:00 on the clock, only 23 hours later
  const spring = R.nextRun(daily9, at('2026-03-07T09:30:00'));
  assert.deepStrictEqual([new Date(spring).getDate(), new Date(spring).getHours()], [8, 9]);
  assert.strictEqual(R.nextRun(daily9, spring - 1) - at('2026-03-07T09:00:00'), 23 * 60 * MIN);
  // fall back (Nov 1, 2026): 9:00 again, 25 hours later
  const fall = R.nextRun(daily9, at('2026-10-31T09:30:00'));
  assert.deepStrictEqual([new Date(fall).getDate(), new Date(fall).getHours()], [1, 9]);
  assert.strictEqual(fall - at('2026-10-31T09:00:00'), 25 * 60 * MIN);
  // a time inside the spring-forward gap runs an hour later that day, then normally
  const gap = R.parseSchedule('every day at 2:30am', NOW).schedule;
  const inGap = R.nextRun(gap, at('2026-03-07T12:00:00'));
  assert.deepStrictEqual([new Date(inGap).getDate(), new Date(inGap).getHours(), new Date(inGap).getMinutes()], [8, 3, 30]);
  assert.strictEqual(new Date(R.nextRun(gap, inGap)).getHours(), 2);
  // intervals over the fall-back night keep moving forward
  const hourly = R.parseSchedule('every hour', NOW).schedule;
  let t = at('2026-11-01T00:30:00');
  for (let i = 0; i < 5; i++) {
    const n = R.nextRun(hourly, t);
    assert.ok(n > t);
    t = n;
  }
  // month ends: the 31st falls back to the month's last day; plain days roll into the next month
  const rent = R.parseSchedule('on the 31st of every month at 9', NOW).schedule;
  const feb = R.nextRun(rent, at('2026-01-31T10:00:00'));
  assert.deepStrictEqual([new Date(feb).getMonth(), new Date(feb).getDate()], [1, 28]);
  const mar = R.nextRun(rent, feb);
  assert.deepStrictEqual([new Date(mar).getMonth(), new Date(mar).getDate()], [2, 31]);
  const leap = R.nextRun(rent, at('2028-02-01T00:00:00'));
  assert.strictEqual(new Date(leap).getDate(), 29);
  assert.strictEqual(new Date(R.nextRun(daily9, at('2026-01-31T10:00:00'))).getMonth(), 1);
  // every other day keeps its rhythm across a month end
  const other = { type: 'daily', time: '07:00', days: R.ALL_DAYS, every: 2, anchor: '2026-01-30' };
  const runs = [];
  for (let n = at('2026-01-29T00:00:00'), i = 0; i < 3; i++) runs.push(new Date((n = R.nextRun(other, n))).getDate());
  assert.deepStrictEqual(runs, [30, 1, 3]);
  // windows: first slot of the day, last slot, then the next day; weekdays skip the weekend
  const water = R.parseSchedule('every 2 hours between 10 and 6', NOW).schedule;
  assert.strictEqual(new Date(R.nextRun(water, at('2026-10-12T08:00:00'))).getHours(), 10);
  assert.strictEqual(new Date(R.nextRun(water, at('2026-10-12T17:00:00'))).getHours(), 18);
  assert.strictEqual(new Date(R.nextRun(water, at('2026-10-12T18:00:00'))).getDate(), 13);
  const weekdays = R.parseSchedule('every weekday at 8:30', NOW).schedule;
  assert.strictEqual(new Date(R.nextRun(weekdays, at('2026-10-16T09:00:00'))).getDay(), 1); // Friday → Monday
  assert.strictEqual(R.nextRun({ type: 'once', at: 5 }, 10), null);
});

// A scheduler on a fresh database with a fake clock, fake timers and recording fakes for everything it touches.
function rig({ settings: extra = {}, connected = true, products = null } = {}) {
  const dir = tmp();
  const clock = { t: NOW.getTime() };
  const memory = new Memory(path.join(dir, 'memory.db'), { now: () => clock.t });
  const settings = { focus: false, privacy: false, quietHours: { on: true, start: '22:00', end: '07:00' }, routineNotifications: false, ...extra };
  const seen = { nudges: [], notes: [], opened: [], audit: [], timers: [] };
  const fake = { connected, products };
  const routines = createRoutines({
    memory,
    settings,
    now: () => clock.t,
    timers: { setTimeout: (fn, ms) => { seen.timers.push(ms); return { fn, ms }; }, clearTimeout: () => {} },
    audit: (entry) => seen.audit.push(entry),
    tasks: {
      connected: () => fake.connected,
      today: async () => '**Good morning!** Two meetings.',
      briefing: async () => 'You were last working on Loon.',
      projects: async () => '',
      products: async () => (typeof fake.products === 'function' ? fake.products() : fake.products),
    },
    ui: {
      nudge: (n) => seen.nudges.push(n),
      notify: (n) => seen.notes.push(n),
      open: (items) => seen.opened.push(items),
    },
  });
  const actions = new Actions({ auditFile: path.join(dir, 'audit.jsonl'), notes: null, memory, openExternal: () => {}, routines });
  const add = (text, opts = {}) => routines.create(R.applyFields(R.parseRoutine(text, { now: new Date(clock.t), ...opts }), [], new Date(clock.t)));
  return { routines, memory, clock, settings, seen, fake, actions, add, dir };
}

test('scheduler: runs when due, delivers through the "?" nudge, audits, logs history, arms one timer', async () => {
  const { routines, clock, seen, add, memory } = rig();
  const day = add('every morning at 9 tell me my day');
  await routines.start();
  assert.strictEqual(seen.timers.at(-1), 60 * MIN); // next run is an hour away: the timer sleeps until then (capped at 1 h)
  clock.t = at('2026-10-12T09:00:00');
  await routines.tick();
  assert.deepStrictEqual(seen.nudges.map((n) => n.kind), ['routine']);
  const row = routines.store.get(day.id);
  assert.deepStrictEqual([row.lastStatus, row.lastResult, row.nextRun], ['ok', 'Good morning! Two meetings.', at('2026-10-13T09:00:00')]);
  assert.deepStrictEqual(seen.audit, [{ action: 'routine', kind: 'today', ok: true, status: 'delivered', ms: 0 }]); // metadata only
  assert.strictEqual(memory.searchEpisodes('')[0].title, 'My day');
  assert.ok(routines.openPending());
  assert.match(seen.opened[0][0].text, /Two meetings/);
  assert.strictEqual(routines.openPending(), false); // shown once
  await routines.tick(); // nothing due: nothing happens
  assert.strictEqual(seen.nudges.length, 1);
});

test('scheduler: sleep/wake runs a missed routine once within the grace window, otherwise skips (never a pile-up)', async () => {
  const { routines, clock, seen, add } = rig();
  const day = add('every morning at 9 tell me my day');
  const water = add('remind me to drink water every 30 minutes between 10 and 6');
  await routines.start();
  clock.t = at('2026-10-12T10:40:00'); // woke up: 9:00 is 1h40 late, water missed 10:00 and 10:30
  await routines.poke();
  assert.deepStrictEqual(seen.nudges.map((n) => n.item.label).sort(), ['Drink water', 'My day']);
  assert.match(routines.store.runs(water.id).map((r) => r.note).join('|'), /1 older run folded into one/);
  clock.t = at('2026-10-15T08:00:00'); // asleep for two days: everything is stale
  seen.nudges.length = 0;
  await routines.poke();
  assert.strictEqual(seen.nudges.length, 0);
  assert.deepStrictEqual([routines.store.get(day.id).lastStatus, routines.store.runs(day.id)[0].status], ['skipped', 'skipped']);
  assert.match(routines.store.get(day.id).lastResult, /missed 2 times while the Mac was asleep/);
  assert.strictEqual(routines.store.get(day.id).nextRun, at('2026-10-15T09:00:00'));
  assert.strictEqual(routines.store.get(water.id).lastStatus, 'skipped');
  // a one-off that was missed by far is skipped and switched off
  const once = add('in 20 minutes remind me to stretch');
  clock.t += 5 * 60 * MIN;
  await routines.poke();
  assert.deepStrictEqual([routines.store.get(once.id).enabled, routines.store.get(once.id).lastStatus], [false, 'skipped']);
});

test('scheduler: quiet hours skip repeating reminders and late catch-ups; Focus defers until it ends; urgent ones may notify', async () => {
  const { routines, clock, seen, settings, add } = rig();
  assert.ok(inQuiet(settings.quietHours, at('2026-10-12T23:00:00')));
  assert.ok(inQuiet(settings.quietHours, at('2026-10-12T06:59:00')));
  assert.ok(!inQuiet(settings.quietHours, at('2026-10-12T07:00:00')));
  const nag = add('remind me to stretch every hour');
  const sleep = add('every night at 10 tell me to sleep 😴');
  await routines.start();
  clock.t = at('2026-10-12T22:00:00'); // inside quiet hours: the hourly nag is skipped, the 10pm routine you chose runs
  await routines.tick();
  assert.deepStrictEqual(seen.nudges.map((n) => n.item.label), ['Time to sleep 😴']);
  assert.strictEqual(routines.store.get(nag.id).lastStatus, 'skipped');
  assert.strictEqual(routines.store.get(sleep.id).lastStatus, 'ok');
  clock.t = at('2026-10-13T22:30:00'); // the 10pm one, 30 minutes late (woke from sleep) inside quiet hours: skipped
  seen.nudges.length = 0;
  await routines.tick();
  assert.strictEqual(seen.nudges.length, 0);
  assert.match(routines.store.get(sleep.id).lastResult, /quiet hours/);

  // Focus: the water reminder waits; two slots pass; when Focus ends it's delivered once
  routines.remove(nag.id);
  routines.remove(sleep.id);
  clock.t = at('2026-10-14T09:55:00');
  const water = add('remind me to drink water every 30 minutes between 10 and 6');
  settings.focus = true;
  clock.t = at('2026-10-14T10:00:00');
  await routines.tick();
  clock.t = at('2026-10-14T10:30:00');
  await routines.tick();
  assert.strictEqual(seen.nudges.length, 0);
  assert.ok(routines.list().find((r) => r.id === water.id).waiting);
  settings.focus = false;
  clock.t = at('2026-10-14T10:45:00');
  await routines.poke();
  assert.strictEqual(seen.nudges.length, 1);
  assert.strictEqual(routines.store.get(water.id).state.deferred, null);

  // urgent one-off reminder in Focus with notifications on: a macOS notification, not a wait
  settings.focus = true;
  settings.routineNotifications = true;
  add('in 10 minutes remind me to take the pasta off');
  clock.t += 10 * MIN;
  await routines.tick();
  assert.deepStrictEqual(seen.notes.map((n) => n.body), ['take the pasta off']);
});

test('scheduler: Privacy mode pauses routines that read pages, history or may use the cloud', async () => {
  const { routines, clock, seen, settings, add, memory } = rig();
  settings.privacy = true;
  const ask = add('every day at 9 ask what should I study next?');
  const week = add('every day at 9 summarize what I worked on this week');
  const price = add('every day at 9 check the price of this page', { pageUrl: PAGE });
  const hi = add('every day at 9 tell me to drink some tea');
  await routines.start();
  clock.t = at('2026-10-12T09:00:00');
  await routines.tick();
  for (const r of [ask, week, price]) assert.strictEqual(routines.store.get(r.id).lastStatus, 'paused', r.label);
  assert.strictEqual(routines.store.get(hi.id).lastStatus, 'ok');
  assert.deepStrictEqual(seen.nudges.map((n) => n.item.label), ['Time to drink some tea']);
  assert.strictEqual(memory.historyCount(), 0); // no history in Privacy mode
  assert.strictEqual((await routines.runNow(price.id)).ok, false);
});

test('scheduler: price watch only nudges on a real drop, compares unit prices, waits for Chrome and the page', async () => {
  const { routines, clock, seen, fake, add } = rig({ connected: false });
  const oats = (price, size = '1 kg') => [{ name: `Oats ${size}`, price, currency: 'USD', sizeText: `Oats ${size}` }];
  const watch = add('every Monday check the price of this page', { pageUrl: PAGE });
  await routines.start();
  clock.t = at('2026-10-12T09:00:00');
  await routines.tick(); // Chrome not connected: waits
  assert.ok(routines.store.get(watch.id).state.deferred);
  fake.connected = true;
  fake.products = null; // connected, but the page isn't open
  await routines.poke();
  assert.ok(routines.store.get(watch.id).state.deferred);
  fake.products = oats(5);
  routines.onPage('https://other.example.com/');
  await routines.poke(); // the page is open now: first check is the baseline, silent
  assert.deepStrictEqual([seen.nudges.length, routines.store.get(watch.id).state.price.price], [0, 5]);
  const runWeek = async (items) => {
    fake.products = items;
    clock.t = routines.store.get(watch.id).nextRun;
    await routines.tick();
  };
  await runWeek(oats(5));
  await runWeek(oats(4.98)); // under 1%: noise
  assert.strictEqual(seen.nudges.length, 0);
  await runWeek(oats(4.5));
  assert.deepStrictEqual(seen.nudges.map((n) => n.kind), ['priceDrop']);
  assert.match(seen.nudges[0].item.text, /\$4\.50 now, down from \$4\.98 \(10% less per unit\)/);
  await runWeek(oats(6, '2 kg')); // pricier, but a bigger bag: cheaper per kg is a drop
  assert.strictEqual(seen.nudges.length, 2);
  await runWeek(oats(7));
  assert.strictEqual(seen.nudges.length, 2);
  const audits = seen.audit.filter((a) => a.kind === 'priceWatch').map((a) => a.status);
  assert.deepStrictEqual(audits, ['quiet', 'quiet', 'quiet', 'delivered', 'delivered', 'quiet']);
  assert.strictEqual(R.priceCheck([], null), null);
});

test('routines: creating always needs a confirm card; unclear text shows what was understood, editable', async () => {
  const { routines, actions, seen } = rig();
  const bubble = (type, payload) => seen.opened.push({ type, ...payload });
  assert.ok(await routines.handleText(1, 'every weekday at 8:30 summarize my calendar', bubble, { execute: (c) => actions.execute(c) }));
  const card = seen.opened.at(-1);
  assert.strictEqual(card.type, 'confirm');
  assert.strictEqual(card.summary, 'New routine: My day, weekdays at 8:30 AM');
  assert.deepStrictEqual(card.command.fields.map((f) => [f.name, f.value]), [['Name', 'My day'], ['When', 'weekdays at 8:30 AM'], ['Do', 'my day'], ['Details', '']]);
  assert.strictEqual(routines.list().length, 0); // nothing saved before ✓
  const done = await actions.execute(card.command);
  assert.ok(done.ok, done.message);
  assert.match(done.message, /Saved "My day", weekdays at 8:30 AM\. First run Mon/);
  assert.strictEqual(routines.list().length, 1);
  assert.strictEqual(actions.recent(1)[0].action, 'routine');

  // unclear: the card says so; ✓ without a time fails with a reason; fixing the When field works
  await routines.handleText(2, 'every blue moon tell me hi', bubble, { execute: (c) => actions.execute(c) });
  const unsure = seen.opened.at(-1);
  assert.match(unsure.summary, /Here's what I understood/);
  assert.match((await actions.execute(unsure.command)).message, /needs a time/);
  const edited = { ...unsure.command, fields: unsure.command.fields.map((f) => (f.name === 'When' ? { ...f, value: 'every Sunday at 11am' } : f)) };
  assert.ok((await actions.execute(edited)).ok);
  assert.strictEqual(routines.list().at(-1).description, 'every Sunday at 11:00 AM');
  // edits are checked: an unknown "Do" or a price watch without a link are refused
  assert.throws(() => R.applyFields(R.parseRoutine('every day at 9 tell me hi', { now: NOW }), [{ name: 'Do', value: 'juggle' }], NOW), /don't know how to "juggle"/);
  assert.throws(() => R.applyFields(R.parseRoutine('every Monday check the price of this page', { now: NOW }), [], NOW), /needs the product page link/);
  // a price watch on a private page is refused outright
  await routines.handleText(3, 'every Monday check the price of this page', bubble, { page: { url: 'https://bank.example.com', sensitive: true }, execute: () => {} });
  assert.match(seen.opened.at(-1).message, /private page/);
  // ordinary questions are not routines
  assert.strictEqual(await routines.handleText(4, 'what is a cron job?', bubble, { execute: () => {} }), false);
});

test('routines: "show my routines", "pause the water reminder", "delete the Friday summary"', async () => {
  const { routines, actions, add, seen, clock } = rig();
  const bubble = (type, payload) => seen.opened.push({ type, ...payload });
  const execute = (c) => actions.execute(c);
  const water = add('remind me to drink water every 2 hours between 10 and 6');
  const friday = add('every Friday at 5 summarize what I worked on this week');
  await routines.handleText(1, 'show my routines', bubble, { execute });
  assert.match(seen.opened.at(-1).message, /\*\*Drink water\*\* · every 2 hours between 10:00 AM and 6:00 PM · next Mon 10:00 AM/);
  assert.match(seen.opened.at(-1).message, /\*\*Week summary\*\* · every Friday at 5:00 PM/);

  await routines.handleText(2, 'pause the water reminder', bubble, { execute });
  assert.match(seen.opened.at(-1).message, /Paused "Drink water"/);
  assert.strictEqual(routines.store.get(water.id).enabled, false);
  clock.t = at('2026-10-12T15:10:00');
  await routines.handleText(3, 'resume the water reminder', bubble, { execute });
  assert.strictEqual(routines.store.get(water.id).nextRun, at('2026-10-12T16:00:00')); // from now, no catch-up

  await routines.handleText(4, 'delete the Friday summary', bubble, { execute });
  const card = seen.opened.at(-1);
  assert.deepStrictEqual([card.type, card.command.action, card.command.routineId], ['confirm', 'routineDelete', friday.id]);
  assert.ok(routines.store.get(friday.id)); // not before ✓
  await actions.execute(card.command);
  assert.strictEqual(routines.store.get(friday.id), null);

  await routines.handleText(5, 'delete the gym reminder', bubble, { execute });
  assert.match(seen.opened.at(-1).message, /don't have a routine like/);
  assert.strictEqual(await routines.handleText(6, 'turn off privacy mode', bubble, { execute }), false); // not about routines
  assert.deepStrictEqual(R.parseRoutineCommand('list my routines'), { action: 'routines' });
});

test('routines: tables are added to an existing memory.db without touching what is there', () => {
  const file = path.join(tmp(), 'memory.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE facts (id TEXT PRIMARY KEY, text TEXT NOT NULL, category TEXT NOT NULL, scope TEXT NOT NULL DEFAULT '',
    pinned INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'user', created INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, uses INTEGER NOT NULL DEFAULT 0)`);
  old.prepare("INSERT INTO facts (id, text, category, created) VALUES ('a', 'I am vegetarian', 'diet', 1)").run();
  old.close();
  const memory = new Memory(file);
  assert.deepStrictEqual(memory.all().map((f) => f.text), ['I am vegetarian']);
  const store = new R.RoutineStore(memory, { now: () => NOW.getTime() });
  const r = store.create(R.parseRoutine('every day at 9 tell me to stretch', { now: NOW }));
  for (let i = 0; i < 60; i++) store.logRun(r.id, { status: 'ok' });
  assert.strictEqual(store.runs(r.id, 100).length, 50); // run history is capped
  memory.close();
  const reopened = new Memory(file); // opening again is a no-op migration
  const again = new R.RoutineStore(reopened);
  assert.deepStrictEqual(again.list().map((x) => [x.label, x.nextRun]), [['Time to stretch', at('2026-10-12T09:00:00')]]);
  reopened.close();
});

test('routines: week summary is plain code over history', () => {
  const now = at('2026-10-16T17:00:00');
  const text = R.formatWeek([
    { at: at('2026-10-14T10:00:00'), title: 'Explain Spring @Transactional', scope: 'docs.spring.io' },
    { at: at('2026-10-14T11:00:00'), title: 'Cheapest oat milk', scope: 'shop.example.com' },
    { at: at('2026-10-13T11:00:00'), title: 'Explain Spring @Transactional', scope: 'docs.spring.io' },
  ], { now, projects: 'You were last working on Loon.' });
  assert.match(text, /3 things asked or looked up, most on Wednesday/);
  assert.match(text, /Mostly on docs\.spring\.io \(2\), shop\.example\.com \(1\)/);
  assert.strictEqual(text.match(/Explain Spring/g).length, 1);
  assert.match(text, /You were last working on Loon\.$/);
  assert.match(R.formatWeek([], { now }), /A quiet week/);
});

test('companion: routine phrasings reach the routine card before Apple Reminders; plain reminders still go there', async () => {
  const { createCompanion } = require('../main/companion');
  const { routines, actions } = rig();
  const companion = createCompanion({
    bridge: { clients: new Set() },
    resolver: {},
    brain: { resetThread() {} },
    ui: { cat() {}, showBubble() {}, hideBubble() {}, bubbleFocused: () => false },
    notes: { files: () => [] },
    actions,
    settings: { personal: {} },
    routines,
  });
  const say = async (question) => {
    const sent = [];
    await companion.run({ id: 1, question }, (type, payload) => sent.push({ type, ...payload }));
    return sent.find((m) => m.type === 'confirm' || m.type === 'action-done');
  };
  assert.strictEqual((await say('remind me to drink water every two hours between 10 and 6')).command.action, 'routine'); // spoken numbers too
  assert.strictEqual((await say('in 20 minutes remind me to stretch')).command.draft.schedule.type, 'once');
  assert.strictEqual((await say('remind me to call mom at 5')).command.action, 'reminder');
  assert.match((await say('show my routines')).message, /No routines yet/);
});
