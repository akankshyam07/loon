const { app, BrowserWindow, screen, ipcMain, globalShortcut, Menu, powerMonitor, clipboard, shell, nativeImage, systemPreferences, session } = require('electron');
const fs = require('fs');
const path = require('path');
const { Brain } = require('./brain/ai');
const { Resolver } = require('./brain/resolve');
const { Translator } = require('./brain/translate');
const { Skills } = require('./brain/skills');
const { Bridge, newPairingCode } = require('./main/bridge');
const { createCompanion } = require('./main/companion');
const capture = require('./main/capture');
const { Actions } = require('./main/actions');
const { Notes } = require('./brain/notes');
const { Memory } = require('./brain/memory');
const { Embedder } = require('./brain/embed');
const { VoiceEngine, createVoiceController } = require('./main/voice');
const { ConnectorHub } = require('./main/hub');
const { createAgentRunner } = require('./main/agent');
const { PERSONAL_DEFAULTS, cleanPersonal, profileSummary } = require('./brain/personal');

// Cat height in px per size preset; the window adds room around it for sparkles and hops.
const SIZES = { S: 120, M: 160, L: 210 };
const CAT_ASPECT = 240 / 256; // loon.svg viewBox
const WINDOW_PAD_X = 1.55;
const WINDOW_PAD_Y = 1.45;
const BUBBLE_WIDTH = 360;
const EDGE_MARGIN = 12;

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const DEMO = process.argv.includes('--demo') || process.env.LOON_DEMO === '1';
const SELFTEST = process.argv.includes('--selftest');
// Hidden runs (the selftest by default; LOON_HIDDEN=0 shows it) draw invisibly, ignore the real mouse and never
// take focus from the app the user is working in.
const HIDDEN = process.env.LOON_HIDDEN === '1' || (SELFTEST && process.env.LOON_HIDDEN !== '0');
const HIDDEN_WINDOW = HIDDEN ? { show: false, opacity: 0 } : {};
if (SELFTEST) {
  // Invisible or covered windows must keep painting and running timers, or capturePage and the checks stall.
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}

let settingsFile;
let settings = { size: 'M', focus: false, privacy: false, judgmental: true, wakeWord: false, speakReplies: 'voiceOnly', projects: [], connectors: [], welcomed: false, cloudCli: 'off', personal: { ...PERSONAL_DEFAULTS }, dismissedSuggestions: [] };
let catWin;
let bubbleWin;
let brain;
let resolver;
let dragTimer = null;
let windowAnimation = null;
let bridge;
let companion;
let translator;
let actions;
let notes;
let memory;
let embedder;
let settingsWin = null;
let voice;
let hub;
let voiceEngine;
let agentRunner;
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
function setCatIgnore(ignore) {
  catWin.setIgnoreMouseEvents(ignore || HIDDEN, SELFTEST ? {} : { forward: true });
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

function catWindowSize() {
  const catH = SIZES[settings.size] || SIZES.M;
  return { width: Math.round(catH * CAT_ASPECT * WINDOW_PAD_X), height: Math.round(catH * WINDOW_PAD_Y) };
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

function placeBubble(height = bubbleWin.getBounds().height) {
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
  catWin.webContents.send('bubble', { open: true });
}

function hideBubble() {
  if (!bubbleWin.isVisible()) return;
  companion.cancel();
  bubbleWin.hide();
  brain.resetThread();
  bubbleWin.webContents.send('bubble-hidden');
  catWin.webContents.send('bubble', { open: false });
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

function onNudgeClick() {
  const kind = dailyNudge;
  dailyNudge = null;
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
    const kind = read.kind === 'csv' ? 'csv' : read.kind === 'pdf' ? 'document' : classifyText(read.text);
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

function setSize(size) {
  settings.size = size;
  saveSettings();
  const bounds = catWin.getBounds();
  const next = catWindowSize();
  // keep the cat's feet where they were
  const pos = clampToWorkArea(bounds.x + (bounds.width - next.width) / 2, bounds.y + bounds.height - next.height, next);
  catWin.setBounds({ ...pos, ...next });
  home = { x: pos.x, y: pos.y };
  settings.position = catWin.getBounds();
  saveSettings();
}

// Behavior toggles (§3.15). The resolver and companion read `settings` live, so no restart is needed.
function setToggle(key, value) {
  settings[key] = value;
  saveSettings();
  if (key === 'focus') catWin.webContents.send('focus', { on: value });
  // "Hey Loon" pauses in Focus and Privacy modes and resumes after.
  if (['wakeWord', 'focus', 'privacy'].includes(key)) voice.setWake(settings.wakeWord && !settings.focus && !settings.privacy);
  settingsWin?.webContents.send('settings-changed', settingsSnapshot());
}

function settingsSnapshot() {
  const { discover } = require('./brain/projects');
  const known = new Map(discover().map((p) => [p.path, p]));
  for (const p of settings.projects || []) if (!known.has(p)) known.set(p, { name: path.basename(p), path: p });
  return {
    ...settings,
    projectChoices: [...known.values()].map((p) => ({ ...p, allowed: (settings.projects || []).includes(p.path) })),
    connectorList: (settings.connectors || []).map((x) => ({ ...x, ready: hub.cache.has(x.id), operations: hub.cache.get(x.id)?.ops.length || 0, canSend: hub.senders.has(x.id) })),
    notesDir: notes.dir,
    connected: bridge.clients.size > 0,
    counts: resolver.counts,
    memory: memory.all(),
    personal: cleanPersonal(settings.personal),
    profile: profileSummary(memory.all(), settings.personal),
    embedder: embedder.status(),
    audit: actions.recent(20),
  };
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) return focusWindow(settingsWin);
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
  settingsWin.webContents.on('will-navigate', (e) => e.preventDefault());
  settingsWin.on('closed', () => { settingsWin = null; });
}

function showCatMenu() {
  Menu.buildFromTemplate([
    { label: 'Ask Loon…', accelerator: 'Alt+Space', click: openAskBubble },
    { label: 'Explain a screenshot…', accelerator: 'Alt+Shift+S', click: onScreenshotHotkey },
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
    { label: 'Settings…', click: openSettings },
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

function registerIpc() {
  ipcMain.handle('cat-svg', () => fs.readFileSync(path.join(__dirname, 'renderer', 'loon.svg'), 'utf8'));
  ipcMain.on('set-ignore-mouse', (_e, ignore) => setCatIgnore(ignore));
  ipcMain.on('cat-menu', showCatMenu);
  ipcMain.on('open-bubble', openAskBubble);
  ipcMain.on('close-bubble', hideBubble);
  ipcMain.handle('animate-window', (_e, opts) => animateWindow(opts));
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
  const toBubble = (type, payload) => {
    voice.observe(type, payload);
    const channel = { chunk: 'ask-chunk', done: 'ask-done', error: 'ask-error', context: 'bubble-context', sensitive: 'bubble-sensitive', confirm: 'bubble-confirm', 'action-done': 'bubble-action', choices: 'bubble-choices', agent: 'bubble-agent', suggest: 'bubble-suggest' }[type];
    bubbleWin.webContents.send(channel, payload);
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
  // Only reveals files a Loon file search just returned (they exist on disk); never arbitrary paths from a page.
  ipcMain.on('reveal', (_e, file) => { if (typeof file === 'string' && path.isAbsolute(file) && fs.existsSync(file)) shell.showItemInFolder(file); });
  ipcMain.handle('settings-get', () => settingsSnapshot());
  ipcMain.handle('settings-set', (_e, { key, value }) => {
    if (['focus', 'privacy', 'judgmental', 'wakeWord'].includes(key)) setToggle(key, Boolean(value));
    if (key === 'speakReplies') { settings.speakReplies = value ? 'voiceOnly' : 'never'; saveSettings(); }
    if (key === 'cloudCli' && ['off', 'claude', 'codex'].includes(value)) { settings.cloudCli = value; saveSettings(); }
    // Custom instructions and reply style: validated and length-capped in brain/personal.js.
    if (key === 'personal' && value && typeof value === 'object') { settings.personal = cleanPersonal({ ...settings.personal, ...value }); saveSettings(); }
    if (key === 'project' && value?.path && fs.existsSync(value.path)) {
      const set = new Set(settings.projects || []);
      if (value.allowed) set.add(value.path);
      else set.delete(value.path);
      settings.projects = [...set];
      saveSettings();
    }
    return settingsSnapshot();
  });
  ipcMain.handle('cli-detect', () => require('./brain/cli-provider').detect());
  ipcMain.handle('connectors-discover', () => hub.discover());
  ipcMain.handle('connectors-add', (_e, found) => { hub.add(found); return settingsSnapshot(); });
  ipcMain.handle('connectors-remove', (_e, id) => { hub.remove(id); return settingsSnapshot(); });
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
  ipcMain.handle('memory-clear', () => { memory.clear(); memory.clearHistory(); resolver.cache.clear(); resolver.escalations.clear(); return settingsSnapshot(); });
  ipcMain.on('open-notes-folder', () => { fs.mkdirSync(notes.dir, { recursive: true }); shell.openPath(notes.dir); });
  ipcMain.on('copy-pairing-code', () => clipboard.writeText(settings.pairingCode));
  ipcMain.on('open-settings', openSettings);
  ipcMain.on('drop-file', (_e, file) => { if (typeof file === 'string' && path.isAbsolute(file) && fs.existsSync(file)) openDroppedFile(file); });
  ipcMain.on('mic-chunk', (_e, samples) => voice.onChunk(Float32Array.from(samples)));
  ipcMain.on('mic-error', (_e, message) => {
    voice.stop();
    companion.showNotice(`I couldn't open the microphone (${message}).`);
    showBubble();
  });
  ipcMain.on('audio-played', (_e, id) => { pendingPlays.get(id)?.(); pendingPlays.delete(id); });
  ipcMain.on('nudge-click', onNudgeClick);
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
  if (arg('theme')) require('electron').nativeTheme.themeSource = arg('theme'); // screenshots in light/dark
  if (process.platform === 'darwin') app.dock.hide();
  loadSettings();
  if (!settings.pairingCode) {
    settings.pairingCode = newPairingCode();
    saveSettings();
  }
  brain = new Brain({ modelsDir: path.join(app.getPath('userData'), 'models'), settings });
  translator = new Translator({ cacheDir: path.join(app.getPath('userData'), 'translation-models') });
  notes = new Notes(settings.notesDir || path.join(app.getPath('documents'), 'Loon'));
  embedder = new Embedder({ modelsDir: path.join(app.getPath('userData'), 'models'), brain });
  let projectNames = null; // names only, so the brain graph recognizes "working on Loon"; folders aren't read
  memory = new Memory(path.join(app.getPath('userData'), 'memory.db'), {
    legacyJson: path.join(app.getPath('userData'), 'memory.json'),
    embedder,
    projectNames: () => (projectNames ??= require('./brain/projects').discover().map((p) => p.name)),
  });
  // Only folders the user ticked in Settings → Projects are ever read.
  const allowedProjects = () => (settings.projects || []).filter((p) => fs.existsSync(p));
  hub = new ConnectorHub({ settings, save: saveSettings });
  actions = new Actions({ auditFile: path.join(app.getPath('userData'), 'audit.jsonl'), notes, memory, hub, projects: allowedProjects, onFocus: startFocus, openExternal: (url) => hooks.openExternal(url) });
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
  companion = createCompanion({
    agent: agentRunner,
    memory,
    bridge,
    resolver,
    brain,
    hooks,
    hub,
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
  if (!SELFTEST) startDayRhythm();
  hub.refresh();
  setInterval(() => hub.refresh(), 5 * 60 * 1000); // apps come and go; keep "Send to …" chips current

  bridge.on('message', (message) => {
    try {
      companion.onBridgeMessage(message);
    } catch (err) {
      console.error('[bridge message]', message.type, err);
    }
  });
  bridge.start();
  registerIpc();
  createCatWindow();
  createBubbleWindow();
  // First launch (needs catWin, so it runs after the windows exist): a short hello in the bubble instead of a silent cat.
  if (!settings.welcomed && !SELFTEST && !arg('shot')) {
    catWin.webContents.once('did-finish-load', () => setTimeout(() => {
      companion.showNotice("Hi, I'm Loon 🐾 Click me to ask anything, press and hold to pet me, or try ⌥Space. Right-click me for Settings, where you can connect Chrome and pick projects for me to keep up with. Everything stays on this Mac.");
      showBubble();
      settings.welcomed = true;
      saveSettings();
    }, 1800));
  }
  scheduleScreenshot();
  if (SELFTEST) {
    const startPosition = settings.position;
    const selftestHooks = {
      isFocused,
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
      const ok = await require('./test/selftest').run({ catWin, bubbleWin, bridge, companion, resolver, hooks, settings, openScreenshot, openDroppedFile, actions, notes, memory, setToggle, voice, voiceEngine, hub, ...selftestHooks }).catch((err) => { console.error(err); return false; });
      app.exit(ok ? 0 : 1);
    });
  }
  // Stop drawing while nobody can see the cat.
  const setPaused = (paused) => { if (!SELFTEST) catWin.webContents.send('power', { paused }); };
  powerMonitor.on('lock-screen', () => setPaused(true));
  powerMonitor.on('suspend', () => setPaused(true));
  powerMonitor.on('unlock-screen', () => setPaused(false));
  powerMonitor.on('resume', () => setPaused(false));
  if (!globalShortcut.register('Alt+Space', onAskHotkey)) console.warn('Loon: ⌥Space is taken by another app; open the bubble by clicking the cat.');
  if (!globalShortcut.register('Alt+Shift+S', onScreenshotHotkey)) console.warn('Loon: ⌥⇧S is taken by another app.');
  if (!globalShortcut.register('Alt+Shift+V', onVoiceHotkey)) console.warn('Loon: ⌥⇧V is taken by another app.');
});

app.on('will-quit', () => {
  memory?.close();
  globalShortcut.unregisterAll();
  bridge?.stop();
  translator?.stop();
  resolver?.cache.saveNow();
});

app.on('window-all-closed', () => app.quit());
