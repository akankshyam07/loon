// Loon content script: reports what the user *selects* and what kind of page this is.
// Page text is only read when the app asks for it after the user clicks a page chip (DESIGN.md §2.3).
(() => {
  const { classifySelection } = globalThis.LoonClassify;
  const { detectPage } = globalThis.LoonPageKind;
  const agent = globalThis.LoonAgentDom.createAgentDom(document, window);
  const MIN_CHARS = 2;
  const MAX_CHARS = 20000;
  const send = (message) => chrome.runtime.sendMessage(message).catch(() => {});

  let page = detectPage(document, location);
  const reportPage = () => send({ type: 'page', ...page, visible: document.visibilityState === 'visible' });
  reportPage();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reportPage(); });

  // ---- selection ----
  function selectionInfo() {
    const active = document.activeElement;
    const inField = active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|search|email|url)?$/.test(active.type)));
    if (inField) {
      const text = active.value.slice(active.selectionStart, active.selectionEnd);
      return { text, editable: true, rect: active.getBoundingClientRect(), node: active, restore: { field: active, start: active.selectionStart, end: active.selectionEnd } };
    }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    const editable = Boolean(node?.closest('[contenteditable=""], [contenteditable="true"]'));
    return { text: sel.toString(), editable, rect: range.getBoundingClientRect(), node, restore: editable ? { range: range.cloneRange(), host: node.closest('[contenteditable]') } : null };
  }

  // Screen coordinates are approximate: the toolbar height is inferred from outer/inner size (DESIGN.md §3.2).
  function toScreen(rect) {
    const toolbar = Math.max(0, window.outerHeight - window.innerHeight);
    return { x: Math.round(window.screenX + rect.left), y: Math.round(window.screenY + toolbar + rect.top), w: Math.round(rect.width), h: Math.round(rect.height) };
  }

  function surroundingText(node, text) {
    const block = node?.closest('p, li, td, blockquote, pre, h1, h2, h3, h4, div') || node;
    const all = (block?.innerText || '').replace(/\s+/g, ' ').trim();
    const at = all.indexOf(text.trim().replace(/\s+/g, ' '));
    if (at < 0) return all.slice(0, 600);
    return all.slice(Math.max(0, at - 250), at + text.length + 250);
  }

  let lastSent = '';
  let lastEditable = null; // where "Replace" puts rewritten text back
  let debounce = null;
  function onSelectionChange() {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const info = selectionInfo();
      const text = info?.text?.trim() || '';
      if (text.length < MIN_CHARS || text.length > MAX_CHARS) {
        if (lastSent) send({ type: 'selection-cleared' });
        lastSent = '';
        return;
      }
      if (text === lastSent) return;
      lastSent = text;
      if (page.sensitive) return send({ type: 'selection-blocked', reason: page.reason });
      lastEditable = info.editable ? info.restore : null;
      const monospace = info.node && /mono|courier|consolas|menlo/i.test(getComputedStyle(info.node).fontFamily);
      send({
        type: 'selection',
        text,
        kind: classifySelection(text, { editable: info.editable, monospace }),
        surrounding: surroundingText(info.node, text),
        anchor: toScreen(info.rect),
        pageKind: page.kind,
      });
    }, 400);
  }
  document.addEventListener('selectionchange', onSelectionChange);
  document.addEventListener('mouseup', onSelectionChange);
  document.addEventListener('keyup', (e) => { if (e.shiftKey) onSelectionChange(); });

  // ---- on-page highlights (CSS Custom Highlight API: no DOM changes) ----
  const style = document.createElement('style');
  style.textContent = '::highlight(loon-key) { background-color: rgba(143, 220, 90, 0.38); }';
  document.documentElement.appendChild(style);

  function highlight(quotes) {
    if (!('highlights' in CSS)) return 0;
    const normalize = (s) => s.replace(/\s+/g, ' ').trim();
    const targets = quotes.map(normalize).filter((q) => q.length > 12);
    const ranges = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let joined = '';
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.parentElement || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.parentElement.tagName)) continue;
      nodes.push({ node: n, start: joined.length });
      joined += n.data;
    }
    // Match on whitespace-collapsed text, then map positions back to DOM text nodes.
    const map = [];
    let collapsed = '';
    for (let i = 0; i < joined.length; i++) {
      if (/\s/.test(joined[i]) && (collapsed.endsWith(' ') || !collapsed)) continue;
      collapsed += /\s/.test(joined[i]) ? ' ' : joined[i];
      map.push(i);
    }
    const locate = (offset) => {
      let lo = 0;
      let hi = nodes.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (nodes[mid].start <= offset) lo = mid;
        else hi = mid - 1;
      }
      return { node: nodes[lo].node, offset: offset - nodes[lo].start };
    };
    for (const quote of targets) {
      const at = collapsed.indexOf(quote);
      if (at < 0) continue;
      const start = locate(map[at]);
      const end = locate(map[at + quote.length - 1] + 1);
      const range = new Range();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      ranges.push(range);
    }
    CSS.highlights.set('loon-key', new Highlight(...ranges));
    ranges[0]?.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return ranges.length;
  }

  // execCommand('insertText') goes through the editor's normal input path, so ⌘Z undo keeps working.
  function replaceSelection(text) {
    if (!lastEditable) return { ok: false, error: 'The selection is gone' };
    if (lastEditable.field) {
      const { field, start, end } = lastEditable;
      field.focus();
      field.setSelectionRange(start, end);
    } else {
      lastEditable.host?.focus();
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(lastEditable.range);
    }
    const ok = document.execCommand('insertText', false, text);
    lastEditable = null;
    return { ok };
  }

  // ---- "Teach me on my screen" (DESIGN.md §3.18) ----
  // Where the viewport is on screen, so the app can turn element boxes into screen points.
  const windowFrame = () => ({ screenX: window.screenX, screenY: window.screenY, outerWidth: window.outerWidth, outerHeight: window.outerHeight, innerWidth: window.innerWidth, innerHeight: window.innerHeight, dpr: window.devicePixelRatio });

  // What is on screen in this tab: the clickable elements plus headings and labels, in view only, with boxes.
  function teachList() {
    const items = agent.list({ limit: 80 }).filter((e) => e.inView);
    let n = 0;
    for (const el of document.querySelectorAll('h1, h2, h3, [role="heading"], label, th, legend')) {
      if (n >= 25) break;
      const r = el.getBoundingClientRect();
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!text || r.width < 2 || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
      items.push({ id: `h${++n}`, role: 'heading', text, label: '', box: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, inView: true });
    }
    return { url: location.href, title: document.title, elements: items, frame: windowFrame() };
  }

  // Tutorial captions: YouTube draws them as .ytp-caption-segment, other players show <track> cues. The last ~30 s are
  // kept in this page's memory only (never stored, never sent) until the user asks Loon to follow along.
  const CAPTION_MS = 30000;
  let captionLog = []; // [{ t, text }]: only the new words of each sample, so rolling captions aren't repeated
  let currentCaption = '';
  function readCaptions() {
    const yt = [...document.querySelectorAll('.ytp-caption-segment')].map((s) => s.textContent).join(' ');
    let text = yt;
    if (!text.trim()) {
      for (const track of document.querySelector('video')?.textTracks || []) {
        if (track.mode === 'showing') text += [...(track.activeCues || [])].map((c) => c.text).join(' ');
      }
    }
    return text.replace(/\s+/g, ' ').trim();
  }
  function sampleCaptions() {
    const text = readCaptions();
    if (!text || text === currentCaption) return;
    const recent = captionLog.map((c) => c.text).join(' ');
    // Rolling captions repeat what was already on screen; keep only the part that is new.
    let overlap = Math.min(text.length, recent.length);
    while (overlap > 0 && !recent.endsWith(text.slice(0, overlap))) overlap--;
    const fresh = text.slice(overlap).trim();
    currentCaption = text;
    const now = Date.now();
    if (fresh) captionLog.push({ t: now, text: fresh });
    captionLog = captionLog.filter((c) => now - c.t < CAPTION_MS);
  }
  setInterval(() => { if (document.visibilityState === 'visible' && !page.sensitive && document.querySelector('video')) sampleCaptions(); }, 1000);

  function captions() {
    sampleCaptions();
    const selection = String(window.getSelection?.() || '').trim().slice(0, 2000);
    return { url: location.href, title: document.title, current: currentCaption, recent: captionLog.map((c) => c.text).join(' '), selection, frame: windowFrame() };
  }

  function pageOutline() {
    const labels = [...document.querySelectorAll('h1, h2, h3, label, button, [role="button"], input[type="submit"]')]
      .map((el) => (el.innerText || el.value || el.getAttribute('aria-label') || '').trim())
      .filter((t) => t && t.length < 120);
    return [...new Set(labels)].slice(0, 60);
  }

  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message.type === 'get-page') {
      if (page.sensitive && !message.force) return reply({ sensitive: true, reason: page.reason });
      const html = document.documentElement.outerHTML;
      reply({ html: html.length > 4_000_000 ? html.slice(0, 4_000_000) : html, url: location.href, title: document.title, outline: pageOutline() });
    } else if (message.type === 'get-page-if') {
      // A price-watch routine looking for its page: only the tab showing that page (same address, any ?query) answers.
      let wanted = null;
      try { wanted = new URL(message.url); } catch { /* not a URL */ }
      const strip = (p) => p.replace(/\/$/, '');
      if (!wanted || wanted.origin !== location.origin || strip(wanted.pathname) !== strip(location.pathname)) return reply({ nomatch: true });
      if (page.sensitive) return reply({ sensitive: true });
      const html = document.documentElement.outerHTML;
      reply({ html: html.length > 4_000_000 ? html.slice(0, 4_000_000) : html, url: location.href, title: document.title });
    } else if (message.type === 'highlight') {
      reply({ count: highlight(message.quotes || []) });
    } else if (message.type === 'clear-highlight') {
      if ('highlights' in CSS) CSS.highlights.delete('loon-key');
      reply({ ok: true });
    } else if (message.type === 'replace') {
      reply(replaceSelection(message.text));
    } else if (message.type.startsWith('agent-')) {
      // Acting for the user (§3.13.1): re-checked on every request, because a page can turn sensitive after it loads.
      page = detectPage(document, location);
      if (page.sensitive) {
        agent.clear();
        return reply({ sensitive: true, reason: page.reason, error: `Private page (${page.reason}): I won't act here` });
      }
      if (message.type === 'agent-list') reply({ url: location.href, title: document.title, kind: page.kind, elements: agent.list() });
      else if (message.type === 'agent-highlight') reply({ ok: agent.highlight(message.id, message.label) });
      else if (message.type === 'agent-clear') reply({ ok: (agent.clear(), true) });
      else if (message.type === 'agent-teach') reply(teachList());
      else if (message.type === 'agent-captions') reply(captions());
      else if (message.type === 'agent-act') {
        agent.act(message).then(reply, (err) => reply({ ok: false, error: err.message }));
        return true; // async reply
      }
    } else if (message.type === 'report-page') {
      page = detectPage(document, location);
      reportPage();
      reply({ ok: true });
    }
    return false;
  });
})();
