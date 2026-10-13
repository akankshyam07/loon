// Loon's body: drives the pixel skin (renderer/pixel-sprites.js, DESIGN.md §5.0.2) or the classic SVG puppet in
// loon.svg (DESIGN.md §5.0). Both read the same state machine below; only the drawing differs.
// Three layers compose every frame: smoothed targets (mood, pose, gaze), always-on micro motion
// (breathing, tail sway, blinks, twitches), and tweened offsets used by cool moves.
(async () => {
  const DEMO = new URLSearchParams(location.search).get('demo') === '1';
  const MIN = 60_000;
  const TIMING = DEMO
    ? { eat: [45_000, 50_000], nap: [90_000, 95_000], napLength: 20_000, fishTimeout: 30_000, move: [25_000, 45_000], roam: [15_000, 30_000] }
    : { eat: [210 * MIN, 230 * MIN], nap: [50 * MIN, 60 * MIN], napLength: 3 * MIN, fishTimeout: 10 * MIN, move: [20 * MIN, 40 * MIN], roam: [4 * MIN, 8 * MIN] };

  const VIEW_W = 240;
  const VIEW_H = 256;
  const PAD_Y = 1.45; // must match WINDOW_PAD_Y in main.js

  const $ = (selector, root = document) => root.querySelector(selector);
  const stage = $('#stage');
  const catBox = $('#catBox');
  const fxLayer = $('#fx');
  const thought = $('#thought');
  const fish = $('#fish');
  const nudgeButton = $('#nudge');

  catBox.innerHTML = await window.loon.getCatSvg();
  const part = (id) => catBox.querySelector(`#${id}`);
  const P = {
    cat: part('cat'), tail: part('tail'), tailUp: part('tailUp'), tailWrap: part('tailWrap'),
    body: part('body'), bodySit: part('bodySit'), bodyLoaf: part('bodyLoaf'), pawsDown: part('pawsDown'),
    collar: part('collar'), glow: part('moonGlowDisc'), head: part('head'), earL: part('earL'), earR: part('earR'),
    mouthSmile: part('mouthSmile'), mouthFlat: part('mouthFlat'), mouthOpen: part('mouthOpen'),
    pawsUp: part('pawsUp'), whiskers: part('whiskers'),
  };
  const eyes = ['eyeL', 'eyeR'].map((id) => {
    const g = part(id);
    return { base: g.getAttribute('transform'), pupil: $('.pupil', g), lid: $('.lid', g), lidLow: $('.lidLow', g), lash: $('.lash', g), happy: $('.happy', g) };
  });

  // ---------- pixel skin ----------
  // The SVG stays loaded (hidden) so switching styles in Settings is instant and nothing below needs two code paths.
  const PX = window.LoonPixel;
  const PERSONA = window.LoonPersona;
  // One canvas spans the whole window so a second cat (duo mode, cameos) can stand beside the helper.
  const canvas = Object.assign(document.createElement('canvas'), { id: 'pixelCat' });
  stage.insertBefore(canvas, catBox);
  const pen = canvas.getContext('2d');
  let look = { catStyle: 'pixel', companion: 'luna', costume: 'none', seasonalCostumes: false, retroSounds: false, cameos: true, duo: false, ...(await window.loon.catLook()) };
  const pixel = () => look.catStyle !== 'classic';
  let cell = 1; // CSS px per sprite pixel: an integer, so the art stays crisp at S/M/L
  let scene = null; // the frame on screen ({ grid, owner }); also the hit mask, per cat
  let hostCol = 0; // sprite column of the helper's 32×32 art in the window-wide grid
  let sceneW = PX.W;
  let canvasLeft = 0;
  let hostOverride = null; // view patch for character moves (Soju's bowl, Luna's fancy groom…)
  let sceneStep = null; // current beat of an idle duo scene
  let cameo = null; // { guest, step, controller } while the other cat pops in
  let lastKey = '';
  let travel = null; // walk | run | leap while the window moves
  let facing = 1;
  let fidget = null; // groom
  let currentMove = null;
  let fileOver = false;
  let mouthKind = 'smile';

  // ---------- layout ----------
  let scale = 1;
  let box = { left: 0, top: 0, width: 0, height: 0 };
  function layout() {
    const catH = stage.clientHeight / PAD_Y;
    const catW = catH * (VIEW_W / VIEW_H);
    scale = catH / VIEW_H;
    box = { left: (stage.clientWidth - catW) / 2, top: stage.clientHeight - catH, width: catW, height: catH };
    Object.assign(catBox.style, { width: `${catW}px`, height: `${catH}px`, marginLeft: `${-catW / 2}px` });
    cell = Math.max(1, Math.floor(catH / PX.ROWS));
    // the helper sits exactly where it always did; whole sprite columns fill the rest of the window on both sides
    const hostLeft = box.left + (catW - PX.W * cell) / 2;
    hostCol = Math.floor(hostLeft / cell);
    sceneW = hostCol + PX.W + Math.floor((stage.clientWidth - hostLeft - PX.W * cell) / cell);
    canvasLeft = hostLeft - hostCol * cell;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = sceneW * cell * dpr;
    canvas.height = PX.ROWS * cell * dpr;
    pen.imageSmoothingEnabled = false;
    Object.assign(canvas.style, { width: `${sceneW * cell}px`, height: `${PX.ROWS * cell}px`, left: `${canvasLeft}px` });
    lastKey = '';
  }
  window.addEventListener('resize', layout);
  layout();

  // SVG user units → stage pixels, following the cat's current move offset.
  const toStage = (x, y) => ({ x: box.left + (x + M.catX) * scale, y: box.top + (y + M.catY) * scale });

  // ---------- animation state ----------
  // T = targets, S = smoothed values that chase T, M = tweened move offsets, FX = short-lived micro motion.
  const T = { headRot: 0, headX: 0, headY: 0, earL: 0, earR: 0, lookX: 0, lookY: 0, pupil: 1, lidL: 0.08, lidR: 0.08, angL: 0, angR: 0, lowL: 0, lowR: 0, happy: 0, bodySy: 1, glow: 0 };
  const S = { ...T };
  const M = { catX: 0, catY: 0, catSx: 1, catSy: 1, catRot: 0, bodyRot: 0 };
  const FX = { blink: 0, twitchL: 0, twitchR: 0 };
  const SPEED = { lookX: 16, lookY: 16, pupil: 10, lidL: 14, lidR: 14, happy: 12 };

  let state = 'idle'; // idle | petted | napping | eating | thinking | talking | acting | move
  let pose = 'sit';
  let mood = 'neutral';
  let moodTilt = 0;
  let idleTilt = 0;
  let poseHeadY = 0;
  let poseBodySy = 1;
  let gaze = { x: 0, y: 0, rot: 0 }; // from the cursor
  let lookOverride = null; // {x, y} forces where the eyes point
  let bubbleOpen = false;
  let privacy = false; // a private page is in front: paws over the eyes, no tricks
  let focusMode = false; // Focus mode (§3.15): napping in a loaf, no tricks, hints or reminders
  let dragging = false;
  const IDLE_TAIL = { amp: 3, period: 4200 };
  let tailStyle = IDLE_TAIL;

  const MOODS = {
    neutral: { lid: 0.08, pupil: 1, ears: 0, tilt: 0, mouth: 'smile' },
    happy: { lid: 1, happy: 1, ears: -3, tilt: 5, mouth: 'smile' },
    curious: { lid: 0, pupil: 1.18, ears: -6, tilt: 9, mouth: 'smile' },
    judgy: { lid: 0.52, pupil: 0.95, ears: 4, tilt: 0, mouth: 'flat' },
    sleepy: { lid: 0.62, ang: -9, ears: 9, tilt: -3, mouth: 'smile' },
    asleep: { lid: 1, ears: 10, tilt: -2, mouth: 'smile' },
    suspicious: { lid: 0.45, ang: 12, pupil: 0.9, ears: 7, tilt: 0, mouth: 'flat' },
    focused: { lid: 0.24, pupil: 0.85, ears: -4, tilt: 0, mouth: 'flat' },
    protective: { lid: 0.18, ang: 14, pupil: 0.9, ears: -8, tilt: 0, mouth: 'flat' },
    confused: { lidL: 0.34, lidR: 0, earL: 12, earR: -4, tilt: -11, mouth: 'flat' },
    wide: { lid: 0, pupil: 1.3, ears: -8, tilt: 0, mouth: 'smile' },
  };

  // Inline style must be explicit: an empty value would fall back to the SVG's display="none" attribute.
  const show = (el, on) => { el.style.display = on ? 'inline' : 'none'; };

  function setMouth(kind) {
    mouthKind = kind;
    show(P.mouthSmile, kind === 'smile');
    show(P.mouthFlat, kind === 'flat');
    show(P.mouthOpen, kind === 'open');
  }

  function setMood(name) {
    const m = MOODS[name] || MOODS.neutral;
    mood = MOODS[name] ? name : 'neutral';
    T.lidL = m.lidL ?? m.lid ?? 0.08;
    T.lidR = m.lidR ?? m.lid ?? 0.08;
    T.angL = m.ang ?? 0;
    T.angR = -(m.ang ?? 0);
    T.lowL = T.lowR = m.low ?? 0;
    T.pupil = m.pupil ?? 1;
    T.happy = m.happy ?? 0;
    T.earL = m.earL ?? m.ears ?? 0;
    T.earR = m.earR ?? m.ears ?? 0;
    moodTilt = m.tilt ?? 0;
    setMouth(m.mouth || 'smile');
  }

  function setPose(name) {
    pose = name;
    show(P.bodySit, name !== 'loaf');
    show(P.bodyLoaf, name === 'loaf');
    show(P.tailUp, name !== 'loaf');
    show(P.tailWrap, name === 'loaf');
    show(P.pawsUp, name === 'pawsUp');
    show(P.pawsDown, name !== 'pawsUp');
    poseHeadY = { loaf: 54, crouch: 12 }[name] ?? 0;
    poseBodySy = name === 'crouch' ? 0.9 : 1;
  }

  // ---------- tweens ----------
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const easeIn = (t) => t * t * t;
  const easeOut = (t) => 1 - (1 - t) ** 3;
  const easeOutBack = (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
  const tweens = new Set();
  function tween(obj, key, to, duration, ease = easeInOut) {
    for (const tw of tweens) if (tw.obj === obj && tw.key === key) { tweens.delete(tw); tw.resolve(); }
    return new Promise((resolve) => tweens.add({ obj, key, from: obj[key], to, start: performance.now(), duration, ease, resolve }));
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const later = (fn, [min, max]) => setTimeout(fn, rand(min, max));

  // ---------- render loop ----------
  const tf = (x, y, rot, sx, sy, px, py) =>
    `translate(${x.toFixed(2)} ${y.toFixed(2)}) translate(${px} ${py}) rotate(${rot.toFixed(2)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${-px} ${-py})`;

  let lastFrame = performance.now();
  let lastCursorMove = 0;
  // A timer instead of requestAnimationFrame: rAF wakes 120 times a second on ProMotion screens even when
  // there is nothing to draw. Each frame repaints the SVG (~0.7% CPU per fps on an M1 Pro), so:
  // 30fps for real motion, 15fps for eye tracking, 5fps idle breathing, 2fps when the user is away, none when locked.
  let paused = false;
  function nextDelay(now) {
    if (paused) return 1000;
    if (tweens.size > 0 || state !== 'idle') return 33;
    if (sceneStep || cameo || hostOverride) return 66; // duo scenes and cameos step at their own pace; repaint only on change
    if (fidget) return 100;
    if (bubbleOpen || now - lastCursorMove < 800) return 66; // eyes following the cursor
    return now - lastCursorMove > 2 * MIN ? 500 : 200;
  }
  function loop() {
    const now = performance.now();
    if (!paused) frame(now);
    setTimeout(loop, nextDelay(now));
  }
  window.loon.onPower(({ paused: p }) => { paused = p; if (p) interruptDuo(); });

  function frame(now) {
    const dt = Math.min(now - lastFrame, 200);
    lastFrame = now;

    for (const tw of tweens) {
      const t = Math.min(1, (now - tw.start) / tw.duration);
      tw.obj[tw.key] = tw.from + (tw.to - tw.from) * tw.ease(t);
      if (t === 1) { tweens.delete(tw); tw.resolve(); }
    }

    const look = lookOverride || gaze;
    T.lookX = look.x;
    T.lookY = look.y;
    T.headX = look.x * 0.5;
    T.headRot = moodTilt + idleTilt + (lookOverride ? 0 : gaze.rot);
    T.headY = poseHeadY;
    T.bodySy = poseBodySy;
    if (state === 'thinking' || state === 'acting') T.glow = 0.55 + 0.35 * Math.sin(now / (state === 'acting' ? 160 : 260));

    const k = (speed) => 1 - Math.exp((-dt / 1000) * speed);
    for (const key in T) S[key] += (T[key] - S[key]) * k(SPEED[key] || 9);
    if (pixel()) { drawPixel(now); return; }

    const napping = state === 'napping';
    const breathPeriod = napping ? 5200 : 3600;
    const breath = Math.sin((now / breathPeriod) * Math.PI * 2);
    const bodySy = S.bodySy * (1 + breath * (napping ? 0.022 : 0.012));
    const headY = S.headY - breath * (napping ? 1.2 : 0.6);
    const sway = Math.sin((now / tailStyle.period) * Math.PI * 2) * tailStyle.amp;

    P.cat.setAttribute('transform', tf(M.catX, M.catY, M.catRot, M.catSx, M.catSy, 110, M.catRot ? 150 : 250));
    P.body.setAttribute('transform', tf(0, 0, M.bodyRot, 1, bodySy, 110, 239));
    P.collar.setAttribute('transform', `translate(${(S.headX * 0.4).toFixed(2)} ${(headY * 0.9).toFixed(2)})`);
    const headTf = tf(S.headX, headY, S.headRot, 1, 1, 110, 126);
    P.head.setAttribute('transform', headTf);
    P.whiskers.setAttribute('transform', headTf);
    P.earL.setAttribute('transform', tf(0, 0, -(S.earL + FX.twitchL), 1, 1, 80, 58));
    P.earR.setAttribute('transform', tf(0, 0, S.earR + FX.twitchR, 1, 1, 140, 58));
    P.tail.setAttribute('transform', tf(0, 0, sway, 1, 1, 156, 228));
    P.glow.setAttribute('opacity', Math.max(0, Math.min(1, S.glow)).toFixed(3));

    const lids = [[S.lidL, S.angL, S.lowL], [S.lidR, S.angR, S.lowR]];
    eyes.forEach((eye, i) => {
      const [lidTarget, angle, low] = lids[i];
      const lid = Math.max(lidTarget, FX.blink, S.happy);
      const drop = lid * 40;
      eye.lid.setAttribute('transform', tf(0, drop, angle, 1, 1, 0, -20));
      eye.lidLow.setAttribute('transform', `translate(0 ${(-low * 20).toFixed(2)})`);
      eye.pupil.setAttribute('transform', `translate(${S.lookX.toFixed(2)} ${S.lookY.toFixed(2)}) scale(${S.pupil.toFixed(3)})`);
      eye.happy.setAttribute('opacity', Math.max(0, S.happy * 2 - 1).toFixed(3));
      eye.lash.setAttribute('opacity', lid > 0.92 && S.happy < 0.5 ? '1' : '0');
    });
  }
  // Pixel frames come from the same live state; a frame is drawn only when it differs from the one on screen.
  const RIM = 'rgba(255, 240, 250, 0.28)'; // faint light edge so a black cat reads on a dark desktop
  function wornCostume() {
    if (look.costume && look.costume !== 'none') return look.costume;
    return (look.seasonalCostumes && PX.seasonalCostume()) || 'none';
  }
  // The other cat, idling beside the helper in duo mode: its own blinks, glances at the helper, naps when the
  // helper naps or Focus mode is on, covers its eyes on private pages, and walks along when the window moves.
  const side = { blinkUntil: 0, happyUntil: 0, glance: false };
  function sidekickView(now) {
    if (focusMode || state === 'napping') return { now: now + 700, pose: 'loaf', state: 'napping', mood: 'asleep', lidL: 1, lidR: 1, costume: wornCostume() };
    if (privacy) return { now: now + 700, pose: 'pawsUp', mood: 'protective', costume: wornCostume() };
    const toHost = look.companion === 'luna' ? -6 : 6;
    const happy = now < side.happyUntil;
    const lid = now < side.blinkUntil ? 1 : 0.08;
    return {
      now: now + 700, tailPeriod: 4200, travel, facing, costume: wornCostume(), lidL: lid, lidR: lid, happy: happy ? 1 : 0, mood: happy ? 'happy' : 'neutral',
      look: side.glance ? { x: toHost, y: 0 } : { x: S.lookX, y: S.lookY },
    };
  }
  setInterval(() => {
    const now = performance.now();
    if (Math.random() < 0.5) side.blinkUntil = now + 300;
    side.glance = Math.random() < 0.3;
  }, 3200);
  const lunaColumn = () => hostCol - (look.companion === 'luna' ? 0 : PX.GAP);
  const otherCat = () => PERSONA.other(look.companion);

  function drawPixel(now) {
    const hostView = {
      now, state, pose, mood, move: currentMove, look: { x: S.lookX, y: S.lookY },
      lidL: Math.max(S.lidL, FX.blink), lidR: Math.max(S.lidR, FX.blink), happy: S.happy, mouth: mouthKind,
      twitchL: FX.twitchL, twitchR: FX.twitchR, glow: S.glow, tailPeriod: tailStyle.period, travel, facing,
      spin: M.catRot, sy: M.catSy, bodyRot: M.bodyRot, privacy, dragging, fileOver, fidget, costume: wornCostume(), ...hostOverride,
    };
    // whole-sprite moves snap to the pixel grid: stepped, never sub-pixel
    const live = { [look.companion]: { view: hostView, dx: Math.round((M.catX * scale) / cell), dy: Math.round((M.catY * scale) / cell) } };
    if (look.duo) live[otherCat()] = { view: sidekickView(now) };
    const step = cameo?.step || sceneStep || {};
    const costume = wornCostume();
    const next = PX.composeScene({ width: sceneW, ...PX.sceneLayers(step, lunaColumn(), { now, costumes: { luna: costume, soju: costume }, live }) });
    const key = `${look.companion}|${next.grid.join('')}`;
    if (key === lastKey) return;
    lastKey = key;
    scene = next;
    PX.drawScene(pen, scene, canvas.width / sceneW, { rim: RIM });
  }
  // Transparent sprite pixels are not the cat: clicks there go to the app behind. whoAt says which cat it was.
  function cellAt(x, y) {
    const r = canvas.getBoundingClientRect();
    return [Math.floor((y - r.top) / cell), Math.floor((x - r.left) / cell)];
  }
  function opaqueAt(x, y) {
    if (!scene || !pixel()) return false;
    const [row, col] = cellAt(x, y);
    const c = scene.grid[row]?.[col];
    return Boolean(c) && c !== '.' && c !== 'z';
  }
  function whoAt(x, y) {
    if (!scene || !pixel()) return look.companion;
    const [row, col] = cellAt(x, y);
    return scene.owner[row]?.[col] || look.companion;
  }
  function applyLook(next) {
    const wasDuo = look.duo;
    look = { ...look, ...next };
    if (look.duo && !wasDuo) duo.start();
    if (!look.duo && wasDuo) { duo.stop(); sceneStep = null; }
    document.body.classList.toggle('pixel', pixel());
    catBox.querySelector('svg').style.visibility = pixel() ? 'hidden' : ''; // hidden, not removed: #headShape keeps its box
    canvas.hidden = !pixel();
    lastKey = '';
    if (!paused) frame(performance.now());
  }
  // ---------- duo mode (§5.0.3): idle-only scenes; any interaction stops them on the spot ----------
  const duo = window.LoonDuo.createDuoScheduler({
    canStart: () => look.duo && pixel() && !paused && state === 'idle' && !bubbleOpen && !dragging && !press && !privacy && !focusMode && !cameo && !fidget && !hostOverride,
    pick: () => PX.IDLE_SCENES[Math.floor(Math.random() * PX.IDLE_SCENES.length)],
    play: (name, signal) => window.LoonDuo.runScene(PX.DUO_SCENES[name], { signal, onStep: (step) => { sceneStep = step; } }).finally(() => { if (!cameo) sceneStep = null; }),
    gap: DEMO ? [8_000, 15_000] : [90_000, 240_000],
  });
  function interruptDuo() {
    if (duo.interrupt() || sceneStep) { sceneStep = null; lastKey = ''; }
  }
  if (look.duo) duo.start();

  window.loon.onCatLook(applyLook);
  applyLook({});
  loop();

  // Retro sounds (off by default): tiny square-wave blips, made on the fly with WebAudio.
  let blipContext = null;
  function blip(notes, length = 0.07) {
    if (!look.retroSounds) return;
    blipContext ??= new AudioContext();
    const start = blipContext.currentTime;
    notes.forEach((freq, i) => {
      const osc = Object.assign(blipContext.createOscillator(), { type: 'square' });
      osc.frequency.value = freq;
      const gain = blipContext.createGain();
      gain.gain.value = 0.04;
      osc.connect(gain).connect(blipContext.destination);
      osc.start(start + i * length);
      osc.stop(start + (i + 1) * length);
    });
  }

  // ---------- micro motion ----------
  async function blink() {
    if (FX.blink > 0) return;
    await tween(FX, 'blink', 1, 70, easeIn);
    await wait(40);
    await tween(FX, 'blink', 0, 120, easeOut);
  }
  (function scheduleBlink() {
    setTimeout(async () => {
      if (state !== 'napping') {
        await blink();
        if (Math.random() < 0.15) { await wait(120); await blink(); }
      }
      scheduleBlink();
    }, rand(2500, 6000));
  })();

  (function scheduleTwitch() {
    setTimeout(async () => {
      const key = Math.random() < 0.5 ? 'twitchL' : 'twitchR';
      await tween(FX, key, 14, 60, easeOut);
      await tween(FX, key, 0, 200, easeInOut);
      scheduleTwitch();
    }, rand(4000, 11000));
  })();

  (function scheduleTilt() {
    setTimeout(() => {
      if (state === 'idle' && !bubbleOpen && !sceneStep && pixel() && Math.random() < (PERSONA.PERSONAS[look.companion]?.groomChance ?? 0.4)) {
        fidget = 'groom'; // the pixel cat has no head tilt; it grooms a paw instead
        setTimeout(() => { fidget = null; }, 1900);
      } else if (state === 'idle' && !bubbleOpen) {
        idleTilt = rand(4, 7) * (Math.random() < 0.5 ? -1 : 1);
        setTimeout(() => { idleTilt = 0; }, 1600);
      }
      scheduleTilt();
    }, rand(9000, 20000));
  })();

  // ---------- gaze ----------
  let lastCursor = null;
  window.loon.onCursor(({ cursor, win }) => {
    lastCursor = cursor;
    lastCursorMove = performance.now();
    const eye = toStage(110, 86 + S.headY);
    const dx = cursor.x - (win.x + eye.x);
    const dy = cursor.y - (win.y + eye.y);
    const dist = Math.hypot(dx, dy) || 1;
    const reach = dist / (dist + 120); // near cursor: small offset, far: full
    gaze = { x: (dx / dist) * reach * 6, y: (dy / dist) * reach * 4.5, rot: Math.max(-1, Math.min(1, dx / 600)) * 3 };
  });
  // When the cursor has been still for a while, let the eyes wander a little.
  setInterval(() => {
    if (performance.now() - lastCursorMove > 7000 && state === 'idle' && !lookOverride) {
      gaze = Math.random() < 0.4 ? { x: 0, y: 0, rot: 0 } : { x: rand(-5, 5), y: rand(-2, 3), rot: rand(-2, 2) };
    }
  }, 3500);

  // ---------- particles ----------
  const STAR = '<svg viewBox="0 0 24 24"><path fill="COLOR" stroke="#557d4c" stroke-width="1.4" stroke-linejoin="round" d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0Z"/></svg>';
  const SPARKLE_COLORS = ['#9cc48f', '#b9dcaa', '#e8f5de', '#eef1f4'];
  // Pixel skin: chunky pixel hearts while petted, pixel sparkles otherwise.
  const PX_STAR = '<svg viewBox="0 0 5 5" shape-rendering="crispEdges"><path fill="COLOR" d="M2 0h1v2h2v1H3v2H2V3H0V2h2z"/></svg>';
  const PX_HEART = '<svg viewBox="0 0 7 6" shape-rendering="crispEdges"><path fill="COLOR" d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z"/><path fill="#fff" d="M1 1h1v1H1z"/></svg>';
  const PX_COLORS = { heart: ['#ff8fb8', '#ff6f9f'], star: ['#ffd166', '#80e27e', '#b9a4ff', '#fff4c8'] };
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  function sparkle(x, y, { dx = rand(-16, 16), dy = rand(-55, -35), size = rand(13, 20), duration = rand(1.1, 1.5) } = {}) {
    const el = document.createElement('div');
    el.className = pixel() ? 'sparkle px' : 'sparkle';
    if (!pixel()) el.innerHTML = STAR.replace('COLOR', pick(SPARKLE_COLORS));
    else if (state === 'petted') el.innerHTML = PX_HEART.replace('COLOR', pick(PX_COLORS.heart));
    else el.innerHTML = PX_STAR.replace('COLOR', pick(PX_COLORS.star));
    if (pixel()) size = Math.max(10, Math.round(size / 5) * 5); // whole sprite pixels
    Object.assign(el.style, { left: `${x}px`, top: `${y}px` });
    el.style.setProperty('--dx', `${dx}px`);
    el.style.setProperty('--dy', `${dy}px`);
    el.style.setProperty('--size', `${size}px`);
    el.style.setProperty('--dur', `${duration}s`);
    fxLayer.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
  function sparklesAround(svgX, svgY, count, spread = 40) {
    for (let i = 0; i < count; i++) {
      const p = toStage(svgX + rand(-spread, spread), svgY + rand(-spread / 2, spread / 3));
      setTimeout(() => sparkle(p.x, p.y), i * 70);
    }
  }
  function burst(count, radius) {
    const c = toStage(110, 142);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(-0.2, 0.2);
      sparkle(c.x, c.y, { dx: Math.cos(a) * radius * scale, dy: Math.sin(a) * radius * scale - 10, size: rand(14, 22), duration: rand(1.2, 1.6) });
    }
  }
  function zzz() {
    const p = toStage(150, 60 + S.headY);
    const el = document.createElement('div');
    el.className = 'zzz';
    el.textContent = 'z';
    el.style.setProperty('--size', `${Math.round(rand(11, 16) * scale * 1.6)}px`);
    Object.assign(el.style, { left: `${p.x}px`, top: `${p.y}px` });
    fxLayer.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  // Pixel "!" and "?" pops over the head (pixel skin only).
  function pop(text) {
    if (!pixel()) return;
    const p = toStage(170, 40 + S.headY);
    const el = Object.assign(document.createElement('div'), { className: 'pop', textContent: text });
    Object.assign(el.style, { left: `${p.x}px`, top: `${p.y}px` });
    fxLayer.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
    blip(text === '!' ? [988, 1319] : [659, 523]);
  }

  // A tiny speech balloon over one cat's head for persona lines (reactions, nudges, cameos). Flavor only: it never
  // carries answer text. A reaction repeats at most every 20 s so it stays charming.
  const sayBox = $('#say');
  const saidAt = {};
  let sayTimer = null;
  function say(text, who = look.companion, { event = null, ms = 2600 } = {}) {
    if (!text) return;
    const now = performance.now();
    if (event) {
      if (now - (saidAt[event] || -1e9) < 20_000) return;
      saidAt[event] = now;
    }
    const at = cameo?.step || sceneStep || {};
    const col = lunaColumn() + (who === 'luna' ? at.lx ?? 0 : at.sx ?? PX.GAP) + PX.W / 2;
    sayBox.textContent = text;
    sayBox.hidden = false;
    Object.assign(sayBox.style, { left: '0px', width: '' }); // measure at full width, then pin that width and place
    sayBox.style.width = `${Math.ceil(sayBox.getBoundingClientRect().width) + 1}px`; // rounding down would re-wrap it
    const half = sayBox.offsetWidth / 2;
    const x = Math.min(Math.max(canvasLeft + col * cell, half + 4), stage.clientWidth - half - 4);
    Object.assign(sayBox.style, { left: `${x}px`, top: `${Math.max(sayBox.offsetHeight + 2, stage.clientHeight - (PX.ROWS - PX.TOP - 1) * cell)}px` });
    thought.style.visibility = 'hidden'; // the line stands in for the thinking dots while it shows
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { sayBox.hidden = true; thought.style.visibility = ''; }, ms);
  }
  const sayLine = (event, who = look.companion, opts = {}) => say(PERSONA.line(who, event), who, { event: event.split('.')[0], ...opts });

  // ---------- interaction: click-through, drag, pet, click ----------
  let ignoring = true;
  const setIgnore = (ignore) => {
    if (ignore !== ignoring) { ignoring = ignore; window.loon.setIgnoreMouse(ignore); }
  };
  const overCat = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (el?.closest('.interactive')) return true;
    return pixel() ? opaqueAt(x, y) : Boolean(el?.closest('#cat'));
  };
  // The same handlers serve the SVG (#cat) and the pixel canvas; only the visible one gets events.
  const onCat = (type, handler) => { for (const el of [P.cat, canvas]) el.addEventListener(type, handler); };
  let press = null;
  document.addEventListener('mousemove', (e) => {
    if (press) return;
    const over = overCat(e.clientX, e.clientY);
    setIgnore(!over);
    canvas.style.cursor = over ? 'pointer' : '';
  });
  document.addEventListener('mouseleave', () => { if (!press) setIgnore(true); });

  let petTimer = null;
  onCat('contextmenu', (e) => { e.preventDefault(); if (!pixel() || opaqueAt(e.clientX, e.clientY)) window.loon.showMenu(); });
  onCat('pointerdown', (e) => {
    if (e.button !== 0 || (pixel() && !opaqueAt(e.clientX, e.clientY))) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    interruptDuo();
    press = { cx: e.clientX, cy: e.clientY, who: whoAt(e.clientX, e.clientY) };
    clearTimeout(homeTimer); // the user has the cat now; walk home later, if at all
    petTimer = setTimeout(startPet, 320);
  });
  onCat('pointermove', (e) => {
    if (!press || dragging || state === 'petted') return;
    if (Math.hypot(e.clientX - press.cx, e.clientY - press.cy) > 9) { // trackpad jitter on a click is not a drag
      clearTimeout(petTimer);
      dragging = true;
      cameo?.controller.abort();
      window.loon.dragStart(press.cx, press.cy);
      setMood('wide');
      pop('!');
      tween(M, 'catSy', 1.07, 150);
      tween(M, 'catSx', 0.95, 150);
    }
  });
  onCat('pointerup', async (e) => {
    clearTimeout(petTimer);
    const wasPress = press;
    press = null;
    if (!wasPress) return;
    if (dragging) {
      dragging = false;
      window.loon.dragEnd();
      await squash();
      setMood('neutral');
    } else if (state === 'petted') {
      endPet();
    } else if (wasPress.who !== look.companion) {
      sidekickPet(wasPress.who);
    } else {
      onCatClick();
    }
    setIgnore(!overCat(e.clientX, e.clientY));
  });
  // Capture can end without a pointerup (app switch, system gesture, a cancelled pointer). Without this the press
  // stays open: main keeps gluing the window to the cursor and tricks, naps and clicks are refused until the next click.
  onCat('lostpointercapture', async () => {
    clearTimeout(petTimer);
    if (!press) return; // the normal case: pointerup already handled it
    press = null;
    if (dragging) {
      dragging = false;
      window.loon.dragEnd();
      await squash();
      setMood('neutral');
    } else if (state === 'petted') {
      endPet();
    }
    setIgnore(true);
  });

  async function squash() {
    await Promise.all([tween(M, 'catSy', 0.87, 80), tween(M, 'catSx', 1.09, 80)]);
    await Promise.all([tween(M, 'catSy', 1, 240, easeOutBack), tween(M, 'catSx', 1, 240, easeOutBack)]);
  }

  // The other cat in duo mode is not the helper: a click just makes it happy.
  function sidekickPet(who) {
    side.happyUntil = performance.now() + 1500;
    blip([659, 988]);
    sayLine('pet', who);
  }

  function onCatClick() {
    if (wakeMove) return wakeMove(); // Soju dozing belly-up wakes on a click
    if (state === 'napping') return wakeUp();
    if (state === 'move' || state === 'eating') return;
    window.loon.openBubble();
  }

  let petSparkles = null;
  function startPet() {
    if (!press || state !== 'idle' || press.who !== look.companion) return;
    state = 'petted';
    sayLine('pet');
    setMood('happy');
    idleTilt = 7;
    tailStyle = { amp: 3, period: 4200 };
    sparklesAround(110, 70, 2);
    blip([659, 988]);
    petSparkles = setInterval(() => sparklesAround(110, 70, 1, 50), 280);
  }
  function endPet() {
    clearInterval(petSparkles);
    idleTilt = 0;
    tailStyle = IDLE_TAIL;
    state = 'idle';
    setTimeout(() => { if (state === 'idle') setMood('neutral'); }, 600);
    if (Math.random() < 0.25) setTimeout(() => doMove('moonMagic'), 900);
  }

  // ---------- cool moves (DESIGN.md §5.0.1) ----------
  async function moonMagic() {
    setMood('wide');
    T.glow = 1;
    blip([523, 659, 784, 1047], 0.09);
    await wait(450);
    burst(10, 55);
    await wait(320);
    moodTilt = 8;
    burst(8, 85);
    await wait(700);
    setMood('happy');
    sparklesAround(110, 90, 3);
    await wait(900);
    T.glow = 0;
  }

  async function pounce() {
    const { win, cursor } = await window.loon.windowInfo();
    let dx = cursor.x - (win.x + win.width / 2);
    dx = Math.abs(dx) < 30 ? 0 : Math.max(-420, Math.min(420, dx));
    setMood('focused');
    lookOverride = { x: Math.sign(dx) * 5, y: 1 };
    setPose('crouch');
    await wait(380);
    for (let i = 0; i < 4; i++) await tween(M, 'bodyRot', i % 2 ? -2.5 : 2.5, 110);
    await tween(M, 'bodyRot', 0, 80);
    await Promise.all([tween(M, 'catSy', 1.12, 90), tween(M, 'catSx', 0.92, 90)]);
    const duration = dx ? Math.min(650, 300 + Math.abs(dx) * 0.6) : 380;
    tween(M, 'catSy', 1, duration * 0.8);
    tween(M, 'catSx', 1, duration * 0.8);
    travel = 'leap';
    await window.loon.animateWindow({ dx, duration, arc: 55 });
    travel = null;
    setPose('sit');
    lookOverride = null;
    await squash();
    setMood('happy');
    sparklesAround(110, 220, 4, 50);
    await wait(900);
  }

  async function edgePeek() {
    setMood('curious');
    await wait(300);
    await tween(M, 'catY', 270, 420, easeIn);
    await wait(1300);
    setMood('wide');
    lookOverride = { x: 0, y: -2 };
    await tween(M, 'catY', 150, 520, easeOut);
    await wait(300);
    lookOverride = { x: -5, y: -1 };
    await wait(550);
    lookOverride = { x: 5, y: -1 };
    await wait(550);
    lookOverride = { x: 0, y: -1 };
    await blink();
    await wait(450);
    await tween(M, 'catY', -16, 200, easeOut);
    await tween(M, 'catY', 0, 180, easeIn);
    lookOverride = null;
    setMood('happy');
    sparklesAround(110, 60, 3);
    await wait(800);
  }

  // Walk back to the spot the user chose (main knows it), with a little hop, once nothing else is going on.
  let homeTimer = null;
  function comeHome(delay = 0) {
    clearTimeout(homeTimer);
    homeTimer = setTimeout(async () => {
      if (await window.loon.atHome()) return;
      if (state !== 'idle' || bubbleOpen || dragging || press || cameo) return comeHome(4000);
      state = 'move';
      try {
        const startX = (await window.loon.windowInfo()).win.x;
        travel = 'walk';
        setTimeout(async () => { facing = (await window.loon.windowInfo()).win.x < startX ? -1 : 1; }, 80);
        await window.loon.goHome();
        travel = null;
        await squash();
      } finally {
        travel = null;
        if (state === 'move') state = 'idle';
      }
    }, delay);
  }

  async function hopAround() {
    const { win, workArea } = await window.loon.windowInfo();
    let dx = rand(70, 150) * (Math.random() < 0.5 ? -1 : 1);
    if (win.x + dx < workArea.x || win.x + win.width + dx > workArea.x + workArea.width) dx = -dx;
    for (let i = 0; i < 2; i++) {
      await Promise.all([tween(M, 'catSy', 0.92, 90), tween(M, 'catSx', 1.05, 90)]);
      tween(M, 'catSy', 1.04, 150);
      tween(M, 'catSx', 0.97, 150);
      travel = 'leap';
      await window.loon.animateWindow({ dx: dx / 2, duration: 330, arc: 24 });
      travel = null;
      await squash();
    }
    comeHome(rand(15000, 30000)); // a short wander, then back to its spot
  }

  // Stretch + yawn: long and low, eyes shut, mouth open, then a satisfied shake.
  async function stretch() {
    setPose('crouch');
    await Promise.all([tween(M, 'catSx', 1.14, 500), tween(M, 'catSy', 0.84, 500)]);
    setMood('asleep');
    moodTilt = -6;
    setMouth('open');
    await wait(900);
    setMouth('smile');
    setPose('sit');
    await Promise.all([tween(M, 'catSx', 1, 300, easeOutBack), tween(M, 'catSy', 1, 300, easeOutBack)]);
    for (let i = 0; i < 3; i++) await tween(M, 'bodyRot', i % 2 ? -3 : 3, 90);
    await tween(M, 'bodyRot', 0, 90);
    setMood('happy');
    await wait(700);
  }

  // Tail chase: two spins, then acts like nothing happened.
  async function tailChase() {
    setMood('focused');
    lookOverride = { x: 5, y: 2 };
    tailStyle = { amp: 14, period: 400 };
    await tween(M, 'catRot', 720, 1600, easeInOut);
    M.catRot = 0;
    tailStyle = IDLE_TAIL;
    lookOverride = { x: -5, y: -1 };
    setMood('judgy');
    await wait(1200);
  }

  // Knock it off: a tiny cup appears on the ledge, Loon holds eye contact, then swats it away.
  async function knockItOff() {
    const cup = document.createElement('div');
    cup.className = 'cup';
    cup.innerHTML = '<svg viewBox="0 0 20 22"><path d="M3 5h12v10a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z" fill="#eef1f4" stroke="#8e949c" stroke-width="1.2"/><path d="M15 8h2a2.5 2.5 0 0 1 0 5h-2" fill="none" stroke="#8e949c" stroke-width="1.2"/><path d="M6 1.5c0 1.5 1.5 1.5 1.5 3M10 1.5c0 1.5 1.5 1.5 1.5 3" fill="none" stroke="#b9dcaa" stroke-width="1"/></svg>';
    const spot = toStage(200, 226);
    Object.assign(cup.style, { left: `${spot.x}px`, top: `${spot.y}px` });
    fxLayer.appendChild(cup);
    lookOverride = { x: 5, y: 3 };
    setMood('curious');
    await wait(700);
    lookOverride = { x: 0, y: 0 }; // stares at you
    setMood('judgy');
    await wait(1100);
    setPose('pawsUp');
    await wait(160);
    cup.classList.add('knocked');
    setPose('sit');
    setMood('happy');
    await wait(900);
    cup.remove();
  }

  // Zoomies: a burst of fast hops back and forth, then an instant, innocent sit.
  async function zoomies() {
    setMood('wide');
    tailStyle = { amp: 12, period: 500 };
    travel = 'run';
    for (const dx of [90, -150, 120, -60]) {
      facing = Math.sign(dx);
      tween(M, 'catSy', 1.06, 100);
      await window.loon.animateWindow({ dx, duration: 230, arc: 18 });
      await Promise.all([tween(M, 'catSy', 0.9, 60), tween(M, 'catSx', 1.06, 60)]);
      await Promise.all([tween(M, 'catSy', 1, 90), tween(M, 'catSx', 1, 90)]);
    }
    travel = null;
    tailStyle = IDLE_TAIL;
    setMood('neutral');
    await blink();
    await wait(600);
  }

  // ---------- character moves (pixel skin): frames come from hostOverride, a view patch over the live state ----------
  const frames = async (list, ms) => { for (const patch of list) { hostOverride = patch; await wait(ms); } };
  // Luna: a fancy groom (lick the paw, lick again, wipe over the ear, pleased).
  async function fancyGroom() {
    await frames([0, 1, 0, 1, 2, 2, 3].map((step) => ({ act: 'fancyGroom', step })), 330);
    await wait(500);
  }
  // Luna: a slow half-lid stare right at you, then a tail flick or two.
  async function judgeStare() {
    lookOverride = { x: 0, y: 0 };
    await wait(400);
    setMood('judgy');
    await frames([0, 0, 2, 1, 0, 2, 0].map((tailFrame) => ({ tailFrame })), 420);
    await wait(700);
  }
  // Luna: the perfect loaf. Smug half-lids, one slow blink, one happy squint.
  async function perfectLoaf() {
    setPose('loaf');
    await frames([{ lidL: 0.5, lidR: 0.5 }, { lidL: 1, lidR: 1 }, { lidL: 0.5, lidR: 0.5 }, { mood: 'happy', happy: 1 }].map((p) => ({ pose: 'loaf', ...p })), 1300);
  }
  // Soju: the food bowl appears and he dives in.
  async function eatBowl() {
    setMood('happy');
    for (let i = 0; i < 10; i++) {
      hostOverride = i % 2 ? { act: 'eat', headDrop: 3, lidL: 1, lidR: 1 } : { act: 'eat', headDrop: 2, mouth: 'open', happy: 1 };
      if (i % 2 === 0) blip([392]);
      await wait(220);
    }
    hostOverride = { act: 'eat', headDrop: 1, mood: 'happy', happy: 1 };
    sparklesAround(110, 100, 3);
    await wait(900);
  }
  // Soju: a belly-up sprawl nap. A click (or anything that needs him) wakes him.
  let wakeMove = null;
  async function sprawlNap(length = rand(7000, 14000)) {
    hostOverride = { act: 'sprawl', mood: 'sleepy', lidL: 0.62, lidR: 0.62 };
    await wait(700);
    hostOverride = { act: 'sprawl', state: 'napping', mood: 'asleep', lidL: 1, lidR: 1 };
    const z = setInterval(zzz, 1800);
    zzz();
    await new Promise((resolve) => { wakeMove = resolve; setTimeout(resolve, length); });
    wakeMove = null;
    clearInterval(z);
    hostOverride = { act: 'sprawl', mood: 'sleepy', lidL: 0.62, lidR: 0.62 };
    await wait(400);
  }
  // Soju falls over: crumples, lands belly-up with dizzy stars, then sits up like nothing happened.
  async function tumble(dir = facing) {
    await frames([{ travel: 'walk', facing: dir, legs: 1, crumple: 2 }, { travel: 'walk', facing: dir, legs: 2, crumple: 4 }], 120);
    blip([330, 220]);
    await frames([{ act: 'sprawl', mood: 'wide', dizzy: true }, { act: 'sprawl', lidL: 1, lidR: 1, dizzy: true }], 750);
    await frames([{ dizzy: true, lidL: 0.5, lidR: 0.5 }, { mood: 'happy', happy: 1 }], 500);
  }
  async function trip() {
    const { win, workArea } = await window.loon.windowInfo();
    const dir = win.x + win.width + 60 > workArea.x + workArea.width ? -1 : 1;
    facing = dir;
    travel = 'walk';
    await window.loon.animateWindow({ dx: dir * 50, duration: 520 });
    travel = null;
    await tumble(dir);
    comeHome(rand(8000, 15000));
  }
  // Soju walks to the nearer screen edge and bonks his nose on it.
  async function bonk() {
    const { win, workArea } = await window.loon.windowInfo();
    const toRight = workArea.x + workArea.width - (win.x + win.width);
    const toLeft = win.x - workArea.x;
    const dir = toRight <= toLeft ? 1 : -1;
    const dist = Math.min(toRight, toLeft);
    if (dist > 700) return trip();
    facing = dir;
    travel = 'walk';
    if (dist > 2) await window.loon.animateWindow({ dx: dir * dist, duration: Math.max(300, dist * 4) });
    const gapCells = dir > 0 ? sceneW - hostCol - PX.W : hostCol; // the window is at the edge; walk the last bit
    await tween(M, 'catX', (dir * gapCells * cell) / scale, 260, (t) => t);
    travel = null;
    hostOverride = { travel: 'walk', facing: dir, legs: 2, act: 'bonk', crumple: 1 };
    blip([196]);
    await wait(320);
    await frames([{ mood: 'wide', dizzy: true }, { lidL: 1, lidR: 1, dizzy: true }, { dizzy: true }], 600);
    hostOverride = null;
    await tween(M, 'catX', 0, 300);
    comeHome(rand(8000, 15000));
  }
  // Soju chases the cursor, lands badly.
  async function clumsyChase() {
    await pounce();
    await tumble();
  }
  // Soju zooms around, then falls asleep mid-play.
  async function playNap() {
    await zoomies();
    await sprawlNap(rand(5000, 9000));
  }
  const CHARACTER_MOVES = { fancyGroom, judgeStare, perfectLoaf, eatBowl, sprawlNap, trip, bonk, clumsyChase, playNap };

  const MOVES = { moonMagic, pounce, edgePeek, stretch, tailChase, knockItOff, zoomies };
  // 'random' picks by the companion's personality (renderer/persona.js): Luna grooms, judges and loafs more; Soju
  // eats, zooms, trips and sprawls more. Character moves are pixel-only.
  const availableMoves = () => [...Object.keys(MOVES), 'hop', ...(pixel() ? Object.keys(CHARACTER_MOVES) : [])];
  async function doMove(name) {
    if (state !== 'idle' || bubbleOpen || dragging || privacy || focusMode || cameo) return;
    if (name === 'random') name = PERSONA.pickMove(look.companion, availableMoves()) || 'hop';
    interruptDuo();
    state = 'move';
    const run = MOVES[name] || (pixel() && CHARACTER_MOVES[name]);
    currentMove = run ? name : 'hop';
    try {
      await (run || hopAround)();
    } finally {
      currentMove = null;
      travel = null;
      hostOverride = null;
      wakeMove = null;
      M.catX = 0;
      M.catY = 0;
      M.catRot = 0;
      M.bodyRot = 0;
      if (['pounce', 'zoomies'].includes(name)) setTimeout(comeHome, 2500);
      lookOverride = null;
      moodTilt = 0;
      T.glow = 0;
      setPose('sit');
      setMood('neutral');
      if (state === 'move') state = 'idle';
    }
  }
  (function scheduleMove() {
    later(async () => { await doMove('random'); scheduleMove(); }, TIMING.move);
  })();
  (function scheduleRoam() {
    later(async () => {
      if (state === 'idle' && !bubbleOpen && !dragging && !privacy && !focusMode) {
        state = 'move';
        try { await hopAround(); } finally { if (state === 'move') state = 'idle'; }
      }
      scheduleRoam();
    }, TIMING.roam);
  })();

  // ---------- reminders: snack + nap ----------
  let fishTimeout = null;
  function showFish() {
    if (state === 'idle' && !bubbleOpen && !focusMode) {
      const p = toStage(20, 60);
      Object.assign(fish.style, { left: `${Math.max(4, p.x - 20)}px`, top: `${Math.max(4, p.y)}px` });
      fish.classList.remove('eaten');
      fish.hidden = false;
      clearTimeout(fishTimeout);
      fishTimeout = setTimeout(() => { fish.hidden = true; }, TIMING.fishTimeout);
      lookOverride = { x: -6, y: 0 };
      setMood('curious');
      setTimeout(() => { if (lookOverride && state === 'idle') { lookOverride = null; setMood('neutral'); } }, 2500);
      maybeCameo({ nudge: 'snack' });
    }
    later(showFish, TIMING.eat);
  }
  fish.addEventListener('click', async () => {
    if (state !== 'idle') return;
    clearTimeout(fishTimeout);
    state = 'eating';
    const mouth = toStage(110, 112);
    setMood('wide');
    setMouth('open');
    Object.assign(fish.style, { left: `${mouth.x - 20}px`, top: `${mouth.y - 13}px` });
    fish.classList.add('eaten');
    await wait(460);
    fish.hidden = true;
    for (let i = 0; i < 6; i++) { setMouth(i % 2 ? 'open' : 'smile'); if (i % 2) blip([392]); await wait(130); }
    setMood('happy');
    sparklesAround(110, 100, 4);
    await wait(1000);
    setMood('neutral');
    state = 'idle';
  });

  let zzzTimer = null;
  let napEnd = null;
  function startNap() {
    if (focusMode) return later(startNap, TIMING.nap);
    if (state !== 'idle' || bubbleOpen || sceneStep || cameo) return later(startNap, [DEMO ? 10_000 : MIN, DEMO ? 15_000 : 2 * MIN]);
    state = 'napping';
    setPose('loaf');
    setMood('asleep');
    tailStyle = { amp: 1.5, period: 6000 };
    zzz();
    zzzTimer = setInterval(zzz, 1600);
    napEnd = setTimeout(wakeUp, TIMING.napLength);
  }
  async function wakeUp() {
    if (state !== 'napping') return;
    clearInterval(zzzTimer);
    clearTimeout(napEnd);
    state = 'waking';
    setPose('sit');
    tailStyle = IDLE_TAIL;
    setMood('sleepy');
    await wait(350);
    setMouth('open');
    await wait(700);
    setMood('neutral');
    state = 'idle';
    later(startNap, TIMING.nap);
  }
  later(showFish, TIMING.eat);
  later(startNap, TIMING.nap);

  // ---------- brain + bubble ----------
  let flapTimer = null;
  function stopTalking() {
    clearInterval(flapTimer);
    flapTimer = null;
    thought.hidden = true;
  }
  function onBrain({ state: brainState, mood: answerMood }) {
    if (['thinking', 'acting', 'talking'].includes(brainState)) { interruptDuo(); wakeMove?.(); }
    if (brainState === 'thinking') {
      if (state === 'napping') wakeUp();
      state = 'thinking';
      const p = toStage(160, 20);
      Object.assign(thought.style, { left: `${p.x}px`, top: `${p.y}px` });
      thought.hidden = false;
      lookOverride = { x: 2.5, y: -4.5 };
      setMood('focused');
      tailStyle = { amp: 10, period: 900 };
    } else if (brainState === 'acting') {
      // Busy paws: Loon is doing something for the user; focused eyes, quick tail, pendant pulsing until it's done.
      if (state === 'napping') wakeUp();
      stopTalking();
      state = 'acting';
      lookOverride = { x: -3, y: 1.5 };
      setMood('focused');
      tailStyle = { amp: 12, period: 600 };
    } else if (brainState === 'talking') {
      state = 'talking';
      thought.hidden = true;
      lookOverride = bubbleOpen ? { x: -4.5, y: -3.5 } : null;
      tailStyle = { amp: 7, period: 1800 };
      setMood('neutral');
      clearInterval(flapTimer);
      flapTimer = setInterval(() => setMouth(Math.random() < 0.55 ? 'open' : 'smile'), 150);
    } else {
      stopTalking();
      T.glow = 0;
      tailStyle = IDLE_TAIL;
      state = 'idle';
      const finalMood = brainState === 'error' ? 'confused' : answerMood || 'happy';
      if (brainState === 'error') { pop('?'); sayLine('error'); }
      if (finalMood === 'happy' && brainState !== 'error' && look.duo) duo.queue('heart'); // once the bubble is closed
      setMood(finalMood);
      setTimeout(() => { if (mood === finalMood && state === 'idle') setMood(bubbleOpen ? 'curious' : 'neutral'); }, brainState === 'error' ? 4000 : 7000);
    }
  }
  window.loon.onBrain(onBrain);

  window.loon.onBubble(({ open }) => {
    bubbleOpen = open;
    if (open) {
      interruptDuo();
      wakeMove?.();
      if (state === 'napping') wakeUp();
      if (focusMode) setPose('sit');
      lookOverride = { x: -4.5, y: -3.5 };
      setMood('curious');
    } else {
      if (state === 'thinking' || state === 'talking' || state === 'acting') onBrain({ state: 'done', mood: 'neutral' });
      lookOverride = null;
      setMood('neutral');
      if (focusMode) setTimeout(applyFocusLook, 1500);
      comeHome(1500); // if it hopped toward a selection, walk back
    }
  });

  // ---------- browser companion ----------
  window.loon.onPrivacy(({ on }) => {
    if (on === privacy) return;
    privacy = on;
    if (on) { interruptDuo(); cameo?.controller.abort(); }
    if (state === 'napping') return;
    if (on) sayLine('privacy');
    setPose(on ? 'pawsUp' : 'sit');
    setMood(on ? 'protective' : 'neutral');
    if (on) hideNudge(false);
  });

  // Ears perk, eyes go to the selection, and a far-away selection is worth a hop (DESIGN.md §3.2).
  window.loon.onSelection(async ({ anchor }) => {
    if (state !== 'idle' || privacy || !anchor) return;
    interruptDuo();
    sayLine('selection');
    const { win } = await window.loon.windowInfo();
    const dx = anchor.x + anchor.w / 2 - (win.x + win.width / 2);
    const dy = anchor.y - win.y;
    setMood('curious');
    pop('?');
    lookOverride = { x: Math.sign(dx) * 5.5, y: dy < 0 ? -3.5 : 2 };
    if (Math.abs(dx) > 260) {
      state = 'move';
      try {
        await Promise.all([tween(M, 'catSy', 0.92, 90), tween(M, 'catSx', 1.05, 90)]);
        tween(M, 'catSy', 1.04, 150);
        tween(M, 'catSx', 0.97, 150);
        travel = 'leap';
        await window.loon.animateWindow({ dx: Math.sign(dx) * Math.min(300, Math.abs(dx) - 200), duration: 420, arc: 30 });
        travel = null;
        await squash();
      } finally {
        travel = null;
        if (state === 'move') state = 'idle';
      }
    }
    setTimeout(() => {
      if (state !== 'idle') return;
      lookOverride = bubbleOpen ? { x: -4.5, y: -3.5 } : null;
      setMood(bubbleOpen ? 'curious' : 'neutral');
    }, 2500);
  });

  let nudgeTimer = null;
  let nudgeKind = null;
  function hideNudge(ignored) {
    clearTimeout(nudgeTimer);
    if (nudgeButton.hidden) return;
    nudgeButton.hidden = true;
    T.glow = 0;
    if (ignored) window.loon.nudgeIgnored(nudgeKind);
  }
  // line: main's own wording (a routine reminder says what it's reminding you of); otherwise the persona's.
  window.loon.onNudge(({ kind, line }) => {
    if (privacy || focusMode || state !== 'idle' || bubbleOpen) return;
    interruptDuo();
    nudgeKind = kind;
    const wording = line || PERSONA.line(look.companion, `nudge.${kind}`);
    if (wording) { nudgeButton.title = wording; nudgeButton.setAttribute('aria-label', wording); }
    const p = toStage(160, 22);
    Object.assign(nudgeButton.style, { left: `${p.x}px`, top: `${p.y}px` });
    nudgeButton.hidden = false;
    T.glow = 0.7;
    setMood('curious');
    setTimeout(() => { if (mood === 'curious' && state === 'idle' && !bubbleOpen) setMood('neutral'); }, 1500);
    nudgeTimer = setTimeout(() => hideNudge(true), 8000);
    // A menu page or a break with Luna: she calls Soju in for a snack. Otherwise the cat says its nudge line.
    if (maybeCameo({ nudge: kind })) return;
    say(wording, look.companion, { event: 'nudge' });
    if (kind === 'break') doMove('stretch'); // show, don't tell
  });

  // ---------- cameos (§5.0.3): the other cat pops in, does its bit, and leaves. Visual and flavor only. ----------
  function maybeCameo({ nudge }) {
    const plan = PERSONA.cameoFor({ companion: look.companion, nudge, sensitive: privacy, enabled: look.cameos !== false });
    if (plan) playCameo(plan);
    return Boolean(plan);
  }
  async function playCameo({ guest, call, line }) {
    if (cameo || privacy || !pixel()) return say(call, look.companion);
    interruptDuo();
    const controller = new AbortController();
    cameo = { guest, step: null, controller };
    const widened = !look.duo;
    try {
      if (widened) await window.loon.catWide(true); // room beside the helper; it stays where it is
      await window.LoonDuo.runScene(PX.cameoScene(guest, { present: look.duo }), {
        signal: controller.signal,
        onStep: (step) => {
          cameo.step = step;
          if (step.say === 'call') say(call, look.companion, { ms: 2200 });
          if (step.say === 'guest') say(line, guest, { ms: 2400 });
        },
      });
    } finally {
      cameo = null;
      lastKey = '';
      if (widened && !look.duo) await window.loon.catWide(false);
    }
  }
  window.loon.onCameo((plan) => { if (plan?.guest && plan.guest !== look.companion) playCameo(plan); });
  nudgeButton.addEventListener('click', () => {
    hideNudge(false);
    window.loon.nudgeClick();
  });

  let focusZzz = null;
  function applyFocusLook() {
    if (!focusMode || state !== 'idle' || bubbleOpen) return;
    setPose('loaf');
    setMood('asleep');
    tailStyle = { amp: 1.5, period: 6000 };
  }
  window.loon.onFocus(({ on }) => {
    focusMode = on;
    clearInterval(focusZzz);
    if (on) {
      interruptDuo();
      hideNudge(false);
      applyFocusLook();
      focusZzz = setInterval(() => { if (focusMode && state === 'idle' && !bubbleOpen) zzz(); }, 6000);
    } else if (state === 'idle') {
      setPose(privacy ? 'pawsUp' : 'sit');
      setMood(privacy ? 'protective' : 'neutral');
      tailStyle = IDLE_TAIL;
    }
  });

  // ---------- files dropped on the cat ----------
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    interruptDuo();
    if (state === 'idle' && mood !== 'wide') {
      setMood('wide');
      T.earL = T.earR = -10;
      pop('!');
    }
    fileOver = state === 'idle';
  });
  document.addEventListener('dragleave', () => { fileOver = false; if (state === 'idle') setMood('neutral'); });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    fileOver = false;
    const file = e.dataTransfer.files[0];
    if (!file) return;
    setMood('happy');
    sparklesAround(110, 120, 4);
    sayLine('fileDrop');
    window.loon.dropFile(file);
  });
  // main opened the body area for a possible drag; hand click-through back once the cursor leaves it
  window.loon.onCursorLeftBody(() => { if (!press) { ignoring = false; setIgnore(true); } });

  // ---------- voice: mic capture, playback, and the listening/speaking looks ----------
  const micBadge = $('#mic');
  let mic = null; // { stream, context, node }
  let audioContext = null;
  let playing = new Set();
  let playedCount = 0;

  async function startMic() {
    if (mic) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    const context = new AudioContext({ sampleRate: 16000 }); // Chromium resamples the mic for us
    await context.audioWorklet.addModule('mic-worklet.js');
    const node = new AudioWorkletNode(context, 'loon-mic');
    node.port.onmessage = (e) => window.loon.micChunk(e.data);
    context.createMediaStreamSource(stream).connect(node);
    mic = { stream, context, node };
  }
  function stopMic() {
    if (!mic) return;
    mic.stream.getTracks().forEach((t) => t.stop());
    mic.context.close();
    mic = null;
  }
  window.loon.onMic(async ({ on }) => {
    try {
      if (on) await startMic();
      else stopMic();
    } catch (err) {
      console.error('[mic]', err);
      window.loon.micError(err.message);
    }
  });

  // TTS plays here (not in main) so Chromium's echo cancellation can subtract it from the mic.
  window.loon.onPlay(async ({ id, samples, sampleRate, muted }) => {
    audioContext ??= new AudioContext();
    const buffer = audioContext.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(Float32Array.from(samples), 0);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    const gain = audioContext.createGain();
    gain.gain.value = muted ? 0 : 1; // the selftest plays real audio silently
    source.connect(gain).connect(audioContext.destination);
    playing.add(source);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      playing.delete(source);
      playedCount++;
      window.loon.audioPlayed(id);
    };
    source.onended = finish;
    // 'ended' never fires if the audio device is unavailable (e.g. the screen is locked), so time it out too.
    setTimeout(finish, buffer.duration * 1000 + 400);
    if (audioContext.state === 'suspended') await audioContext.resume().catch(() => {});
    source.start();
  });
  window.loon.onStopAudio(() => {
    for (const source of playing) { source.onended = null; try { source.stop(); } catch { /* already stopped */ } }
    playing.clear();
  });

  let voiceFlap = null;
  window.loon.onVoice(({ state: voiceState }) => {
    clearInterval(voiceFlap);
    micBadge.hidden = voiceState !== 'listening' && voiceState !== 'wake';
    micBadge.classList.toggle('passive', voiceState === 'wake'); // mic open for "Hey Loon", not yet in a turn
    if (voiceState === 'listening') {
      interruptDuo();
      if (state === 'napping') wakeUp();
      const p = toStage(160, 18);
      Object.assign(micBadge.style, { left: `${p.x}px`, top: `${p.y}px` });
      setMood('curious');
      T.earL = T.earR = -10; // ears up while listening
      lookOverride = { x: 0, y: 1 };
    } else if (voiceState === 'speaking') {
      voiceFlap = setInterval(() => setMouth(Math.random() < 0.55 ? 'open' : 'smile'), 140);
    } else if (voiceState === 'wake') {
      const p = toStage(160, 18);
      Object.assign(micBadge.style, { left: `${p.x}px`, top: `${p.y}px` });
    } else if (voiceState === 'idle' && state === 'idle') {
      setMouth('smile');
      lookOverride = null;
      setMood(bubbleOpen ? 'curious' : 'neutral');
    }
  });

  // ---------- debug hook (used by `--cmd=<json>` screenshots and the "Do a trick" menu item) ----------
  window.loon.onDebug((cmd) => {
    if (cmd.pose) setPose(cmd.pose);
    if (cmd.mood) setMood(cmd.mood);
    if (cmd.look) lookOverride = cmd.look;
    if (cmd.move) doMove(cmd.move);
    if (cmd.nap) startNap();
    if (cmd.fish) showFish();
    if (cmd.brain) onBrain(cmd.brain);
    if (cmd.sparkle) sparklesAround(110, 90, 6);
    if (cmd.catLook) applyLook(cmd.catLook);
    if (cmd.cameo) playCameo(cmd.cameo);
    if (cmd.duoScene && PX.DUO_SCENES[cmd.duoScene]) duo.queue(cmd.duoScene, 0);
  });

  // read-only view for test/selftest.js
  window.__loon = {
    get state() { return state; }, get pose() { return pose; }, get mood() { return mood; },
    get privacy() { return privacy; }, get nudge() { return !nudgeButton.hidden; }, get focus() { return focusMode; },
    get listening() { return !micBadge.hidden; }, get played() { return playedCount; },
    get duoScene() { return duo.playing; }, get cameo() { return cameo?.guest || null; },
  };

  setPose('sit');
  setMood('neutral');
})();
