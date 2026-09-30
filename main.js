const { app, BrowserWindow, screen, ipcMain, globalShortcut, Menu, powerMonitor, clipboard, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { Brain } = require('./brain/ai');
const { Resolver } = require('./brain/resolve');
const { Translator } = require('./brain/translate');
const { Bridge, newPairingCode } = require('./main/bridge');
const { createCompanion } = require('./main/companion');

// Cat height in px per size preset; the window adds room around it for sparkles and hops.
const SIZES = { S: 120, M: 160, L: 210 };
const CAT_ASPECT = 240 / 256; // loon.svg viewBox
const WINDOW_PAD_X = 1.55;
const WINDOW_PAD_Y = 1.45;
const BUBBLE_WIDTH = 360;
const EDGE_MARGIN = 12;

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const DEMO = process.argv.includes('--demo') || process.env.LOON_DEMO === '1';

let settingsFile;
let settings = { size: 'M' };
let catWin;
let bubbleWin;
let brain;
let resolver;
let dragTimer = null;
let windowAnimation = null;
let bridge;
let companion;
let translator;
// Swappable side effects so the selftest never opens a real browser tab or touches the clipboard.
const hooks = { openExternal: (url) => shell.openExternal(url), clipboard: (text) => clipboard.writeText(text) };

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
    webPreferences: { preload: path.join(__dirname, 'renderer', 'preload.js') },
  });
  catWin.setAlwaysOnTop(true, 'screen-saver');
  catWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Transparent pixels pass clicks through; the renderer turns this off while the cursor is over the cat.
  catWin.setIgnoreMouseEvents(true, { forward: true });
  catWin.loadFile(path.join(__dirname, 'renderer', 'cat.html'), { query: { demo: DEMO ? '1' : '0' } });
  catWin.on('moved', () => {
    settings.position = catWin.getBounds();
    saveSettings();
  });
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
    webPreferences: { preload: path.join(__dirname, 'renderer', 'preload.js') },
  });
  bubbleWin.setAlwaysOnTop(true, 'screen-saver');
  bubbleWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  bubbleWin.loadFile(path.join(__dirname, 'renderer', 'bubble.html'));
  bubbleWin.on('blur', () => {
    if (!companion.isBusy() && !process.argv.includes('--keep-bubble')) hideBubble();
  });
}

let bubbleAnchor = null; // screen rect of the selection the bubble belongs to, or null to sit by the cat

function placeBubble(height = bubbleWin.getBounds().height) {
  const cat = catWin.getBounds();
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
function showBubble({ anchor = null, focus = true } = {}) {
  bubbleAnchor = anchor;
  placeBubble();
  bubbleWin.setFocusable(focus);
  if (focus) {
    bubbleWin.show();
    bubbleWin.focus();
  } else {
    bubbleWin.showInactive();
  }
  bubbleWin.webContents.send('bubble-shown', { context: companion.context(), focus });
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

function toggleBubble() {
  if (bubbleWin.isVisible()) hideBubble();
  else openAskBubble();
}

let lastCursor = null;
function startCursorFeed() {
  setInterval(() => {
    if (!catWin || catWin.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    if (lastCursor && cursor.x === lastCursor.x && cursor.y === lastCursor.y) return;
    lastCursor = cursor;
    catWin.webContents.send('cursor', { cursor, win: catWin.getBounds() });
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
}

function showCatMenu() {
  Menu.buildFromTemplate([
    { label: 'Ask Loon…', accelerator: 'Alt+Space', click: openAskBubble },
    { label: 'Do a trick', click: () => catWin.webContents.send('debug', { move: 'random' }) },
    {
      label: bridge.clients.size ? 'Browser connected ✓' : `Pair browser… code ${settings.pairingCode} (click to copy)`,
      enabled: !bridge.clients.size,
      click: () => clipboard.writeText(settings.pairingCode),
    },
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
  ipcMain.on('set-ignore-mouse', (_e, ignore) => catWin.setIgnoreMouseEvents(ignore, { forward: true }));
  ipcMain.on('cat-menu', showCatMenu);
  ipcMain.on('open-bubble', openAskBubble);
  ipcMain.on('close-bubble', hideBubble);
  ipcMain.handle('animate-window', (_e, opts) => animateWindow(opts));
  ipcMain.handle('window-info', () => ({ win: catWin.getBounds(), workArea: workAreaFor(catWin.getBounds()), cursor: screen.getCursorScreenPoint() }));

  // Drag: main follows the global cursor so fast drags never lose the window.
  ipcMain.on('drag-start', (_e, { offsetX, offsetY }) => {
    stopWindowAnimation();
    clearInterval(dragTimer);
    const size = catWin.getBounds();
    dragTimer = setInterval(() => {
      const c = screen.getCursorScreenPoint();
      const pos = clampToWorkArea(c.x - offsetX, c.y - offsetY, size);
      catWin.setPosition(pos.x, pos.y);
    }, 16);
  });
  ipcMain.on('drag-end', () => {
    clearInterval(dragTimer);
    dragTimer = null;
    settings.position = catWin.getBounds();
    saveSettings();
  });

  ipcMain.on('bubble-height', (_e, height) => placeBubble(Math.min(Math.max(height, 80), 560)));

  ipcMain.handle('brain-status', async () => ({ ...(await brain.status()), counts: resolver.counts }));
  ipcMain.handle('download-model', async () => {
    const status = await brain.downloadModel((progress) => bubbleWin.webContents.send('download-progress', progress));
    return { ...status, counts: resolver.counts };
  });

  // Bubble ↔ companion. Every answer streams back as ask-chunk / ask-done / ask-error.
  const toBubble = (type, payload) => {
    const channel = { chunk: 'ask-chunk', done: 'ask-done', error: 'ask-error', context: 'bubble-context', sensitive: 'bubble-sensitive' }[type];
    bubbleWin.webContents.send(channel, payload);
  };
  ipcMain.on('ask', (_e, { id, text }) => companion.run({ id, question: text }, toBubble));
  ipcMain.on('run-task', (_e, { id, task, deeper }) => companion.run({ id, task, deeper }, toBubble));
  ipcMain.on('ask-cancel', () => companion.cancel());
  ipcMain.handle('look-anyway', () => companion.lookAnyway(toBubble));
  ipcMain.handle('handoff', (_e, opts) => companion.handoff(opts));
  ipcMain.on('bubble-focus', () => {
    bubbleWin.setFocusable(true);
    bubbleWin.focus();
  });
  ipcMain.on('nudge-click', () => companion.onNudgeClick());
  ipcMain.on('nudge-ignored', (_e, kind) => companion.onNudgeIgnored(kind));
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
    setTimeout(async () => {
      const target = process.argv.includes('--shot-bubble') ? bubbleWin : catWin;
      fs.writeFileSync(shot, (await target.webContents.capturePage()).toPNG());
      app.quit();
    }, 1200 + delay);
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
  loadSettings();
  if (!settings.pairingCode) {
    settings.pairingCode = newPairingCode();
    saveSettings();
  }
  brain = new Brain({ modelsDir: path.join(app.getPath('userData'), 'models'), settings });
  translator = new Translator({ cacheDir: path.join(app.getPath('userData'), 'translation-models') });
  resolver = new Resolver({
    brain,
    translator,
    cacheFile: path.join(app.getPath('userData'), 'cache.json'),
    countsFile: path.join(app.getPath('userData'), 'counts.json'),
  });
  bridge = new Bridge({ pairingCode: settings.pairingCode });
  companion = createCompanion({
    bridge,
    resolver,
    brain,
    hooks,
    ui: {
      showBubble,
      hideBubble,
      bubbleFocused: () => bubbleWin.isFocused(),
      cat: (channel, payload) => catWin.webContents.send(channel, payload),
      runInBubble: (task) => bubbleWin.webContents.send('bubble-run', { task }),
    },
  });
  // A malformed message must never surface as a modal error dialog in the main process.
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
  scheduleScreenshot();
  if (process.argv.includes('--selftest')) {
    catWin.webContents.once('did-finish-load', async () => {
      const ok = await require('./test/selftest').run({ catWin, bubbleWin, bridge, companion, resolver, hooks, settings }).catch((err) => { console.error(err); return false; });
      app.exit(ok ? 0 : 1);
    });
  }
  // Stop drawing while nobody can see the cat.
  const setPaused = (paused) => catWin.webContents.send('power', { paused });
  powerMonitor.on('lock-screen', () => setPaused(true));
  powerMonitor.on('suspend', () => setPaused(true));
  powerMonitor.on('unlock-screen', () => setPaused(false));
  powerMonitor.on('resume', () => setPaused(false));
  if (!globalShortcut.register('Alt+Space', toggleBubble)) console.warn('Loon: ⌥Space is taken by another app; open the bubble by clicking the cat.');
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  bridge?.stop();
  translator?.stop();
  resolver?.cache.saveNow();
});

app.on('window-all-closed', () => app.quit());
