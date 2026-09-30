# M1 — Living cat + local brain ✅

Spec: DESIGN.md §5.0, §5.0.1, §2.10, §8 (M1). Verified with `npm test` (unit) and `npm run selftest`
(17 end-to-end checks against the real app and a real local model), plus screenshots of every pose.

## Setup
- [x] 1. git init, `.gitignore`, MIT `LICENSE`, Electron 31 → 44

## Cat
- [x] 2. Window: S/M/L presets (right-click menu), transparent areas click-through, drag handled in main, clamped to screen
- [x] 3. SVG puppet cat (`renderer/loon.svg`) in the reference style: named parts, sticker outline, silver collar + moon pendant
- [x] 4. Micro motion: breathing, blink, ear twitch, tail sway, head tilt; eyes follow the cursor
- [x] 5. Poses (sit, loaf, crouch, paws-over-eyes) + 11 moods
- [x] 6. States (idle, petted, napping, eating, thinking, talking, move); petting sparkles; snack + nap reminders at real intervals (`npm run demo` for fast ones)
- [x] 7. Cool moves: moon magic, cursor pounce, edge peek (+ occasional hop-around)
- [x] 8. Pixel renderer deleted

## Brain
- [x] 9. Bubble: input, streamed answer, context footer, weekly counters; opens by clicking the cat or ⌥Space; Esc/× closes
- [x] 10. `brain/ai.js`: node-llama-cpp in-process (Metal), Ollama fallback, model picked by RAM (Qwen3 1.7B/4B/8B, Apache-2.0), first-run download with progress
- [x] 11. `brain/cache.js` (exact-match, LRU, 7-day TTL) + `brain/resolve.js` ladder (templates → cache → local LLM) + per-tier counters
- [x] 12. Cat reacts: thinking pose + dots + glowing moon, mouth flaps while streaming, mood from the answer, confused on error
- [x] 13. End-to-end: offline answer streamed; repeat is a cache hit (~0.3 s); counters update

## Notes
- Idle CPU went 23% → ~6% (8% while the mouse moves): timer loop instead of rAF (120 Hz ProMotion), adaptive
  frame rate (30/15/5/2 fps), drawing paused when the screen is locked. The sticker filter costs only ~3%.
  Next step if needed: split head/body/tail into separate composited layers so breathing doesn't repaint.
- Tested with the Llama 3 8B already on this Mac (via `modelPath` in `~/Library/Application Support/loon/settings.json`).
  The Qwen3 4B download was verified to start and stream bytes, but the full 2.3 GB file was not downloaded.
- Interaction checks use synthetic input (`sendInputEvent`); real-mouse feel still needs a human pass.
- Debug helpers: `electron . --shot=out.png --cmd='{"mood":"judgy"}'`, right-click → "Do a trick".
