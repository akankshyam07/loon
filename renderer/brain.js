// Settings → Loon's brain: the memory graph (brain/graph.js) drawn on a canvas with a small hand-written
// force-directed layout. Hover shows a label, click opens the node's facts (edit/delete), chips filter by domain,
// drag moves a node or pans, the wheel zooms. No libraries.
(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $('brain');
  const ctx = canvas.getContext('2d');
  const COLORS = { work: '#d08a3c', study: '#6b8fd6', shopping: '#d36b8f', food: '#7fb069', code: '#9b7be0', personal: '#d9b13f', health: '#46ad9f', travel: '#e07a5f' };
  const ME = '@me';

  let nodes = [];
  let edges = [];
  let byId = new Map();
  let hidden = new Set(); // domains switched off
  let hover = null;
  let selected = null;
  let alpha = 0;
  let frame = null;
  const view = { x: 0, y: 0, k: 1 };
  let drag = null; // { node } or { panX, panY, x, y }
  let moved = false;
  let fitted = true; // the view follows the layout until the user pans or zooms

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const visible = (n) => n.id === ME || !hidden.has(n.domain);
  const radius = (n) => (n.id === ME ? 11 : Math.min(16, 4 + 2 * Math.sqrt(n.uses + n.facts)));

  function size() {
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  // Keeps positions of nodes that were already on screen, so an edit doesn't scramble the picture.
  function load(data) {
    const old = byId;
    nodes = data.nodes.map((n) => {
      const prev = old.get(n.id);
      const angle = Math.random() * Math.PI * 2;
      const r = n.id === ME ? 0 : 40 + Math.random() * 120;
      return { ...n, x: prev?.x ?? Math.cos(angle) * r, y: prev?.y ?? Math.sin(angle) * r, vx: 0, vy: 0 };
    });
    byId = new Map(nodes.map((n) => [n.id, n]));
    edges = data.edges.map((e) => ({ ...e, a: byId.get(e.src), b: byId.get(e.dst) })).filter((e) => e.a && e.b);
    $('brainEmpty').hidden = nodes.length > 1;
    canvas.setAttribute('aria-label', `Memory graph: ${nodes.length - 1} things Loon knows, ${edges.length} links`);
    $('brainNodes').replaceChildren(...nodes.filter((n) => n.id !== ME).map((n) => Object.assign(document.createElement('option'), { value: n.label })));
    renderChips(data.domains);
    if (selected && !byId.has(selected.id)) closePanel();
    heat(1);
  }

  function heat(a) {
    alpha = Math.max(alpha, a);
    if (!frame) frame = requestAnimationFrame(tick);
  }

  // ponytail: O(n²) repulsion, ~125k pairs per frame at the 500-node cap and smooth on an M1; a Barnes–Hut quadtree
  // is the upgrade if the cap ever grows.
  function tick() {
    frame = null;
    const shown = nodes.filter(visible);
    for (let i = 0; i < shown.length; i++) {
      const a = shown[i];
      for (let j = i + 1; j < shown.length; j++) {
        const b = shown[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
        if (d2 > 90000) continue; // beyond 300px the push is negligible
        const f = (350 * alpha) / d2;
        a.vx += dx * f; a.vy += dy * f;
        b.vx -= dx * f; b.vy -= dy * f;
      }
    }
    for (const e of edges) {
      if (!visible(e.a) || !visible(e.b)) continue;
      const dx = e.b.x - e.a.x;
      const dy = e.b.y - e.a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const rest = e.a.id === ME || e.b.id === ME ? 90 : 55;
      const f = ((d - rest) / d) * 0.04 * alpha * Math.min(2, e.weight);
      e.a.vx += dx * f; e.a.vy += dy * f;
      e.b.vx -= dx * f; e.b.vy -= dy * f;
    }
    for (const n of shown) {
      if (n.id === ME && !(drag?.node === n)) { n.x *= 0.9; n.y *= 0.9; n.vx = 0; n.vy = 0; continue; } // the user stays central
      n.vx -= n.x * 0.015 * alpha;
      n.vy -= n.y * 0.015 * alpha;
      if (drag?.node === n) { n.vx = 0; n.vy = 0; continue; }
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += n.vx; n.y += n.vy;
    }
    alpha *= 0.985;
    if (fitted) fit();
    draw();
    if (alpha > 0.01 || drag?.node) frame = requestAnimationFrame(tick);
  }

  // Zooms and centers so every visible node fits, never closer than 1.6×.
  function fit() {
    const shown = nodes.filter(visible);
    if (shown.length < 2) return;
    const { width, height } = canvas.getBoundingClientRect();
    const xs = shown.map((n) => n.x);
    const ys = shown.map((n) => n.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    view.k = Math.min(1.6, (width - 60) / Math.max(1, x1 - x0), (height - 60) / Math.max(1, y1 - y0));
    view.x = -((x0 + x1) / 2) * view.k;
    view.y = -((y0 + y1) / 2) * view.k;
  }

  function toScreen(n) {
    const { width, height } = canvas.getBoundingClientRect();
    return { x: width / 2 + view.x + n.x * view.k, y: height / 2 + view.y + n.y * view.k };
  }

  function toWorld(px, py) {
    const { width, height } = canvas.getBoundingClientRect();
    return { x: (px - width / 2 - view.x) / view.k, y: (py - height / 2 - view.y) / view.k };
  }

  function draw() {
    const { width, height } = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);
    const ink = css('--ink');
    const muted = css('--muted');
    const focus = hover || selected;
    const near = new Set(focus ? edges.filter((e) => e.a === focus || e.b === focus).flatMap((e) => [e.a, e.b]) : []);
    ctx.lineWidth = 1;
    for (const e of edges) {
      if (!visible(e.a) || !visible(e.b)) continue;
      const a = toScreen(e.a);
      const b = toScreen(e.b);
      const lit = focus && (e.a === focus || e.b === focus);
      ctx.globalAlpha = lit ? 0.9 : focus ? 0.08 : Math.min(0.55, 0.2 + 0.1 * e.weight);
      ctx.strokeStyle = lit ? css('--sage') : muted;
      ctx.setLineDash(e.relation === 'related' ? [] : [3, 3]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const n of nodes) {
      if (!visible(n)) continue;
      const p = toScreen(n);
      const r = radius(n) * Math.sqrt(view.k);
      ctx.globalAlpha = focus && n !== focus && !near.has(n) ? 0.3 : 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = n.id === ME ? '#1c1a20' : COLORS[n.domain] || '#999';
      ctx.fill();
      if (n.id === ME || n === selected) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = n.id === ME ? '#8fdc5a' : ink;
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
    ctx.globalAlpha = 1;
    // Labels: the hovered/selected node and its neighbors, the user node, and everything once zoomed in.
    ctx.font = '11.5px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const n of nodes) {
      if (!visible(n)) continue;
      if (!(n === focus || n.id === ME || view.k > 1.8 || (focus && near.has(n) && near.size < 14))) continue;
      const p = toScreen(n);
      const label = n.label.length > 28 ? `${n.label.slice(0, 27)}…` : n.label;
      const y = p.y - radius(n) * Math.sqrt(view.k) - 6;
      const w = ctx.measureText(label).width + 10;
      ctx.fillStyle = css('--card');
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.roundRect(p.x - w / 2, y - 12, w, 16, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = ink;
      ctx.fillText(label, p.x, y);
    }
  }

  function hit(px, py) {
    let best = null;
    let bestD = Infinity;
    for (const n of nodes) {
      if (!visible(n)) continue;
      const p = toScreen(n);
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < radius(n) * Math.sqrt(view.k) + 4 && d < bestD) { best = n; bestD = d; }
    }
    return best;
  }

  const point = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  };

  canvas.addEventListener('pointerdown', (e) => {
    const { px, py } = point(e);
    const n = hit(px, py);
    moved = false;
    drag = { node: n, panX: view.x, panY: view.y, x: px, y: py };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    const { px, py } = point(e);
    if (drag && !moved && Math.abs(px - drag.x) + Math.abs(py - drag.y) > 3) {
      moved = true;
      fitted = false;
    }
    if (drag?.node) {
      if (!moved) return;
      const w = toWorld(px, py);
      drag.node.x = w.x;
      drag.node.y = w.y;
      heat(0.3);
    } else if (drag) {
      if (!moved) return;
      view.x = drag.panX + px - drag.x;
      view.y = drag.panY + py - drag.y;
      draw();
    } else {
      const n = hit(px, py);
      if (n !== hover) { hover = n; canvas.style.cursor = n ? 'pointer' : 'grab'; draw(); }
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    const { px, py } = point(e);
    const n = drag?.node;
    drag = null;
    if (!moved) {
      const target = n || hit(px, py);
      if (target) openPanel(target);
      else closePanel();
    }
  });
  canvas.addEventListener('pointerleave', () => { if (hover) { hover = null; draw(); } });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    fitted = false;
    const { px, py } = point(e);
    const before = toWorld(px, py);
    view.k = Math.min(4, Math.max(0.3, view.k * Math.exp(-e.deltaY * 0.0015)));
    const after = toWorld(px, py);
    view.x += (after.x - before.x) * view.k;
    view.y += (after.y - before.y) * view.k;
    draw();
  }, { passive: false });

  function renderChips(domains) {
    const chip = (domain) => {
      const b = Object.assign(document.createElement('button'), { className: 'domain-chip' });
      b.setAttribute('aria-pressed', String(!hidden.has(domain)));
      b.innerHTML = '<i></i><span></span>';
      b.querySelector('i').style.background = COLORS[domain];
      b.querySelector('span').textContent = domain;
      const count = nodes.filter((n) => n.domain === domain && n.id !== ME).length;
      b.title = `${count} in ${domain}`;
      b.disabled = !count;
      b.addEventListener('click', () => {
        if (hidden.has(domain)) hidden.delete(domain);
        else hidden.add(domain);
        b.setAttribute('aria-pressed', String(!hidden.has(domain)));
        heat(0.4);
      });
      return b;
    };
    $('brainDomains').replaceChildren(...domains.map(chip));
  }

  async function openPanel(n) {
    selected = n;
    draw();
    const info = await window.loon.nodeFacts(n.id);
    if (!info || selected !== n) return;
    const panel = $('brainPanel');
    panel.hidden = false;
    $('brainTitle').textContent = n.id === ME ? 'You' : n.label;
    const sub = n.subdomain && n.subdomain !== 'general' && n.subdomain.toLowerCase() !== n.label.toLowerCase() ? ` › ${n.subdomain}` : '';
    $('brainMeta').textContent = n.id === ME ? 'Everything with a "you" link: works at, prefers, lives in…' : `${n.kind} · ${n.domain}${sub} · used ${n.uses}×`;
    $('brainForget').hidden = n.id === ME;
    $('brainFacts').replaceChildren(...(info.facts.length ? info.facts : [null]).map((f) => {
      const li = document.createElement('li');
      if (!f) { li.className = 'muted'; li.textContent = 'No facts link here any more.'; return li; }
      const input = Object.assign(document.createElement('input'), { value: f.text });
      input.setAttribute('aria-label', 'Edit memory');
      input.addEventListener('change', async () => { window.loonSettings.render(await window.loon.updateMemory(f.id, input.value)); refresh(); });
      const del = Object.assign(document.createElement('button'), { textContent: 'Delete' });
      del.addEventListener('click', async () => { window.loonSettings.render(await window.loon.deleteMemory(f.id)); refresh(); });
      li.append(input, del);
      return li;
    }));
  }

  function closePanel() {
    selected = null;
    $('brainPanel').hidden = true;
    draw();
  }

  $('brainForget').addEventListener('click', async () => {
    if (!selected || !confirm(`Forget "${selected.label}" as a node? Its facts stay in Memory.`)) return;
    load(await window.loon.deleteNode(selected.id));
    closePanel();
  });
  $('brainClose').addEventListener('click', closePanel);
  $('brainFind').addEventListener('change', (e) => {
    const want = e.target.value.trim().toLowerCase();
    const n = nodes.find((x) => x.label.toLowerCase() === want);
    if (!n) return;
    hidden.delete(n.domain);
    fitted = false;
    view.x = -n.x * view.k;
    view.y = -n.y * view.k;
    openPanel(n);
    e.target.value = '';
  });

  async function refresh() {
    load(await window.loon.memoryGraph());
  }

  new ResizeObserver(size).observe(canvas);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  window.loonBrain = { refresh };
  refresh();
})();
