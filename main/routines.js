// Routines scheduler (DESIGN.md §3.19). One timer, armed for the next due routine (at most an hour ahead so clock or
// time-zone changes correct themselves); no polling. tick() is the whole policy and runs on the timer, on wake, on
// startup and whenever a gate opens (Focus ends, Privacy off, Chrome connects, the watched page shows up):
// - missed runs (asleep, Loon closed): the latest one runs once if it's within GRACE, older ones are skipped
// - quiet hours: interval reminders and late catch-ups are skipped; a routine you set for that exact time still runs
// - Focus: non-urgent routines wait until it ends (one delivery per routine, never a pile-up)
// - Privacy: routines that read pages, history or may use the cloud are paused (skipped)
// Delivery is the cat's "?" nudge; the bubble shows the result on click. Every run is in the audit log (metadata only).
const {
  RoutineStore, nextRun, parseRoutine, parseRoutineCommand, matchRoutines, mentionsRoutine, fieldsFor, applyFields, describeSchedule, priceCheck, formatWeek, hostOf,
} = require('../brain/routines');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const GRACE = 2 * HOUR; // ponytail: one catch-up window for every routine; per-routine grace if weekly ones need longer
const DEFER_LIMIT = 6 * HOUR; // longer than the longest Focus session (4 h); price watches wait for the page instead
const MAX_SLEEP = HOUR;
const PRIVACY_PAUSED = new Set(['priceWatch', 'ask', 'weekSummary']); // read pages, may use the cloud, or read history

function inQuiet(quiet, t) {
  if (!quiet?.on || !quiet.start || !quiet.end) return false;
  const d = new Date(t);
  const m = d.getHours() * 60 + d.getMinutes();
  const [sh, sm] = quiet.start.split(':').map(Number);
  const [eh, em] = quiet.end.split(':').map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  return s <= e ? m >= s && m < e : m >= s || m < e;
}

const when = (ms) => new Date(ms).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).replace(/\s/g, ' ');
const firstLine = (text) => String(text || '').replace(/[*_`#>]/g, '').split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 140) || '';
const samePage = (a, b) => {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.origin === y.origin && x.pathname.replace(/\/$/, '') === y.pathname.replace(/\/$/, ''); // ponytail: ignores ?query (tracking params)
  } catch {
    return false;
  }
};

// tasks: { connected(), today(), briefing(project), projects(), products(url) } (products: items, or null when the
// page isn't open in Chrome). ui: { nudge({ kind, item, count }), notify({ title, body, onClick }) | null, open(items) }.
function createRoutines({ memory, settings, tasks, ui, audit = () => {}, now = () => Date.now(), timers = { setTimeout, clearTimeout } }) {
  const store = new RoutineStore(memory, { now });
  const pending = []; // results waiting behind the nudge, newest last, one per routine
  let timer = null;
  let busy = false;
  let again = false;
  let stopped = true;

  const urgent = (r) => r.action === 'reminder' && r.schedule.type === 'once';
  const canNotify = () => Boolean(settings.routineNotifications && ui.notify);
  const setState = (r, patch) => {
    r.state = { ...store.get(r.id).state, ...patch };
    store.update(r.id, { state: r.state });
  };

  function gate(r, due, t) {
    if (settings.privacy && PRIVACY_PAUSED.has(r.action)) return 'paused';
    if (inQuiet(settings.quietHours, t) && (r.schedule.type === 'interval' || t - due > MINUTE)) return 'quiet';
    if (settings.focus && !(urgent(r) && canNotify())) return 'defer';
    if (r.action === 'priceWatch' && !tasks.connected()) return 'defer';
    return 'run';
  }

  function skip(r, due, status, note) {
    store.logRun(r.id, { due, status, note });
    store.update(r.id, { lastStatus: status, lastResult: `Skipped: ${note}` });
    audit({ action: 'routine', kind: r.action, ok: true, status });
  }

  async function perform(r) {
    const p = r.payload || {};
    switch (r.action) {
      case 'notify':
      case 'reminder':
        return { text: p.message };
      case 'ask': // asked in the bubble when opened, so it goes through the normal resolver, confirm cards and history
        return { ask: p.question, text: p.question };
      case 'today':
        return { text: await tasks.today() };
      case 'briefing':
        return { text: await tasks.briefing(p.project || null) };
      case 'weekSummary': {
        const episodes = memory.db.prepare('SELECT at, kind, title, scope FROM episodes WHERE at >= ? ORDER BY at DESC LIMIT 300').all(now() - 7 * 24 * HOUR);
        return { text: formatWeek(episodes, { now: now(), projects: await tasks.projects() }) };
      }
      case 'priceWatch': {
        if (!tasks.connected()) return { defer: "Chrome with the Loon extension isn't connected" };
        const items = await tasks.products(p.url);
        if (items == null) return { defer: `Open ${hostOf(p.url) || 'the page'} in Chrome and I'll check it then` };
        const check = priceCheck(items, r.state.price || null, r.state.price?.name, p.below ?? null);
        if (!check) throw new Error("I couldn't find a price on that page");
        return { text: check.text, silent: !check.drop, state: { price: check.current }, kind: 'priceDrop' };
      }
      default:
        throw new Error(`Unknown routine action: ${r.action}`);
    }
  }

  const itemFor = (r, result) => ({ id: r.id, label: r.label, action: r.action, text: result.text, ask: result.ask || null, kind: result.kind || (['reminder', 'notify'].includes(r.action) ? 'reminder' : 'routine') });

  function deliver(r, result) {
    const item = itemFor(r, result);
    if (r.action === 'reminder' && canNotify()) return ui.notify({ title: 'Loon', body: item.text, onClick: () => ui.open([item]) });
    const old = pending.findIndex((x) => x.id === r.id);
    if (old >= 0) pending.splice(old, 1);
    pending.push(item);
    return renudge();
  }

  function renudge() {
    if (pending.length) ui.nudge({ kind: pending.at(-1).kind, item: pending.at(-1), count: pending.length });
  }

  // manual: "Run now" in Settings; the result opens straight away, even when there's no news.
  async function runOne(r, due, { manual = false } = {}) {
    const started = now();
    try {
      const result = await perform(r);
      if (result.defer) {
        if (!manual) setState(r, { deferred: due });
        return { ok: false, message: `${result.defer}.` };
      }
      store.update(r.id, { lastRun: started, lastStatus: 'ok', lastResult: firstLine(result.text), state: { ...store.get(r.id).state, ...result.state, deferred: null } });
      store.logRun(r.id, { due, status: 'ok', note: result.silent ? 'no news' : 'delivered' });
      audit({ action: 'routine', kind: r.action, ok: true, status: result.silent ? 'quiet' : 'delivered', ms: now() - started, ...(manual ? { manual: true } : {}) });
      // History like a normal answer (never in Privacy mode). Saved questions are logged by the bubble when asked.
      if (result.text && !result.ask && !result.silent && !settings.privacy) memory.logEpisode({ kind: 'routine', title: r.label, text: result.text.slice(0, 300) });
      if (manual) ui.open([itemFor(r, result)]);
      else if (!result.silent) deliver(r, result);
      return { ok: true, message: firstLine(result.text) };
    } catch (err) {
      store.update(r.id, { lastRun: started, lastStatus: 'error', lastResult: `Failed: ${err.message}`.slice(0, 200) });
      store.logRun(r.id, { due, status: 'error', note: err.message });
      audit({ action: 'routine', kind: r.action, ok: false, error: err.message.slice(0, 200) });
      return { ok: false, message: `That didn't work: ${err.message}.` };
    }
  }

  async function tick() {
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      const t = now();
      for (const r of store.list()) {
        if (!r.enabled) continue;
        let due = r.state.deferred ?? null;
        if (due != null && t - due > DEFER_LIMIT && r.action !== 'priceWatch') {
          setState(r, { deferred: null });
          skip(r, due, 'skipped', 'waited too long');
          due = null;
        }
        if (r.nextRun != null && r.nextRun <= t) {
          let last = null;
          let missed = 0;
          let n = r.nextRun;
          while (n != null && n <= t) {
            last = n;
            missed++;
            n = nextRun(r.schedule, n);
          }
          store.update(r.id, { nextRun: n });
          if (t - last > GRACE) skip(r, last, 'skipped', `missed ${missed === 1 ? 'it' : `${missed} times`} while the Mac was asleep or Loon was closed`);
          else {
            if (missed > 1) store.logRun(r.id, { due: r.nextRun, status: 'skipped', note: `${missed - 1} older run${missed > 2 ? 's' : ''} folded into one` });
            due = last; // newest wins: a deferred run and a fresh one become one delivery
          }
        }
        if (due != null) {
          const verdict = gate(r, due, t);
          if (verdict === 'defer') setState(r, { deferred: due });
          else {
            if (r.state.deferred != null) setState(r, { deferred: null });
            if (verdict === 'run') await runOne(r, due);
            else skip(r, due, verdict === 'paused' ? 'paused' : 'skipped', verdict === 'paused' ? 'paused in Privacy mode' : 'quiet hours');
          }
        }
        const fresh = store.get(r.id);
        if (fresh && fresh.schedule.type === 'once' && fresh.nextRun == null && fresh.state.deferred == null) store.update(r.id, { enabled: false });
      }
    } finally {
      busy = false;
      if (!stopped) arm();
    }
    if (again) {
      again = false;
      await tick();
    }
  }

  function arm() {
    timers.clearTimeout(timer);
    const next = Math.min(Infinity, ...store.list().filter((r) => r.enabled && r.nextRun != null).map((r) => r.nextRun));
    timer = timers.setTimeout(() => tick(), Math.min(Math.max(next - now(), 0) + 25, MAX_SLEEP));
    timer?.unref?.();
  }

  // ---------- managing ----------
  function list() {
    return store.list().map((r) => ({ ...r, description: describeSchedule(r.schedule), fields: fieldsFor(r), waiting: r.state.deferred != null }));
  }

  function create(draft) {
    const routine = store.create(draft);
    if (!stopped) arm();
    return routine;
  }

  function update(id, fields) {
    const r = store.get(id);
    if (!r) throw new Error('That routine is gone');
    const next = applyFields(r, fields, new Date(now()));
    const changed = next.action !== r.action || (next.action === 'priceWatch' && next.payload.url !== r.payload.url);
    const routine = store.update(id, { label: next.label, action: next.action, schedule: next.schedule, payload: next.payload, nextRun: nextRun(next.schedule, now()), ...(changed ? { state: {} } : {}) });
    if (!stopped) arm();
    return routine;
  }

  // Turning one back on starts from now: what it would have done while paused is not caught up.
  function setEnabled(id, on) {
    const r = store.get(id);
    if (!r) throw new Error('That routine is gone');
    const routine = store.update(id, { enabled: on, nextRun: on ? nextRun(r.schedule, now()) : r.nextRun, state: { ...r.state, deferred: null } });
    if (!stopped) arm();
    return routine;
  }

  function remove(id) {
    store.remove(id);
    const i = pending.findIndex((x) => x.id === id);
    if (i >= 0) pending.splice(i, 1);
    if (!stopped) arm();
  }

  async function runNow(id) {
    const r = store.get(id);
    if (!r) return { ok: false, message: 'That routine is gone.' };
    if (settings.privacy && PRIVACY_PAUSED.has(r.action)) return { ok: false, message: 'Paused while Privacy mode is on.' };
    return runOne(r, null, { manual: true });
  }

  // Results behind the nudge (or a notification): the bubble shows them all at once.
  function openPending() {
    const items = pending.splice(0);
    if (items.length) ui.open(items);
    return items.length > 0;
  }

  // ---------- typed or spoken commands (companion.command) ----------
  // execute: actions.execute, so changes go through the audit log. Returns true when the text was about routines.
  async function handleText(id, text, bubble, { page = null, execute }) {
    const command = parseRoutineCommand(text);
    if (command?.action === 'routines') {
      bubble('action-done', { id, ok: true, markdown: true, message: formatList(list()) });
      return true;
    }
    if (command) {
      const matches = matchRoutines(store.list(), command.query);
      if (!matches.length) {
        if (!mentionsRoutine(text)) return false; // "turn off privacy mode" and friends aren't about routines
        bubble('action-done', { id, ok: false, message: `I don't have a routine like "${command.query}". Say "show my routines" to see them.` });
        return true;
      }
      if (matches.length > 1) {
        bubble('action-done', { id, ok: false, message: `Which one? ${matches.map((r) => `"${r.label}" (${describeSchedule(r.schedule)})`).join(', ')}.` });
        return true;
      }
      const [r] = matches;
      if (command.action === 'routinePause') bubble('action-done', { id, ...(await execute({ action: 'routinePause', routineId: r.id, on: command.on })) });
      else bubble('confirm', { id, summary: `Delete the routine "${r.label}" (${describeSchedule(r.schedule)})?`, command: { action: 'routineDelete', routineId: r.id } });
      return true;
    }
    const draft = parseRoutine(text, { now: new Date(now()), pageUrl: page && !page.sensitive ? page.url : null });
    if (!draft) return false;
    if (draft.action === 'priceWatch' && page?.sensitive) {
      bubble('action-done', { id, ok: false, message: "That's a private page, so I won't watch it." });
      return true;
    }
    // Creating a routine is persistent configuration: always a confirm card, with every field editable.
    const summary = draft.understood ? `New routine: ${draft.label}, ${describeSchedule(draft.schedule)}` : "Here's what I understood. Fix anything, then ✓.";
    bubble('confirm', { id, summary, command: { action: 'routine', draft, fields: fieldsFor(draft) } });
    return true;
  }

  return {
    store,
    tick,
    poke: () => (stopped ? Promise.resolve() : tick()),
    start() {
      stopped = false;
      return tick();
    },
    stop() {
      stopped = true;
      timers.clearTimeout(timer);
    },
    // A page report from Chrome: a price watch waiting for exactly this page runs now.
    onPage(url) {
      if (!stopped && url && store.list().some((r) => r.enabled && r.action === 'priceWatch' && r.state.deferred != null && samePage(r.payload.url, url))) tick();
    },
    list,
    create,
    createFromCommand: (command) => create(applyFields(command.draft, command.fields, new Date(now()))),
    update,
    setEnabled,
    remove,
    runNow,
    openPending,
    renudge,
    pendingCount: () => pending.length,
    handleText,
  };
}

function formatList(routines) {
  if (!routines.length) return 'No routines yet. Try "every weekday at 8:30 summarize my calendar" or "remind me to drink water every 2 hours between 10 and 6".';
  const lines = ['**Your routines**', ''];
  for (const r of routines) {
    const status = !r.enabled ? (r.schedule.type === 'once' && r.lastRun ? 'done' : 'paused') : r.waiting ? 'waiting' : r.nextRun ? `next ${when(r.nextRun)}` : '';
    lines.push(`- **${r.label}** · ${r.description}${status ? ` · ${status}` : ''}`);
    if (r.lastResult) lines.push(`  _Last: ${r.lastResult.slice(0, 100)}_`);
  }
  lines.push('', '_Pause, edit or delete them in Settings → Routines, or say "pause the water reminder"._');
  return lines.join('\n');
}

module.exports = { createRoutines, inQuiet, formatList, when, GRACE };
