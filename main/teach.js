// "Teach me on my screen" (DESIGN.md §3.18): look (capture + OCR + the extension's DOM boxes) → find the target in code,
// or let a model pick element ids and write the words → draw on the overlay. It only annotates: it never clicks, types
// or moves anything (that is the confirm-card agent in main/agent.js). Screenshots live in memory for one request.
// Everything Electron-specific comes in through `screen` and `overlay`, so tests drive it with fakes.
const teach = require('../brain/teach');
const { imageRoute } = require('../brain/vision');
const { redact } = require('../brain/redact');

const BROWSERS = /\b(chrome|chromium|brave|edge|arc|vivaldi|opera)\b/i;
const SINGLE_MS = 16000; // a one-shot explanation fades by itself; step-by-step waits for Next
const STEPS_MS = 120000;

class GateError extends Error {}

// screen: { grab(), ocr(png), frontApp(), windowNames(), ownWindows(), displays(), cursorDisplayId(), downscale(png) }
// overlay: { show(payload), hide(), hideNow?(), visible() } · bubble(type, payload) as in main/companion.js
function createTeacher({ settings, screen, overlay, bridge = null, activePage = () => null, brain = null, cli = null, api = null, audit = () => {}, settleMs = 120 }) {
  let active = null; // { annotations, current, multi } | { stepper, follow: true }

  // The one place that captures. It re-checks the privacy gate every time (Next in a follow-along captures again).
  async function look({ exclude = [], useDom = true } = {}) {
    const [frontApp, windowNames] = await Promise.all([
      Promise.resolve(screen.frontApp()).catch(() => ''),
      Promise.resolve(screen.windowNames()).catch(() => []),
    ]);
    const page = activePage();
    const blocked = teach.screenGate({ requested: true, frontApp, windowNames, page });
    if (blocked) throw new GateError(blocked.reason);
    (overlay.hideNow || overlay.hide)(); // never read our own callouts back
    await new Promise((r) => setTimeout(r, settleMs));
    const shots = await screen.grab();
    if (!shots.length) throw new GateError('To teach on your screen I need to see it: allow Loon in System Settings → Privacy & Security → Screen Recording, then ask again.');
    let elements = [];
    for (const shot of shots) {
      const data = await screen.ocr(shot.png);
      const { bounds } = shot.display;
      elements.push(...teach.ocrElements(data, { scale: shot.width / bounds.width, origin: { x: bounds.x, y: bounds.y }, start: elements.length + 1 }));
    }
    elements = teach.excludeRects(elements, [...screen.ownWindows(), ...exclude]);
    // In front and paired: exact boxes from the page instead of OCR guesses inside the browser's viewport.
    let source = 'ocr';
    if (useDom && bridge?.clients?.size && BROWSERS.test(frontApp || '') && page && !page.sensitive) {
      const reply = await bridge.request({ type: 'agent-teach' }).catch(() => null);
      if (reply?.sensitive) throw new GateError("A private page is open in Chrome, so I won't look at your screen.");
      if (reply?.frame && Array.isArray(reply.elements)) {
        const display = screen.displays().find((d) => reply.frame.screenX >= d.bounds.x && reply.frame.screenX < d.bounds.x + d.bounds.width) || screen.displays()[0];
        const scale = display?.scaleFactor || 1;
        const dom = teach.domElements(reply.elements, reply.frame, scale);
        elements = teach.mergeElements(elements, dom, teach.viewportRect(reply.frame, scale));
        if (dom.length) source = 'ocr+dom';
      }
    }
    const all = screen.displays().map((d) => d.bounds);
    const x0 = Math.min(...all.map((b) => b.x));
    const y0 = Math.min(...all.map((b) => b.y));
    const bounds = { x: x0, y: y0, w: Math.max(...all.map((b) => b.x + b.width)) - x0, h: Math.max(...all.map((b) => b.y + b.height)) - y0 };
    return { elements, bounds, shots, source };
  }

  const tell = (bubble, id, text, meta = {}) => {
    bubble('chunk', { id, chunk: text });
    bubble('done', { id, text, tier: meta.tier || 'code', detail: meta.detail, mood: meta.mood || 'happy', canGoDeeper: false });
  };
  const refuse = (bubble, id, mode, message) => {
    bubble('action-done', { id, ok: false, message });
    audit({ action: 'teach', mode, ok: false, refused: true });
    return { ok: false, message };
  };

  function show(annotations, { multi = false, current = 1 } = {}) {
    active = { annotations, current, multi };
    overlay.show({ annotations, current, total: annotations.length, multi, companion: settings.companion, timeoutMs: multi ? STEPS_MS : SINGLE_MS + 2500 * Math.max(0, annotations.length - 1) });
  }

  // The model's turn: cloud words when "Smarter answers" is on (redacted list, the screenshot only if allowed), else the
  // local model held to TEACH_SCHEMA. Either way it can only name ids from `elements`.
  async function modelSteps({ question, mode, caption = '' }, seen, signal) {
    const cloud = teach.cloudRoute(settings);
    const vision = mode === 'explain' || mode === 'follow' ? imageRoute(settings) : null;
    let image = null;
    if (vision) {
      const cursor = screen.cursorDisplayId?.();
      const shot = seen.shots.find((s) => s.display.id === cursor) || seen.shots[0];
      image = shot ? screen.downscale(shot.png) : null;
    }
    const prompt = (withSystem, withImage = false) => teach.teachPrompt({ question, mode, elements: seen.elements, bounds: seen.bounds, caption, image: withImage, withSystem });
    let raw = '';
    let tier = 'local';
    let detail = 'read on this Mac';
    let note = '';
    if (cloud) {
      const body = redact(prompt(false, Boolean(image))).text;
      try {
        if (cloud.kind === 'cli') raw = await cli.ask(cloud.which, { system: teach.TEACH_SYSTEM, prompt: body, image: image || undefined, signal, level: 'medium', models: settings.planModels?.[cloud.which] });
        else {
          const route = api.route(settings);
          raw = await route.ask({ system: teach.TEACH_SYSTEM, prompt: body, image, signal, maxTokens: 700 });
          detail = route.label(false);
        }
        tier = 'cloud';
        if (cloud.kind === 'cli') detail = cli.label?.(cloud.which) || cloud.which;
        if (image) detail += ' · with the screenshot';
      } catch (err) {
        if (signal?.aborted) throw err;
        note = 'your plan didn’t answer, so this came from your Mac';
        raw = '';
      }
    }
    let steps = teach.parseTeach(raw, seen.elements);
    if (!steps.length) {
      if (!brain) return { steps, tier, detail };
      raw = '';
      await brain.chat(prompt(true), { onText: (t) => { raw += t; }, signal, maxTokens: 500, jsonSchema: teach.TEACH_SCHEMA });
      steps = teach.parseTeach(raw, seen.elements);
      tier = 'local';
      detail = note || 'read on this Mac';
    }
    return { steps, tier, detail, image: Boolean(image && tier === 'cloud') };
  }

  async function explainOrGuide(id, intent, bubble, signal, { exclude = [], caption = '' } = {}) {
    const seen = await look({ exclude, useDom: !exclude.length });
    if (signal?.aborted) return { ok: false };
    // "where is Export?" / "File > Export": plain text matching, no model at all.
    const query = intent.target || intent.goal;
    const path = query && ['where', 'how'].includes(intent.mode) ? teach.findPath(seen.elements, query) : null;
    if (path) {
      const annotations = path.map((m, i) => ({ n: i + 1, say: path.length === 1 ? `Here: "${m.element.text}"` : `Click "${m.element.text}"`, kind: 'box', box: m.box }));
      show(annotations, { multi: annotations.length > 1 });
      tell(bubble, id, annotations.length === 1 ? `There it is: **${path[0].element.text}**. I put a box around it.` : annotations.map((a) => `${a.n}. ${a.say}`).join('\n'), { detail: 'matched the text on your screen, no model' });
      audit({ action: 'teach', mode: intent.mode, ok: true, source: seen.source, elements: seen.elements.length, steps: annotations.length, model: 'none', image: false });
      return { ok: true, annotations };
    }
    let result;
    try {
      result = await modelSteps({ question: intent.question || query || 'What am I looking at?', mode: intent.mode, caption }, seen, signal);
    } catch (err) {
      if (signal?.aborted) return { ok: false };
      return refuse(bubble, id, intent.mode, /no model/i.test(err.message) ? 'I need my local model for that one (or "Smarter answers" in Settings). "Where is the … button?" works without it.' : `I couldn't work that out: ${err.message}`);
    }
    if (!result.steps.length) {
      return refuse(bubble, id, intent.mode, query ? `I can't find "${query}" on your screen. Is it inside a menu or another window?` : "I couldn't pin that to anything on your screen.");
    }
    const byId = new Map(seen.elements.map((e) => [e.id, e]));
    const annotations = result.steps.map((s, i) => ({ n: i + 1, say: s.say, kind: s.kind, box: s.target ? byId.get(s.target).box : null }));
    show(annotations, { multi: intent.mode === 'how' && annotations.length > 1 });
    tell(bubble, id, annotations.map((a) => `${a.n}. ${a.say}`).join('\n'), { tier: result.tier, detail: result.detail, mood: 'focused' });
    audit({ action: 'teach', mode: intent.mode, ok: true, source: seen.source, elements: seen.elements.length, steps: annotations.length, model: result.tier, image: Boolean(result.image) });
    return { ok: true, annotations };
  }

  function showFollow(state) {
    if (!state) return done();
    const { index, total, instruction, match } = state;
    const say = instruction.action === 'click' && !match ? `I can't see "${instruction.target}" yet. Do the step before, then Next.` : instruction.say;
    overlay.show({ annotations: [{ n: index + 1, say, kind: 'box', box: match?.box || null, keys: instruction.keys }], current: index + 1, total, multi: true, companion: settings.companion, timeoutMs: STEPS_MS });
    return state;
  }

  // Video follow-along: the captions (or the user's selection) from the tab → instructions in code → one at a time on
  // the user's other window, captured again for each step. Nothing matches → explain what the step is about instead.
  async function follow(id, intent, bubble, signal) {
    if (!bridge?.clients?.size) return refuse(bubble, id, 'follow', 'Following a video reads its captions through the Loon Chrome extension. Pair it first: right-click me → Pair browser…');
    const reply = await bridge.request({ type: 'agent-captions' }).catch((err) => ({ error: err.message }));
    if (reply.sensitive) return refuse(bubble, id, 'follow', "That tab is a private page, so I won't read it.");
    if (reply.error) return refuse(bubble, id, 'follow', reply.error);
    const caption = String(reply.selection || reply.recent || reply.current || '').trim();
    if (!caption) return refuse(bubble, id, 'follow', "I can't see any captions. Turn on CC in the video (or select a line of the transcript), then ask again.");
    const f = reply.frame;
    const browser = f ? { x: f.screenX, y: f.screenY, w: f.outerWidth, h: f.outerHeight } : null;
    const instructions = teach.parseInstructions(caption);
    if (!instructions.length) {
      return explainOrGuide(id, { mode: 'follow', question: 'Point at what this tutorial step is talking about on my screen.' }, bubble, signal, { exclude: [browser].filter(Boolean), caption });
    }
    const stepper = teach.createStepper(instructions, async (instruction) => {
      const seen = await look({ exclude: [browser].filter(Boolean), useDom: false });
      return teach.findTarget(seen.elements, instruction.target);
    });
    active = { follow: true, stepper };
    const first = await stepper.current();
    if (signal?.aborted) return { ok: false };
    showFollow(first);
    const quote = caption.length > 160 ? `…${caption.slice(-159)}` : caption;
    tell(bubble, id, [`From the video: _"${quote}"_`, '', ...instructions.map((s, i) => `${i + 1}. ${s.say}`), '', 'Press **Next** on screen after each step.'].join('\n'), { detail: 'read from the captions and matched on your screen, no model' });
    audit({ action: 'teach', mode: 'follow', ok: true, source: 'captions', steps: instructions.length, model: 'none', image: false });
    return { ok: true, instructions };
  }

  async function run(id, intent, bubble, signal) {
    try {
      return intent.mode === 'follow' ? await follow(id, intent, bubble, signal) : await explainOrGuide(id, intent, bubble, signal);
    } catch (err) {
      if (err instanceof GateError) return refuse(bubble, id, intent.mode, err.message);
      throw err;
    }
  }

  // Next on the overlay (or "next" typed): the next highlight, or for a video the next instruction, looked for again.
  async function next() {
    if (!active) return null;
    if (active.follow) {
      try {
        return showFollow(await active.stepper.next());
      } catch (err) {
        done();
        if (!(err instanceof GateError)) throw err;
        return null;
      }
    }
    if (active.current >= active.annotations.length) return done();
    show(active.annotations, { multi: true, current: active.current + 1 });
    return active.current;
  }

  function done() {
    active = null;
    overlay.hide();
    return null;
  }

  return { run, next, done, look, active: () => Boolean(active) };
}

// One click-through window per display, created on first use. Only the card's buttons take clicks, while the pointer
// is over them (the renderer says so); Esc is a global shortcut only while something is drawn.
function createOverlay({ BrowserWindow, screen, globalShortcut, preload, file, splitByDisplay, cursorPoint, onAction, hidden = false }) {
  const wins = new Map();
  let timer = null;
  let escOwned = false;
  let visible = false;

  function windowFor(display) {
    let win = wins.get(display.id);
    if (win && !win.isDestroyed()) {
      win.setBounds(display.bounds);
      return win;
    }
    win = new BrowserWindow({
      ...display.bounds,
      show: false,
      transparent: true,
      frame: false,
      resizable: false,
      movable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      focusable: false,
      fullscreenable: false,
      enableLargerThanScreen: true, // cover the menu bar too
      ...(hidden ? { opacity: 0 } : {}),
      webPreferences: { preload, backgroundThrottling: false },
    });
    win.setAlwaysOnTop(true, 'screen-saver', 2);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setIgnoreMouseEvents(true, { forward: true });
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.ready = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    win.loadFile(file);
    win.setBounds(display.bounds);
    wins.set(display.id, win);
    return win;
  }

  async function show(payload) {
    clearTimeout(timer);
    const displays = screen.getAllDisplays();
    const parts = splitByDisplay(payload.annotations, displays, screen.getDisplayNearestPoint(cursorPoint()).id);
    visible = true;
    for (const display of displays) {
      const mine = parts.get(display.id) || [];
      const existing = wins.get(display.id);
      if (!mine.length) {
        if (existing && !existing.isDestroyed()) existing.hide();
        continue;
      }
      const win = windowFor(display);
      await win.ready;
      if (!visible) return; // closed while loading
      win.webContents.send('overlay', { ...payload, annotations: mine });
      win.setIgnoreMouseEvents(true, { forward: true });
      win.showInactive();
    }
    if (!escOwned && !globalShortcut.isRegistered('Escape')) escOwned = globalShortcut.register('Escape', () => onAction('close'));
    if (payload.timeoutMs) timer = setTimeout(() => onAction('timeout'), payload.timeoutMs);
  }

  function release() {
    clearTimeout(timer);
    if (escOwned) globalShortcut.unregister('Escape');
    escOwned = false;
    const was = visible;
    visible = false;
    return was;
  }

  // Fades (stepped) and then hides.
  function hide() {
    if (!release()) return;
    for (const win of wins.values()) {
      if (win.isDestroyed() || !win.isVisible()) continue;
      win.webContents.send('overlay-fade');
      setTimeout(() => { if (!visible && !win.isDestroyed()) win.hide(); }, 340);
    }
  }

  // Gone at once, before a capture.
  function hideNow() {
    release();
    for (const win of wins.values()) if (!win.isDestroyed()) win.hide();
  }

  function setMouse(sender, over) {
    for (const win of wins.values()) if (!win.isDestroyed() && win.webContents === sender) win.setIgnoreMouseEvents(!over, { forward: true });
  }

  return { show, hide, hideNow, setMouse, visible: () => visible };
}

module.exports = { createTeacher, createOverlay, GateError };
