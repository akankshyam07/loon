// "Loon sees your screen when you ask" (DESIGN.md §3.20): the frontmost window that isn't Loon → OCR on this Mac → a
// screen packet, shaped and redacted like page context. Only on request; the picture lives in memory for that one
// request and is never written to disk. Everything Electron-specific comes in through `deps`, so tests use fakes.
const { screenGate } = require('../brain/teach');
const { redact } = require('../brain/redact');

const NO_PERMISSION = 'To look at your screen I need Screen Recording. Open System Settings → Privacy & Security → Screen Recording, turn on Loon, then ask again. (⌥⇧T, "Teach me on my screen", uses the same permission.)';
const NO_WINDOW = "I couldn't find a window to look at. Click the window you mean, then ask me again.";

const windowKey = (win) => `${win?.app || ''}|${win?.title || ''}`;

// Tesseract's text (auto page layout, so columns come out in reading order), tidied like main/capture.js ocr().
const tidy = (text) => String(text || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

// deps: frontWindow() → { id, app, title, bounds } | null · permission() → 'granted' | 'denied' | 'restricted' |
// 'not-determined' · grab(win) → { png, width, height } | null (null or empty = no permission) · ocr(png) → text
function createScreenSight(deps) {
  const frontWindow = () => Promise.resolve(deps.frontWindow()).catch(() => null);

  // → { packet, png } or { refused: 'nowindow' | 'sensitive' | 'permission', message }. Sensitive windows are refused
  // before anything is captured.
  async function look() {
    const front = await frontWindow();
    if (!front) return { refused: 'nowindow', message: NO_WINDOW };
    const gate = screenGate({ requested: true, frontApp: front.app, windowNames: [front.title].filter(Boolean) });
    if (gate) return { refused: 'sensitive', message: gate.reason };
    if (['denied', 'restricted'].includes(deps.permission?.())) return { refused: 'permission', message: NO_PERMISSION };
    const shot = await Promise.resolve(deps.grab(front)).catch(() => null);
    if (!shot?.png?.length) return { refused: 'permission', message: NO_PERMISSION };
    const raw = tidy(await deps.ocr(shot.png));
    const cleaned = redact(raw);
    return {
      packet: {
        source: 'screen',
        app: front.app,
        title: front.title,
        text: cleaned.text || '(no readable text)',
        redactions: cleaned.count,
        lowText: raw.replace(/\s/g, '').length < 40,
        selectionKind: 'document',
        windowKey: windowKey(front),
      },
      png: shot.png,
    };
  }

  return { look, frontWindow };
}

module.exports = { createScreenSight, windowKey, NO_PERMISSION };
