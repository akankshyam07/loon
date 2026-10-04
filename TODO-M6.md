# M6 — Personal agent hub + polish

Principle: Loon connects to the user's own projects and tools with plain code first. Read-only things run directly;
anything that changes something goes through a confirm card and the audit log. The local model only helps pick a
tool when no pattern or keyword match is clear, and nothing breaks if it picks badly (the user still confirms).
Loon never writes to other repos: git is only ever read, with `--no-optional-locks` so not even the index is touched.

## Projects
- [x] 1. Project awareness: allowlisted folders (Settings suggests git repos on the Desktop); "Where did I leave off?" briefing from git log/status, open TODO items and recent files — no model
- [x] 2. Leetcode lookup: on a leetcode.com problem, "Which companies ask this?" from the local Leetcode repo's CSVs — no model

## Tools
- [x] 3. macOS Shortcuts as tools: list, fuzzy-match "run <shortcut>", confirm card, run with `shortcuts run`
- [ ] 4. Local apps via OpenAPI: discover `openapi.json` on localhost dev ports, turn operations into tools (GET = read, others = confirm), keyword routing, model only as a tie-breaker; "Send this page to …"

## Everyday
- [ ] 5. Drop a file on the cat: PDF / text / CSV / image → the usual chips (pdf.js text, Tesseract for images)

## Polish
- [ ] 6. Graphics + UX pass: cat details, bubble and settings visual refinement, dark mode, first-run welcome, empty states
- [ ] 7. Tests (unit + selftest), packaged build check, README/DESIGN updates

## Notes
