// Context from outside the browser (DESIGN.md §3.3, §3.5).
// Selections: a clipboard sentinel + simulated ⌘C, with the user's clipboard restored afterwards.
// Screenshots: macOS's own `screencapture -i` picker, then Tesseract OCR on this Mac.
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  execFile(cmd, args, { timeout: 60_000, ...opts }, (err, stdout, stderr) => (err ? reject(Object.assign(err, { stderr })) : resolve(stdout.trim())));
});

class AccessibilityError extends Error {}

async function frontmostApp() {
  try {
    return await run('osascript', ['-e', 'tell application "System Events" to get name of first application process whose frontmost is true']);
  } catch {
    return null;
  }
}

// Returns { text, app } or null when nothing was selected. Throws AccessibilityError without permission.
async function captureSelection(clipboard) {
  const app = await frontmostApp();
  if (!app || /^(Electron|Loon)$/.test(app)) return null;
  const saved = { text: clipboard.readText(), html: clipboard.readHTML(), image: clipboard.readImage() };
  const sentinel = `loon-${crypto.randomBytes(8).toString('hex')}`;
  clipboard.writeText(sentinel);
  try {
    await run('osascript', ['-e', 'tell application "System Events" to keystroke "c" using {command down}']);
  } catch (err) {
    restore(clipboard, saved);
    if (/not allowed|1002|assistive/i.test(err.stderr || err.message)) throw new AccessibilityError('Loon needs Accessibility permission to read selections in other apps.');
    throw err;
  }
  let text = sentinel;
  for (let i = 0; i < 8 && text === sentinel; i++) {
    await new Promise((r) => setTimeout(r, 40));
    text = clipboard.readText();
  }
  restore(clipboard, saved);
  return text && text !== sentinel && text.trim() ? { text: text.trim(), app } : null;
}

// Only text, HTML and images survive the round trip; rarer clipboard formats are lost (DESIGN.md §3.3).
function restore(clipboard, { text, html, image }) {
  clipboard.clear();
  const data = {};
  if (text) data.text = text;
  if (html) data.html = html;
  if (image && !image.isEmpty()) data.image = image;
  if (Object.keys(data).length) clipboard.write(data);
}

// ⌥⇧S screenshots live in a temp file only while their conversation is open (the "Ask in…" hand-off copies the image
// from it). discardShot removes one when the conversation ends; sweepShots clears any left behind by a crash or quit.
const SHOT = /^loon-shot-\d+\.png$/;
function discardShot(file) {
  if (!file || path.dirname(file) !== os.tmpdir() || !SHOT.test(path.basename(file))) return false;
  try { fs.rmSync(file, { force: true }); return true; } catch { return false; }
}
function sweepShots(dir = os.tmpdir()) {
  let n = 0;
  for (const name of fs.readdirSync(dir)) if (SHOT.test(name)) { try { fs.rmSync(path.join(dir, name), { force: true }); n++; } catch { /* in use */ } }
  return n;
}

// Interactive region picker; resolves with a PNG path, or null if the user pressed Esc.
async function screenshotRegion() {
  const file = path.join(os.tmpdir(), `loon-shot-${Date.now()}.png`);
  try {
    await run('screencapture', ['-i', '-x', file], { timeout: 120_000 });
  } catch {
    // non-zero exit when cancelled; the missing file below says so too
  }
  return fs.existsSync(file) ? file : null;
}

let workerPromise = null;
function worker(cacheDir) {
  workerPromise ??= (async () => {
    const { createWorker } = require('tesseract.js');
    fs.mkdirSync(cacheDir, { recursive: true });
    return createWorker('eng', 1, { cachePath: cacheDir });
  })();
  return workerPromise;
}

async function ocr(file, cacheDir) {
  const { data } = await (await worker(cacheDir)).recognize(file);
  return data.text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Word boxes too ("Teach me on my screen", brain/teach.js ocrElements): `image` is a path or PNG bytes.
async function ocrBoxes(image, cacheDir) {
  const { data } = await (await worker(cacheDir)).recognize(image, {}, { blocks: true });
  return data;
}

// Every display as PNG bytes in memory at its native resolution (never written to disk), via Electron's
// desktopCapturer (Screen Recording permission). → [{ display: { id, bounds, scaleFactor }, png, width, height }]
async function grabDisplays(desktopCapturer, screen) {
  const displays = screen.getAllDisplays();
  const max = displays.reduce((m, d) => ({ width: Math.max(m.width, Math.round(d.bounds.width * d.scaleFactor)), height: Math.max(m.height, Math.round(d.bounds.height * d.scaleFactor)) }), { width: 1, height: 1 });
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: max });
  return displays.map((display) => {
    const source = sources.find((s) => String(s.display_id) === String(display.id)) || (displays.length === 1 ? sources[0] : null);
    if (!source || source.thumbnail.isEmpty()) return null;
    const { width, height } = source.thumbnail.getSize();
    return { display: { id: display.id, bounds: display.bounds, scaleFactor: display.scaleFactor }, png: source.thumbnail.toPNG(), width, height };
  }).filter(Boolean);
}

// Titles of the windows on screen, so a password manager or a bank in another app makes Loon look away.
async function windowNames(desktopCapturer) {
  const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });
  return sources.map((s) => s.name).filter(Boolean);
}

module.exports = { discardShot, sweepShots, captureSelection, screenshotRegion, ocr, ocrBoxes, grabDisplays, windowNames, AccessibilityError, frontmostApp };
