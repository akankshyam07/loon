// "Loon does it for you" in the page (DESIGN.md §3.13.1): lists what can be clicked or typed into, and performs one
// action by id. Shared by the content script and the unit tests. It never types into password, card or one-time-code
// fields, whatever the app asks; the caller refuses sensitive pages before getting here.
(function (root) {
  const ACTIONABLE = [
    'a[href]', 'button', 'input:not([type="hidden"])', 'textarea', 'select', 'summary',
    '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]', '[role="checkbox"]', '[role="option"]',
    '[role="searchbox"]', '[role="textbox"]', '[role="combobox"]', '[contenteditable=""]', '[contenteditable="true"]',
  ].join(', ');
  const SECRET_HINT = /(pass(word|code|wd|phrase)|\bpwd\b|\bcvv|\bcvc|\bcsc\b|security.?code|card.?(number|num|no\b)|\bcc.?(num|number|exp|csc)|credit.?card|expir|\botp\b|one.?time|verification.?code|\b2fa\b|\bmfa\b|\bpin\b|\bssn\b|social.?security|routing.?number|account.?number|\biban\b)/i;
  const clip = (s, n = 80) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
  };

  function labelOf(el) {
    const doc = el.ownerDocument;
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const text = by.split(/\s+/).map((id) => doc.getElementById(id)?.textContent || '').join(' ').trim();
      if (text) return text;
    }
    if (el.id) {
      const label = doc.querySelector(`label[for="${el.id.replace(/["\\]/g, '\\$&')}"]`);
      if (label?.textContent.trim()) return label.textContent;
    }
    const wrap = el.closest('label');
    if (wrap?.textContent.trim()) return wrap.textContent;
    return el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || '';
  }

  function textOf(el) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
      return ['submit', 'button', 'reset'].includes((el.getAttribute('type') || '').toLowerCase()) ? el.value || labelOf(el) : '';
    }
    return (el.innerText ?? el.textContent ?? '').trim() || el.getAttribute('aria-label') || el.getAttribute('title') || el.querySelector?.('img[alt]')?.getAttribute('alt') || '';
  }

  function roleOf(el) {
    const role = el.getAttribute('role');
    if (role) return role;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'select') return 'select';
    if (tag === 'textarea' || el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '') return 'textbox';
    if (tag === 'input') {
      if (['submit', 'button', 'reset', 'image'].includes(type)) return 'button';
      if (['checkbox', 'radio'].includes(type)) return type;
      return type === 'search' ? 'searchbox' : 'textbox';
    }
    return tag === 'summary' ? 'button' : tag;
  }

  const isTextField = (el) => {
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') return !['submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'file', 'hidden', 'range', 'color'].includes((el.getAttribute('type') || 'text').toLowerCase());
    return el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '' || ['textbox', 'searchbox', 'combobox'].includes(el.getAttribute('role'));
  };

  // Why a field must never be typed into, or null. Checked on listing *and* again right before typing.
  function sensitiveField(el) {
    if (!el || !isTextField(el)) return null;
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'password') return 'password field';
    const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/);
    if (autocomplete.some((t) => t.startsWith('cc-'))) return 'payment field';
    if (autocomplete.includes('one-time-code')) return 'one-time code field';
    if (autocomplete.some((t) => /password$/.test(t))) return 'password field';
    const hints = [el.getAttribute('name'), el.id, el.getAttribute('aria-label'), el.getAttribute('placeholder'), labelOf(el)].join(' ');
    return SECRET_HINT.test(hints) ? 'private field' : null;
  }

  function visible(el) {
    if (el.closest('[hidden], [aria-hidden="true"]') || el.disabled) return false;
    // checkVisibility needs layout; linkedom (tests) has none, so there everything counts as visible.
    return typeof el.checkVisibility === 'function' ? el.checkVisibility({ visibilityProperty: true, opacityProperty: true }) : true;
  }

  function createAgentDom(doc, win = doc.defaultView) {
    const ids = new WeakMap(); // element → id, so the same button keeps its id across listings
    const byId = new Map();
    let next = 1;
    let overlay = null;

    const idFor = (el) => {
      let id = ids.get(el);
      if (!id) {
        id = `e${next++}`;
        ids.set(el, id);
      }
      byId.set(id, el);
      return id;
    };

    // Compact list for the planner: in-view elements first, at most `limit`.
    function list({ limit = 80 } = {}) {
      const height = win?.innerHeight || 800;
      const items = [];
      for (const el of doc.querySelectorAll(ACTIONABLE)) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        const role = roleOf(el);
        const item = { id: idFor(el), role, text: clip(textOf(el)), label: clip(labelOf(el)) };
        if (!item.text && !item.label && role !== 'textbox' && role !== 'searchbox') continue;
        item.box = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
        item.inView = r.bottom >= 0 && r.top <= height;
        if (el.tagName === 'A') item.href = String(el.href || el.getAttribute('href')).slice(0, 200);
        if (isTextField(el)) {
          item.filled = Boolean((el.value ?? el.textContent ?? '').trim());
          const why = sensitiveField(el);
          if (why) item.sensitive = why;
          const submit = (el.form || el.closest('form'))?.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
          if (submit) item.submitText = clip(textOf(submit), 40);
        }
        if (el.tagName === 'SELECT') item.options = [...el.options].slice(0, 12).map((o) => clip(o.textContent, 40));
        if (['checkbox', 'radio'].includes(role)) item.checked = Boolean(el.checked);
        items.push(item);
      }
      items.sort((a, b) => Number(b.inView) - Number(a.inView));
      return items.slice(0, limit);
    }

    // Green outline and a paw on the element Loon is about to touch; stays until clear() or the next highlight.
    function highlight(id, label = '') {
      clear();
      const el = byId.get(id);
      if (!el || !doc.body) return false;
      el.scrollIntoView?.({ block: 'center', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      overlay = doc.createElement('div');
      overlay.setAttribute('data-loon-overlay', '');
      overlay.style.cssText = `position:fixed;left:${r.left - 4}px;top:${r.top - 4}px;width:${r.width + 8}px;height:${r.height + 8}px;`
        + 'border:3px solid #8fdc5a;border-radius:8px;box-shadow:0 0 0 4px rgba(143,220,90,.3);pointer-events:none;z-index:2147483647;';
      const paw = doc.createElement('div');
      paw.textContent = `🐾${label ? ` ${label}` : ''}`;
      paw.style.cssText = 'position:absolute;right:-6px;bottom:-26px;padding:2px 7px;border-radius:10px;background:#1c1a1f;color:#fbfaf5;'
        + 'font:600 12px -apple-system,system-ui,sans-serif;white-space:nowrap;';
      overlay.append(paw);
      doc.body.append(overlay);
      return true;
    }

    function clear() {
      overlay?.remove();
      overlay = null;
    }

    // React and friends track input values through the prototype setter, so plain `el.value =` is not seen.
    function setValue(el, text) {
      el.focus?.();
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        const proto = win && (el.tagName === 'INPUT' ? win.HTMLInputElement : win.HTMLTextAreaElement)?.prototype;
        const setter = proto && Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, text);
        else el.value = text;
      } else {
        const range = doc.createRange?.();
        if (range) {
          range.selectNodeContents(el);
          win.getSelection?.().removeAllRanges();
          win.getSelection?.().addRange(range);
        }
        if (!doc.execCommand?.('insertText', false, text)) el.textContent = text;
      }
      const Event = win?.Event || root.Event;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    // One action. Returns { ok, text? } or { ok: false, error }.
    async function act({ op, id, text = '', direction = 'down' }, { pauseMs = 350 } = {}) {
      const el = id ? byId.get(id) : null;
      if (id && (!el || !el.isConnected)) return { ok: false, error: 'That element is gone (the page changed)' };
      if (op === 'back') {
        win.history.back();
        return { ok: true };
      }
      if (op === 'scroll') {
        const step = (win?.innerHeight || 800) * 0.8 * (direction === 'up' ? -1 : 1);
        if (el) el.scrollBy?.({ top: step });
        else if (direction === 'top' || direction === 'bottom') win.scrollTo?.({ top: direction === 'top' ? 0 : doc.body.scrollHeight });
        else win.scrollBy?.({ top: step });
        return { ok: true };
      }
      if (op === 'read') {
        const from = el || doc.querySelector('main, article, [role="main"]') || doc.body;
        return { ok: true, text: clip(from?.innerText ?? from?.textContent ?? '', 4000) };
      }
      const target = el || (op === 'enter' ? doc.activeElement : null);
      if (!target) return { ok: false, error: 'No element given' };
      if (op === 'type' || op === 'enter') {
        const why = sensitiveField(target);
        if (why) return { ok: false, refused: true, error: `I never type into a ${why}` };
      }
      if (op === 'type' && !isTextField(target)) return { ok: false, error: "That isn't a text field" };
      if (op === 'select' && target.tagName !== 'SELECT') return { ok: false, error: "That isn't a dropdown" };
      if (el) {
        highlight(id);
        await wait(pauseMs);
      }
      try {
        if (op === 'click') target.click();
        else if (op === 'type') setValue(target, String(text));
        else if (op === 'select') {
          const want = String(text).trim().toLowerCase();
          const option = [...target.options].find((o) => o.textContent.trim().toLowerCase() === want || o.value.toLowerCase() === want)
            || [...target.options].find((o) => o.textContent.toLowerCase().includes(want));
          if (!option) return { ok: false, error: `No option "${text}"` };
          for (const o of target.options) o.selected = o === option;
          target.dispatchEvent(new (win?.Event || root.Event)('change', { bubbles: true }));
        } else if (op === 'enter') {
          const KeyboardEvent = win?.KeyboardEvent || root.KeyboardEvent;
          const init = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
          const go = target.dispatchEvent(new KeyboardEvent('keydown', init));
          target.dispatchEvent(new KeyboardEvent('keyup', init));
          // Synthetic key events don't submit forms by themselves; a real Enter would.
          const form = target.form || target.closest?.('form');
          if (go && form) form.requestSubmit ? form.requestSubmit() : form.submit();
        } else return { ok: false, error: `Unknown action: ${op}` };
      } finally {
        setTimeout(clear, 900);
      }
      return { ok: true };
    }

    return { list, act, highlight, clear, byId };
  }

  const api = { createAgentDom, sensitiveField };
  root.LoonAgentDom = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
