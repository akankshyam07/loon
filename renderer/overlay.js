// "Teach me on my screen" overlay (DESIGN.md §3.18): draws what main sends for this display (targets, numbered badges,
// label cards, chunky pixel arrows, a small pointing cat) and nothing else. The window ignores the mouse; only the
// card's ✕ and Next take clicks, and main lets them through while the pointer is over them.
(() => {
  const L = window.LoonOverlayLayout;
  const PX = window.LoonPixel;
  const layer = document.getElementById('layer');
  const CELL = 5; // arrow pixel size
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const el = (tag, className, props = {}) => Object.assign(document.createElement(tag), { className, ...props });
  const place = (node, { x, y, w, h }) => {
    Object.assign(node.style, { left: `${x}px`, top: `${y}px` });
    if (w != null) node.style.width = `${w}px`;
    if (h != null) node.style.height = `${h}px`;
    return node;
  };

  // "Press ⇧⌘P" → keycaps; everything else is plain text (never HTML from the model).
  function sayNode(text, keys) {
    const span = el('span', 'say');
    if (!keys) return Object.assign(span, { textContent: text });
    span.append('Press ', ...[...keys.replace('Space', '␣')].map((k) => el('kbd', '', { textContent: k === '␣' ? 'Space' : k })));
    return span;
  }

  // A stepped line of square cells ending in a pixel arrowhead (one of 8 directions), on its own small canvas so the
  // current one can bob toward its target. Heads are offsets from the tip cell: east, and south-east.
  const HEAD_E = [];
  for (let c = 0; c < 5; c++) for (let r = c - 4; r <= 4 - c; r++) HEAD_E.push([c - 4, r]);
  const HEAD_SE = [];
  for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) if (x + y >= 4) HEAD_SE.push([x - 4, y - 4]);
  const turn = ([x, y], quarters) => { for (let i = 0; i < quarters; i++) [x, y] = [-y, x]; return [x, y]; };

  function arrowCanvas({ from, to }, now) {
    const pad = CELL * 6;
    const x0 = Math.min(from.x, to.x) - pad;
    const y0 = Math.min(from.y, to.y) - pad;
    const canvas = place(el('canvas', `arrow${now ? ' now' : ''}`), { x: x0, y: y0 });
    canvas.width = Math.abs(to.x - from.x) + pad * 2;
    canvas.height = Math.abs(to.y - from.y) + pad * 2;
    const ctx = canvas.getContext('2d');
    const f = { x: (from.x - x0) / CELL, y: (from.y - y0) / CELL };
    const t = { x: Math.round((to.x - x0) / CELL), y: Math.round((to.y - y0) / CELL) };
    const angle = Math.atan2(t.y - f.y, t.x - f.x);
    const dir = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
    const quarters = Math.floor(dir / 2);
    const cells = new Map();
    const add = (x, y) => cells.set(`${x},${y}`, [x, y]);
    for (const p of (dir % 2 ? HEAD_SE : HEAD_E)) {
      const [dx, dy] = turn(p, quarters);
      add(t.x + dx, t.y + dy);
    }
    const [bx, by] = turn(dir % 2 ? [-3, -3] : [-5, 0], quarters); // where the shaft meets the head
    const end = { x: t.x + bx, y: t.y + by };
    const n = Math.max(1, Math.round(Math.max(Math.abs(end.x - f.x), Math.abs(end.y - f.y))));
    for (let i = 0; i <= n; i++) add(Math.round(f.x + ((end.x - f.x) * i) / n), Math.round(f.y + ((end.y - f.y) * i) / n));
    const outline = css('--line');
    const fill = now ? css('--pink') : css('--lav');
    for (const [x, y] of cells.values()) { ctx.fillStyle = outline; ctx.fillRect(x * CELL - 2, y * CELL - 2, CELL + 4, CELL + 4); }
    for (const [x, y] of cells.values()) { ctx.fillStyle = fill; ctx.fillRect(x * CELL, y * CELL, CELL, CELL); }
    canvas.style.setProperty('--nx', `${Math.round(Math.cos(angle) * 4)}px`);
    canvas.style.setProperty('--ny', `${Math.round(Math.sin(angle) * 4)}px`);
    return canvas;
  }

  // The helper cat with one paw out (the sprite's "swat" pose), facing the target.
  function pointingCat(card, target, companion) {
    if (!PX) return null;
    const cell = 3;
    const canvas = el('canvas', 'cat pop');
    canvas.width = PX.W * cell;
    canvas.height = PX.ROWS * cell;
    const toRight = !target || target.x + target.w / 2 >= card.x + card.w / 2;
    const frame = PX.pickFrame({ pose: 'pawsUp', move: 'knockItOff', mood: 'happy', happy: 1, lidL: 0.08, lidR: 0.08 }, companion || 'luna');
    frame.flip = !toRight;
    PX.drawGrid(canvas.getContext('2d'), PX.compose(frame), PX.colorsFor(companion || 'luna'), cell, { rim: 'rgba(255, 240, 250, 0.55)' });
    const x = toRight ? card.x - canvas.width + 30 : card.x + card.w - 30;
    const y = card.y - canvas.height + 26;
    place(canvas, { x: Math.max(0, Math.min(x, innerWidth - canvas.width)), y: Math.max(0, y) });
    return canvas;
  }

  let hovering = false;
  const hover = (on) => {
    if (on === hovering) return;
    hovering = on;
    window.loon?.overlayMouse(on);
  };
  const action = (kind) => window.loon?.overlayAction(kind);

  // payload: { annotations: [{ n, say, kind, box | null, keys? }] in this display's coordinates, current (n), total,
  //            multi, companion, hint? }
  function render(payload) {
    document.body.classList.remove('bye');
    layer.replaceChildren();
    hover(false);
    const { annotations = [], current = 1, total = annotations.length, multi = false, companion = 'luna' } = payload || {};
    const shown = multi ? annotations.filter((a) => a.n === current) : annotations;
    const controlsOn = (a) => a.n === shown[0]?.n;
    const laid = L.layout(shown.map((a) => ({ ...a, text: a.keys ? `Press ${[...a.keys].join('    ')}` : a.say, controls: multi && controlsOn(a) })), { x: 0, y: 0, w: innerWidth, h: innerHeight },
      { keepOut: annotations.filter((a) => a.box && !shown.includes(a)).map((a) => a.box) });
    let delay = 0;
    const stagger = (node) => { node.style.animationDelay = `${delay}ms`; return node; };

    // Later and earlier steps stay as faint dashed outlines with their numbers, so the whole path is visible.
    for (const a of annotations) {
      if (!a.box) continue;
      const now = !multi || a.n === current;
      const later = !now;
      if (a.kind === 'underline') layer.append(stagger(place(el('div', `underline blink${later ? ' later' : ''}`), { x: a.box.x - 2, y: a.box.y + a.box.h + 2, w: a.box.w + 4 })));
      else layer.append(stagger(place(el('div', `target blink kind-${a.kind || 'box'}${later ? ' later' : ''}`), { x: a.box.x - 6, y: a.box.y - 5, w: a.box.w + 12, h: a.box.h + 10 })));
      delay += 60;
    }
    for (const item of laid) {
      if (item.arrow) layer.append(stagger(arrowCanvas(item.arrow, !multi || item.n === current)));
      const card = place(el('div', `card pop${item.box ? '' : ' solo'}`), { x: item.card.x, y: item.card.y }); // height follows the text; the layout's estimate only steers placement
      card.style.width = `${item.card.w}px`;
      card.setAttribute('role', 'note');
      if (item.box) card.append(el('span', 'n', { textContent: String(item.n) }));
      card.append(sayNode(item.say, item.keys));
      if (controlsOn(item)) {
        const close = el('button', 'close', { textContent: '✕', title: 'Done (Esc)' });
        close.setAttribute('aria-label', 'Close');
        close.addEventListener('click', () => action('close'));
        close.addEventListener('mouseenter', () => hover(true));
        close.addEventListener('mouseleave', () => hover(false));
        card.append(close);
        if (multi) {
          const row = el('div', 'controls');
          row.append(el('span', 'count', { textContent: `${current}/${total}` }));
          const next = el('button', '', { textContent: current >= total ? 'Done ✓' : 'Next ›' });
          next.addEventListener('click', () => action(current >= total ? 'close' : 'next'));
          row.append(next);
          row.addEventListener('mouseenter', () => hover(true));
          row.addEventListener('mouseleave', () => hover(false));
          card.append(row);
        }
        const cat = pointingCat(item.card, item.box, companion);
        if (cat) layer.append(stagger(cat));
      }
      layer.append(stagger(card));
      if (item.box) layer.append(stagger(place(el('div', `badge pop${multi && item.n !== current ? ' later' : ''}`, { textContent: String(item.n) }), item.badge)));
      delay += 120;
    }
    // Badges for steps whose cards are hidden (multi-step), so "2" and "3" are visible ahead of time.
    if (multi) {
      for (const a of annotations) {
        if (!a.box || a.n === current) continue;
        const b = L.layout([{ box: a.box, text: '' }], { x: 0, y: 0, w: innerWidth, h: innerHeight })[0].badge;
        layer.append(place(el('div', 'badge later pop', { textContent: String(a.n) }), b));
      }
    }
  }

  function fade() {
    document.body.classList.add('bye');
    hover(false);
  }

  window.LoonOverlay = { render, fade }; // the headless visual check drives these directly
  if (window.loon?.onOverlay) {
    window.loon.onOverlay(render);
    window.loon.onOverlayFade(fade);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') action('close'); });
})();
