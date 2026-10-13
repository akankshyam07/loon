// Personalities, cameos and duo mode (renderer/persona.js, renderer/duo.js, DESIGN.md §5.0.3): flavor never changes
// an answer, cameos trigger only where they should, and duo scenes never start while busy and stop on interaction.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const persona = require('../renderer/persona');
const { runScene, createDuoScheduler } = require('../renderer/duo');
const PX = require('../renderer/pixel-sprites');
const { createCompanion } = require('../main/companion');

const catJs = fs.readFileSync(path.join(__dirname, '../renderer/cat.js'), 'utf8');
const values = (node) => (typeof node === 'string' ? [node] : Object.values(node).flatMap(values));
const allLines = (id) => values(persona.PERSONAS[id].lines);

function companionFor(settings) {
  const calls = [];
  const cat = [];
  const companion = createCompanion({
    bridge: { clients: new Set() },
    resolver: { run: async (...args) => { calls.push(args); return { text: 'The error means x is undefined. Check the import.', mood: 'curious', tier: 'local' }; }, counts: {}, lastMemory: [] },
    brain: { resetThread() {}, modelLabel: () => 'fake' },
    ui: { cat: (channel, payload) => cat.push([channel, payload]), showBubble() {}, hideBubble() {}, bubbleFocused: () => false },
    notes: { files: () => [] },
    actions: {},
    settings,
  });
  return { companion, calls, cat };
}
async function answer(settings, task = 'explain_error', text = "TypeError: Cannot read properties of undefined (reading 'map')\n    at render (app.js:12:5)") {
  const { companion, calls, cat } = companionFor(settings);
  const sent = [];
  companion.fromCapture({ text, app: 'Code' });
  await companion.run({ id: 1, task }, (type, payload) => sent.push({ type, ...payload }));
  return { done: sent.find((m) => m.type === 'done'), calls, cameos: cat.filter(([c]) => c === 'cameo').map(([, p]) => p) };
}
const strip = (args) => JSON.parse(JSON.stringify(args, (k, v) => (typeof v === 'function' || k === 'signal' ? undefined : v)));

test('persona never alters the answer, the resolver call or the prompt; flavor rides beside the answer', async () => {
  const runs = [];
  for (const companion of ['luna', 'soju']) for (const cameos of [true, false]) runs.push(await answer({ companion, cameos, personal: {} }));
  for (const run of runs) {
    assert.strictEqual(run.done.text, runs[0].done.text);
    assert.deepStrictEqual(strip(run.calls), strip(runs[0].calls));
    const sentToModel = JSON.stringify(strip(run.calls));
    for (const id of ['luna', 'soju']) for (const line of allLines(id)) assert.ok(!sentToModel.includes(line), `persona line reached the resolver: ${line}`);
    if (run.done.flavor) assert.ok(!run.done.text.includes(run.done.flavor));
  }
  // Soju + a brainy task: Luna's cameo line is the flavor, outside the text.
  assert.ok(allLines('luna').includes(runs[2].done.flavor));
  assert.strictEqual(runs[3].done.flavor, undefined); // cameos off
});

test('cameo triggers: food with Luna calls Soju, brainy with Soju calls Luna; off or sensitive means none', async () => {
  const food = persona.cameoFor({ companion: 'luna', task: 'food_lightest', pageKind: 'menu' });
  assert.deepStrictEqual([food.guest, food.kind], ['soju', 'food']);
  assert.ok(persona.PERSONAS.luna.lines.call.includes(food.call) && persona.PERSONAS.soju.lines.guest.includes(food.line));
  assert.strictEqual(persona.cameoFor({ companion: 'luna', task: 'page_summary', pageKind: 'menu' }).guest, 'soju'); // anything on a menu page
  for (const nudge of ['menu', 'break', 'snack']) assert.strictEqual(persona.cameoFor({ companion: 'luna', nudge }).guest, 'soju');
  for (const task of persona.BRAINY_TASKS) assert.strictEqual(persona.cameoFor({ companion: 'soju', task }).guest, 'luna', task);
  assert.strictEqual(persona.cameoFor({ companion: 'luna', task: 'explain_error' }), null); // Luna handles brainy herself
  assert.strictEqual(persona.cameoFor({ companion: 'soju', task: 'food_veg', pageKind: 'menu' }), null); // Soju handles food himself
  assert.strictEqual(persona.cameoFor({ companion: 'luna', task: 'ask' }), null);
  assert.strictEqual(persona.cameoFor({ companion: 'luna', task: 'food_lightest', enabled: false }), null);
  assert.strictEqual(persona.cameoFor({ companion: 'soju', task: 'find_bug', sensitive: true }), null);

  // Through the companion: the cat window gets the cameo, and a private page in front means none.
  assert.deepStrictEqual((await answer({ companion: 'soju', personal: {} })).cameos.map((c) => c.guest), ['luna']);
  assert.deepStrictEqual((await answer({ companion: 'soju', cameos: false, personal: {} })).cameos, []);
  const { companion, cat } = companionFor({ companion: 'soju', personal: {} });
  companion.onBridgeMessage({ type: 'page', active: true, visible: true, sensitive: true, url: 'https://bank.example/login' });
  companion.fromCapture({ text: 'TypeError: x is undefined', app: 'Code' });
  await companion.run({ id: 2, task: 'explain_error' }, () => {});
  assert.ok(!cat.some(([c]) => c === 'cameo'));
});

test('no flattery in flavor lines: neither cat praises the question or agrees for the sake of it', () => {
  const { stripFlattery } = require('../brain/resolve');
  for (const id of ['luna', 'soju']) {
    for (const text of allLines(id)) {
      assert.doesNotMatch(text, /\b(great|good|excellent|smart|brilliant) (question|point)\b|absolutely right/i, text);
      assert.strictEqual(stripFlattery(`${text} More.`), `${text} More.`, text);
    }
  }
});

test('persona lines and idle weights: every event has words for both cats, weights favor their signatures', () => {
  for (const id of ['luna', 'soju']) {
    for (const event of ['greeting', 'pet', 'selection', 'fileDrop', 'error', 'privacy', 'shopping', 'call', 'guest', 'nudge.menu', 'nudge.break', 'nudge.shopping', 'nudge.code', 'nudge.dense', 'nudge.today']) {
      const said = persona.line(id, event, () => 0.99);
      assert.ok(said && said.length <= 48, `${id} ${event}: "${said}"`);
    }
  }
  assert.strictEqual(persona.line('luna', 'nope'), '');
  assert.ok(persona.flavorFor({ companion: 'luna', task: 'shop_value' }));
  assert.strictEqual(persona.flavorFor({ companion: 'luna', task: 'shop_value', judgmental: false }), null);
  assert.strictEqual(persona.flavorFor({ companion: 'soju', task: 'explain' }), null);

  // Every weighted move exists in cat.js and has a pixel animation for that cat.
  const list = (name) => catJs.match(new RegExp(`const ${name} = \\{([^}]+)\\}`))[1].split(',').map((s) => s.trim());
  const known = new Set([...list('MOVES'), ...list('CHARACTER_MOVES'), 'hop']);
  for (const id of ['luna', 'soju']) {
    for (const move of Object.keys(persona.PERSONAS[id].moves)) {
      assert.ok(known.has(move), `${id}: ${move} is not a cat.js move`);
      assert.ok(PX.animationsFor(id)[PX.MOVE_ANIM[move]], `${id}: ${move} has no animation`);
    }
  }
  const tally = (id) => {
    const counts = {};
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 4000; i++) { const m = persona.pickMove(id, [...known], rand); counts[m] = (counts[m] || 0) + 1; }
    return counts;
  };
  const luna = tally('luna');
  const soju = tally('soju');
  assert.ok(luna.fancyGroom > luna.zoomies * 3 && !luna.eatBowl);
  assert.ok(soju.eatBowl > (soju.stretch || 0) * 2 && soju.zoomies > (luna.zoomies || 0) && !soju.fancyGroom);
  assert.strictEqual(persona.pickMove('soju', ['moonMagic', 'hop'], () => 0), 'hop'); // only what's available
});

// A clock the tests advance by hand.
function fakeClock() {
  let t = 0;
  let id = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimeout: (fn, ms) => { timers.set(++id, { at: t + ms, fn }); return id; },
    clearTimeout: (k) => timers.delete(k),
    pending: () => timers.size,
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [k, v] of timers) if (v.at <= end && (!next || v.at < next[1].at)) next = [k, v];
        if (!next) break;
        timers.delete(next[0]);
        t = next[1].at;
        next[1].fn();
        await new Promise(setImmediate);
      }
      t = end;
      await new Promise(setImmediate);
    },
  };
}

test('duo scheduler: never starts while busy, plays when idle, aborts at once on interaction', async () => {
  const clock = fakeClock();
  let busy = true;
  const steps = [];
  const played = [];
  const duo = createDuoScheduler({
    clock, gap: [1000, 1000], retry: 500, rand: () => 0,
    canStart: () => !busy,
    pick: () => 'zoomies',
    play: (name, signal) => { played.push(name); return runScene(PX.DUO_SCENES[name], { clock, signal, onStep: (s, i) => steps.push(i) }); },
  });
  duo.start();
  await clock.advance(10_000);
  assert.deepStrictEqual(played, [], 'busy: nothing starts');

  busy = false;
  await clock.advance(600);
  assert.deepStrictEqual([played, duo.playing], [['zoomies'], 'zoomies']);
  await clock.advance(150);
  const before = steps.length;
  assert.ok(before >= 2);
  assert.strictEqual(duo.interrupt(), true); // the user clicked
  assert.strictEqual(duo.playing, null);
  await clock.advance(200);
  assert.strictEqual(steps.length, before, 'no beat after an interrupt');

  // It waits a full gap before trying again, and a queued scene (the heart) goes first.
  await clock.advance(500);
  assert.strictEqual(played.length, 1);
  duo.queue('heart', 100);
  await clock.advance(150);
  assert.deepStrictEqual(played, ['zoomies', 'heart']);
  const heartSteps = PX.DUO_SCENES.heart.steps.reduce((ms, s) => ms + (s.ms ?? PX.DUO_SCENES.heart.ms), 0);
  await clock.advance(heartSteps + 10);
  assert.strictEqual(duo.playing, null, 'finished on its own');
  duo.stop();
  await clock.advance(60_000);
  assert.strictEqual(played.length, 2);
});

test('runScene: plays every beat with its timing, resolves false when aborted', async () => {
  const clock = fakeClock();
  const seen = [];
  const done = runScene({ ms: 100, steps: [{}, { ms: 300 }, {}] }, { clock, onStep: (s, i) => seen.push([i, clock.now()]) });
  await clock.advance(1000);
  assert.deepStrictEqual(seen, [[0, 0], [1, 100], [2, 400]]);
  assert.strictEqual(await done, true);
  const controller = new AbortController();
  const aborted = runScene({ ms: 100, steps: [{}, {}, {}] }, { clock, signal: controller.signal, onStep: () => {} });
  controller.abort();
  assert.strictEqual(await aborted, false);
  assert.strictEqual(clock.pending(), 0);
});

test('duo scenes and cameos: 6–10 beats each, both cats drawn with their own palettes and owners', () => {
  for (const [name, scene] of Object.entries(PX.DUO_SCENES)) {
    assert.ok(scene.steps.length >= 6 && scene.steps.length <= 10, `${name}: ${scene.steps.length} beats`);
    scene.steps.forEach((step, i) => {
      const { grid, owner } = PX.composeScene({ width: 84, ...PX.sceneLayers(step, 26, { now: i * 200 }) });
      assert.strictEqual(grid.length, PX.ROWS);
      grid.forEach((row, y) => {
        assert.strictEqual(row.length, 84);
        for (let x = 0; x < row.length; x++) {
          if (row[x] === '.') continue;
          assert.ok(PX.colorsFor(owner[y][x] || 'luna')[row[x]], `${name}#${i}: no color for "${row[x]}"`);
        }
      });
      const who = new Set(owner.flat().filter(Boolean));
      if (step.luna && step.soju) assert.deepStrictEqual([...who].sort(), ['luna', 'soju'], `${name}#${i}`);
    });
  }
  assert.ok(PX.IDLE_SCENES.every((n) => PX.DUO_SCENES[n]) && !PX.IDLE_SCENES.includes('heart'));
  for (const guest of ['luna', 'soju']) {
    const scene = PX.cameoScene(guest);
    assert.deepStrictEqual(scene.steps.filter((s) => s.say).map((s) => s.say), ['call', 'guest']);
    assert.ok(scene.steps.every((s) => !s[persona.other(guest)]), 'the helper stays live during a cameo');
    assert.ok(PX.cameoScene(guest, { present: true }).steps.length < scene.steps.length, 'no run-in when already there');
  }
});
