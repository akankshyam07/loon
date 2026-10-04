# M6 — Personal agent hub + polish ✅

Principle: Loon connects to the user's own projects and tools with plain code first. Read-only things run directly;
anything that changes something goes through a confirm card and the audit log. The local model only helps pick a
tool when no pattern or keyword match is clear, and nothing breaks if it picks badly (the user still confirms).
Loon never writes to other repos: git is only ever read, with `--no-optional-locks` so not even the index is touched.

## Projects
- [x] 1. Project awareness: allowlisted folders (Settings suggests git repos on the Desktop); "Where did I leave off?" briefing from git log/status, open TODO items and recent files — no model
- [x] 2. Leetcode lookup: on a leetcode.com problem, "Which companies ask this?" from the local Leetcode repo's CSVs — no model

## Tools
- [x] 3. macOS Shortcuts as tools: list, fuzzy-match "run <shortcut>", confirm card, run with `shortcuts run`
- [x] 4. Local apps via OpenAPI: discover `openapi.json` on localhost dev ports, turn operations into tools (GET = read, others = confirm), keyword routing, model only as a tie-breaker; "Send this page to …"

## Everyday
- [x] 5. Drop a file on the cat: PDF / text / CSV / image → the usual chips (pdf.js text, Tesseract for images)

## Polish
- [x] 6. Graphics + UX pass: cat details, bubble and settings visual refinement, dark mode, first-run welcome, empty states
- [x] 7. Tests (unit + selftest), packaged build check, README/DESIGN updates

## Notes
- Verified: `npm test` 35/35; `npm run selftest` 39 app + 37 browser checks; packaged app selftest 39/39.
- No model is needed for any M6 feature. Connector routing is IDF-weighted keyword matching, and close calls become
  buttons instead of letting a model guess, so nothing depends on the model getting it right.
- Connectors only accept localhost apps. The tests use a fake FastAPI-style app (test/fixtures/openapi-app.js).
  The real career-intelligence repo was never touched; once its API is running, connect it from
  Settings → Local apps → "Find apps on this Mac".
- Project briefings only read: `git --no-optional-locks` means not even the index is refreshed in other repos.
- File drops: Electron can't fake an OS drag, so the selftest calls the drop handler's IPC path. During a real drag,
  main opens the cat's body area by cursor position, because the page receives no mouse events.
- Found while polishing: Chromium throttles hidden windows when the screen is locked, and audio 'ended' never fires
  without an audio device. Playback now times out on its own; the selftest turns throttling off.
- Not built (no clear need yet): a morning briefing, "watch this page", spaced repetition, a model tie-breaker for
  connector routing.
