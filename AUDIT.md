# Loon product audit (living document)

Branch `audit/product-loop` in `/Users/smohanty/loon-audit`, a separate clone. Pushing is disabled, and the original
`~/Desktop/Loon` is untouched. Each run uses a temporary data folder and hidden windows that ignore the real mouse,
with the global hotkeys left alone (`LOON_NO_HOTKEYS=1`). The model files are shared read-only.

## How I test

- `npm test` for the unit tests.
- `npm run selftest -- --part=core|features|browser` for the end-to-end checks.
- `--part=explore` with `LOON_EXPLORE=<script>`: ad-hoc user sessions that type into the real bubble, open
  Settings and take screenshots.

## Feature inventory and status

| Area | Status | Notes |
|---|---|---|
| Cat window: click, pet, drag, moves, nap | ✅ e2e | core part |
| Bubble: ask, follow-ups, chips, ⋯ menu, 👍/👎 | ✅ e2e | |
| Instant answers: time, date, help | ✅ | |
| Math, %, tips, unit conversion, days-until, dice | ✅ **new** | was LLM: slow (4 s) and sometimes wrong |
| Typed "define X" / "what does X mean" | ✅ **new** | was LLM: invented jokes as definitions |
| Typed "translate …" (+ "to Spanish") | ✅ **new** | was LLM, which leaked "The user wrote…" |
| Language detection for short phrases | ✅ **fixed** | franc said German = Turkish, Spanish = nothing |
| Timers ("set a timer for 5 min", status, cancel) | ✅ **new** | model used to *offer* a timer that didn't exist |
| Reminders / calendar / open app | ✅ confirm card | executors stubbed in tests |
| "What's my day", focus timer | ✅ | |
| Remember / memory | ✅ confirm card | |
| Settings | ✅ **improved** | 18 cards, 6,400 px scroll; now sticky jump bar and filter |
| History → Continue | ✅ e2e | features part |
| Browser: selections, page summary, shopping, food | ✅ e2e | browser part (44/44) |
| No model yet (first run) | ✅ **fixed** | input was disabled; now code features work and a waiting question is answered after the download |
| Ollama fallback | ✅ **fixed** | ignored each task's answer length (always 400 tokens) |
| Model answer endings | ✅ **fixed** | "let me know if…" filler trimmed in code |
| Weather | ✅ **new** | was a false offer; now a confirm card that opens a forecast |
| Error selections (npm, git, tsc, gcc, rustc, shell) | ✅ **fixed** | were "code" → paw; now instant error-table answers |
| "Best value?" on any page with prices | ✅ **fixed** | model guessed with no numbers; now the unit-price table |
| Menus with stacked layouts (name / description / price / calories) | ✅ **fixed** | prices and calories were dropped from page text; the model called chicken bowls vegetarian |
| Typed menu questions ("lightest?", "if I'm vegetarian?"), incl. follow-ups | ✅ **fixed** | went to the model without the page |
| Writing: rewrite → Replace in a contenteditable editor | ✅ verified | 2 s, text replaced in place |
| Bubble keyboard / screen reader | ✅ **improved** | ⋯ has aria-expanded; answer source readable without hover |
| Voice (Silero, Moonshine, Kokoro) | ✅ e2e 42/42 | voice models shared read-only |
| Voice instant answers ("fifteen percent of eighty-four", timers) | ✅ **fixed** | number words stopped at 50; decimals were read as sentence breaks; "12*12" read as "1212" |
| Voice action results | ✅ **fixed** | said "Done." instead of what happened; timers now play the Glass sound |
| Plain shop pages, no structured data | ✅ **faster** | page-layout guess before the model: 4 s → 0.7 s, no model call |
| First run without a model | ✅ permanent check | selftest `fresh` part (8/8) |
| "Lightest" on a menu with sides | ✅ **fixed** | answered a side of bread; mains now rank first |
| Performance (hidden real launch) | ✅ measured | bridge ready 1.3 s; idle CPU about 1% (lower bound, since hidden windows draw less); about 420 MB RSS over 5 processes |
| History: search, continue, delete | ✅ verified | full-text, case-insensitive, empty state, Continue carries context |
| Model hedging on easy facts | ✅ **fixed** | "I don't know who wrote Pride and Prejudice": about 11/20 hedged → 1/20 with the new prompt wording, facts checked |
| Routines phrasing | ✅ **fixed** | "brief me", "watch this price", "below $30", "stop/restart X" |
| Notes: find and reuse | ✅ **fixed** | notes were write-only; "when is my dentist appointment?" got an invented date |
| Writing tools in a textarea (Fix grammar, Shorter, Warmer → Replace) | ✅ verified | Replace works in textarea and contenteditable |
| Fix grammar spelling choice | ✅ **fixed** | "probly" → "poly"; now "probably" |
| Model offering lookups it can't do | ✅ **fixed** | prompt rule plus trimming "would you like me to check…" and "I don't know, but…" |
| Screen look / Teach | ✅ e2e (fixtures) | real permissions need a manual check |

## Broken or weak (open)

1. **Small-model reasoning** (UX, high). Qwen3 4B flip-flopped: "which one for video calls?" got UDP on one run and
   TCP on the next. Code can't fix this; Smarter answers or "Go deeper" covers it. Possible mitigation: when the
   question compares two things, add the earlier turn's verdict to the prompt.
2. **Live weather** (proposal, needs your call). A forecast link works today. A free, keyless source
   (Open-Meteo) could answer inline, but it's a network call, which goes against "no cloud calls in the default
   path". Recommendation: offer it as a Settings toggle, off by default.
3. **The streamed answer shows the filler, then it disappears** at the end. It's a short flash. Removing it would
   mean holding back the last sentence while streaming.
4. **Mode badge** for a selection ignores the page kind (an article selection shows the site's mode). Low impact.
5. **Pinned memories show on every answer** (design question). "Remember that…" facts are pinned, so they go into
   every prompt and "Remembered: …" appears under unrelated answers. Proposal: pinned facts stay in the prompt but
   show in the label only when the answer mentions them.
6. **Grammar agreement** ("there is a lot of bugs") isn't caught by Harper. The rewrite chips fix it.
7. **Packaged .dmg not rebuilt this session.** `build.files` includes `brain/**`, so the new modules ship; run
   `npm run dist` plus the `smoke` part before a release.
8. **Unknown-language translation** makes things up (e.g. Klingon "ju'va"). Low impact.

## Improvements made (commits on the branch)

1. Background runs leave the global hotkeys alone (`LOON_NO_HOTKEYS`).
2. `brain/quick.js`: arithmetic (a parser, never eval), %, tips, discounts, units, days until a date or holiday,
   coin, dice, random numbers. Wired in before the model.
3. Typed define and translate go to the WordNet and offline-translator tiers, translate with a target language.
4. Real timers in main.js, with a notice when one rings, a status check and cancel.
5. Mid-conversation, "the window" no longer triggers a screen look; "this product" does. Regression test included.
6. Short-text language detection (common words and letters, Unicode-aware).
7. Settings: sticky jump chips (active card highlighted) and a filter with an empty state.
8. First run without a model: the input stays usable, the question waits, and it's answered after the download.
9. Ollama answers respect the task's length; `LOON_OLLAMA_URL` keeps test runs off a running Ollama.
10. Trailing model filler is trimmed in code (with tests).
11. Weather becomes an "open a forecast" confirm card.
12. Terminal error classification and two new error-table entries.
13. Value questions on any page with prices go to the unit-price code.
14. Page text keeps all visible text (prices and calories in bare spans and divs), with a regression test.
15. Menu reader: stacked layouts, printed calories rank "lightest", "fish + salmon" counted once.
16. One table maps typed phrasing to page tasks (lightest, protein, vegetarian, best value), for first questions and
    follow-ups; page tasks read the page whatever window is in front. Permanent browser selftest check added.
17. Accessibility: aria-expanded on ⋯, and the tier icon is focusable with an aria-label.
18. No false offers: prompt rule, trailing-offer trim, contradicted-hedge trim (`tidyModelAnswer`).
19. Voice: number words up to 90 and hundreds; quick answers take spoken numbers; `speakable` keeps decimals and says
    operators, units and degrees in words, skipping emoji.
20. Spoken action results ("10-second timer started"); a finished timer plays the system Glass sound (never in tests).
21. Shopping: the page-layout extractor guess runs before the model, rejects button text, and requires distinct names.
    The dead heuristic fallback after model retries is removed; DESIGN.md §3.6 updated.
22. Selftest `fresh`: the input stays usable, math works in code, and a model question waits.
23. Menu sections: sides, drinks and desserts rank after mains.
24. System prompt: "state it plainly when you know" instead of "honest about uncertainty". Measured A/B over 20
    samples; temperature ruled out as the cause.
26. Notes: "what did I note about…", "find my notes about…", "show my notes" (read-only, before file search); typed
    questions matching a note's words get the note as context, never cached; question words ignored; no file path
    in "Saved".
27. Grammar: spelling suggestions picked by typo distance (swaps count once), then shared start.
25. Routines: "brief me" / "morning briefing" → day briefing; price watches without a schedule (every 6 h) and with
    a target price (one alert on crossing); "stop" / "restart" pause and resume, except focus and timers.

## Test results

- Unit: 233/233 (was 213).
- End-to-end after the changes: core 42/42 (with voice), features 32/32, browser 45/45, fresh 8/8, migrate 7/7.
- End-to-end baseline before changes: core 36/36, features 32/32, browser 44/44.
- Explore sessions: 3 rounds; timings and results are in the commit messages above.

## Prioritized next

1. Settings: does every toggle take effect without a restart?
2. Packaged .dmg build and the `smoke` part.
3. Email drafting on a webmail-like page (reply chips, thread summary).
4. Compare across tabs (the basket) as a shopper with three real-looking pages.
5. Long-session behavior: 20+ follow-ups in one thread (context budget, speed).
