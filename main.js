const { app, BrowserWindow, screen, ipcMain, globalShortcut, Menu, powerMonitor, clipboard, shell, nativeImage, systemPreferences, session, safeStorage, desktopCapturer, Notification } = require('electron');
const fs = require('fs');
const path = require('path');
const { Brain, SYSTEM_PROMPT } = require('./brain/ai');
const cliProvider = require('./brain/cli-provider');
const { Resolver } = require('./brain/resolve');
const { Translator } = require('./brain/translate');
const { Skills } = require('./brain/skills');
const { Bridge, newPairingCode } = require('./main/bridge');
const { createCompanion } = require('./main/companion');
const { createScreenSight } = require('./main/screen');
const capture = require('./main/capture');
const { Actions } = require('./main/actions');
const { Notes } = require('./brain/notes');
const { Memory } = require('./brain/memory');
const { MemoryFiles } = require('./brain/memory-files');
const { Embedder } = require('./brain/embed');
const { VoiceEngine, createVoiceController } = require('./main/voice');
const { ConnectorHub, McpHub } = require('./main/hub');
const { createAgentRunner } = require('./main/agent');
const { PERSONAL_DEFAULTS, cleanPersonal, profileSummary, onboardingResult } = require('./brain/personal');
const { MODES } = require('./brain/modes');
const apiProvider = require('./brain/api-provider');
const { createTeacher, createOverlay } = require('./main/teach');
const { splitByDisplay } = require('./renderer/overlay-layout');
const { createRoutines } = require('./main/routines');
const persona = require('./renderer/persona');

// Cat height in px per size preset; the window adds room around it for sparkles and hops.
const SIZES = { S: 120, M: 160, L: 210 };
const CAT_ASPECT = 240 / 256; // loon.svg viewBox
const WINDOW_PAD_X = 1.55;
const WINDOW_PAD_Y = 1.45;
const DUO_WIDTH = 1.45; // duo mode and cameos: room for the second cat beside the helper
const BUBBLE_WIDTH = 360;
const EDGE_MARGIN = 12;

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const DEMO = process.argv.includes('--demo') || process.env.LOON_DEMO === '1';
const SELFTEST = process.argv.includes('--selftest');
// `--part=fresh` checks the first-launch welcome, which other selftest runs skip.
const FRESH_CHECK = SELFTEST && (arg('part') || '').split(',').includes('fresh');
// A separate data folder (settings, memory, models): the fresh-install and migration selftests start from one.
if (process.env.LOON_USER_DATA) app.setPath('userData', process.env.LOON_USER_DATA);
// Hidden runs (the selftest by default; LOON_HIDDEN=0 shows it) draw invisibly, ignore the real mouse and never
// take focus from the app the user is working in.
const HIDDEN = process.env.LOON_HIDDEN === '1' || (SELFTEST && process.env.LOON_HIDDEN !== '0');
const HIDDEN_WINDOW = HIDDEN ? { show: false, opacity: 0 } : {};
// Electron's default for an uncaught exception is a modal "JavaScript error" alert, which blocks the main thread (and
// quitting) until someone clicks it. A background cat logs it instead.
process.on('uncaughtException', (err) => console.error('[main] uncaught exception:', err));
if (SELFTEST) {
  // Invisible or covered windows must keep painting and running timers, or capturePage and the checks stall.
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}

let settingsFile;
let settings = { size: 'M', catStyle: 'pixel', companion: 'luna', costume: 'none', seasonalCostumes: false, retroSounds: false, cameos: true, duo: false, focus: false, privacy: false, judgmental: true, wakeWord: false, speakReplies: 'voiceOnly', projects: [], connectors: [], welcomed: false, cloudCli: 'off', answerWith: 'plan', quickTake: false, teachScreenshots: false, screenSight: 'ask-first', planModels: {}, personal: { ...PERSONAL_DEFAULTS }, dismissedSuggestions: [], onboarded: false, role: '', modeOverride: 'auto', feedbackText: false, dismissedNudges: [], routineNotifications: false, quietHours: { on: true, start: '22:00', end: '07:00' }, memoryFiles: true, mcpServers: [] };
let catWin;
let bubbleWin;
let brain;
let apiKeys; // own API keys, encrypted (brain/api-provider.js KeyStore)
let resolver;
let dragTimer = null;
let windowAnimation = null;
let bridge;
let companion;
let translator;
let actions;
let notes;
let memory;
let memoryFiles; // the readable Markdown copy of memory (brain/memory-files.js)
let embedder;
let settingsWin = null;
let voice;
let hub;
let mcpHub; // MCP tool servers (main/hub.js McpHub)
let voiceEngine;
let agentRunner;
let teacher; // "Teach me on my screen" (main/teach.js)
let overlay; // its click-through windows, one per display
let teachSeam; // the teacher's screen access; the selftest swaps in a fixture capture
let routines; // scheduled tasks (main/routines.js)
let routineNotification = null;
const pendingPlays = new Map();
const toBubbleRef = { current: null };
let playId = 0;
// The selftest drives the cat with synthetic input and moves this pointer itself; the real mouse must not steer
// drags, pounces or click-through while it runs.
let virtualCursor = { x: -100000, y: -100000 };
const cursorPoint = () => (SELFTEST ? virtualCursor : screen.getCursorScreenPoint());
let hiddenFocus = null; // in a hidden run, the window that would have focus
function focusWindow(win) {
  if (!HIDDEN) {
    win.show();
    return win.focus();
  }
  hiddenFocus = win;
  win.showInactive();
}
const isFocused = (win) => (HIDDEN ? hiddenFocus === win && win.isVisible() : win.isFocused());
// Real use forwards mouse moves so the page can tell when the cursor is over the cat; a hidden window never takes clicks.
// catIgnore keeps what the renderer last asked for apart from what the window got, so a hidden selftest can still
// check the renderer's click-through decisions.
const catIgnore = { requested: null, applied: null };
function setCatIgnore(ignore) {
  catIgnore.applied = ignore || HIDDEN;
  catWin.setIgnoreMouseEvents(catIgnore.applied, SELFTEST ? {} : { forward: true });
}
// Swappable side effects so the selftest never opens a real browser tab or touches the clipboard.
const hooks = {
  say: (text) => new Promise((resolve) => require('child_process').execFile('say', [text], () => resolve())),
  openExternal: (url) => shell.openExternal(url),
  clipboard: (text, imagePath) => (imagePath ? clipboard.write({ text, image: nativeImage.createFromPath(imagePath) }) : clipboard.writeText(text)),
};

function loadSettings() {
  settingsFile = path.join(app.getPath('userData'), 'settings.json');
  try {
    settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) };
  } catch {
    // first run: defaults
  }
}

function saveSettings() {
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
}

let catWide = false; // a cameo asked for room for a moment
function catWindowSize() {
  const catH = SIZES[settings.size] || SIZES.M;
  const wide = settings.duo || catWide ? DUO_WIDTH : 1;
  return { width: Math.round(catH * CAT_ASPECT * WINDOW_PAD_X * wide), height: Math.round(catH * WINDOW_PAD_Y) };
}

// Accepts window bounds ({width, height}) and selection anchors from the extension ({w, h}).
function workAreaFor({ x, y, width, height, w, h }) {
  return screen.getDisplayMatching({ x: Math.round(x), y: Math.round(y), width: Math.max(1, Math.round(width ?? w ?? 1)), height: Math.max(1, Math.round(height ?? h ?? 1)) }).workArea;
}

// Keeps the window fully on the display it is on (horizontally) and above the dock.
function clampToWorkArea(x, y, { width, height }) {
  const wa = workAreaFor({ x, y, width, height });
  return {
    x: Math.round(Math.min(Math.max(x, wa.x), wa.x + wa.width - width)),
    y: Math.round(Math.min(Math.max(y, wa.y), wa.y + wa.height - height)),
  };
}

function createCatWindow() {
  const { width, height } = catWindowSize();
  const wa = screen.getPrimaryDisplay().workArea;
  const start = settings.position
    ? clampToWorkArea(settings.position.x, settings.position.y, { width, height })
    : { x: wa.x + wa.width - width - EDGE_MARGIN, y: wa.y + wa.height - height };

  catWin = new BrowserWindow({
    width,
    height,
    ...start,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    focusable: false,
    ...HIDDEN_WINDOW,
    // The selftest may run while the screen is locked; real use keeps Chromium's throttling for hidden windows.
    webPreferences: { preload: path.join(__dirname, 'renderer', 'preload.js'), backgroundThrottling: !SELFTEST },
  });
  catWin.setAlwaysOnTop(true, 'screen-saver');
  catWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Transparent pixels pass clicks through; the renderer turns this off while the cursor is over the cat.
  setCatIgnore(true);
  if (HIDDEN) catWin.showInactive();
  catWin.loadFile(path.join(__dirname, 'renderer', 'cat.html'), { query: { demo: DEMO ? '1' : '0' } });
  catWin.webContents.once('did-finish-load', () => { if (settings.focus) catWin.webContents.send('focus', { on: true }); });
  // settings.position is "home": only a user drag changes it (programmatic moves also fire 'moved').
  home = { x: start.x, y: start.y };
  startCursorFeed();
}

function createBubbleWindow() {
  bubbleWin = new BrowserWindow({
    width: BUBBLE_WIDTH,
    height: 200,
    show: false,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    ...HIDDEN_WINDOW,
    webPreferences: { preload: path.join(__dirname, 'renderer', 'preload.js'), backgroundThrottling: !SELFTEST },
  });
  if (HIDDEN) bubbleWin.setIgnoreMouseEvents(true);
  bubbleWin.setAlwaysOnTop(true, 'screen-saver');
  bubbleWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  bubbleWin.loadFile(path.join(__dirname, 'renderer', 'bubble.html'));
  // The bubble shows model output; it must never navigate or open windows itself.
  bubbleWin.webContents.on('will-navigate', (e) => e.preventDefault());
  bubbleWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  bubbleWin.on('blur', () => {
    if (!companion.isBusy() && !process.argv.includes('--keep-bubble')) hideBubble();
  });
}

let bubbleAnchor = null; // screen rect of the selection the bubble belongs to, or null to sit by the cat
let bubblePill = false; // a small paw beside the selection until clicked

function placeBubble(height) {
  // The bubble page keeps reporting its height while the app quits and destroys the windows.
  if (bubbleWin.isDestroyed() || catWin.isDestroyed()) return;
  height ??= bubbleWin.getBounds().height;
  const cat = catWin.getBounds();
  if (bubblePill && bubbleAnchor) {
    const wa = workAreaFor(bubbleAnchor);
    const x = Math.min(bubbleAnchor.x + bubbleAnchor.w + 4, wa.x + wa.width - 50);
    const y = Math.max(bubbleAnchor.y - 46, wa.y);
    return bubbleWin.setBounds({ x: Math.round(x), y: Math.round(y), width: 46, height: 46 });
  }
  const wa = workAreaFor(bubbleAnchor || cat);
  let x;
  let y;
  if (bubbleAnchor) {
    x = bubbleAnchor.x;
    y = bubbleAnchor.y + bubbleAnchor.h + 8;
    if (y + height > wa.y + wa.height) y = bubbleAnchor.y - height - 8; // no room below the selection: go above
  } else {
    x = cat.x + cat.width / 2 - BUBBLE_WIDTH + 40;
    y = cat.y - height + 36;
    if (y < wa.y) y = cat.y + cat.height * 0.2; // no room above: sit beside the cat
  }
  x = Math.min(Math.max(x, wa.x + EDGE_MARGIN), wa.x + wa.width - BUBBLE_WIDTH - EDGE_MARGIN);
  y = Math.min(Math.max(y, wa.y), wa.y + wa.height - height);
  bubbleWin.setBounds({ x: Math.round(x), y: Math.round(y), width: BUBBLE_WIDTH, height: Math.round(height) });
}

// focus=false shows chips next to a selection without taking focus from the browser (§2.8).
function showBubble({ anchor = null, focus = true, pill = false } = {}) {
  bubbleAnchor = anchor;
  bubblePill = pill && Boolean(anchor);
  placeBubble(bubblePill ? undefined : Math.max(bubbleWin.getBounds().height, 120));
  bubbleWin.setFocusable(focus);
  if (focus) {
    focusWindow(bubbleWin);
  } else {
    if (hiddenFocus === bubbleWin) hiddenFocus = null;
    bubbleWin.showInactive();
  }
  bubbleWin.webContents.send('bubble-shown', { context: companion.context(), focus, pill: bubblePill });
  warmPlan();
  catWin.webContents.send('bubble', { open: true });
}

function hideBubble() {
  if (!bubbleWin.isVisible()) return;
  companion.cancel();
  bubbleWin.hide();
  companion.endThread();
  bubbleWin.webContents.send('bubble-hidden');
  catWin.webContents.send('bubble', { open: false });
  routines?.renudge(); // a routine nudge that arrived while the bubble was open
}

function openAskBubble() {
  companion.openAsk();
  showBubble();
}

function askInBubble(text) {
  const wasOpen = bubbleWin.isVisible();
  if (!wasOpen) openAskBubble();
  setTimeout(() => bubbleWin.webContents.send('bubble-ask', { text }), wasOpen ? 0 : 250);
}

// "focus for 25 minutes": Focus mode (the cat naps, no chips or nudges) that switches itself off.
let focusTimer = null;
function startFocus(minutes) {
  clearTimeout(focusTimer);
  setToggle('focus', minutes > 0);
  if (!minutes) return 'Focus is off. Welcome back.';
  const until = new Date(Date.now() + minutes * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  focusTimer = setTimeout(() => {
    setToggle('focus', false);
    companion.showNotice(`Focus session done: ${minutes} minutes. Nice work. Stand up, stretch, drink some water.`);
    showBubble();
  }, minutes * 60000);
  return `Focus on until ${until}. I'll nap and keep quiet. Say "stop focus" to end early.`;
}

// "set a timer for 5 minutes": rings with the cat's notice. seconds 0 cancels all, null reports what's left.
const timers = new Set();
const spell = (s) => (s >= 3600 ? `${+(s / 3600).toFixed(1)} hour${s === 3600 ? '' : 's'}` : s >= 120 || s % 60 === 0 ? `${Math.round(s / 60)} minute${Math.round(s / 60) === 1 ? '' : 's'}` : `${s} second${s === 1 ? '' : 's'}`);
function startTimer(seconds, label) {
  if (seconds === null) {
    if (!timers.size) return 'No timers running.';
    return [...timers].map((t) => `${t.label ? `${t.label}: ` : ''}${spell(Math.max(1, Math.round((t.ends - Date.now()) / 1000)))} left`).join('\n');
  }
  if (seconds === 0) {
    const count = timers.size;
    for (const t of timers) clearTimeout(t.handle);
    timers.clear();
    return count ? `Cancelled ${count === 1 ? 'the timer' : `${count} timers`}.` : 'No timers running.';
  }
  const timer = { label, ends: Date.now() + seconds * 1000 };
  timer.handle = setTimeout(() => {
    timers.delete(timer);
    companion.showNotice(`⏰ Time's up${label ? `: ${label}` : ''}! (${spell(seconds)})`);
    // A timer you can't hear is easy to miss; the built-in Glass sound, never in test runs.
    if (!SELFTEST) require('child_process').execFile('afplay', ['/System/Library/Sounds/Glass.aiff'], () => {});
    showBubble();
    catWin.webContents.send('brain', { state: 'done', mood: 'happy' });
  }, seconds * 1000);
  timers.add(timer);
  const at = new Date(timer.ends).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', ...(seconds < 120 ? { second: '2-digit' } : {}) });
  return `⏱️ ${spell(seconds).replace(/s$/, '').replace(' ', '-')} timer${label ? ` for ${label}` : ''} started. I'll ping you at ${at}.`;
}

// Gentle rhythm: one "your day" nudge on the first morning activity and a stretch nudge after ~an hour of non-stop use.
// The nudge is the cat's small "?" (ignored in 8 s, skipped in Focus and Privacy), never a popup.
let dailyNudge = null;
function startDayRhythm() {
  let activeSince = Date.now();
  setInterval(() => {
    if (powerMonitor.getSystemIdleTime() > 5 * 60) { activeSince = Date.now(); return; }
    if (settings.focus || settings.privacy || bubbleWin.isVisible()) return;
    const now = new Date();
    if (settings.lastDayNudge !== now.toDateString() && now.getHours() >= 6 && now.getHours() < 12) {
      settings.lastDayNudge = now.toDateString();
      saveSettings();
      dailyNudge = 'today';
      catWin.webContents.send('nudge', { kind: 'today' });
    } else if (Date.now() - activeSince > 55 * 60000) {
      activeSince = Date.now();
      dailyNudge = 'break';
      catWin.webContents.send('nudge', { kind: 'break' });
    }
  }, 60000);
}

// Routine results behind the "?" (or a notification): shown together in a fresh bubble. Saved questions are asked
// there, so they take the normal path (resolver, confirm cards, history).
function openRoutineResults(items) {
  openAskBubble();
  for (const item of items.filter((i) => !i.ask)) {
    const message = item.kind === 'reminder' ? `⏰ **${item.text}**` : `**${item.label}**\n\n${item.text}`;
    toBubbleRef.current?.('action-done', { id: 0, ok: true, markdown: true, message });
  }
  const ask = items.find((i) => i.ask);
  if (ask) askInBubble(ask.ask);
}

function onNudgeClick() {
  const kind = dailyNudge;
  dailyNudge = null;
  if (kind === 'routine') return routines.openPending();
  if (kind === 'today') return askInBubble("what's my day");
  if (kind === 'break') {
    companion.showNotice("You've been at it for about an hour. Quick break: stand up, roll your shoulders, look at something far away for 20 seconds.");
    return showBubble();
  }
  companion.onNudgeClick();
}

// ⌥Space: with text selected in another app, that selection; otherwise a typed question (DESIGN.md §3.3).
async function onAskHotkey() {
  if (bubbleWin.isVisible()) return hideBubble();
  const cursor = cursorPoint();
  const anchor = { x: cursor.x, y: cursor.y, w: 1, h: 1 };
  try {
    const selection = await capture.captureSelection(clipboard);
    if (selection) {
      companion.fromCapture(selection);
      return showBubble({ anchor });
    }
  } catch (err) {
    if (err instanceof capture.AccessibilityError) {
      systemPreferences.isTrustedAccessibilityClient(true); // shows macOS's permission prompt, once
      companion.showNotice('To help with text selected in other apps, allow Loon in System Settings → Privacy & Security → Accessibility.');
      return showBubble();
    }
    console.warn('[capture]', err.message);
  }
  openAskBubble();
}

// One-time voice model download, with progress shown in the bubble.
async function setUpVoice() {
  companion.showNotice('Downloading the speech models (open source, ~240 MB). You can keep using Loon meanwhile.');
  showBubble();
  try {
    await voiceEngine.downloadModels((p) => bubbleWin.webContents.send('bubble-context', { ...companion.context(), notice: `Downloading the speech models… ${Math.round(p * 100)}%` }));
    companion.showNotice('Voice is ready. Press ⌥⇧V and talk. Loon listens until you pause.');
  } catch (err) {
    companion.showNotice(`Voice download failed: ${err.message}. Try again from the cat's menu.`);
  }
  bubbleWin.webContents.send('bubble-context', companion.context());
}

async function onVoiceHotkey() {
  if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('microphone') !== 'granted') {
    const granted = await systemPreferences.askForMediaAccess('microphone');
    if (!granted) {
      companion.showNotice('Loon needs microphone access for voice: System Settings → Privacy & Security → Microphone.');
      return showBubble();
    }
  }
  voice.start('hotkey');
}

// ⌥⇧T: "Teach me on my screen" (DESIGN.md §3.18). Callouts up: the same key clears them.
function onTeachHotkey() {
  if (overlay.visible()) return teacher.done();
  companion.openTeach();
  showBubble();
}

// The overlay's Next / ✕, Esc, or its timeout. Next may capture again (follow-along), so failures are only logged.
function onOverlayAction(kind) {
  if (kind !== 'next') return teacher.done();
  return Promise.resolve(teacher.next()).catch((err) => console.warn('[teach]', err.message));
}

// Capture, OCR and window facts for the teacher; screenshots stay in memory and are dropped after each request.
function teachScreen() {
  const rect = (w) => { const b = w.getBounds(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  return {
    async grab() {
      if (process.platform === 'darwin' && ['denied', 'restricted'].includes(systemPreferences.getMediaAccessStatus('screen'))) return [];
      return capture.grabDisplays(desktopCapturer, screen);
    },
    ocr: (png) => capture.ocrBoxes(png, path.join(app.getPath('userData'), 'ocr')),
    frontApp: () => capture.frontmostApp(),
    windowNames: () => capture.windowNames(desktopCapturer),
    ownWindows: () => [catWin, bubbleWin, settingsWin].filter((w) => w && !w.isDestroyed() && w.isVisible()).map(rect),
    displays: () => screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, scaleFactor: d.scaleFactor })),
    cursorDisplayId: () => screen.getDisplayNearestPoint(cursorPoint()).id,
    downscale: downscaleForCloud,
  };
}

// Only for a cloud route the user allowed to see screenshots: at most 1600 px wide.
function downscaleForCloud(png) {
  const image = nativeImage.createFromBuffer(png);
  return (image.getSize().width > 1600 ? image.resize({ width: 1600 }) : image).toPNG();
}

// "Loon sees your screen when you ask" (DESIGN.md §3.20): the front window that isn't Loon, read on this Mac.
function screenSightDeps() {
  return {
    frontWindow: () => (process.platform === 'darwin' ? capture.frontWindow() : null),
    permission: () => (process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted'),
    grab: (win) => capture.grabWindow(desktopCapturer, screen, win),
    ocr: (png) => capture.ocr(png, path.join(app.getPath('userData'), 'ocr')),
    downscale: downscaleForCloud,
  };
}

// ⌥⇧S: macOS's region picker → OCR on this Mac → the usual chips.
async function onScreenshotHotkey() {
  const file = await capture.screenshotRegion();
  if (file) await openScreenshot(file);
}

// A file dropped on the cat: read locally, then the usual chips (DESIGN M6).
async function openDroppedFile(file) {
  const { readDropped } = require('./brain/files');
  catWin.webContents.send('brain', { state: 'thinking' });
  try {
    const read = await readDropped(file);
    if (read.error) {
      companion.showNotice(read.error);
      return showBubble();
    }
    if (read.kind === 'image') return openScreenshot(file, read.name);
    const kind = read.kind === 'csv' ? 'csv' : ['pdf', 'document'].includes(read.kind) ? 'document' : classifyText(read.text);
    companion.fromCapture({ text: read.text, source: 'file', kind, title: read.name, note: read.note });
    showBubble();
  } catch (err) {
    companion.showNotice(`I couldn't read that file: ${err.message}`);
    showBubble();
  } finally {
    catWin.webContents.send('brain', { state: 'done', mood: 'curious' });
  }
}

function classifyText(text) {
  const kind = require('./extension/lib/classify').classifySelection(text.slice(0, 4000));
  return ['code', 'json', 'stacktrace'].includes(kind) ? kind : 'document';
}

async function openScreenshot(file) {
  catWin.webContents.send('brain', { state: 'thinking' });
  try {
    const text = await capture.ocr(file, path.join(app.getPath('userData'), 'ocr'));
    companion.fromCapture({ text: text || '(no readable text)', source: 'screenshot', imagePath: file, lowText: text.replace(/\s/g, '').length < 20 });
    showBubble();
  } finally {
    catWin.webContents.send('brain', { state: 'done', mood: 'curious' });
  }
}

let lastCursor = null;
let catBodyOpen = false;
let home = null; // where the user put the cat; tricks and hops walk back here
function startCursorFeed() {
  setInterval(() => {
    if (!catWin || catWin.isDestroyed()) return;
    const cursor = cursorPoint();
    if (lastCursor && cursor.x === lastCursor.x && cursor.y === lastCursor.y) return;
    lastCursor = cursor;
    const win = catWin.getBounds();
    catWin.webContents.send('cursor', { cursor, win });
    // During a file drag the page gets no mouse events, so main opens the cat's body area by cursor position.
    // Only the middle of the cat's body (always opaque), so clicks next to the cat still reach the apps behind it.
    const inBody = cursor.x > win.x + win.width * 0.42 && cursor.x < win.x + win.width * 0.58 && cursor.y > win.y + win.height * 0.62 && cursor.y < win.y + win.height * 0.95;
    if (inBody !== catBodyOpen) {
      catBodyOpen = inBody;
      if (inBody) setCatIgnore(false);
      else catWin.webContents.send('cursor-left-body');
    }
  }, 50);
}

function stopWindowAnimation() {
  if (windowAnimation) clearInterval(windowAnimation.timer);
  windowAnimation?.resolve(catWin.getBounds());
  windowAnimation = null;
}

// Moves the cat window by dx (px) with an optional hop arc; resolves with the final bounds.
function animateWindow({ dx = 0, dy = 0, duration = 400, arc = 0 }) {
  stopWindowAnimation();
  const from = catWin.getBounds();
  const to = clampToWorkArea(from.x + dx, from.y + dy, from);
  const started = Date.now();
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / duration);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const lift = arc * Math.sin(Math.PI * t);
      catWin.setPosition(Math.round(from.x + (to.x - from.x) * eased), Math.round(from.y + (to.y - from.y) * eased - lift));
      if (t === 1) stopWindowAnimation();
    }, 16);
    windowAnimation = { timer, resolve };
  });
}

// Resizes the cat window around the cat's feet. `remember`: a lasting change (size, duo) that becomes the new home;
// otherwise (a cameo) home just follows the width change so the cat doesn't think it wandered off.
function fitCatWindow(remember) {
  const bounds = catWin.getBounds();
  const next = catWindowSize();
  if (next.width === bounds.width && next.height === bounds.height) return;
  const pos = clampToWorkArea(bounds.x + (bounds.width - next.width) / 2, bounds.y + bounds.height - next.height, next);
  catWin.setBounds({ ...pos, ...next });
  if (remember) {
    home = { x: pos.x, y: pos.y };
    settings.position = catWin.getBounds();
    saveSettings();
  } else if (home) {
    home = { x: home.x + (bounds.width - next.width) / 2, y: home.y + bounds.height - next.height };
  }
}

function setSize(size) {
  settings.size = size;
  saveSettings();
  fitCatWindow(true);
}

// Behavior toggles (§3.15). The resolver and companion read `settings` live, so no restart is needed.
function setToggle(key, value) {
  settings[key] = value;
  saveSettings();
  if (key === 'focus') catWin.webContents.send('focus', { on: value });
  // "Hey Loon" pauses in Focus and Privacy modes and resumes after.
  if (['wakeWord', 'focus', 'privacy'].includes(key)) voice.setWake(settings.wakeWord && !settings.focus && !settings.privacy);
  if (key === 'privacy') warmPlan();
  if (key === 'focus' || key === 'privacy') routines?.poke(); // routines that waited for Focus to end
  if (key === 'privacy') syncMemoryFiles();
  settingsWin?.webContents.send('settings-changed', settingsSnapshot());
}

// The Markdown copy of memory follows Privacy mode and its Settings toggle: off means no reads, no writes, no watcher.
function syncMemoryFiles() {
  if (!memoryFiles?.enabled()) return memoryFiles?.unwatch();
  try {
    memoryFiles.sync();
    memoryFiles.watch();
  } catch (err) {
    console.warn('[memory-files]', err.message);
  }
}

// Plan-first (DESIGN.md §3.17.1): keep one plan CLI process started and waiting (it sends nothing), so the next
// question skips its startup. Runs after launch and whenever the bubble opens; idle processes end after a few minutes.
function warmPlan() {
  const which = settings.cloudCli;
  if (SELFTEST || settings.privacy || settings.answerWith === 'mac' || !['claude', 'codex'].includes(which)) return cliProvider.shutdown();
  cliProvider.warm(which, { system: SYSTEM_PROMPT, level: 'medium', models: settings.planModels?.[which] });
}

const pixelSprites = require('./renderer/pixel-sprites');
function catLook() {
  const { catStyle, companion, costume, seasonalCostumes, retroSounds, cameos, duo } = settings;
  return { catStyle, companion, costume, seasonalCostumes, retroSounds, cameos, duo };
}

function settingsSnapshot() {
  const { discover } = require('./brain/projects');
  const known = new Map(discover().map((p) => [p.path, p]));
  for (const p of settings.projects || []) if (!known.has(p)) known.set(p, { name: path.basename(p), path: p });
  return {
    ...settings,
    projectChoices: [...known.values()].map((p) => ({ ...p, allowed: (settings.projects || []).includes(p.path) })),
    connectorList: (settings.connectors || []).map((x) => ({ ...x, ready: hub.cache.has(x.id), operations: hub.cache.get(x.id)?.ops.length || 0, canSend: hub.senders.has(x.id) })),
    mcpServers: undefined, // mcpList instead: same servers, without environment values
    mcpList: mcpHub.snapshot(),
    notesDir: notes.dir,
    memoryDir: memoryFiles.dir,
    connected: bridge.clients.size > 0,
    counts: resolver.counts,
    ...apiProvider.snapshot(settings, apiKeys), // key hints only; the keys never leave the main process
    planModelDefaults: cliProvider.MODEL_DEFAULTS,
    memory: memory.all(),
    personal: cleanPersonal(settings.personal),
    profile: profileSummary(memory.all(), settings.personal),
    ratings: Object.values(memory.feedbackStats()).reduce((n, t) => ({ up: n.up + t.up, down: n.down + t.down }), { up: 0, down: 0 }),
    embedder: embedder.status(),
    audit: actions.recent(20),
    routines: routines.list().map(({ id, label, enabled, description, nextRun, lastRun, lastResult, lastStatus, waiting, fields, schedule }) => ({ id, label, enabled, description, nextRun, lastRun, lastResult, lastStatus, waiting, fields, once: schedule.type === 'once' })),
  };
}

// section: an element id to scroll to (e.g. 'history' from the cat menu or the bubble's ⋯).
function openSettings(section = '') {
  const show = () => { if (typeof section === 'string' && /^[a-z]+$/.test(section)) settingsWin.webContents.send('settings-show', section); };
  if (settingsWin && !settingsWin.isDestroyed()) {
    show();
    return focusWindow(settingsWin);
  }
  settingsWin = new BrowserWindow({
    width: 520,
    height: 640,
    title: 'Loon Settings',
    backgroundColor: '#fbfaf5',
    ...HIDDEN_WINDOW,
    webPreferences: { preload: path.join(__dirname, 'renderer', 'preload.js'), backgroundThrottling: !SELFTEST },
  });
  if (HIDDEN) {
    settingsWin.setIgnoreMouseEvents(true);
    settingsWin.showInactive();
  }
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.webContents.once('did-finish-load', show);
  settingsWin.webContents.on('will-navigate', (e) => e.preventDefault());
  settingsWin.on('closed', () => { settingsWin = null; });
}

function showCatMenu() {
  Menu.buildFromTemplate([
    { label: 'Ask Loon…', accelerator: 'Alt+Space', click: openAskBubble },
    { label: 'Explain a screenshot…', accelerator: 'Alt+Shift+S', click: onScreenshotHotkey },
    { label: 'Teach me on screen…', accelerator: 'Alt+Shift+T', click: onTeachHotkey },
    voiceEngine.modelsReady()
      ? { label: voice.listening ? 'Stop listening' : 'Talk to Loon', accelerator: 'Alt+Shift+V', click: () => voice.start('menu') }
      : { label: 'Set up voice (download ~240 MB)…', click: setUpVoice },
    { label: 'Do a trick', click: () => catWin.webContents.send('debug', { move: 'random' }) },
    {
      label: bridge.clients.size ? 'Browser connected ✓' : `Pair browser… code ${settings.pairingCode} (click to copy)`,
      enabled: !bridge.clients.size,
      click: () => clipboard.writeText(settings.pairingCode),
    },
    { type: 'separator' },
    { label: 'Focus mode', type: 'checkbox', checked: settings.focus, click: (item) => setToggle('focus', item.checked) },
    { label: 'Privacy mode', type: 'checkbox', checked: settings.privacy, click: (item) => setToggle('privacy', item.checked) },
    { label: 'Judgmental', type: 'checkbox', checked: settings.judgmental, click: (item) => setToggle('judgmental', item.checked) },
    { label: '"Hey Loon" wake word', type: 'checkbox', checked: settings.wakeWord, enabled: voiceEngine.modelsReady(), click: (item) => setToggle('wakeWord', item.checked) },
    {
      label: 'Mode',
      submenu: [['auto', 'Auto (from what you\'re doing)'], ...Object.entries(MODES).map(([id, m]) => [id, m.name])].map(([id, label]) => ({
        label, type: 'radio', checked: (settings.modeOverride || 'auto') === id, click: () => setMode(id),
      })),
    },
    { label: 'History…', click: () => openSettings('history') },
    { label: 'Settings…', click: () => openSettings() },
    { type: 'separator' },
    ...Object.keys(SIZES).map((size) => ({
      label: { S: 'Small', M: 'Medium', L: 'Large' }[size],
      type: 'radio',
      checked: settings.size === size,
      click: () => setSize(size),
    })),
    { type: 'separator' },
    { label: 'Quit Loon', click: () => app.quit() },
  ]).popup({ window: catWin });
}

// Cat menu → Mode: 'auto' or a pinned mode (brain/modes.js). Only chip order, greeting flavor and memory boost change.
function setMode(id) {
  settings.modeOverride = id === 'auto' || Object.hasOwn(MODES, id) ? id : 'auto';
  saveSettings();
  if (bubbleWin.isVisible()) bubbleWin.webContents.send('bubble-context', companion.context());
}

function openOnboarding() {
  companion.openOnboarding();
  showBubble();
}

function registerIpc() {
  ipcMain.handle('cat-svg', () => fs.readFileSync(path.join(__dirname, 'renderer', 'loon.svg'), 'utf8'));
  ipcMain.on('set-ignore-mouse', (_e, ignore) => {
    catIgnore.requested = ignore;
    setCatIgnore(ignore);
  });
  ipcMain.on('cat-menu', showCatMenu);
  // Clicking the cat while callouts are up clears them first.
  ipcMain.on('open-bubble', () => (overlay?.visible() ? teacher.done() : openAskBubble()));
  ipcMain.on('overlay-action', (_e, kind) => onOverlayAction(kind));
  ipcMain.on('overlay-mouse', (e, over) => overlay.setMouse(e.sender, Boolean(over)));
  ipcMain.on('close-bubble', hideBubble);
  ipcMain.handle('animate-window', (_e, opts) => animateWindow(opts));
  ipcMain.handle('cat-wide', (_e, on) => {
    catWide = Boolean(on);
    if (dragTimer) return; // never resize under a drag; drag-end catches up
    stopWindowAnimation();
    fitCatWindow(false);
  });
  ipcMain.handle('window-info', () => ({ win: catWin.getBounds(), workArea: workAreaFor(catWin.getBounds()), cursor: cursorPoint() }));

  // Drag: main follows the global cursor so fast drags never lose the window.
  ipcMain.on('drag-start', (_e, { offsetX, offsetY }) => {
    stopWindowAnimation();
    clearInterval(dragTimer);
    const size = catWin.getBounds();
    dragTimer = setInterval(() => {
      const c = cursorPoint();
      const pos = clampToWorkArea(c.x - offsetX, c.y - offsetY, size);
      catWin.setPosition(pos.x, pos.y);
    }, 16);
  });
  ipcMain.on('drag-end', () => {
    clearInterval(dragTimer);
    dragTimer = null;
    fitCatWindow(false);
    settings.position = catWin.getBounds();
    home = { x: settings.position.x, y: settings.position.y };
    saveSettings();
  });
  ipcMain.handle('at-home', () => { const b = catWin.getBounds(); return Math.hypot(home.x - b.x, home.y - b.y) < 12; });
  ipcMain.handle('go-home', () => {
    const b = catWin.getBounds();
    const dx = home.x - b.x;
    const dy = home.y - b.y;
    if (Math.hypot(dx, dy) < 12) return null;
    return animateWindow({ dx, dy, duration: Math.min(900, 300 + Math.abs(dx) * 0.8), arc: Math.min(40, 10 + Math.abs(dx) / 10) });
  });

  ipcMain.on('bubble-height', (_e, height) => { if (!bubblePill) placeBubble(Math.min(Math.max(height, 80), 560)); });
  ipcMain.on('bubble-expand', () => { bubblePill = false; placeBubble(160); });

  ipcMain.handle('brain-status', async () => ({ ...(await brain.status()), counts: resolver.counts }));
  ipcMain.handle('download-model', async () => {
    const status = await brain.downloadModel((progress) => bubbleWin.webContents.send('download-progress', progress));
    return { ...status, counts: resolver.counts };
  });

  // Bubble ↔ companion. Every answer streams back as ask-chunk / ask-done / ask-error.
  // The bubble first: a spoken confirm card is on screen before Loon starts reading it out.
  const toBubble = (type, payload) => {
    const channel = { chunk: 'ask-chunk', done: 'ask-done', error: 'ask-error', context: 'bubble-context', sensitive: 'bubble-sensitive', confirm: 'bubble-confirm', 'action-done': 'bubble-action', choices: 'bubble-choices', agent: 'bubble-agent', suggest: 'bubble-suggest', remembered: 'bubble-remembered' }[type];
    bubbleWin.webContents.send(channel, payload);
    voice.observe(type, payload);
  };
  toBubbleRef.current = toBubble;
  ipcMain.on('ask', (_e, { id, text }) => companion.run({ id, question: text }, toBubble));
  ipcMain.on('run-task', (_e, { id, task, deeper }) => companion.run({ id, task, deeper }, toBubble));
  ipcMain.on('ask-cancel', () => companion.cancel());
  ipcMain.handle('look-anyway', () => companion.lookAnyway(toBubble));
  ipcMain.handle('handoff', (_e, opts) => companion.handoff(opts));
  ipcMain.handle('replace', (_e, text) => companion.replace(text));
  ipcMain.on('open-link', (_e, url) => {
    if (/^https?:\/\//i.test(url)) hooks.openExternal(url);
  });
  ipcMain.on('bubble-focus', () => {
    bubbleWin.setFocusable(true);
    focusWindow(bubbleWin);
  });
  ipcMain.on('confirm-action', (_e, { id, command }) => companion.confirm(command, toBubble, id));
  ipcMain.on('agent-decision', (_e, decision) => agentRunner.decide(decision || {}));
  ipcMain.handle('save-note', (_e, entry) => companion.saveNote(entry));
  ipcMain.on('dismiss-suggestion', (_e, text) => { if (typeof text === 'string') companion.dismissSuggestion(text.slice(0, 200)); });
  // Per-answer actions and History (DESIGN.md §3.12.1–3.12.3).
  ipcMain.handle('answer-feedback', (_e, { id, vote } = {}) => companion.feedback({ id, vote }));
  ipcMain.handle('style-nudge', (_e, { key, accept } = {}) => companion.answerNudge({ key: String(key), accept: Boolean(accept) }));
  ipcMain.handle('propose-memory', (_e, { id, selection } = {}) => companion.proposeMemory({ id, selection: typeof selection === 'string' ? selection : '' }));
  ipcMain.handle('remember-facts', (_e, texts) => companion.rememberFacts(Array.isArray(texts) ? texts : []));
  ipcMain.handle('save-chat', () => companion.saveChat());
  ipcMain.handle('history-list', (_e, query) => memory.conversations({ query: typeof query === 'string' ? query.slice(0, 200) : '' }));
  ipcMain.handle('history-get', (_e, id) => memory.conversation(String(id)));
  ipcMain.handle('history-delete', (_e, id) => { memory.deleteConversation(String(id)); return memory.conversations(); });
  ipcMain.handle('history-clear', () => { memory.clearHistory(); return []; });
  ipcMain.on('history-continue', (_e, id) => { if (companion.continueConversation(String(id))) showBubble(); });
  ipcMain.on('open-history', () => openSettings('history'));
  ipcMain.handle('onboarding-save', (_e, payload) => {
    const result = companion.saveOnboarding({ answers: payload?.answers || {}, keep: Array.isArray(payload?.keep) ? payload.keep : [] });
    settingsWin?.webContents.send('settings-changed', settingsSnapshot());
    return result;
  });
  ipcMain.handle('onboarding-preview', (_e, answers) => onboardingResult(answers && typeof answers === 'object' ? answers : {}));
  ipcMain.on('onboarding-skip', () => companion.skipOnboarding());
  ipcMain.on('onboarding-start', openOnboarding);
  // Only reveals files a Loon file search just returned (they exist on disk); never arbitrary paths from a page.
  ipcMain.on('reveal', (_e, file) => { if (typeof file === 'string' && path.isAbsolute(file) && fs.existsSync(file)) shell.showItemInFolder(file); });
  ipcMain.handle('settings-get', () => settingsSnapshot());
  ipcMain.handle('cat-look', () => catLook());
  ipcMain.handle('settings-set', (_e, { key, value }) => {
    // How the cat looks (§5.0.2): validated against the sprite tables, then pushed to the cat window live.
    const lookOk = { catStyle: ['pixel', 'classic'].includes(value), companion: typeof value === 'string' && Object.hasOwn(pixelSprites.CHARACTERS, value), costume: typeof value === 'string' && Object.hasOwn(pixelSprites.COSTUMES, value), seasonalCostumes: typeof value === 'boolean', retroSounds: typeof value === 'boolean', cameos: typeof value === 'boolean', duo: typeof value === 'boolean' };
    if (lookOk[key]) {
      settings[key] = value;
      saveSettings();
      if (key === 'duo' && catWin) fitCatWindow(true);
      catWin?.webContents.send('cat-look', catLook());
    }
    if (['focus', 'privacy', 'judgmental', 'wakeWord'].includes(key)) setToggle(key, Boolean(value));
    if (key === 'speakReplies') { settings.speakReplies = value ? 'voiceOnly' : 'never'; saveSettings(); }
    if (key === 'cloudCli' && ['off', 'claude', 'codex', 'api'].includes(value)) { settings.cloudCli = value; saveSettings(); warmPlan(); }
    if (key === 'answerWith' && ['plan', 'mac'].includes(value)) { settings.answerWith = value; saveSettings(); warmPlan(); }
    if (key === 'quickTake' && typeof value === 'boolean') { settings.quickTake = value; saveSettings(); }
    if (key === 'teachScreenshots' && typeof value === 'boolean') { settings.teachScreenshots = value; saveSettings(); }
    if (key === 'screenSight') { settings.screenSight = value ? 'when-asked' : 'off'; saveSettings(); }
    if (key === 'feedbackText' && typeof value === 'boolean') { settings.feedbackText = value; saveSettings(); }
    if (key === 'routineNotifications' && typeof value === 'boolean') { settings.routineNotifications = value; saveSettings(); }
    if (key === 'memoryFiles' && typeof value === 'boolean') { settings.memoryFiles = value; saveSettings(); syncMemoryFiles(); }
    if (key === 'quietHours' && value && typeof value === 'object') {
      const time = (t, fallback) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : fallback);
      settings.quietHours = { on: Boolean(value.on), start: time(value.start, settings.quietHours.start), end: time(value.end, settings.quietHours.end) };
      saveSettings();
    }
    // One model name per CLI and difficulty; '' = Loon's default. Names that could read as a flag are refused.
    if (key === 'planModel' && ['claude', 'codex'].includes(value?.which) && ['medium', 'hard'].includes(value?.level)) {
      const model = String(value.model || '').trim();
      if (model && !cliProvider.MODEL_NAME.test(model)) return { ...settingsSnapshot(), planModelError: 'Model names are letters, numbers and . - _ : / only.' };
      settings.planModels = { ...settings.planModels, [value.which]: { ...settings.planModels?.[value.which], [value.level]: model } };
      saveSettings();
      warmPlan();
    }
    // Custom instructions and reply style: validated and length-capped in brain/personal.js.
    if (key === 'personal' && value && typeof value === 'object') { settings.personal = cleanPersonal({ ...settings.personal, ...value }); saveSettings(); }
    if (key === 'api' && value && typeof value === 'object') {
      try {
        settings.api = apiProvider.cleanConfig(value);
        saveSettings();
      } catch (err) {
        return { ...settingsSnapshot(), apiError: err.message };
      }
    }
    if (key === 'project' && value?.path && fs.existsSync(value.path)) {
      const set = new Set(settings.projects || []);
      if (value.allowed) set.add(value.path);
      else set.delete(value.path);
      settings.projects = [...set];
      saveSettings();
    }
    return settingsSnapshot();
  });
  ipcMain.handle('cli-detect', () => cliProvider.detect());
  // Own API key: the key comes in once from Settings, is encrypted with safeStorage, and only hints go back out.
  ipcMain.handle('api-key-save', (_e, { provider, key }) => {
    try {
      apiKeys.save(provider, key);
      return settingsSnapshot();
    } catch (err) {
      return { ...settingsSnapshot(), apiError: err.message };
    }
  });
  ipcMain.handle('api-key-remove', (_e, provider) => { apiKeys.remove(provider); return settingsSnapshot(); });
  ipcMain.handle('api-key-test', () => {
    const { provider, baseUrl } = apiProvider.config(settings);
    return apiProvider.testKey({ provider, baseUrl, key: apiKeys.get(provider) });
  });
  ipcMain.handle('connectors-discover', () => hub.discover());
  ipcMain.handle('connectors-add', (_e, found) => { hub.add(found); return settingsSnapshot(); });
  ipcMain.handle('connectors-remove', (_e, id) => { hub.remove(id); return settingsSnapshot(); });
  // Settings → Tools (MCP). Adding (and "Refresh") starts the server and lists its tools; a failure shows on its row.
  const mcpAction = (fn) => async (_e, arg) => {
    try {
      await fn(arg || {});
      return settingsSnapshot();
    } catch (err) {
      return { ...settingsSnapshot(), mcpError: err.message };
    }
  };
  ipcMain.handle('mcp-add', mcpAction(async (server) => {
    const added = mcpHub.add(server);
    await mcpHub.tools(added, { force: true }).catch(() => {}); // the error shows on its row
  }));
  ipcMain.handle('mcp-remove', mcpAction(({ id }) => mcpHub.remove(String(id))));
  ipcMain.handle('mcp-refresh', mcpAction(async ({ id }) => {
    const server = mcpHub.get(String(id));
    if (!server) return;
    mcpHub.disconnect(server.id);
    await mcpHub.tools(server, { force: true }).catch(() => {});
  }));
  ipcMain.handle('mcp-tool', mcpAction(({ id, tool, enabled, autoAllow }) => mcpHub.setTool(String(id), String(tool), { enabled, autoAllow })));
  ipcMain.handle('memory-update', (_e, { id, text }) => { memory.update(id, text); return settingsSnapshot(); });
  ipcMain.handle('memory-delete', (_e, id) => { memory.remove(id); return settingsSnapshot(); });
  ipcMain.handle('memory-pin', (_e, { id, pinned }) => { memory.pin(id, pinned); return settingsSnapshot(); });
  // Loon's brain (Settings): the graph, one node's facts, forgetting a node (its facts stay).
  ipcMain.handle('memory-graph', () => memory.graph());
  ipcMain.handle('memory-node-facts', (_e, id) => memory.nodeFacts(String(id)));
  ipcMain.handle('memory-node-delete', (_e, id) => { memory.removeNode(String(id)); return memory.graph(); });
  // Optional embedding model for meaning-based memory and cache matches; downloaded only when the user asks.
  ipcMain.handle('download-embedder', async () => {
    try {
      await embedder.downloadModel((progress) => settingsWin?.webContents.send('embedder-progress', progress));
    } catch (err) {
      console.warn('[embed] download failed:', err.message);
    }
    return settingsSnapshot();
  });
  ipcMain.handle('memory-clear', () => {
    memory.clear();
    memory.clearHistory();
    memory.clearFeedback();
    resolver.cache.clear();
    resolver.escalations.clear();
    memoryFiles.unwatch();
    memoryFiles.clear(); // the Markdown copy goes too
    return settingsSnapshot();
  });
  ipcMain.on('open-notes-folder', () => { fs.mkdirSync(notes.dir, { recursive: true }); shell.openPath(notes.dir); });
  // Writes the folder first (with its README) unless Privacy mode or the toggle says no writes.
  ipcMain.on('open-memory-folder', () => {
    if (memoryFiles.enabled()) {
      syncMemoryFiles();
      fs.mkdirSync(memoryFiles.dir, { recursive: true });
      memoryFiles.write('README.md', memoryFiles.readme());
      memoryFiles.watch();
    }
    if (fs.existsSync(memoryFiles.dir)) shell.openPath(memoryFiles.dir);
  });
  ipcMain.on('copy-pairing-code', () => clipboard.writeText(settings.pairingCode));
  ipcMain.on('open-settings', () => openSettings());
  ipcMain.on('drop-file', (_e, file) => { if (typeof file === 'string' && path.isAbsolute(file) && fs.existsSync(file)) openDroppedFile(file); });
  ipcMain.on('mic-chunk', (_e, samples) => voice.onChunk(Float32Array.from(samples)));
  ipcMain.on('mic-error', (_e, message) => {
    voice.stop();
    companion.showNotice(`I couldn't open the microphone (${message}).`);
    showBubble();
  });
  ipcMain.on('audio-played', (_e, id) => { pendingPlays.get(id)?.(); pendingPlays.delete(id); });
  ipcMain.on('nudge-click', onNudgeClick);
  // Settings → Routines. Creating one happens in the bubble, behind a confirm card.
  const routineAction = (fn) => async (_e, arg) => {
    try {
      const message = await fn(arg);
      return { ...settingsSnapshot(), routineMessage: message || '' };
    } catch (err) {
      return { ...settingsSnapshot(), routineError: err.message };
    }
  };
  ipcMain.handle('routine-toggle', routineAction(({ id, on }) => { routines.setEnabled(String(id), Boolean(on)); }));
  ipcMain.handle('routine-update', routineAction(({ id, fields }) => { routines.update(String(id), Array.isArray(fields) ? fields.map((f) => ({ name: String(f.name), value: String(f.value ?? '').slice(0, 500) })) : []); }));
  ipcMain.handle('routine-delete', routineAction((id) => { routines.remove(String(id)); }));
  ipcMain.handle('routine-run', routineAction(async (id) => (await routines.runNow(String(id))).message));
  ipcMain.on('nudge-ignored', (_e, kind) => { dailyNudge = null; companion.onNudgeIgnored(kind); });
}

// Debug/verification hook: --shot=out.png [--shot-delay=ms] [--cmd=<json>] [--shot-bubble [--ask=<question>]]
function scheduleScreenshot() {
  const shot = arg('shot');
  if (!shot) return;
  const debug = arg('cmd');
  const delay = Number(arg('shot-delay') || 2500);
  catWin.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      if (debug) catWin.webContents.send('debug', JSON.parse(debug));
      if (process.argv.includes('--shot-bubble')) {
        openAskBubble();
        const question = arg('ask');
        if (question) {
          setTimeout(() => bubbleWin.webContents.executeJavaScript(
            `document.getElementById('input').value = ${JSON.stringify(question)}; document.getElementById('askForm').requestSubmit();`,
          ), 400);
        }
      }
    }, 1200);
    if (process.argv.includes('--shot-settings')) setTimeout(openSettings, 1000);
    setTimeout(async () => {
      const target = process.argv.includes('--shot-settings') ? settingsWin : process.argv.includes('--shot-bubble') ? bubbleWin : catWin;
      fs.writeFileSync(shot, (await target.webContents.capturePage()).toPNG());
      app.quit();
    }, 1200 + delay);
  });
}

app.whenReady().then(() => {
  try { capture.sweepShots(); } catch { /* temp dir unreadable */ } // screenshots left behind by a crash or quit
  if (arg('theme')) require('electron').nativeTheme.themeSource = arg('theme'); // screenshots in light/dark
  if (process.platform === 'darwin') app.dock.hide();
  loadSettings();
  if (!settings.pairingCode) {
    settings.pairingCode = newPairingCode();
    saveSettings();
  }
  brain = new Brain({ modelsDir: path.join(app.getPath('userData'), 'models'), settings });
  apiKeys = new apiProvider.KeyStore(path.join(app.getPath('userData'), 'api-keys.json'), safeStorage);
  translator = new Translator({ cacheDir: path.join(app.getPath('userData'), 'translation-models') });
  notes = new Notes(settings.notesDir || path.join(app.getPath('documents'), 'Loon'));
  embedder = new Embedder({ modelsDir: path.join(app.getPath('userData'), 'models'), brain });
  let projectNames = null; // names only, so the brain graph recognizes "working on Loon"; folders aren't read
  memory = new Memory(path.join(app.getPath('userData'), 'memory.db'), {
    legacyJson: path.join(app.getPath('userData'), 'memory.json'),
    embedder,
    projectNames: () => (projectNames ??= require('./brain/projects').discover().map((p) => p.name)),
  });
  // "Loon remembered…" (§3.12.1): every saved fact, whatever saved it, shows a toast with Undo in the open bubble.
  memory.onAdd = (fact) => { if (bubbleWin?.isVisible()) bubbleWin.webContents.send('bubble-remembered', { id: fact.id, text: fact.text }); };
  // Never during the selftest, which swaps in a temporary database.
  memoryFiles = new MemoryFiles({ dir: path.join(notes.dir, 'Memory'), memory, notesDir: notes.dir, enabled: () => !SELFTEST && settings.memoryFiles !== false && !settings.privacy });
  memory.onChange = () => memoryFiles.schedule();
  syncMemoryFiles(); // picks up edits made while Loon was closed
  // Only folders the user ticked in Settings → Projects are ever read.
  const allowedProjects = () => (settings.projects || []).filter((p) => fs.existsSync(p));
  hub = new ConnectorHub({ settings, save: saveSettings });
  mcpHub = new McpHub({ settings, save: saveSettings, secrets: new apiProvider.KeyStore(path.join(app.getPath('userData'), 'mcp-secrets.json'), safeStorage) });
  actions = new Actions({ auditFile: path.join(app.getPath('userData'), 'audit.jsonl'), notes, memory, hub, mcp: mcpHub, projects: allowedProjects, onFocus: startFocus, onTimer: startTimer, openExternal: (url) => hooks.openExternal(url) });
  // Tidy memory at most once a day: merges duplicate facts only, logged as a count (no content).
  if (!settings.privacy && !SELFTEST && settings.lastTidy !== new Date().toDateString()) {
    settings.lastTidy = new Date().toDateString();
    saveSettings();
    const merged = memory.consolidate();
    if (merged) actions.audit({ action: 'tidy-memory', ok: true, merged });
  }
  resolver = new Resolver({
    brain,
    translator,
    skills: new Skills({ dataDir: app.getPath('userData'), brain, projects: allowedProjects }),
    memory,
    notes,
    embedder,
    settings,
    api: { route: (s) => apiProvider.route(s, apiKeys) },
    cacheFile: path.join(app.getPath('userData'), 'cache.json'),
    countsFile: path.join(app.getPath('userData'), 'counts.json'),
  });
  bridge = new Bridge({ pairingCode: settings.pairingCode });
  // While Loon acts for the user: busy paws on the cat, and Esc anywhere stops the task.
  agentRunner = createAgentRunner({
    bridge,
    actions,
    brain,
    settings,
    memory,
    ui: {
      busy: (on, ok) => {
        catWin.webContents.send('brain', on ? { state: 'acting' } : { state: 'done', mood: ok ? 'happy' : 'confused' });
        if (on) globalShortcut.register('Escape', () => companion.cancel());
        else globalShortcut.unregister('Escape');
      },
    },
  });
  overlay = createOverlay({
    BrowserWindow,
    screen,
    globalShortcut,
    splitByDisplay,
    cursorPoint,
    hidden: HIDDEN,
    preload: path.join(__dirname, 'renderer', 'preload.js'),
    file: path.join(__dirname, 'renderer', 'overlay.html'),
    onAction: onOverlayAction,
  });
  teacher = createTeacher({
    settings,
    screen: (teachSeam = teachScreen()),
    overlay,
    bridge,
    brain,
    cli: cliProvider,
    api: { route: (s) => apiProvider.route(s, apiKeys) },
    activePage: () => companion?.activePage,
    audit: (entry) => actions.audit(entry),
  });
  routines = createRoutines({
    memory,
    settings,
    audit: (entry) => actions.audit(entry),
    tasks: {
      connected: () => bridge.clients.size > 0,
      today: async () => (await actions.execute({ action: 'today' })).message,
      briefing: async (project) => (await actions.execute({ action: 'briefing', project })).message,
      projects: async () => (allowedProjects().length ? (await require('./brain/projects').briefing(allowedProjects())).text : ''),
      // Price watch: only a Chrome tab already showing that page answers; nothing is opened or fetched behind your back.
      products: async (url) => {
        const reply = await bridge.request({ type: 'find-page', url }, 15000);
        if (reply.error) throw new Error(reply.error);
        if (reply.sensitive) throw new Error('that page looks private, so I skipped it');
        if (!reply.html) return null;
        const { parseHTML } = await import('linkedom');
        return require('./brain/shopping').extractStructured(parseHTML(reply.html).document);
      },
    },
    ui: {
      nudge: ({ kind, item }) => {
        dailyNudge = 'routine';
        const line = kind === 'reminder' ? `${persona.line(settings.companion, 'nudge.reminder')} ${item.text}`.slice(0, 80) : '';
        catWin.webContents.send('nudge', { kind, ...(line ? { line } : {}) });
      },
      notify: Notification.isSupported() ? ({ title, body, onClick }) => {
        // Held in a variable: a collected Notification never reports its click.
        routineNotification = new Notification({ title, body });
        routineNotification.on('click', onClick);
        routineNotification.show();
      } : null,
      open: openRoutineResults,
    },
  });
  actions.routines = routines;
  companion = createCompanion({
    agent: agentRunner,
    routines,
    teacher,
    screenSight: createScreenSight(screenSightDeps()),
    memory,
    bridge,
    resolver,
    brain,
    hooks,
    hub,
    mcp: mcpHub,
    actions,
    notes,
    settings,
    saveSettings: () => { saveSettings(); settingsWin?.webContents.send('settings-changed', settingsSnapshot()); },
    ui: {
      showBubble,
      hideBubble,
      bubbleFocused: () => isFocused(bubbleWin),
      cat: (channel, payload) => catWin.webContents.send(channel, payload),
      runInBubble: (task) => bubbleWin.webContents.send('bubble-run', { task }),
    },
  });
  // A malformed message must never surface as a modal error dialog in the main process.
  voiceEngine = new VoiceEngine(path.join(app.getPath('userData'), 'voice'));
  voice = createVoiceController({
    engine: voiceEngine,
    session: companion.session,
    settings,
    setToggle,
    ui: {
      cat: (channel, payload) => catWin.webContents.send(channel, payload),
      mic: (on) => catWin.webContents.send('mic', { on }),
      micAllowed: () => !SELFTEST,
      transcript: () => {},
      showNotice: (notice) => { companion.showNotice(notice); showBubble(); },
      ask: askInBubble,
      runTask: (task, text) => {
        if (text) {
          companion.fromCapture({ text, app: 'voice' });
          showBubble();
        } else if (!bubbleWin.isVisible()) {
          openAskBubble();
        }
        setTimeout(() => bubbleWin.webContents.send('bubble-run', { task }), 300);
      },
      confirm: ({ id, command }) => companion.confirm(command, toBubbleRef.current, id),
      cancelConfirm: (id) => bubbleWin.webContents.send('bubble-cancel-confirm', { id }),
      play: ({ samples, sampleRate }) => new Promise((resolve) => {
        const id = ++playId;
        pendingPlays.set(id, resolve);
        catWin.webContents.send('play-audio', { id, samples, sampleRate, muted: SELFTEST });
        setTimeout(() => { if (pendingPlays.delete(id)) resolve(); }, (samples.length / sampleRate) * 1000 + 2000);
      }),
      stopAudio: () => {
        catWin.webContents.send('stop-audio');
        for (const resolve of pendingPlays.values()) resolve();
        pendingPlays.clear();
      },
      sayFallback: (text) => hooks.say(text),
    },
  });
  // Let only the cat window use the microphone; everything else is denied.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => callback(permission === 'media' && wc === catWin?.webContents));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media' && wc === catWin?.webContents);

  if (settings.wakeWord) setTimeout(() => voice.setWake(!settings.focus && !settings.privacy), 3000);
  // Load the fast model shortly after launch so the first answer starts streaming right away.
  if (!SELFTEST) setTimeout(() => brain.warmUp(), 4000);
  setTimeout(warmPlan, 6000);
  if (!SELFTEST) startDayRhythm();
  hub.refresh();
  setInterval(() => hub.refresh(), 5 * 60 * 1000); // apps come and go; keep "Send to …" chips current

  bridge.on('message', (message) => {
    try {
      companion.onBridgeMessage(message);
      if (message.type === 'page') routines.onPage(message.url);
    } catch (err) {
      console.error('[bridge message]', message.type, err);
    }
  });
  bridge.on('status', ({ connected }) => { if (connected) routines.poke(); }); // price watches waiting for Chrome
  bridge.start();
  registerIpc();
  createCatWindow();
  createBubbleWindow();
  // First launch (needs catWin, so it runs after the windows exist): a short hello in the bubble instead of a silent cat.
  if (!settings.welcomed && (!SELFTEST || FRESH_CHECK) && !arg('shot')) {
    catWin.webContents.once('did-finish-load', () => setTimeout(() => {
      // The hello is Luna's first line in "Get to know you"; Skip ends it and nothing is saved.
      if (settings.onboarded) companion.showNotice("Hi, I'm Loon 🐾 Click me to ask anything, press and hold to pet me, or try ⌥Space. Right-click me for Settings, where you can connect Chrome and pick projects for me to keep up with. Everything stays on this Mac.");
      else companion.openOnboarding();
      showBubble();
      settings.welcomed = true;
      saveSettings();
    }, 1800));
  }
  // Routines start once the cat can show a nudge; the first tick also catches up on runs missed while Loon was closed.
  if (!SELFTEST && !arg('shot')) catWin.webContents.once('did-finish-load', () => setTimeout(() => routines.start(), 3000));
  scheduleScreenshot();
  if (SELFTEST) {
    const startPosition = settings.position;
    const selftestHooks = {
      isFocused,
      hidden: HIDDEN,
      catIgnore: () => ({ ...catIgnore }),
      setCursor: (point) => { virtualCursor = point; },
      // Puts the cat back where the run started, including the home it walks back to and the saved position.
      resetCatPosition: (bounds) => {
        stopWindowAnimation();
        catWin.setBounds(bounds);
        home = { x: bounds.x, y: bounds.y };
        settings.position = startPosition;
        saveSettings();
      },
    };
    catWin.webContents.once('did-finish-load', async () => {
      const ok = await require('./test/selftest').run({ catWin, bubbleWin, bridge, companion, resolver, hooks, settings, openScreenshot, openDroppedFile, actions, notes, memory, setToggle, voice, voiceEngine, hub, brain, teacher, overlay, routines, teachScreen: teachSeam, ...selftestHooks }).catch((err) => { console.error(err); return false; });
      console.log(`selftest finished, exiting with ${ok ? 0 : 1}`);
      app.exit(ok ? 0 : 1);
    });
  }
  // Stop drawing while nobody can see the cat.
  const setPaused = (paused) => { if (!SELFTEST) catWin.webContents.send('power', { paused }); };
  powerMonitor.on('lock-screen', () => setPaused(true));
  powerMonitor.on('suspend', () => setPaused(true));
  powerMonitor.on('unlock-screen', () => { setPaused(false); routines.poke(); });
  powerMonitor.on('resume', () => { setPaused(false); routines.poke(); }); // catch up on runs missed while asleep
  // LOON_NO_HOTKEYS=1: a background run on a machine someone is using must not take their ⌥Space and friends.
  if (process.env.LOON_NO_HOTKEYS === '1') return;
  if (!globalShortcut.register('Alt+Space', onAskHotkey)) console.warn('Loon: ⌥Space is taken by another app; open the bubble by clicking the cat.');
  if (!globalShortcut.register('Alt+Shift+S', onScreenshotHotkey)) console.warn('Loon: ⌥⇧S is taken by another app.');
  if (!globalShortcut.register('Alt+Shift+V', onVoiceHotkey)) console.warn('Loon: ⌥⇧V is taken by another app.');
  if (!globalShortcut.register('Alt+Shift+T', onTeachHotkey)) console.warn('Loon: ⌥⇧T is taken by another app; use "Teach me on screen" in the cat menu.');
});

app.on('will-quit', () => {
  routines?.stop();
  memoryFiles?.unwatch();
  mcpHub?.closeAll();
  memory?.close();
  globalShortcut.unregisterAll();
  bridge?.stop();
  translator?.stop();
  voiceEngine?.stopTts();
  resolver?.cache.saveNow();
  cliProvider.shutdown();
});

app.on('window-all-closed', () => app.quit());
