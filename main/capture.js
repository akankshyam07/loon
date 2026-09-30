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
async function ocr(file, cacheDir) {
  workerPromise ??= (async () => {
    const { createWorker } = require('tesseract.js');
    fs.mkdirSync(cacheDir, { recursive: true });
    return createWorker('eng', 1, { cachePath: cacheDir });
  })();
  const worker = await workerPromise;
  const { data } = await worker.recognize(file);
  return data.text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { captureSelection, screenshotRegion, ocr, AccessibilityError, frontmostApp };
