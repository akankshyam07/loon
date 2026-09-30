# M4 — Personal assistant

Spec: DESIGN.md §3.10–3.13, §3.15, §6, §8 (M4). Safety: anything that touches another app (Reminders, Calendar,
opening apps, mail) goes through a confirm card, is written to the audit log, and is stubbed in tests so no real
reminder or event is ever created by the test suite.

## Notes, research, study (§3.10–3.11)
- [ ] 1. Notes as plain markdown in ~/Documents/Loon (one file per day), "Save to notes" on every answer, source URL kept
- [ ] 2. Research: "What have I found?" synthesizes saved notes with links (model sees only saved snippets); text search over notes
- [ ] 3. Study: "Quiz me" cloze cards from TextRank sentences, graded in code; "Harder questions" via the model

## Memory (§3.12)
- [ ] 4. memory.json with categories; "Remember …" typed command and model-proposed memories need a confirm click; relevant entries added to prompts; Privacy mode skips memory and cache

## Actions (§3.13)
- [ ] 5. Command parsing without a model: chrono-node dates + patterns (remind me, add event, open, find, note)
- [ ] 6. Confirm cards with editable details; executors: Reminders/Calendar via osascript, open app/link, Spotlight find (mdfind), mailto drafts
- [ ] 7. Audit log (audit.jsonl, metadata only) and an action history view

## Behavior + settings (§3.15, §6)
- [ ] 8. Focus / Privacy / Judgmental toggles (menu + settings), respected by nudges, moves, memory and cache
- [ ] 9. Settings window: model, behavior, privacy, memory, notes folder, pairing code, weekly counters

## Checks
- [ ] 10. Unit tests (command parser, quiz grading, memory relevance, audit) + selftest (notes saved, confirm → stubbed reminder + audit line, memory used in next answer, privacy mode skips memory)

## Notes
