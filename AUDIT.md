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
| Voice | ⚠️ not run | voice models not in the test data folder |
| Screen look / Teach | ✅ e2e (fixtures) | real permissions need a manual check |

## Broken or weak (open)

1. **Small-model reasoning** (UX, high). Qwen3 4B flip-flopped: "which one for video calls?" got UDP on one run and
   TCP on the next. Code can't fix this; Smarter answers or "Go deeper" covers it. Possible mitigation: when the
   question compares two things, add the earlier turn's verdict to the prompt.
2. **Filler in model answers** (polish). "Let me know if you need help with anything else!" ends many replies.
3. **Weather and other live data** (missing). It's an honest "I can't", but the user expects an answer. Proposal: a
   free, keyless weather source (Open-Meteo) with the location the user gives. It's a network call, so it needs a
   product decision.
4. **Unknown-language translation** makes things up (e.g. Klingon "ju'va"). Low impact.

## Improvements made (commits on the branch)

1. Background runs leave the global hotkeys alone (`LOON_NO_HOTKEYS`).
2. `brain/quick.js`: arithmetic (a parser, never eval), %, tips, discounts, units, days until a date or holiday,
   coin, dice, random numbers. Wired in before the model.
3. Typed define and translate go to the WordNet and offline-translator tiers, translate with a target language.
4. Real timers in main.js, with a notice when one rings, a status check and cancel.
5. Mid-conversation, "the window" no longer triggers a screen look; "this product" does. Regression test included.
6. Short-text language detection (common words and letters, Unicode-aware).
7. Settings: sticky jump chips (active card highlighted) and a filter with an empty state.

## Test results

- Unit: 220/220 (was 213).
- End-to-end baseline before changes: core 36/36, features 32/32, browser 44/44.
- Explore sessions: 3 rounds; timings and results are in the commit messages above.

## Prioritized next

1. Re-run the full end-to-end suite on the branch (regression gate).
2. Explore the browser flows as a user: selection paw, page summary, shopping table on a real-looking page.
3. Model-answer polish: strip trailing filler sentences in code.
4. A first-run walkthrough: what a new user sees in the first 60 seconds.
