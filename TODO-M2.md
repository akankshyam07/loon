# M2 — Browser companion ✅

Spec: DESIGN.md §2.1–2.4, §2.10, §3.2, §3.4, §3.14, §3.17, §4, §8 (M2). Verified by running the real app with the
real extension loaded in Chromium (Playwright) against local fixture pages.

## Plumbing
- [x] 1. Bridge: WebSocket server in main on 127.0.0.1, pairing token, origin check
- [x] 2. Chrome extension (MV3, no build step): service worker socket + reconnect, content script, pairing popup
- [x] 3. E2E harness: selftest launches Chromium with the extension + fixture pages (article, shop, menu, code, bank)

## Highlight help (§3.2)
- [x] 4. Selection capture: debounce, kind classification (word/sentence/paragraph/code/json/stacktrace/editable), screen anchor
- [x] 5. Chip bubble near the selection without stealing focus; cat perks up, looks, hops toward it
- [x] 6. Define via WordNet (no LLM) + "Meaning here?" → LLM
- [x] 7. Translate: language detection + Bergamot (fallback: local LLM)
- [x] 8. Explain / Simplify / Summarize / Rewrite / Ask… on the local LLM with task prompts; "Go deeper" = longer answer

## Page (§3.4)
- [x] 9. Explain this page: Defuddle extraction, TextRank key sentences (instant) + LLM summary / notes / checklist / what-do-I-do
- [x] 10. Key sentences highlighted on the page (CSS Custom Highlight API)

## Safety (§2.4, §4)
- [x] 11. Page-kind detection in the content script (only the kind leaves the page)
- [x] 12. Sensitive pages: nothing sent, chips hidden, cat covers its eyes; "look anyway" for one request
- [x] 13. Redaction (cards+Luhn, IBAN, SSN, API keys/tokens, private keys, password=…) before any model call or hand-off

## Extras
- [x] 14. Hand-off: "Ask in Claude / ChatGPT / Gemini" copies the prompt and opens the official site
- [x] 15. Gentle nudges (§3.14): glow + "?" on shop/menu/code/dense pages, all rate limits
- [x] 16. Unit tests (redaction, TextRank, selection kinds, WordNet) + full selftest green

## Notes
- Verified by `npm run selftest`: 40/40 (17 M1 + 23 browser checks with the real extension in Chrome for Testing).
  `npm run selftest -- --browser-only` runs just the browser part; `--no-browser` skips it.
- Bergamot runs in its own Electron utilityProcess (it clobbers globals); models download once to
  `~/Library/Application Support/loon/translation-models`. Pairs it lacks (e.g. Japanese) fall back to the local LLM.
- Chrome no longer loads unpacked extensions from the command line, so the tests use Playwright's Chrome for Testing.
  For daily use: chrome://extensions → Developer mode → Load unpacked → `extension/`, then enter the pairing code
  from the cat's right-click menu in the extension popup.
- Found and fixed: selection anchors used {w,h} and crashed `screen.getDisplayMatching` into a modal error dialog;
  extension messages are now handled inside try/catch.
- Not built here (later milestones): Shopping/Food extractors (M3), dense-text nudges only offer page chips for now.
