// The demo timeline. Everything on screen is a pure function of t: seek(t) draws that moment, with no timers, so
// demo/render.js can screenshot any frame in any order and get the same picture. Times are seconds.
(async () => {
  const PX = window.LoonPixel;
  const RIM = 'rgba(255, 240, 250, 0.28)';
  const PERSONA = window.LoonPersona;
  const C = window.LoonDemoContent;
  const $ = (s) => document.querySelector(s);
  const world = $('#world');
  const W = 1280;
  const H = 800;
  const CLIP = new URLSearchParams(location.search).has('clip'); // the square social clip, see CLIP_CUTS
  if (CLIP) document.documentElement.classList.add('clip');
  window.innerWidth = W; // the Teach overlay lays itself out in the "screen", not the 1600×1000 viewport
  window.innerHeight = H;

  // ---------- small math ----------
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
  const prog = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const stepped = (p, n) => Math.ceil(p * n) / n;
  const within = (t, a, b) => t >= a && t < b;
  const spriteNow = (t) => Math.floor(t * 8) * 125; // sprites tick at 8 fps inside the 30 fps video
  function track(keys, t) {
    if (t <= keys[0][0]) return { ...keys[0][1] };
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1] = keys[i];
      if (t >= t1) continue;
      const [t0, v0] = keys[i - 1];
      const p = ease((t - t0) / (t1 - t0));
      const out = {};
      for (const k of Object.keys(v1)) out[k] = v0[k] + (v1[k] - v0[k]) * p;
      return out;
    }
    return { ...keys[keys.length - 1][1] };
  }
  // A scripted scene from pixel-sprites.js: which beat is playing `lt` seconds in (null after the last).
  function beatAt(steps, lt, defaultMs = 250) {
    let acc = 0;
    for (const step of steps) {
      acc += (step.ms ?? defaultMs) / 1000;
      if (lt < acc) return step;
    }
    return null;
  }
  const line = ([who, event, index = 0]) => {
    const value = event.split('.').reduce((node, key) => node?.[key], PERSONA.PERSONAS[who].lines);
    return typeof value === 'string' ? value : value[index];
  };

  // The real markdown renderer from the bubble (renderer/bubble.js), so answers render exactly like the app's.
  const bubbleSrc = await (await fetch('../renderer/bubble.js')).text();
  const mdSrc = bubbleSrc.slice(bubbleSrc.indexOf('const escapeHtml'), bubbleSrc.indexOf('// Links open'));
  const renderMarkdown = new Function(`${mdSrc}; return renderMarkdown;`)();
  await document.fonts.load("20px 'Press Start 2P'");

  // ---------- scenery art (pixel canvases) ----------
  function grid(canvas, w, h) {
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    const px = (x, y, c, ww = 1, hh = 1) => { g.fillStyle = c; g.fillRect(x, y, ww, hh); };
    return { g, px };
  }
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const paintMap = (px, map, colors, x0, y0) => map.forEach((row, y) => [...row].forEach((c, x) => { if (colors[c]) px(x0 + x, y0 + y, colors[c]); }));

  (function clouds() {
    const { px } = grid($('#clouds'), 160, 100);
    const cloud = ['...wwww.....', '..wwwwww.ww.', '.wwwwwwwwwww', 'wwwwwwwwwwww', '.ppppppppppp'];
    const star = ['.y.', 'yyy', '.y.'];
    [[8, 12], [118, 8], [132, 70], [6, 76], [74, 88]].forEach(([x, y]) => paintMap(px, cloud, { w: 'rgba(255,255,255,.9)', p: 'rgba(255,190,215,.6)' }, x, y));
    [[30, 6], [101, 18], [150, 40], [20, 50], [140, 90], [60, 4]].forEach(([x, y]) => paintMap(px, star, { y: 'rgba(255,209,102,.75)' }, x, y));
  })();

  function drawSprite(canvas, view, who, cell = 1) {
    canvas.width = PX.W * cell;
    canvas.height = PX.ROWS * cell;
    PX.drawGrid(canvas.getContext('2d'), PX.compose(PX.pickFrame(view, who)), PX.colorsFor(who), cell, { rim: 'rgba(255, 240, 250, 0.3)' });
  }
  drawSprite($('#mbCat'), {}, 'luna');
  drawSprite($('#extIcon'), {}, 'luna');

  (function heroArt() {
    const { px } = grid($('#heroArt'), 240, 42);
    const sky = ['#ffd9e6', '#ffd1dc', '#ffcbd3', '#ffd3c4', '#ffdcb9', '#ffe6bf'];
    for (let y = 0; y < 42; y++) px(0, y, sky[Math.min(5, Math.floor(y / 6))], 240);
    for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) if (x * x + y * y <= 49) px(170 + x, 20 + y, '#fff3c4');
    const ridge = (base, amp, f, c, ph) => { for (let x = 0; x < 240; x++) { const top = Math.round(base - amp * (Math.sin(x * f + ph) * 0.6 + Math.sin(x * f * 2.3 + ph) * 0.4)); px(x, top, c, 1, 42 - top); } };
    ridge(26, 6, 0.045, '#d9c4f2', 1);
    ridge(31, 5, 0.06, '#bfa6e8', 3);
    ridge(37, 3, 0.08, '#9e86d6', 5);
    seed = 11;
    for (let i = 0; i < 9; i++) {
      const x = 20 + i * 22 + Math.floor(rand() * 8);
      const h = 4 + Math.floor(rand() * 4);
      px(x, 41 - h, '#7d68b8', 6, h);
      px(x - 1, 41 - h - 1, '#ff8fb8', 8, 1);
      px(x + 2, 41 - h + 2, '#ffe08a', 2, 1);
    }
    px(0, 41, '#7d68b8', 240);
  })();

  (function editorArt() {
    const { px } = grid($('#edArt'), 112, 80);
    const sky = ['#2a2350', '#332960', '#3d3070', '#4a3a80', '#5a4790', '#6b55a0'];
    for (let y = 0; y < 80; y++) px(0, y, sky[Math.min(5, Math.floor(y / 10))], 112);
    seed = 3;
    for (let i = 0; i < 40; i++) px(Math.floor(rand() * 112), Math.floor(rand() * 44), rand() > 0.7 ? '#ffe08a' : '#eee7ff');
    for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) if (x * x + y * y <= 81 && !((x + 5) ** 2 + (y - 3) ** 2 <= 60)) px(84 + x, 18 + y, '#fff4c8');
    const ridge = (base, amp, f, c, ph) => { for (let x = 0; x < 112; x++) { const top = Math.round(base - amp * Math.sin(x * f + ph)); px(x, top, c, 1, 80 - top); } };
    ridge(56, 6, 0.06, '#7f6bc0', 0.5);
    ridge(64, 5, 0.09, '#5fa88a', 2);
    ridge(71, 3, 0.12, '#4a8f74', 4);
    // a tiny house with a lit window and a cat on the roof
    px(30, 52, '#2b1d24', 18, 1); px(31, 51, '#2b1d24', 16, 1); px(33, 50, '#2b1d24', 12, 1); px(35, 49, '#2b1d24', 8, 1);
    px(32, 53, '#f3e3d0', 14, 10); px(36, 56, '#ffd166', 4, 4); px(42, 57, '#a2643f', 3, 6);
    paintMap(px, ['k.k', 'kkk', 'kgk', 'kkkk'], { k: '#16121c', g: '#80e27e' }, 38, 45);
  })();

  function pack(canvas, { n, cols, cw, ch, body, accent }) {
    const { px } = grid(canvas, 58, 42);
    for (let y = 0; y < 42; y++) px(0, y, y < 30 ? '#f4fbf7' : '#e8f4ee', 58);
    const rows = Math.ceil(n / cols);
    for (let r = 0; r < rows; r++) {
      const count = Math.min(cols, n - r * cols);
      const width = count * (cw + 1) - 1;
      const x0 = Math.round((58 - width) / 2) + (rows - 1 - r) * 2;
      const y0 = 38 - ch - (rows - 1 - r) * 5;
      for (let i = 0; i < count; i++) {
        const x = x0 + i * (cw + 1);
        px(x, y0, '#2b2238', cw, ch + 1);
        px(x + 1, y0 + 1, '#d9d4e2', cw - 2, 2);
        px(x + 1, y0 + 3, body, cw - 2, ch - 4);
        px(x + 1, y0 + Math.round(ch / 2) - 1, '#fffdfb', cw - 2, 3);
        px(x + Math.floor(cw / 2), y0 + Math.round(ch / 2), accent);
        px(x + 1, y0 + 3, 'rgba(255,255,255,.55)', 1, ch - 4);
      }
    }
  }
  const PACKS = {
    lime: { n: 12, cols: 6, cw: 6, ch: 12, body: '#8fdc5a', accent: '#3f8f2c', tint: '#e9f9de' },
    pink: { n: 8, cols: 4, cw: 6, ch: 10, body: '#ff8fb8', accent: '#c2457a', tint: '#ffe8f0' },
    blue: { n: 6, cols: 3, cw: 7, ch: 15, body: '#8fd3ff', accent: '#3a7fc2', tint: '#e3f3ff' },
  };
  const prods = $('#prods');
  const STARS = { lime: '★★★★★ 2,314', pink: '★★★★☆ 860', blue: '★★★★☆ 1,102' };
  for (const item of C.SHOP_ITEMS) {
    const [, brand, size] = item.name.match(/^(.*?) (\d+ x \d+ ml)$/);
    const tile = document.createElement('div');
    tile.className = 'prod';
    const canvas = document.createElement('canvas');
    pack(canvas, PACKS[item.color]);
    tile.append(canvas);
    tile.insertAdjacentHTML('beforeend', `<h3>${brand} Sparkling</h3><p class="size">${size.replace(' x ', ' × ')} cans</p><div class="row"><span class="price">$${item.price.toFixed(2)}</span><span class="stars">${STARS[item.color]}</span></div><div class="add">Add to cart</div>`);
    prods.append(tile);
  }

  const DISH_ART = [
    { map: ['..bbbbbb..', '.bbbbbbbb.', 'gggggggggg', 'ccccccccc.', 'mmmmmmmmmm', 'bbbbbbbbbb', '.bbbbbbbb.'], colors: { b: '#e8a95b', g: '#8fdc5a', c: '#ffd166', m: '#c9824a' } },
    { map: ['....gg....', '.ssgggrrr.', 'ssssgrrrrr', 'wwwwwwwwww', '.wwwwwwww.', '..wwwwww..'], colors: { s: '#ff9f80', g: '#8fdc5a', r: '#fff3df', w: '#8fd3ff' } },
    { map: ['..yyyyyy..', '.yyoyyyoy.', 'yyyyyyyyyy', 'wwwwwwwwww', '.wwwwwwww.', '..wwwwww..'], colors: { y: '#ffd166', o: '#e8a95b', w: '#ff8fb8' } },
    { map: ['..g.t.g...', '.ggttgggg.', 'gggggtgggg', 'wwwwwwwwww', '.wwwwwwww.', '..wwwwww..'], colors: { g: '#6fd6a8', t: '#f3e3d0', w: '#b9a4ff' } },
  ];
  const dishes = $('#dishes');
  const menuItems = C.MENU_TEXT.split('\n');
  for (let i = 0; i < menuItems.length; i += 2) {
    const [, name, price] = menuItems[i].match(/^(.*) \$(\d+)$/);
    const row = document.createElement('div');
    row.className = 'dish';
    const canvas = document.createElement('canvas');
    const { px } = grid(canvas, 12, 12);
    paintMap(px, DISH_ART[i / 2].map, DISH_ART[i / 2].colors, 1, 3);
    row.append(canvas);
    row.insertAdjacentHTML('beforeend', `<b>${name}</b><span class="p">$${price}</span><i>${menuItems[i + 1]}</i>`);
    dishes.append(row);
  }

  // ---------- cursor ----------
  const ARROW = ['X...........', 'XX..........', 'XwX.........', 'XwwX........', 'XwwwX.......', 'XwwwwX......', 'XwwwwwX.....', 'XwwwwwwX....', 'XwwwwwwwX...', 'XwwwwwwwwX..', 'XwwwwwwwwwX.', 'XwwwwwwXXXXX', 'XwwwXwwX....', 'XwwXXwwX....', 'XwX..XwwX...', 'XX...XwwX...', 'X.....XwwX..', '......XwwX..', '.......XX...'];
  const IBEAM = ['XXX.XXX', '...X...', '...X...', '...X...', '...X...', '...X...', '...X...', '...X...', '...X...', '...X...', '...X...', '...X...', '...X...', '...X...', '...X...', 'XXX.XXX'];
  const svgOf = (map, dx = 0) => map.flatMap((row, y) => [...row].map((c, x) => (c === '.' ? '' : `<rect x="${x + dx}" y="${y}" width="1" height="1" fill="${c === 'X' ? '#2b2238' : '#ffffff'}"/>`))).join('');
  const CURSORS = { arrow: svgOf(ARROW), ibeam: svgOf(IBEAM, -3) };
  const cursorEl = $('#cursor');
  const ring = Object.assign(document.createElement('div'), { className: 'ring' });
  world.append(ring);

  // ---------- geometry (measured once with the camera at rest) ----------
  const rectIn = (el) => {
    const r = el.getBoundingClientRect();
    const w = world.getBoundingClientRect();
    const s = w.width / W;
    return { x: (r.left - w.left) / s, y: (r.top - w.top) / s, w: r.width / s, h: r.height / s };
  };
  const pages = { article: $('#pg-article'), shop: $('#pg-shop'), menu: $('#pg-menu') };
  const showPage = (name) => { for (const [k, el] of Object.entries(pages)) el.classList.toggle('on', k === name); };
  world.style.transform = 'none';
  showPage('article');
  const WORD = rectIn($('#word'));
  showPage('shop');
  const TILES = [...document.querySelectorAll('.prod')].map(rectIn);
  showPage('menu');
  const DISHES = [...document.querySelectorAll('.dish')].map(rectIn);
  $('#editor').style.display = 'block';
  const PNG = rectIn($('#fmtPng'));
  const EXPORT = rectIn($('#exportBtn'));
  $('#editor').style.display = '';

  // Cats: one canvas holds Luna and (in cameos and duo scenes) Soju. Columns are sprite pixels, 4 screen px each.
  const CELL = 4;
  const LUNA_COL = 4;
  const CATS_W = 100;
  const catsCanvas = $('#cats');
  catsCanvas.width = CATS_W;
  catsCanvas.height = PX.ROWS;
  const LUNA_X = 1012;
  const CATS = { x: LUNA_X - LUNA_COL * CELL, y: 636 };
  Object.assign(catsCanvas.style, { left: `${CATS.x}px`, top: `${CATS.y}px`, width: `${CATS_W * CELL}px`, height: `${PX.ROWS * CELL}px` });
  const LUNA_BOX = { x: LUNA_X + 6 * CELL, y: CATS.y + 7 * CELL, w: 20 * CELL, h: 31 * CELL };
  const EYES_AT = { x: LUNA_X + 16 * CELL, y: CATS.y + (PX.TOP + 9) * CELL };
  const SOJU_BOX = { ...LUNA_BOX, x: LUNA_BOX.x + PX.GAP * CELL };

  // ---------- the bubble (real bubble.css markup) ----------
  const FACE = '<svg class="face" viewBox="0.5 -0.5 7 8" shape-rendering="crispEdges" aria-hidden="true"><path fill="#2e2733" d="M1 0h1v1h1v1h2V1h1V0h1v6H6v1H2V6H1z"/><path fill="#ff8fb8" d="M1 1h1v1H1zM6 1h1v1H6zM1.5 4.5h1v.5h-1zM5.5 4.5h1v.5h-1z"/><path fill="#80e27e" d="M2 3h1v1H2zM5 3h1v1H5z"/></svg>';
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function cardHtml(spec) {
    const chips = spec.chips ? `<div id="chips">${spec.chips.map((c) => `<button class="chip${/…$/.test(c) ? ' more' : ''}" data-chip="${c}">${c}</button>`).join('')}</div>` : '';
    const notice = spec.notice ? `<p id="notice">${spec.notice}</p>` : '';
    let log = '';
    if (spec.q) log += `<div class="q">${esc(spec.q)}</div>`;
    if (spec.typing) log += '<div class="a"><span class="typing"><i></i><i></i><i></i></span></div>';
    if (spec.answer) {
      const flavor = spec.flavor ? `<p class="flavor">${esc(spec.flavor)}</p>` : '';
      log += `<div class="a">${renderMarkdown(spec.answer)}${flavor}<div class="answer-tools"><button>Copy</button><span class="menu"><button>⋯</button></span><span class="tier-icon">${spec.tier}</span></div></div>`;
    }
    const form = spec.form ? `<form id="askForm"><textarea id="input" rows="1" placeholder="${spec.placeholder}">${esc(spec.typed || '')}</textarea><button id="send" type="button"${spec.typed ? '' : ' disabled'}>↑</button></form>` : '';
    return `<header>${FACE}<span class="title">Loon</span><span id="sourceLabel" class="source">· ${spec.label}</span><button id="close">×</button></header>${notice}${chips}<section id="log">${log}</section>${form}`;
  }
  const bubbleEl = $('#bubble');
  const cardEl = $('#card');
  let bubbleKey = null;
  function setBubble(spec, at) {
    const key = JSON.stringify(spec);
    if (key === bubbleKey) return;
    bubbleKey = key;
    cardEl.innerHTML = cardHtml(spec);
    bubbleEl.dataset.at = at;
  }
  // Where main.js puts the bubble: under a selection, or above the cat with its corner near the cat's middle.
  const CAT_WIN_TOP = CATS.y - 60;
  function bubblePlace(spec) {
    setBubble(spec, 0);
    const h = bubbleEl.offsetHeight;
    bubbleKey = null;
    if (spec.anchor) {
      const a = spec.anchor;
      let y = a.y + a.h + 8;
      if (y + h > H) y = a.y - h - 8;
      return { x: clamp(a.x - 10, 8, W - 368), y, w: 360, h };
    }
    return { x: clamp(LUNA_X + 16 * CELL - 360 + 40, 8, W - 368), y: Math.max(26, CAT_WIN_TOP - h + 36), w: 360, h };
  }
  const chipRect = (spec, label) => {
    const box = bubblePlace(spec);
    setBubble(spec, 0);
    const r = cardEl.querySelector(`[data-chip="${label}"]`).getBoundingClientRect();
    const b = bubbleEl.getBoundingClientRect();
    bubbleKey = null;
    return { x: box.x + (r.left - b.left), y: box.y + (r.top - b.top), w: r.width, h: r.height };
  };
  const centerOf = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

  const B = {
    define: { anchor: WORD, label: 'Selection · wanderlust.blog', answer: C.define, tier: '⚡' },
    shopChips: { label: 'About bubblemart.shop?', chips: ['Best value', 'Reviews', 'Add to compare', 'More…', 'Ask…'] },
    shopTyping: { label: 'About bubblemart.shop?', typing: true },
    shopAnswer: { label: 'About bubblemart.shop?', answer: C.shop, flavor: line(C.lines.shopFlavor), tier: '⚡' },
    foodChips: { label: 'About thelittlefork.com?', chips: ['Lightest', 'Most protein', 'Vegetarian', 'More…', 'Ask…'] },
    foodAnswer: { label: 'About thelittlefork.com?', answer: C.food, tier: '⚡' },
  };
  const TEACH_BASE = { label: 'Teach me on screen', chips: ['Show me on screen'], form: true, placeholder: 'Where is…? Show me how to…' };
  const teachTyped = (n) => ({ ...TEACH_BASE, typed: C.teach.question.slice(0, n) });
  B.teachAsk = teachTyped(0);
  B.teachThink = { ...TEACH_BASE, q: C.teach.question, typing: true };
  B.teachAnswer = { ...TEACH_BASE, q: C.teach.question, answer: C.teach.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'), tier: '🐾' };
  const BOX = Object.fromEntries(Object.keys(B).map((k) => [k, bubblePlace(B[k])]));

  // ---------- Teach overlay geometry (laid out by the real overlay code) ----------
  const TEACH_PAYLOAD = (current) => ({
    annotations: C.teach.steps.map((say, i) => ({ n: i + 1, say, kind: 'box', box: [PNG, EXPORT][i] })),
    current, total: 2, multi: true, companion: 'luna',
  });
  const layer = $('#layer');
  const overlayButton = (current) => {
    window.LoonOverlay.render(TEACH_PAYLOAD(current));
    const r = rectIn(layer.querySelector('.controls button'));
    layer.replaceChildren();
    return r;
  };
  const NEXT_BTN = overlayButton(1);
  const DONE_BTN = overlayButton(2);

  // ---------- the storyboard ----------
  const INTRO = { hook: 0, reveal: 3.0, value: 6.5 }; // the ad opener: a relatable problem, meet Loon, what it does
  const T = { article: 9.6, shop: 16.4, menu: 23.6, teach: 31.8, duo: 39.4, end: 49.0 };
  const DURATION = 53.4;
  const t = T;
  // In the clip Luna hops toward the selection, as the app does (renderer/cat.js onSelection: a selection more than
  // 260 px away gets a leap of up to 300 px). She lands just right of the card. The full demo keeps her in her corner.
  const LEAP = CLIP ? { at: t.article + 3.55, dur: 0.42, dx: clamp(BOX.define.x + BOX.define.w + 6 - LUNA_BOX.x, -300, 0), until: t.shop } : null;
  const leapAt = (tt) => {
    if (!LEAP || tt < LEAP.at || tt >= LEAP.until) return { x: 0, y: 0, flying: false };
    const p = prog(tt, LEAP.at, LEAP.at + LEAP.dur);
    return { x: LEAP.dx * ease(p), y: -30 * Math.sin(Math.PI * p), flying: p < 1 };
  };
  const fit = (r, pad = 30) => {
    const z = clamp(Math.min(W / (r.w + pad * 2), H / (r.h + pad * 2)), 1, 3);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2, z };
  };
  const union = (...rs) => {
    const x = Math.min(...rs.map((r) => r.x));
    const y = Math.min(...rs.map((r) => r.y));
    return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
  };
  const FULL = { x: W / 2, y: H / 2, z: 1 };
  const TIP_BOX = () => ({ x: tipAnchor.x - 262, y: tipAnchor.y + 16, w: 250, h: 30 });
  const CAM_DUO_IN = { x: 1110, y: 676, z: 2.3 };
  const CAM_DUO = { x: 1140, y: 694, z: 3.0 }; // past the screen edge: the wallpaper runs on, so the cats can be centered
  const CAMERA = []; // filled in below, once the cursor targets are measured
  const pt = (r, dx = 0.5, dy = 0.5) => ({ x: r.x + r.w * dx, y: r.y + r.h * dy });
  const CAT_PT = { x: LUNA_X + 17 * CELL, y: 712 };
  const shopChip = centerOf(chipRect(B.shopChips, 'Best value'));
  const foodChip = centerOf(chipRect(B.foodChips, 'Lightest'));
  const tipAnchor = (() => {
    const box = BOX.define;
    setBubble(B.define, 0);
    const r = cardEl.querySelector('.tier-icon').getBoundingClientRect();
    const b = bubbleEl.getBoundingClientRect();
    bubbleKey = null;
    return { x: box.x + (r.left - b.left) + r.width / 2, y: box.y + (r.top - b.top) + r.height / 2 };
  })();
  const CAM_SEL = fit(union({ x: 230, y: WORD.y - 150, w: 10, h: 10 }, WORD, LUNA_BOX), 16);
  const CAM_CARD = fit(union(WORD, BOX.define, TIP_BOX(), ...(LEAP ? [{ ...LUNA_BOX, x: LUNA_BOX.x + LEAP.dx }] : [])), 26);
  const CAM_SHOP = fit(union(BOX.shopAnswer, LUNA_BOX), 20);
  const CAM_FOOD = fit(union(BOX.foodAnswer, SOJU_BOX, LUNA_BOX), 16);
  const CAM_TEACH_ASK = fit(union(BOX.teachAnswer, LUNA_BOX), 30);
  const CAM_TEACH = fit({ x: 300, y: 70, w: 980, h: 420 }, 0);
  CAMERA.push(
    [0, FULL], [t.article + 2.3, FULL], [t.article + 3.1, CAM_SEL], [t.article + 3.8, CAM_SEL], [t.article + 4.6, CAM_CARD],
    [t.shop - 0.001, CAM_CARD], [t.shop, FULL], // scene changes happen under a transition, so the camera can jump
    [t.shop + 2.0, FULL], [t.shop + 2.9, CAM_SHOP], [t.menu - 0.001, CAM_SHOP], [t.menu, FULL],
    [t.menu + 1.4, FULL], [t.menu + 2.2, CAM_FOOD], [t.teach - 0.001, CAM_FOOD], [t.teach, FULL],
    [t.teach + 0.9, FULL], [t.teach + 1.6, CAM_TEACH_ASK], [t.teach + 3.6, CAM_TEACH_ASK], [t.teach + 4.3, CAM_TEACH],
    [t.duo - 0.001, CAM_TEACH], [t.duo, CAM_DUO_IN], [t.duo + 1.1, CAM_DUO],
  );
  const wordStart = { x: WORD.x - 1, y: WORD.y + WORD.h * 0.55 };
  const wordEnd = { x: WORD.x + WORD.w + 1, y: WORD.y + WORD.h * 0.55 };
  const hold = (a, b, p) => [[a, p], [b, p]];
  const CURSOR = [
    [t.article + 0.3, { x: 330, y: 640 }], [t.article + 1.3, { x: 700, y: 330 }], [t.article + 2.2, { x: 420, y: 470 }],
    ...hold(t.article + 2.8, t.article + 2.95, wordStart), [t.article + 3.45, wordEnd], [t.article + 3.9, { x: wordEnd.x + 34, y: WORD.y - 24 }],
    ...hold(t.article + 5.0, t.shop, tipAnchor),
    [t.shop + 0.2, { x: 520, y: 260 }], [t.shop + 0.9, pt(TILES[0], 0.5, 0.35)], [t.shop + 1.5, pt(TILES[2], 0.5, 0.35)],
    ...hold(t.shop + 2.2, t.shop + 2.3, CAT_PT), ...hold(t.shop + 2.85, t.shop + 3.05, shopChip), ...hold(t.shop + 3.8, t.menu, { x: 690, y: 610 }),
    [t.menu + 0.3, { x: 560, y: 300 }], [t.menu + 0.9, pt(DISHES[1], 0.4, 0.5)],
    ...hold(t.menu + 1.4, t.menu + 1.5, CAT_PT), ...hold(t.menu + 2.05, t.menu + 2.2, foodChip), ...hold(t.menu + 2.9, t.teach, { x: 690, y: 560 }),
    ...hold(t.teach + 0.6, t.teach + 4.3, { x: 560, y: 420 }),
    ...hold(t.teach + 4.9, t.teach + 5.0, pt(PNG)), ...hold(t.teach + 5.5, t.teach + 5.6, pt(NEXT_BTN)),
    ...hold(t.teach + 6.1, t.teach + 6.2, pt(EXPORT)), ...hold(t.teach + 6.7, t.teach + 6.8, pt(DONE_BTN)),
    [t.teach + 7.4, { x: 960, y: 560 }],
  ];
  const CLICKS = [t.shop + 2.25, t.shop + 2.95, t.menu + 1.45, t.menu + 2.15, t.teach + 4.95, t.teach + 5.55, t.teach + 6.15, t.teach + 6.75];
  const IBEAM_AT = [[t.article + 2.3, t.article + 3.9]];
  const CURSOR_HIDDEN = [[0, t.article + 0.3], [t.duo, DURATION + 1]];

  const SEL = { start: t.article + 2.95, end: t.article + 3.45, clear: t.shop };
  const CARD_DEF = { at: t.article + 3.6, out: t.shop };
  const TIP = { at: t.article + 5.4, out: t.shop };
  const SHOP = { chips: t.shop + 2.4, typing: t.shop + 3.0, answer: t.shop + 3.15, out: t.menu };
  const FOOD = { chips: t.menu + 1.6, cameo: t.menu + 2.2, answer: t.menu + 2.3, out: t.teach };
  const TEACH = { app: t.teach, keys: t.teach + 0.5, open: t.teach + 1.0, type: t.teach + 1.6, send: t.teach + 2.9, step1: t.teach + 3.9, png: t.teach + 4.95, step2: t.teach + 5.55, saved: t.teach + 6.15, done: t.teach + 6.75, out: t.duo };
  const CAMEO = PX.cameoScene('soju');
  const BLINKS = [4.9, 6.2, 8.4, 11.5, 15.6, 18.4, 22.9, 25.4, 31.3, 33.8, 37.4, 45.0];

  const CAPTIONS = [
    [t.article + 0.5, t.shop - 0.4, '1', 'Instant definitions'],
    [t.shop + 0.5, t.menu - 0.4, '2', 'Smart shopping: price per unit'],
    [t.menu + 0.5, t.teach - 0.4, '3', 'Food? Ask Soju'],
    [t.teach + 0.5, t.duo - 0.4, '4', 'Teach me on my screen'],
    [t.duo + 0.5, t.end - 0.1, '5', 'Two cats, one helper'],
  ];
  let BALLOONS = []; // [from, to, who, text], filled in once the voice cues are timed

  // ---------- the cats ----------
  const cursorAt = (tt) => track(CURSOR, tt);
  function lookAt(p) {
    return { x: clamp((p.x - EYES_AT.x) / 45, -6, 6), y: clamp((p.y - EYES_AT.y) / 45, -5, 5) };
  }
  function blinkLid(tt) {
    for (const b of BLINKS) if (within(tt, b, b + 0.3)) return [0.5, 1, 0.5][Math.floor((tt - b) / 0.1)];
    return 0.08;
  }
  const LUNA_ANIMS = PX.animationsFor('luna');
  const animFrame = (name, lt, who = 'luna', loop = false) => {
    const a = (who === 'luna' ? LUNA_ANIMS : PX.animationsFor(who))[name];
    const i = Math.floor(lt * a.fps);
    return a.frames[loop ? i % a.frames.length : Math.min(i, a.frames.length - 1)];
  };

  function lunaView(tt) {
    const lid = blinkLid(tt);
    const v = { now: spriteNow(tt), lidL: lid, lidR: lid, tailPeriod: 4200, look: tt >= t.article && tt < t.duo ? lookAt(cursorAt(tt)) : { x: 0, y: 0 } };
    if (within(tt, SEL.end, SEL.end + 0.25) || within(tt, SEL.end + 0.5, SEL.end + 0.62)) Object.assign(v, { twitchL: 14, twitchR: 14 });
    if (within(tt, SEL.end, t.article + 5.6)) Object.assign(v, { mood: 'curious', look: lookAt(centerOf(WORD)), tailPeriod: 900 });
    if (within(tt, t.shop + 0.5, t.shop + 2.1)) Object.assign(v, { glow: 0.5, look: { x: -6, y: -1 } });
    if (within(tt, SHOP.answer, t.menu - 0.3)) Object.assign(v, animFrame('judgeStare', tt - SHOP.answer), { now: spriteNow(tt) });
    if (within(tt, FOOD.cameo, FOOD.cameo + 0.7)) Object.assign(v, { mood: 'judgy', lidL: 0.52, lidR: 0.52, look: { x: 0, y: 0 } });
    else if (within(tt, FOOD.cameo + 0.7, t.teach - 0.3)) Object.assign(v, { look: { x: 6, y: 1 } });
    if (within(tt, TEACH.keys + 0.3, TEACH.keys + 0.55)) Object.assign(v, { twitchL: 14, twitchR: 14 });
    if (within(tt, TEACH.send, TEACH.step1)) Object.assign(v, animFrame('think', tt - TEACH.send, 'luna', true), { now: spriteNow(tt) });
    if (within(tt, TEACH.done, t.duo)) Object.assign(v, { mood: 'happy', happy: 1 });
    if (leapAt(tt).flying) v.travel = 'leap';
    if (speaking('luna', tt)) v.mouth = 'open';
    for (const c of CLICKS.slice(0, 1).concat(CLICKS[2])) if (within(tt, c, c + 0.35)) Object.assign(v, { mood: 'happy', happy: 1 });
    return v;
  }

  const DUO_ENTER = Array.from({ length: 8 }, (_, i) => ({ luna: { look: { x: 6, y: 0 } }, soju: { travel: 'run', facing: -1, legs: i % 4 }, sx: PX.GAP + 64 - i * 8, ms: 90 }));
  const NAP = PX.DUO_SCENES.cuddleNap.steps.slice(0, 4).map((s) => ({ ...s, ms: 450 }));
  const DRESS = [
    { luna: { mood: 'wide' }, soju: { mood: 'wide' }, ms: 300, dress: true },
    { luna: { mood: 'happy', happy: 1 }, soju: { mood: 'happy', happy: 1 }, ms: 500, dress: true },
    { luna: { look: { x: 6, y: 0 } }, soju: { look: { x: -6, y: 0 } }, ms: 500, dress: true },
    { luna: { mood: 'happy', happy: 1 }, soju: { mood: 'happy', happy: 1 }, ms: 3000, dress: true },
  ];
  const DUO_STEPS = [...DUO_ENTER, { luna: {}, soju: {}, ms: 200 }, ...PX.DUO_SCENES.groomSoju.steps.map((s) => ({ ms: PX.DUO_SCENES.groomSoju.ms, ...s })), ...NAP, ...DRESS];
  const DRESS_AT = t.duo + DUO_STEPS.slice(0, DUO_STEPS.indexOf(DRESS[0])).reduce((sum, s) => sum + s.ms / 1000, 0);
  const COSTUMES = { luna: 'witch', soju: 'strawberry' };

  // ---------- voices: when each line starts (render.js passes clip lengths and mouth tracks in window.DEMO_VOICES) ----------
  const VOICE_LINES = C.voiceLines(PERSONA);
  const clip = (id) => (window.DEMO_VOICES || {})[id] || { duration: 1.4, mouth: [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0] };
  const stepStart = (steps, pick, defaultMs = 250) => {
    let acc = 0;
    for (const st of steps) { if (pick(st)) return acc; acc += (st.ms ?? defaultMs) / 1000; }
    return acc;
  };
  const VOICE_AT = {
    greet: INTRO.reveal + 1.0,
    what: SEL.end + 0.1,
    opinions: t.shop + 0.55,
    darling: SHOP.answer + 0.6,
    dept: FOOD.cameo + 0.05,
    food: FOOD.cameo + stepStart(CAMEO.steps, (st) => st.say === 'guest'),
    purr: t.duo + stepStart(DUO_STEPS, (st) => st.soju?.happy && st.soju?.bodyRot) + 0.05,
    acceptable: DRESS_AT + 0.35,
    byeLuna: t.end + 1.2,
  };
  VOICE_AT.acceptabubble = VOICE_AT.acceptable + clip('acceptable').duration + 0.12; // Soju copies his sister, a bit wrong
  VOICE_AT.byeSoju = VOICE_AT.byeLuna + clip('byeLuna').duration + 0.1;
  function speaking(who, tt) {
    for (const l of VOICE_LINES) {
      if (l.who !== who) continue;
      const at = VOICE_AT[l.id];
      const { duration, mouth } = clip(l.id);
      if (within(tt, at, at + duration)) return mouth[Math.floor((tt - at) * 12)] === 1;
    }
    return false;
  }
  const SCREEN_LINES = ['greet', 'byeLuna', 'byeSoju']; // said on the title and end cards, not on the desktop
  BALLOONS = [
    ...VOICE_LINES.filter((l) => !SCREEN_LINES.includes(l.id)).map((l) => [VOICE_AT[l.id], VOICE_AT[l.id] + Math.max(1.5, clip(l.id).duration + 0.45), l.who, l.text]),
    [t.teach + 7.1, t.duo - 0.2, 'luna', line(C.lines.teachDone)],
  ].sort((a, b) => a[0] - b[0]);
  const screenBalloon = (id) => { const l = VOICE_LINES.find((x) => x.id === id); return [VOICE_AT[id], VOICE_AT[id] + clip(id).duration + 0.5, l.text]; };

  const talk = (scene, tt) => ({ ...scene, cats: scene.cats.map((c) => (speaking(c.id, tt) ? { ...c, view: { ...c.view, mouth: 'open' } } : c)) });
  function catsAt(tt) {
    const now = spriteNow(tt);
    if (tt >= t.duo) {
      const step = beatAt(DUO_STEPS, tt - t.duo) || DRESS[DRESS.length - 1];
      const lid = blinkLid(tt);
      const live = { luna: { view: { now, lidL: lid, lidR: lid } } };
      return { step, ...talk(PX.sceneLayers(step, LUNA_COL, { now, costumes: step.dress ? COSTUMES : {}, live }), tt) };
    }
    const live = { luna: { view: lunaView(tt) } };
    if (tt >= FOOD.cameo) {
      const step = beatAt(CAMEO.steps, tt - FOOD.cameo);
      if (step) return { step, ...talk(PX.sceneLayers(step, LUNA_COL, { now, live }), tt) };
    }
    return { step: {}, cats: [{ id: 'luna', view: live.luna.view, x: LUNA_COL }], props: [] };
  }
  function drawCats(tt) {
    const { cats, props, step } = catsAt(tt);
    PX.drawScene(catsCanvas.getContext('2d'), PX.composeScene({ width: CATS_W, cats, props }), 1, { rim: RIM });
    const leap = leapAt(tt);
    catsCanvas.style.translate = `${leap.x}px ${leap.y}px`;
    return step;
  }

  // ---------- sparkles ----------
  const SPARK_SVG = (c) => `<svg viewBox="0 0 5 5" shape-rendering="crispEdges"><path fill="#2b2238" d="M2-1h1v2h2v1H3v2H2V3H0V2h2z" transform="translate(.35 .35)" opacity=".35"/><path fill="${c}" d="M2 0h1v2h2v1H3v2H2V3H0V2h2z"/></svg>`;
  function sparkleLayer(container, list) {
    return list.map(([x, y, size = 20, color = '#ffd166', phase = 0]) => {
      const el = Object.assign(document.createElement('div'), { className: 'spark', innerHTML: SPARK_SVG(color) });
      Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px`, margin: `${-size / 2}px 0 0 ${-size / 2}px` });
      container.append(el);
      return { el, phase };
    });
  }
  const twinkle = (s, tt, on) => {
    const k = (Math.sin((tt * 1.6 + s.phase) * Math.PI * 2) + 1) / 2;
    const level = Math.round(k * 4) / 4;
    s.el.style.opacity = on ? String(level) : '0';
    s.el.style.transform = `scale(${0.4 + 0.6 * level})`;
  };
  const tileSparks = sparkleLayer($('#sparkles'), TILES.flatMap((r, i) => [[r.x + 24, r.y + 30, 18, '#ffffff', i * 0.3], [r.x + r.w - 26, r.y + 60, 22, '#ffd166', i * 0.3 + 0.5], [r.x + r.w * 0.55, r.y + 22, 14, '#ff8fb8', i * 0.3 + 0.25]]));
  const titleSparks = sparkleLayer($('#screenSparkles'), [[520, 200, 34], [1090, 260, 28, '#ff8fb8', 0.4], [470, 560, 26, '#b9a4ff', 0.2], [1130, 600, 36, '#ffd166', 0.7], [800, 90, 22, '#6fd6a8', 0.55]]);
  const DRESS_POINTS = [[LUNA_BOX.x + 10, LUNA_BOX.y + 6], [LUNA_BOX.x + 70, LUNA_BOX.y - 10], [SOJU_BOX.x + 20, SOJU_BOX.y - 6], [SOJU_BOX.x + 76, SOJU_BOX.y + 10], [LUNA_BOX.x + 40, LUNA_BOX.y - 22], [SOJU_BOX.x + 46, SOJU_BOX.y - 24], [LUNA_BOX.x - 6, LUNA_BOX.y + 50], [SOJU_BOX.x + 86, SOJU_BOX.y + 52]];
  const dressSparks = sparkleLayer($('#sparkles'), DRESS_POINTS.map(([x, y], i) => [x, y, 18 + (i % 3) * 5, ['#ffd166', '#ff8fb8', '#b9a4ff', '#ffffff'][i % 4], i * 0.13]));
  const endSparks = sparkleLayer($('#screenSparkles'), [[430, 250, 30], [1170, 230, 34, '#ff8fb8', 0.3], [380, 640, 26, '#b9a4ff', 0.6], [1220, 620, 30, '#6fd6a8', 0.15]]);

  // ---------- title and end cards ----------
  const titleCat = $('#titleCat');
  const endCats = $('#endCats');
  const tagline = $('#title .tagline');
  const TAGLINE = tagline.textContent;
  const sayEl = $('#say');
  const caption = $('#caption');
  const tipEl = $('#tip');
  tipEl.textContent = '⚡ instant · WordNet dictionary';
  const keys = [...document.querySelectorAll('#keys kbd')];
  let overlayKey = null;

  function popScale(tt, at, dur = 0.36) {
    const p = prog(tt, at, at + dur);
    if (p <= 0) return 0;
    return [0.4, 0.75, 1.08, 1][Math.min(3, Math.floor(p * 4))];
  }

  // ---------- seek ----------
  // ---------- 90s transitions, drawn on a 160×100 grid and stepped at 12 fps ----------
  const HALF = 4 / 12; // four steps to cover, four to reveal
  const TRANSITIONS = [
    { at: INTRO.reveal, kind: 'wipe', colors: ['#ffd6e7', '#ffc2da'] },
    { at: t.article, kind: 'dissolve', colors: ['#ffd6e7', '#ffc2da'] },
    { at: t.shop, kind: 'wipe', colors: ['#d9ccff', '#c4b2ff'] },
    { at: t.menu, kind: 'iris' },
    { at: t.teach, kind: 'dissolve', colors: ['#d4f5e5', '#b5ecd2'] },
    { at: t.duo, kind: 'iris' },
  ];
  const fx = $('#fx');
  fx.width = 160;
  fx.height = 100;
  const fxCtx = fx.getContext('2d');
  const fxImage = fxCtx.createImageData(160, 100);
  const fxPixels = new Uint32Array(fxImage.data.buffer);
  const rgba = (hex) => { const n = parseInt(hex.slice(1), 16); return ((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16)) >>> 0; };
  seed = 42;
  const DISSOLVE_RANK = (() => {
    const order = Array.from({ length: 32 * 20 }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const rank = new Array(order.length);
    order.forEach((cell, i) => { rank[cell] = i / order.length; });
    return rank;
  })();
  const INK = rgba('#2b2238');
  const STAR = [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]];
  function drawTransition(tt) {
    const tr = TRANSITIONS.find((x) => tt >= x.at - HALF && tt < x.at + HALF);
    fx.style.display = tr ? 'block' : 'none';
    if (!tr) return;
    const q = Math.min(7, Math.floor((tt - (tr.at - HALF)) * 12 + 1e-6)); // 0..3 cover, 4..7 reveal
    const covering = q < 4;
    const amount = covering ? (q + 1) / 4 : (q - 3) / 4; // how far the cover (or the reveal) has got
    fxPixels.fill(0);
    const put = (x, y, c) => { if (x >= 0 && x < 160 && y >= 0 && y < 100) fxPixels[y * 160 + x] = c; };
    if (tr.kind === 'dissolve') {
      const [a, b] = tr.colors.map(rgba);
      for (let y = 0; y < 100; y++) for (let x = 0; x < 160; x++) {
        const r = DISSOLVE_RANK[Math.floor(y / 5) * 32 + Math.floor(x / 5)];
        if (covering ? r < amount : r >= amount) put(x, y, (Math.floor(x / 5) + Math.floor(y / 5)) % 2 ? a : b);
      }
    } else if (tr.kind === 'wipe') {
      // a stepped curtain sweeps across with a jagged pixel edge and sparkles riding on it
      const [a, b] = tr.colors.map(rgba);
      const edge = amount * 176 - 8;
      const jag = (y) => (Math.floor(y / 4) % 3) * 3;
      for (let y = 0; y < 100; y++) for (let x = 0; x < 160; x++) {
        if (covering ? x < edge - jag(y) : x > edge - jag(y)) put(x, y, Math.floor(y / 4) % 2 ? a : b);
      }
      [8, 30, 52, 74, 94].forEach((y, i) => {
        const c = rgba(['#ffffff', '#ffd166', '#ff8fb8'][(i + q) % 3]);
        for (const [dx, dy] of STAR) put(Math.round(edge - jag(y)) + (covering ? 2 : -2) + dx, y + dy, c);
      });
    } else {
      // iris: a blocky circle closes on Luna, a heart blinks, and it opens on her again
      const cx = (camNow.tx + (LUNA_X + 16 * CELL) * camNow.s) / 10;
      const cy = (camNow.ty + (CATS.y + 20 * CELL) * camNow.s) / 10;
      const radius = (covering ? 1 - amount : amount) * 190;
      for (let y = 0; y < 100; y++) for (let x = 0; x < 160; x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > radius) put(x, y, INK);
      if (q === 3) {
        const colors = { h: rgba('#ff8fb8'), w: rgba('#ffffff'), O: rgba('#ff8fb8') };
        PX.MAPS.HEART.forEach((row, j) => [...row].forEach((ch, i) => { if (colors[ch] && ch !== 'O') put(Math.round(cx) - 3 + i, Math.round(cy) - 4 + j, colors[ch]); }));
      }
    }
    fxCtx.putImageData(fxImage, 0, 0);
  }
  function placeScreenBalloon(el, [a, b, text], tt) {
    el.hidden = !within(tt, a, b);
    if (el.hidden) return;
    el.textContent = text;
    const p = stepped(prog(tt, a, a + 0.3), 3);
    Object.assign(el.style, { opacity: String(p), translate: `0 ${6 - 6 * p}px` });
  }

  let camNow = { tx: 0, ty: 0, s: 1.25 };
  // ---------- the hook: a confusing page, a tired cursor, the copy-paste-into-a-chatbot dance ----------
  const HOOK1 = 'Ever get stuck on a confusing page…';
  const HOOK2 = '…and end up copy-pasting it into a chatbot?';
  const hookText = $('#hookText');
  const HOOK_TEXT = hookText.textContent;
  $('#hookCursor').innerHTML = CURSORS.arrow;
  const HOOK_PATH = [[0.2, { x: 360, y: 640 }], [1.0, { x: 520, y: 420 }], [1.45, { x: 470, y: 440 }], [1.85, { x: 880, y: 470 }], [2.6, { x: 1230, y: 470 }]];
  function drawHook(tt) {
    const hook = $('#hook');
    hook.style.display = tt < INTRO.reveal ? 'flex' : 'none';
    if (tt >= INTRO.reveal) return;
    $('#hook1').textContent = HOOK1.slice(0, Math.max(0, Math.floor((tt - 0.15) / 0.03)));
    $('#hook2').textContent = HOOK2.slice(0, Math.max(0, Math.floor((tt - 1.55) / 0.025)));
    $('.hook-browser').style.transform = `scale(${popScale(tt, 0.05, 0.3)})`;
    const sel = Math.floor(stepped(prog(tt, 1.45, 1.8), 6) * HOOK_TEXT.length);
    hookText.innerHTML = sel ? `<mark>${HOOK_TEXT.slice(0, sel)}</mark>${HOOK_TEXT.slice(sel)}` : HOOK_TEXT;
    $('#hookKey').style.transform = `scale(${popScale(tt, 1.85, 0.3)})`;
    $('#hookKey').style.opacity = tt < 2.5 ? '1' : '0';
    $('.hook-bot').style.transform = `scale(${popScale(tt, 2.1, 0.3)})`;
    $('#hookPaste').textContent = tt > 2.6 ? 'Notwithstanding the foregoing, the licensee shall…' : 'Paste here…';
    const p = track(HOOK_PATH, tt);
    const wobble = Math.round(Math.sin(tt * 3) * 6); // a tired, droopy cursor
    $('#hookCursor').style.transform = `translate(${p.x}px, ${p.y + wobble}px)`;
    const sweat = $('#hookSweat');
    sweat.style.opacity = within(tt, 0.9, 1.45) || tt > 2.65 ? '1' : '0';
    sweat.style.transform = `translate(${p.x + 30}px, ${p.y - 30 + Math.floor((tt * 6) % 3) * 4}px)`;
  }
  function seek(tt) {
    // camera
    const cam = track(CAMERA, tt);
    const s = 1.25 * cam.z;
    const free = tt >= t.duo && tt < t.end;
    const tx = free ? 800 - cam.x * s : clamp(800 - cam.x * s, 1600 - W * s, 0);
    const ty = free ? 500 - cam.y * s : clamp(500 - cam.y * s, 1000 - H * s, 0);
    camNow = { tx, ty, s };
    world.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${s.toFixed(4)})`;

    // title (iris opens onto the desktop) and end card (iris closes into it)
    const title = $('#title');
    drawHook(tt);
    title.style.display = tt >= INTRO.reveal && tt < t.article ? 'flex' : 'none';
    if (tt >= INTRO.reveal && tt < t.article) {
      const r = INTRO.reveal;
      const lid = blinkLid(tt);
      const view = within(tt, INTRO.value - 0.5, INTRO.value + 0.3) ? { now: spriteNow(tt), mood: 'happy', happy: 1 } : { now: spriteNow(tt), lidL: lid, lidR: lid, tailPeriod: 2000, look: within(tt, r + 2.2, r + 3.0) ? { x: 6, y: 1 } : { x: 0, y: 0 } };
      if (speaking('luna', tt)) view.mouth = 'open';
      drawSprite(titleCat, view, 'luna');
      titleCat.style.transform = `scale(${popScale(tt, r + 0.15, 0.4)})`;
      placeScreenBalloon($('#titleSay'), screenBalloon('greet'), tt);
      $('#title .meet').style.transform = `scale(${popScale(tt, r + 0.3)})`;
      $('#title .logo').style.transform = `scale(${popScale(tt, r + 0.45)})`;
      const valueOn = tt >= INTRO.value;
      tagline.style.display = valueOn ? 'none' : '';
      tagline.textContent = TAGLINE.slice(0, Math.max(0, Math.floor((tt - r - 0.9) / 0.025)));
      tagline.style.minHeight = '1.5em';
      const value = $('#title .value');
      value.style.display = valueOn ? 'flex' : 'none';
      value.querySelector('.value-big').style.transform = `scale(${popScale(tt, INTRO.value, 0.3)})`;
      value.querySelector('.value-small').style.opacity = tt > INTRO.value + 0.6 ? '1' : '0';
      value.querySelectorAll('.value-chips span').forEach((chip, i) => { chip.style.transform = `scale(${popScale(tt, INTRO.value + 1.1 + i * 0.18, 0.3)})`; });
      // Soju peeks in from the screen edge, looking at his sister
      const peek = $('#peekSoju');
      drawSprite(peek, { now: spriteNow(tt), look: { x: -6, y: 0 }, ...(within(tt, r + 2.6, r + 2.9) ? { lidL: 1, lidR: 1 } : {}) }, 'soju');
      peek.style.right = `${-256 + 128 * stepped(prog(tt, r + 1.6, r + 2.0), 4) - 128 * stepped(prog(tt, INTRO.value + 2.4, INTRO.value + 2.8), 4)}px`;
    }
    const endOn = tt >= t.end;
    const end = $('#end');
    end.style.display = endOn ? 'flex' : 'none';
    const pop = popScale(tt, t.end, 0.4);
    Object.assign(end.style, { transform: `scale(${pop})`, borderRadius: pop < 1 ? '40px' : '0', boxShadow: pop < 1 ? '10px 10px 0 #2b2238' : 'none', outline: pop < 1 ? '6px solid #2b2238' : 'none' });
    if (endOn) {
      const heart = PX.DUO_SCENES.heart.steps;
      const lt = tt - t.end - 0.5;
      let step = lt < 0 ? heart[0] : beatAt(heart.slice(0, 6), lt, 300);
      if (!step) step = { ...heart[3 + (Math.floor((lt - 1.8) * 3) % 2)], props: [['HEART', 25, -5 - (Math.floor((lt - 1.8) * 3) % 2)]] };
      const blinkAt = 3.1;
      if (within(lt, blinkAt, blinkAt + 0.2)) step = { ...step, luna: { lidL: 1, lidR: 1 }, soju: { lidL: 1, lidR: 1 } };
      endCats.width = 64;
      endCats.height = PX.ROWS;
      PX.drawScene(endCats.getContext('2d'), PX.composeScene({ width: 64, ...talk(PX.sceneLayers(step, 4, { now: spriteNow(tt) }), tt) }), 1, { rim: RIM });
      placeScreenBalloon($('#endSayLuna'), screenBalloon('byeLuna'), tt);
      placeScreenBalloon($('#endSaySoju'), screenBalloon('byeSoju'), tt);
      $('#end .logo').style.transform = `scale(${popScale(tt, t.end + 0.7)})`;
      $('#end .cta').style.transform = `scale(${popScale(tt, t.end + 1.0)})`;
      document.querySelectorAll('#end .url-pill').forEach((pill, i) => { pill.style.transform = `scale(${popScale(tt, t.end + 1.3 + i * 0.25)})`; });
      $('#end .tagline').style.opacity = tt > t.end + 1.9 ? '1' : '0';
    }
    titleSparks.forEach((sp) => twinkle(sp, tt, tt >= INTRO.reveal && tt < t.article));
    endSparks.forEach((sp) => twinkle(sp, tt, endOn && tt > t.end + 0.5));

    // windows and pages
    const editorOn = tt >= TEACH.app && tt < TEACH.out;
    $('#browser').style.display = editorOn || tt >= t.duo ? 'none' : 'block';
    $('#editor').style.display = editorOn ? 'block' : 'none';
    $('#editor').style.transform = editorOn ? `scale(${popScale(tt, TEACH.app, 0.3) || 1})` : '';
    $('#appName').textContent = editorOn ? 'Pixelpad' : 'Browser';
    $('#mbExtra').textContent = editorOn ? 'Image' : 'History';
    const page = tt < t.shop ? 'article' : tt < t.menu ? 'shop' : 'menu';
    showPage(page);
    $('#tabTitle').textContent = { article: 'Slow travel', shop: 'Sparkling water', menu: 'The Little Fork' }[page];
    $('#tabIcon').textContent = { article: '✈︎', shop: '🛒', menu: '🍴' }[page];
    $('#url').textContent = { article: 'wanderlust.blog/slow-travel', shop: 'bubblemart.shop/sparkling-water', menu: 'thelittlefork.com/menu' }[page];
    $('#word').style.setProperty('--sel', tt >= SEL.clear ? 0 : stepped(prog(tt, SEL.start, SEL.end), 9));
    const cur = cursorAt(tt);
    document.querySelectorAll('.prod').forEach((el, i) => el.classList.toggle('hover', page === 'shop' && cur.x >= TILES[i].x && cur.x <= TILES[i].x + TILES[i].w && cur.y >= TILES[i].y && cur.y <= TILES[i].y + TILES[i].h));
    tileSparks.forEach((sp) => twinkle(sp, tt, page === 'shop'));
    const segs = $('#fmtPng').parentElement.children;
    segs[0].classList.toggle('on', tt < TEACH.png);
    segs[1].classList.toggle('on', tt >= TEACH.png);
    $('#exportBtn').classList.toggle('down', within(tt, TEACH.saved, TEACH.saved + 0.12));
    $('#toast').style.opacity = within(tt, TEACH.saved + 0.1, TEACH.out) ? '1' : '0';

    // cats and their balloon
    const step = drawCats(tt);
    const balloon = [...BALLOONS].reverse().find(([a, b]) => within(tt, a, b));
    sayEl.hidden = !balloon;
    if (balloon) {
      const [a, , who, text] = balloon;
      sayEl.textContent = text;
      const col = LUNA_COL + (who === 'luna' ? step.lx ?? 0 : step.sx ?? PX.GAP) + PX.W / 2;
      const half = sayEl.offsetWidth / 2;
      const leap = who === 'luna' ? leapAt(tt) : { x: 0, y: 0 };
      const x = clamp(CATS.x + col * CELL + leap.x, half + 4, W - half - 4);
      const p = stepped(prog(tt, a || tt, (a || tt) + 0.3), 3);
      Object.assign(sayEl.style, { left: `${x}px`, top: `${CATS.y + (PX.TOP + 1) * CELL - 2 - (step.dress ? 26 : 0) + leap.y}px`, opacity: a ? String(p) : '1', translate: a ? `0 ${4 - 4 * p}px` : '0 0' });
    }
    dressSparks.forEach((sp, i) => {
      const lt = tt - DRESS_AT + 0.25 - i * 0.04;
      const on = lt > 0 && lt < 1.2;
      twinkle(sp, tt * 2, on);
      if (on) sp.el.style.translate = `0 ${-Math.floor(lt * 6) * 4}px`;
    });

    // the bubble: which card shows when, and where main.js would put it
    let pick = null; // [placement, spec, shown at, bubble opened at]
    if (within(tt, CARD_DEF.at, CARD_DEF.out)) pick = ['define', B.define, CARD_DEF.at, CARD_DEF.at];
    else if (within(tt, SHOP.chips, SHOP.typing)) pick = ['shopChips', B.shopChips, SHOP.chips, SHOP.chips];
    else if (within(tt, SHOP.typing, SHOP.answer)) pick = ['shopTyping', B.shopTyping, SHOP.typing, SHOP.chips];
    else if (within(tt, SHOP.answer, SHOP.out)) pick = ['shopAnswer', B.shopAnswer, SHOP.answer, SHOP.chips];
    else if (within(tt, FOOD.chips, FOOD.answer)) pick = ['foodChips', B.foodChips, FOOD.chips, FOOD.chips];
    else if (within(tt, FOOD.answer, FOOD.out)) pick = ['foodAnswer', B.foodAnswer, FOOD.answer, FOOD.chips];
    else if (within(tt, TEACH.open, TEACH.send)) pick = ['teachAsk', teachTyped(Math.floor(clamp((tt - TEACH.type) / 0.04, 0, C.teach.question.length))), TEACH.open, TEACH.open];
    else if (within(tt, TEACH.send, TEACH.step1)) pick = ['teachThink', B.teachThink, TEACH.send, TEACH.open];
    else if (within(tt, TEACH.step1, TEACH.out)) pick = ['teachAnswer', B.teachAnswer, TEACH.step1, TEACH.open];
    bubbleEl.style.display = pick ? 'block' : 'none';
    if (pick) {
      const [name, spec, at, opened] = pick;
      const box = BOX[name];
      setBubble(spec, at);
      bubbleEl.classList.toggle('at-selection', Boolean(spec.anchor));
      Object.assign(bubbleEl.style, { left: `${box.x}px`, top: `${box.y}px`, transform: `scale(${[0.6, 0.85, 1][Math.min(2, Math.floor(prog(tt, opened, opened + 0.18) * 3))]})` });
    }
    tipEl.hidden = !within(tt, TIP.at, TIP.out);
    Object.assign(tipEl.style, { left: `${TIP_BOX().x}px`, top: `${TIP_BOX().y}px` });

    // the Teach overlay, drawn by renderer/overlay.js
    let want = null;
    if (within(tt, TEACH.step1, TEACH.step2)) want = [1, TEACH.step1];
    else if (within(tt, TEACH.step2, TEACH.done + 0.4)) want = [2, TEACH.step2];
    const key = want ? want[0] : null;
    if (key !== overlayKey) {
      overlayKey = key;
      if (want) window.LoonOverlay.render(TEACH_PAYLOAD(want[0]));
      else layer.replaceChildren();
      layer.dataset.at = want ? want[1] : 0;
    }
    layer.style.opacity = String(1 - stepped(prog(tt, TEACH.done, TEACH.done + 0.32), 4));

    // ⌥⇧T keycaps
    keys.forEach((k, i) => {
      const at0 = TEACH.keys + i * 0.12;
      const sc = popScale(tt, at0, 0.3);
      const down = within(tt, TEACH.keys + 0.42, TEACH.keys + 0.6);
      const gone = stepped(prog(tt, TEACH.keys + 1.0, TEACH.keys + 1.25), 3);
      k.style.opacity = String(sc ? 1 - gone : 0);
      k.style.transform = `translateY(${down ? 6 : 0}px) scale(${sc})`;
      k.style.boxShadow = down ? '0 2px 0 var(--ink)' : '';
    });

    // caption
    const cap = CAPTIONS.find(([a, b]) => within(tt, a, b));
    caption.style.opacity = cap ? '1' : '0';
    if (cap) {
      caption.querySelector('.num').textContent = cap[2];
      caption.querySelector('.text').textContent = cap[3];
      const outP = stepped(prog(tt, cap[1] - 0.2, cap[1]), 3);
      caption.style.transform = `scale(${popScale(tt, cap[0], 0.3) * (1 - outP * 0.4)})`;
      caption.style.opacity = String(1 - outP);
    }

    // cursor
    const hidden = CURSOR_HIDDEN.some(([a, b]) => within(tt, a, b));
    cursorEl.style.display = hidden ? 'none' : 'block';
    const kind = IBEAM_AT.some(([a, b]) => within(tt, a, b)) ? 'ibeam' : 'arrow';
    if (cursorEl.dataset.kind !== kind) { cursorEl.innerHTML = CURSORS[kind]; cursorEl.dataset.kind = kind; }
    const press = CLICKS.find((c) => within(tt, c, c + 0.12));
    cursorEl.style.transform = `translate(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px) translate(0, ${kind === 'ibeam' ? -12 : 0}px) scale(${press ? 0.86 : 1})`;
    const click = CLICKS.find((c) => within(tt, c, c + 0.3));
    ring.style.display = click && !hidden ? 'block' : 'none';
    if (click) {
      const r = 6 + Math.floor((tt - click) / 0.1) * 7;
      Object.assign(ring.style, { left: `${cur.x - r}px`, top: `${cur.y - r}px`, width: `${r * 2}px`, height: `${r * 2}px`, opacity: String(1 - Math.floor((tt - click) / 0.1) * 0.3) });
    }

    drawTransition(tt);

    // CSS animations from the real stylesheets (bubble rise, overlay pop/blink/nudge) follow the timeline too
    for (const a of document.getAnimations()) {
      const host = a.effect?.target?.closest?.('[data-at]');
      a.currentTime = Math.max(0, (tt - (host ? Number(host.dataset.at) : 0)) * 1000);
    }
  }

  // ---------- sound cues for demo/music.js ----------
  const SFX = [
    ...TRANSITIONS.map((tr) => ({ t: tr.at - HALF, kind: 'sparkle' })), { t: t.end, kind: 'sparkle' }, { t: DRESS_AT, kind: 'sparkle' },
    ...[0.2, 1.85, 2.1, INTRO.reveal + 0.3, INTRO.reveal + 0.9, INTRO.reveal + 1.6, INTRO.value, INTRO.value + 0.7, CARD_DEF.at, SHOP.chips, SHOP.answer, FOOD.chips, TEACH.open, TEACH.step1, TEACH.step2, t.end + 0.7].map((at) => ({ t: at, kind: 'pop' })),
    ...CLICKS.map((at) => ({ t: at, kind: 'click' })), { t: TEACH.keys + 0.42, kind: 'click' },
    ...CAMEO.steps.reduce((acc, st) => {
      if (st.soju?.act === 'eat' && st.soju.mouth === 'open') acc.list.push({ t: FOOD.cameo + acc.at, kind: 'munch' });
      acc.at += (st.ms ?? 250) / 1000;
      return acc;
    }, { at: 0, list: [] }).list,
    { t: t.end + 0.5 + 0.6, kind: 'heart' },
  ].sort((a, b) => a.t - b.t);
  const cues = { sfx: SFX, voice: VOICE_LINES.map((l) => ({ t: VOICE_AT[l.id], id: l.id })) };

  // ---------- the 10-second social clip: cuts from the timeline above, with big captions over the stage ----------
  const CLIP_CUTS = [
    { from: t.article + 2.3, to: t.article + 6.0, big: 'Highlight anything', small: 'Luna hops over and explains it instantly' },
    { from: t.menu + 0.3, to: t.menu + 4.4, big: 'Looking at a menu?', small: 'Soju runs in, Loon picks the lightest dishes' },
    { from: t.end + 0.3, to: t.end + 2.5, big: 'Loon · free · runs on your Mac', small: 'Open source · no account · no API key' },
  ];
  let acc = 0;
  for (const c of CLIP_CUTS) { c.start = acc; acc += c.to - c.from; }
  const CLIP_DURATION = acc;
  const clipTop = $('#clipTop');
  function seekClip(ct) {
    const cut = [...CLIP_CUTS].reverse().find((c) => ct >= c.start) || CLIP_CUTS[0];
    seek(Math.min(cut.to, cut.from + ct - cut.start));
    clipTop.querySelector('b').textContent = cut.big;
    clipTop.querySelector('span').textContent = cut.small;
    clipTop.querySelector('b').style.transform = `scale(${popScale(ct, cut.start, 0.3)})`;
    clipTop.querySelector('span').style.opacity = ct > cut.start + 0.25 ? '1' : '0';
  }
  const inClip = (m) => CLIP_CUTS.find((c) => m >= c.from && m < c.to);
  const toClip = (list) => list.filter((x) => inClip(x.t)).map((x) => ({ ...x, t: x.t - inClip(x.t).from + inClip(x.t).start }));
  const clipReel = { seek: seekClip, DURATION: CLIP_DURATION, cues: { sfx: [...toClip(SFX), ...CLIP_CUTS.slice(1).map((c) => ({ t: c.start, kind: 'sparkle' }))], voice: toClip(cues.voice) } };

  window.DEMO = { seek, DURATION, FPS: 30, T, cues, clip: clipReel };

  seek(0);
  window.stageReady = true;
})();
