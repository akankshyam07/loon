// Layout math for the "Teach me on my screen" overlay (DESIGN.md §3.18): where each label card goes so it stays on
// screen and off the other cards and targets, the short arrow from card to target, and which display each annotation
// belongs to. Plain UMD like pixel-sprites.js: the overlay loads it as window.LoonOverlayLayout, main.js and the tests
// require it.
(function (root) {
  const GAP = 56; // room for the pixel arrow between a card and its target
  const MARGIN = 12; // cards never touch the screen edge
  const CARD = { maxW: 270, minW: 150, charW: 7.3, lineH: 19, padX: 14, padY: 11, badge: 34, controls: 36 };

  const area = (r) => Math.max(0, r.w) * Math.max(0, r.h);
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const between = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const grow = (r, by) => ({ x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 });

  function clampTo(r, vp) {
    return { ...r, x: Math.round(between(r.x, vp.x + MARGIN, vp.x + vp.w - r.w - MARGIN)), y: Math.round(between(r.y, vp.y + MARGIN, vp.y + vp.h - r.h - MARGIN)) };
  }

  // The card's size for a label. The overlay draws the card at exactly this width, so its text wraps the same way.
  function cardSize(text, { controls = false } = {}) {
    const chars = String(text || '').length;
    const textW = CARD.maxW - CARD.padX * 2 - CARD.badge;
    const w = Math.round(between(chars * CARD.charW + CARD.padX * 2 + CARD.badge, CARD.minW, CARD.maxW));
    const lines = Math.max(1, Math.ceil((chars * CARD.charW) / textW));
    return { w, h: lines * CARD.lineH + CARD.padY * 2 + (controls ? CARD.controls : 0) };
  }

  // Right of the target first (reading direction), then below, left, above, then the corners.
  function candidates(box, size) {
    const midY = box.y + box.h / 2 - size.h / 2;
    const midX = box.x + box.w / 2 - size.w / 2;
    return [
      { side: 'right', x: box.x + box.w + GAP, y: midY },
      { side: 'below', x: midX, y: box.y + box.h + GAP },
      { side: 'left', x: box.x - GAP - size.w, y: midY },
      { side: 'above', x: midX, y: box.y - GAP - size.h },
      { side: 'below', x: box.x, y: box.y + box.h + GAP },
      { side: 'below', x: box.x + box.w - size.w, y: box.y + box.h + GAP },
      { side: 'above', x: box.x, y: box.y - GAP - size.h },
      { side: 'above', x: box.x + box.w - size.w, y: box.y - GAP - size.h },
    ].map((c) => ({ ...c, w: size.w, h: size.h }));
  }

  // From the card's edge to just outside the nearest point of the target's outline; null when they touch.
  function arrowFor(card, box) {
    const cx = card.x + card.w / 2;
    const cy = card.y + card.h / 2;
    const edge = { x: between(cx, box.x, box.x + box.w), y: between(cy, box.y, box.y + box.h) };
    const from = { x: between(edge.x, card.x, card.x + card.w), y: between(edge.y, card.y, card.y + card.h) };
    const len = Math.hypot(edge.x - from.x, edge.y - from.y);
    if (len < 20) return null;
    const back = 12 / len; // the outline is drawn 6 px outside the target; the tip stops short of it
    return { from, to: { x: Math.round(edge.x - (edge.x - from.x) * back), y: Math.round(edge.y - (edge.y - from.y) * back) } };
  }

  // items: [{ box | null, text, controls? }] in the viewport's coordinates → the same items, each with
  // { card: {x,y,w,h}, side, arrow, badge: {x,y} }. Cards without a target (a key to press, a general point) stack at
  // the top center. Placement cost: overlap with earlier cards, then with any target, then being pushed by the edge.
  function layout(items, viewport, { keepOut = [] } = {}) {
    const placed = [];
    const targets = items.filter((i) => i.box).map((i) => grow(i.box, 4));
    let topY = viewport.y + 56;
    return items.map((item) => {
      const size = cardSize(item.text, item);
      let card;
      let side = 'top';
      if (!item.box) {
        card = clampTo({ x: viewport.x + viewport.w / 2 - size.w / 2, y: topY, ...size }, viewport);
        while (placed.some((p) => overlap(grow(p, 6), card)) && card.y + card.h < viewport.y + viewport.h - MARGIN) card = { ...card, y: card.y + 12 };
        topY = card.y + card.h + 12;
      } else {
        let best = null;
        for (const c of candidates(item.box, size)) {
          const r = clampTo(c, viewport);
          const pushed = Math.abs(r.x - c.x) + Math.abs(r.y - c.y);
          const cost = placed.reduce((s, p) => s + overlap(grow(p, 6), r), 0) * 4
            + targets.reduce((s, t) => s + overlap(t, r), 0) * 2
            + keepOut.reduce((s, k) => s + overlap(k, r), 0) * 2
            + (pushed ? 40 + pushed : 0);
          if (!best || cost < best.cost) best = { cost, r, side: c.side };
          if (cost === 0) break;
        }
        card = best.r;
        side = best.side;
      }
      placed.push(card);
      // The number sits on the target's top-left corner, or its bottom-left when the target hugs the top of the screen.
      const anchor = item.box || card;
      const badgeY = anchor.y - 20 < viewport.y + 2 ? anchor.y + anchor.h - 6 : anchor.y - 20;
      const badge = { x: Math.round(between(anchor.x - 22, viewport.x + 2, viewport.x + viewport.w - 30)), y: Math.round(between(badgeY, viewport.y + 2, viewport.y + viewport.h - 30)) };
      return { ...item, card, side, arrow: item.box ? arrowFor(card, item.box) : null, badge };
    });
  }

  const centerInside = (box, b) => {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    return cx >= b.x && cx < b.x + b.width && cy >= b.y && cy < b.y + b.height;
  };

  // Annotations in screen points → Map(displayId → annotations in that display's own coordinates).
  // Ones with no box, or a box on no display, go to `fallbackId` (the display under the cursor).
  // displays: [{ id, bounds: { x, y, width, height } }] as Electron's screen module reports them.
  function splitByDisplay(annotations, displays, fallbackId) {
    const out = new Map(displays.map((d) => [d.id, []]));
    const fallback = displays.find((d) => d.id === fallbackId) || displays[0];
    for (const a of annotations) {
      const d = (a.box && displays.find((x) => centerInside(a.box, x.bounds))) || fallback;
      out.get(d.id).push({ ...a, box: a.box ? { x: a.box.x - d.bounds.x, y: a.box.y - d.bounds.y, w: a.box.w, h: a.box.h } : null });
    }
    return out;
  }

  const api = { layout, cardSize, arrowFor, splitByDisplay, overlap, area, GAP, MARGIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LoonOverlayLayout = api;
})(typeof window !== 'undefined' ? window : globalThis);
