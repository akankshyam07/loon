# M5 — Voice + launch ✅

Spec: DESIGN.md §3.16, §5.0.1, §8 (M5).

## Voice (§3.16)
- [x] 1. Local speech-to-text: sherpa-onnx + Moonshine base (int8), ~105 ms for a 2 s command on the M1 Pro
- [x] 2. End of turn with Silero VAD (700 ms of silence); mic streams 16 kHz frames from the cat window with echo cancellation
- [x] 3. Intent router: stop words → yes/no → templates → commands → question; spoken numbers → digits for dates
- [x] 4. Kokoro voice (q8) played in the cat window, sentence by sentence, first two sentences + "the rest is in the bubble"; macOS `say` while Kokoro loads
- [x] 5. Spoken confirmations ("Reminder… Say yes, or click."), follow-up listening window, "stop" interrupts
- [x] 6. Opt-in "Hey Loon" (off by default; paused in Focus/Privacy)
- [~] 7. Hold-to-talk: replaced by ⌥⇧V press-to-talk with automatic end of turn (see notes)

## Cat
- [x] 8. Remaining cool moves: stretch + yawn, tail chase, knock it off, zoomies

## Launch
- [x] 9. electron-builder .dmg (arm64, unsigned), app icon, usage strings for mic / automation / screen recording
- [x] 10. Packaged app passes the selftest (llama.cpp, sherpa-onnx, Kokoro, Bergamot all load from the bundle)
- [x] 11. README (install, keys, features) and THIRD_PARTY.md license audit

## Notes
- Verified: `npm test` 30/30, `npm run selftest` 68/68 (dev), packaged app selftest 32/32 (`--no-browser`).
- Tests never open the mic or play sound aloud: voice checks feed WAV files made with macOS `say` into the same
  pipeline, and Kokoro playback runs muted during the selftest.
- `intents.test` guards the design's key promise: 30 common spoken phrases never reach the language model
  (Home Assistant once regressed on exactly this).
- Hold-to-talk needs a global key-up listener (uiohook-napi) plus Accessibility *and* Input Monitoring permissions.
  ⌥⇧V toggles listening instead, and the turn ends on its own after a pause. Add uiohook when true hold-to-talk is wanted.
- "Hey Loon" is keyword spotting on short transcripts (the isair/jarvis approach), not openWakeWord: it reuses the
  VAD and Moonshine already loaded, needs no extra model, and non-matching speech is dropped immediately. sherpa-onnx's
  keyword-spotter models would be a lower-CPU upgrade.
- Unverified without a person present: real-mic quality and echo cancellation while Kokoro speaks, and the macOS
  permission prompts (Microphone, Accessibility, Automation, Screen Recording).
- **Decision needed before a public release:** Kokoro's phonemizer embeds eSpeak NG (GPL-3.0). See THIRD_PARTY.md.
