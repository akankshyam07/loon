// Loon's body: drives the SVG puppet in loon.svg (DESIGN.md §5.0).
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

  // ---------- layout ----------
  let scale = 1;
  let box = { left: 0, top: 0, width: 0, height: 0 };
  function layout() {
    const catH = stage.clientHeight / PAD_Y;
    const catW = catH * (VIEW_W / VIEW_H);
    scale = catH / VIEW_H;
    box = { left: (stage.clientWidth - catW) / 2, top: stage.clientHeight - catH, width: catW, height: catH };
    Object.assign(catBox.style, { width: `${catW}px`, height: `${catH}px`, marginLeft: `${-catW / 2}px` });
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

  let state = 'idle'; // idle | petted | napping | eating | thinking | talking | move
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
    if (bubbleOpen || now - lastCursorMove < 800) return 66; // eyes following the cursor
    return now - lastCursorMove > 2 * MIN ? 500 : 200;
  }
  function loop() {
    const now = performance.now();
    if (!paused) frame(now);
    setTimeout(loop, nextDelay(now));
  }
  window.loon.onPower(({ paused: p }) => { paused = p; });

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
    if (state === 'thinking') T.glow = 0.55 + 0.35 * Math.sin(now / 260);

    const k = (speed) => 1 - Math.exp((-dt / 1000) * speed);
    for (const key in T) S[key] += (T[key] - S[key]) * k(SPEED[key] || 9);

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
  loop();

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
      if (state === 'idle' && !bubbleOpen) {
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
  function sparkle(x, y, { dx = rand(-16, 16), dy = rand(-55, -35), size = rand(13, 20), duration = rand(1.1, 1.5) } = {}) {
    const el = document.createElement('div');
    el.className = 'sparkle';
    el.innerHTML = STAR.replace('COLOR', SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)]);
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

  // ---------- interaction: click-through, drag, pet, click ----------
  let ignoring = true;
  const setIgnore = (ignore) => {
    if (ignore !== ignoring) { ignoring = ignore; window.loon.setIgnoreMouse(ignore); }
  };
  const overCat = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return Boolean(el && (el.closest('#cat') || el.closest('.interactive')));
  };
  let press = null;
  document.addEventListener('mousemove', (e) => { if (!press) setIgnore(!overCat(e.clientX, e.clientY)); });
  document.addEventListener('mouseleave', () => { if (!press) setIgnore(true); });

  let petTimer = null;
  P.cat.addEventListener('contextmenu', (e) => { e.preventDefault(); window.loon.showMenu(); });
  P.cat.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    P.cat.setPointerCapture(e.pointerId);
    press = { cx: e.clientX, cy: e.clientY };
    petTimer = setTimeout(startPet, 320);
  });
  P.cat.addEventListener('pointermove', (e) => {
    if (!press || dragging || state === 'petted') return;
    if (Math.hypot(e.clientX - press.cx, e.clientY - press.cy) > 5) {
      clearTimeout(petTimer);
      dragging = true;
      window.loon.dragStart(press.cx, press.cy);
      setMood('wide');
      tween(M, 'catSy', 1.07, 150);
      tween(M, 'catSx', 0.95, 150);
    }
  });
  P.cat.addEventListener('pointerup', async (e) => {
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
    } else {
      onCatClick();
    }
    setIgnore(!overCat(e.clientX, e.clientY));
  });

  async function squash() {
    await Promise.all([tween(M, 'catSy', 0.87, 80), tween(M, 'catSx', 1.09, 80)]);
    await Promise.all([tween(M, 'catSy', 1, 240, easeOutBack), tween(M, 'catSx', 1, 240, easeOutBack)]);
  }

  function onCatClick() {
    if (state === 'napping') return wakeUp();
    if (state === 'move' || state === 'eating') return;
    window.loon.openBubble();
  }

  let petSparkles = null;
  function startPet() {
    if (!press || state !== 'idle') return;
    state = 'petted';
    setMood('happy');
    idleTilt = 7;
    tailStyle = { amp: 3, period: 4200 };
    sparklesAround(110, 70, 2);
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
    await window.loon.animateWindow({ dx, duration, arc: 55 });
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

  async function hopAround() {
    const { win, workArea } = await window.loon.windowInfo();
    let dx = rand(70, 150) * (Math.random() < 0.5 ? -1 : 1);
    if (win.x + dx < workArea.x || win.x + win.width + dx > workArea.x + workArea.width) dx = -dx;
    for (let i = 0; i < 2; i++) {
      await Promise.all([tween(M, 'catSy', 0.92, 90), tween(M, 'catSx', 1.05, 90)]);
      tween(M, 'catSy', 1.04, 150);
      tween(M, 'catSx', 0.97, 150);
      await window.loon.animateWindow({ dx: dx / 2, duration: 330, arc: 24 });
      await squash();
    }
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
    for (const dx of [90, -150, 120, -60]) {
      tween(M, 'catSy', 1.06, 100);
      await window.loon.animateWindow({ dx, duration: 230, arc: 18 });
      await Promise.all([tween(M, 'catSy', 0.9, 60), tween(M, 'catSx', 1.06, 60)]);
      await Promise.all([tween(M, 'catSy', 1, 90), tween(M, 'catSx', 1, 90)]);
    }
    tailStyle = IDLE_TAIL;
    setMood('neutral');
    await blink();
    await wait(600);
  }

  const MOVES = { moonMagic, pounce, edgePeek, stretch, tailChase, knockItOff, zoomies };
  async function doMove(name) {
    if (state !== 'idle' || bubbleOpen || dragging || privacy || focusMode) return;
    if (name === 'random') name = Object.keys(MOVES)[Math.floor(Math.random() * Object.keys(MOVES).length)];
    state = 'move';
    try {
      await (MOVES[name] || hopAround)();
    } finally {
      M.catY = 0;
      M.catRot = 0;
      M.bodyRot = 0;
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
    for (let i = 0; i < 6; i++) { setMouth(i % 2 ? 'open' : 'smile'); await wait(130); }
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
    if (state !== 'idle' || bubbleOpen) return later(startNap, [DEMO ? 10_000 : MIN, DEMO ? 15_000 : 2 * MIN]);
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
    if (brainState === 'thinking') {
      if (state === 'napping') wakeUp();
      state = 'thinking';
      const p = toStage(160, 20);
      Object.assign(thought.style, { left: `${p.x}px`, top: `${p.y}px` });
      thought.hidden = false;
      lookOverride = { x: 2.5, y: -4.5 };
      setMood('focused');
      tailStyle = { amp: 10, period: 900 };
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
      setMood(finalMood);
      setTimeout(() => { if (mood === finalMood && state === 'idle') setMood(bubbleOpen ? 'curious' : 'neutral'); }, brainState === 'error' ? 4000 : 7000);
    }
  }
  window.loon.onBrain(onBrain);

  window.loon.onBubble(({ open }) => {
    bubbleOpen = open;
    if (open) {
      if (state === 'napping') wakeUp();
      if (focusMode) setPose('sit');
      lookOverride = { x: -4.5, y: -3.5 };
      setMood('curious');
    } else {
      if (state === 'thinking' || state === 'talking') onBrain({ state: 'done', mood: 'neutral' });
      lookOverride = null;
      setMood('neutral');
      if (focusMode) setTimeout(applyFocusLook, 1500);
    }
  });

  // ---------- browser companion ----------
  window.loon.onPrivacy(({ on }) => {
    if (on === privacy) return;
    privacy = on;
    if (state === 'napping') return;
    setPose(on ? 'pawsUp' : 'sit');
    setMood(on ? 'protective' : 'neutral');
    if (on) hideNudge(false);
  });

  // Ears perk, eyes go to the selection, and a far-away selection is worth a hop (DESIGN.md §3.2).
  window.loon.onSelection(async ({ anchor }) => {
    if (state !== 'idle' || privacy || !anchor) return;
    const { win } = await window.loon.windowInfo();
    const dx = anchor.x + anchor.w / 2 - (win.x + win.width / 2);
    const dy = anchor.y - win.y;
    setMood('curious');
    lookOverride = { x: Math.sign(dx) * 5.5, y: dy < 0 ? -3.5 : 2 };
    if (Math.abs(dx) > 260) {
      state = 'move';
      try {
        await Promise.all([tween(M, 'catSy', 0.92, 90), tween(M, 'catSx', 1.05, 90)]);
        tween(M, 'catSy', 1.04, 150);
        tween(M, 'catSx', 0.97, 150);
        await window.loon.animateWindow({ dx: Math.sign(dx) * Math.min(300, Math.abs(dx) - 200), duration: 420, arc: 30 });
        await squash();
      } finally {
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
  window.loon.onNudge(({ kind }) => {
    if (privacy || focusMode || state !== 'idle' || bubbleOpen) return;
    nudgeKind = kind;
    const p = toStage(160, 22);
    Object.assign(nudgeButton.style, { left: `${p.x}px`, top: `${p.y}px` });
    nudgeButton.hidden = false;
    T.glow = 0.7;
    setMood('curious');
    setTimeout(() => { if (mood === 'curious' && state === 'idle' && !bubbleOpen) setMood('neutral'); }, 1500);
    nudgeTimer = setTimeout(() => hideNudge(true), 8000);
  });
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
      hideNudge(false);
      applyFocusLook();
      focusZzz = setInterval(() => { if (focusMode && state === 'idle' && !bubbleOpen) zzz(); }, 6000);
    } else if (state === 'idle') {
      setPose(privacy ? 'pawsUp' : 'sit');
      setMood(privacy ? 'protective' : 'neutral');
      tailStyle = IDLE_TAIL;
    }
  });

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
    const finish = () => { playing.delete(source); playedCount++; window.loon.audioPlayed(id); };
    source.onended = finish;
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
  });

  // read-only view for test/selftest.js
  window.__loon = {
    get state() { return state; }, get pose() { return pose; }, get mood() { return mood; },
    get privacy() { return privacy; }, get nudge() { return !nudgeButton.hidden; }, get focus() { return focusMode; },
    get listening() { return !micBadge.hidden; }, get played() { return playedCount; },
  };

  setPose('sit');
  setMood('neutral');
})();
