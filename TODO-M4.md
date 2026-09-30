# M4 — Personal assistant ✅

Spec: DESIGN.md §3.10–3.13, §3.15, §6, §8 (M4). Safety: anything that touches another app (Reminders, Calendar,
opening apps, mail) goes through a confirm card, is written to the audit log, and is stubbed in tests so no real
reminder or event is ever created by the test suite.

## Notes, research, study (§3.10–3.11)
- [x] 1. Notes as plain markdown in ~/Documents/Loon (one file per day), "Save to notes" on every answer, source URL kept
- [x] 2. Research: "What have I found?" synthesizes saved notes with links (model sees only saved snippets); text search over notes
- [x] 3. Study: "Quiz me" cloze cards from TextRank sentences, graded in code; "Harder questions" via the model

## Memory (§3.12)
- [x] 4. memory.json with categories; "Remember …" / "forget …" typed commands need a confirm click; relevant entries added to prompts; Privacy mode skips memory and cache

## Actions (§3.13)
- [x] 5. Command parsing without a model: chrono-node dates + patterns (remind me, add event, open, find, note)
- [x] 6. Confirm cards with editable details; executors: Reminders/Calendar via osascript, open app/link, Spotlight find (mdfind)
- [x] 7. Audit log (audit.jsonl, metadata only) and an action history view

## Behavior + settings (§3.15, §6)
- [x] 8. Focus / Privacy / Judgmental toggles (menu + settings), respected by nudges, moves, memory and cache
- [x] 9. Settings window: behavior toggles, browser pairing, weekly counters, notes folder, memory (edit/delete/forget all), recent actions

## Checks
- [x] 10. Unit tests (command parser, quiz grading, memory relevance, audit) + selftest (notes saved, confirm → stubbed reminder + audit line, memory used in next answer, privacy mode skips memory)

## Notes
- Verified: `npm test` 24/24; `npm run selftest` runs 17 M1 + 11 M4 + 36 browser checks against the real app and model.
- Nothing in the tests touches your real Reminders, Calendar, notes or memory: the selftest swaps in temp folders and
  stub executors, and restores them afterwards.
- Real Reminders/Calendar actions use AppleScript; macOS asks for Automation permission the first time.
  Dates are built field by field, never from locale-dependent date strings.
- "Remind me to call mom at 5" at 7:30 pm correctly means tomorrow 5 pm; before 5 pm it means today.
- Memory is used without a model where it matters: a saved "I'm vegetarian" filters every menu answer.
- Not built: email drafting (mailto) and model-proposed memories. "Remember…" covers memory; drafting waits for a
  need.
