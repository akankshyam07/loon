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
| Voice | ⚠️ not run | voice models not in the test data folder |
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
5. **Unknown-language translation** makes things up (e.g. Klingon "ju'va"). Low impact.

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

## Test results

- Unit: 223/223 (was 213).
- End-to-end after the changes: core 36/36, features 32/32, browser 44/44.
- End-to-end baseline before changes: core 36/36, features 32/32, browser 44/44.
- Explore sessions: 3 rounds; timings and results are in the commit messages above.

## Prioritized next

1. Turn the explore scenarios (no-model flow, value question on a plain page) into permanent selftest checks.
2. Voice: download the voice models into a test folder and walk through "remind me", "timer" and math by voice.
3. Food/menu pages that aren't fixtures (a real restaurant layout), as a user.
4. Writing in a text field: the rewrite → Replace flow on an unfamiliar editor (contenteditable).
5. Accessibility pass on the bubble: keyboard-only use, focus order, screen-reader labels.
