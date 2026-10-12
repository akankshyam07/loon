// Pixel skin (renderer/pixel-sprites.js): frames are well-formed, the cat.js state machine is fully covered for both
// companions, and every costume is worn on every frame.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const PX = require('../renderer/pixel-sprites');

const CHARACTERS = Object.keys(PX.CHARACTERS);
const catJs = fs.readFileSync(path.join(__dirname, '../renderer/cat.js'), 'utf8');

test('every animation frame is a full grid of known palette characters, for every companion', () => {
  assert.deepStrictEqual(CHARACTERS.sort(), ['luna', 'soju']);
  for (const id of CHARACTERS) {
    const known = new Set(['.', ...Object.keys(PX.colorsFor(id))]);
    for (const [name, anim] of Object.entries(PX.animationsFor(id))) {
      assert.ok(anim.frames.length > 0 && anim.fps > 0 && anim.fps <= 12, `${id}/${name}: low-fps, frame-by-frame`);
      anim.frames.forEach((view, i) => {
        const grid = PX.compose(PX.pickFrame(view, id));
        assert.strictEqual(grid.length, PX.ROWS, `${id}/${name}#${i} rows`);
        for (const row of grid) {
          assert.strictEqual(row.length, PX.W, `${id}/${name}#${i} width`);
          for (const c of row) assert.ok(known.has(c), `${id}/${name}#${i}: unknown palette char "${c}"`);
        }
      });
    }
  }
});

test('hand-drawn maps are rectangular', () => {
  const maps = Object.entries(PX.MAPS).flatMap(([name, map]) => {
    if (Array.isArray(map) && typeof map[0] === 'string') return [[name, map]];
    return Object.entries(map).map(([k, m]) => [`${name}.${k}`, m]);
  });
  for (const costume of Object.values(PX.COSTUMES).filter(Boolean)) {
    for (const view of ['front', 'side', 'back']) maps.push([`${costume.name}.${view}`, costume[view][2]]);
  }
  for (const [name, map] of maps) {
    assert.ok(map.every((row) => row.length === map[0].length), `${name} rows differ in width`);
  }
});

test('the face is locked: the nose stays on the same pixels through idle, blink and look frames', () => {
  const nose = (grid) => grid.map((row) => row.replace(/[^n]/g, '.')).join('\n');
  const still = nose(PX.compose(PX.pickFrame({})));
  for (const view of PX.BASE_ANIMATIONS.idle.frames.concat(PX.BASE_ANIMATIONS.blink.frames, PX.BASE_ANIMATIONS.look.frames)) {
    assert.strictEqual(nose(PX.compose(PX.pickFrame({ ...view, now: 0 }))), still);
  }
});

test('every cat.js state, mood and move maps to a pixel animation for both companions', () => {
  const states = new Set([...catJs.matchAll(/\bstate = '(\w+)'/g)].map((m) => m[1]));
  const moves = catJs.match(/const MOVES = \{([^}]+)\}/)[1].split(',').map((s) => s.trim()).filter(Boolean);
  const moods = Object.keys(eval(`(${catJs.match(/const MOODS = (\{[\s\S]*?\n {2}\});/)[1]})`)); // eslint-disable-line no-eval
  assert.ok(states.size >= 8 && moves.length >= 7 && moods.length >= 10, 'parsed the state machine');
  for (const id of CHARACTERS) {
    const anims = PX.animationsFor(id);
    for (const state of states) assert.ok(anims[PX.STATE_ANIM[state]], `${id}: state "${state}" has no animation`);
    for (const move of [...moves, 'hop']) assert.ok(anims[PX.MOVE_ANIM[move]], `${id}: move "${move}" has no animation`);
    for (const mood of moods) assert.strictEqual(PX.compose(PX.pickFrame({ mood }, id)).length, PX.ROWS, `${id}: mood "${mood}"`);
  }
  for (const travel of ['walk', 'run', 'leap']) assert.strictEqual(PX.pickFrame({ travel }).pose, travel);
});

test('every costume is worn on every frame of every animation (front, side and back views)', () => {
  const costumes = Object.entries(PX.COSTUMES).filter(([, c]) => c);
  assert.ok(costumes.length >= 10);
  for (const [costumeId, costume] of costumes) {
    for (const view of ['front', 'side', 'back']) assert.ok(Array.isArray(costume[view]) && costume[view].length === 3, `${costumeId} has a ${view} anchor`);
    for (const id of CHARACTERS) {
      for (const [name, anim] of Object.entries(PX.animationsFor(id))) {
        anim.frames.forEach((view, i) => {
          const frame = PX.pickFrame({ ...view, costume: costumeId }, id);
          assert.ok(frame.layers.some((l) => l.costume), `${costumeId} missing on ${id}/${name}#${i}`);
          const plain = PX.compose(PX.pickFrame(view, id)).join('');
          assert.notStrictEqual(PX.compose(frame).join(''), plain, `${costumeId} invisible on ${id}/${name}#${i}`);
        });
      }
    }
  }
});

test('seasonal costumes are opt-in dates only', () => {
  assert.strictEqual(PX.seasonalCostume(new Date(2026, 9, 31)), 'witch');
  assert.strictEqual(PX.seasonalCostume(new Date(2026, 11, 24)), 'santa');
  assert.strictEqual(PX.seasonalCostume(new Date(2026, 5, 1)), null);
});

test('the site uses the same sprites as the app', () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  assert.strictEqual(read('docs/pixel-sprites.js'), read('renderer/pixel-sprites.js'), 'copy renderer/pixel-sprites.js to docs/');
});

// The belly-up sprawl draws the whole head stack upside down; undo that to check positions against the head.
const unflip = (l, head) => (l.flipY ? 2 * head.y + 15 - l.y - l.map.length + 1 : l.y);

test('character animations exist per cat, and costumes ride on the head in every new frame (sprawl, bowl, groom)', () => {
  assert.deepStrictEqual(Object.keys(PX.CHARACTERS.soju.animations).sort(), ['bonk', 'eatBowl', 'sprawlNap', 'trip']);
  assert.deepStrictEqual(Object.keys(PX.CHARACTERS.luna.animations).sort(), ['fancyGroom', 'judgeStare', 'perfectLoaf']);
  const scenes = Object.values(PX.DUO_SCENES).flatMap((s) => s.steps).flatMap((step) => ['luna', 'soju'].filter((id) => step[id]).map((id) => [id, step[id]]));
  const frames = ['luna', 'soju'].flatMap((id) => Object.values(PX.CHARACTERS[id].animations).flatMap((a) => a.frames.map((v) => [id, v]))).concat(scenes);
  for (const [costumeId, costume] of Object.entries(PX.COSTUMES).filter(([, c]) => c)) {
    for (const [id, view] of frames) {
      const frame = PX.pickFrame({ ...view, costume: costumeId }, id);
      const head = frame.layers.find((l) => l.map === PX.MAPS.HEAD);
      const worn = frame.layers.find((l) => l.costume);
      assert.ok(worn, `${costumeId} missing on ${id} ${JSON.stringify(view)}`);
      if (!head) continue; // side view: the side anchor
      const [ax, ay, map] = costume.front;
      assert.deepStrictEqual([worn.x - head.x, unflip(worn, head)], [ax, Math.min(head.y + ay, PX.H - map.length)], `${costumeId} off the head on ${id} ${JSON.stringify(view)}`);
    }
  }
  // The locked face stays locked on the new poses: the eyes sit on the same pixels relative to the head.
  const faceAt = (view, id) => {
    const frame = PX.pickFrame(view, id);
    const head = frame.layers.find((l) => l.map === PX.MAPS.HEAD);
    return frame.layers.filter((l) => Object.values(PX.MAPS.EYES).includes(l.map)).map((l) => [l.x - head.x, unflip(l, head) - head.y]);
  };
  for (const view of [{ act: 'sprawl' }, { act: 'eat' }, { act: 'lick' }, { act: 'fancyGroom', step: 3 }]) {
    assert.deepStrictEqual(faceAt(view, 'soju'), faceAt({}, 'soju'), JSON.stringify(view));
  }
});

test('only Luna wears the moon pendant; Soju keeps just his collar, even during moon magic', () => {
  const PX = require('../renderer/pixel-sprites.js');
  for (const glow of [0, 1]) {
    assert.ok(!PX.compose(PX.pickFrame({ glow }, 'soju')).join('').match(/[mMy]/), `soju glow ${glow}`);
  }
  assert.ok(PX.compose(PX.pickFrame({}, 'luna')).join('').includes('m'));
});
