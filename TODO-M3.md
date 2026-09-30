# M3 — Everywhere + smart modes ✅

Spec: DESIGN.md §3.3, §3.5–3.9, §2.10, §8 (M3). Principle: normal paths make zero LLM calls; the model is only
used when the user asks for words ("Why?", "Estimate calories", tone rewrites, unknown errors).

## Shopping (§3.6)
- [x] 1. Product extraction: JSON-LD / microdata / price meta → items; per-domain extractor cache, generated once by the LLM when a site has no structured data
- [x] 2. `parseQuantity` (multipacks, compound weights) with an exact unit table → unit prices; ranking; rule warnings; verdict templates
- [x] 3. Shopping chips on shop pages: Best value table (no LLM), Reviews (aspect lexicon + TextRank quotes), Add to compare / Compare basket, "Loon's take" (LLM on the computed table)

## Food (§3.7)
- [x] 4. Menu extraction (JSON-LD Menu or price lines), keyword scoring (lightest / protein / likely vegetarian), modification tips; "Estimate calories" → LLM with estimated badge

## Developer (§3.8)
- [x] 5. Error fingerprint + curated table of common errors (no LLM), LLM only on a miss, cached by fingerprint
- [x] 6. JSON → DTO with quicktype (Java record/class, TypeScript) chips

## Writing (§3.9)
- [x] 7. Fix grammar with Harper (no LLM); tone chips Shorter / Professional / Warmer (LLM)
- [x] 8. Replace in place for editable selections in the browser (execCommand insertText keeps undo)

## Everywhere (§3.3, §3.5)
- [~] 9. ⌥Space in any app: clipboard-sentinel selection capture (needs Accessibility; explains itself if missing)
- [x] 10. ⌥⇧S screenshot: macOS `screencapture -i`, Tesseract OCR, OCR text goes through the normal chips; image hand-off

## Wiring + checks
- [x] 11. Page-kind modes: shop/menu/code pages get their own chips (bubble + nudge click)
- [x] 12. Unit tests for every deterministic piece + browser selftest checks (shop table with zero LLM calls, menu picks, DTO, Harper fix, Replace, OCR)

## Notes
- Verified: `npm test` 17/17 and `npm run selftest` 52/52 (17 M1 + 35 browser checks, real model and extension).
- Normal paths make zero model calls, and the selftest asserts it by comparing the on-device counter before and
  after: Best value, Reviews, the compare basket, menu picks, known errors, DTOs and grammar fixes.
- The only automatic model use is the one-time site extractor for shops without structured data: the model gets a
  flat JSON outline of price elements (NEXT-EVAL) and returns CSS selectors, which are validated and saved per site.
  The answer is labelled "on your Mac" rather than "instant" when this happens.
- ⌥Space (item 9, marked ~): built and wired, but it simulates ⌘C via System Events, which needs macOS Accessibility
  permission. Without it, Loon shows a notice and macOS's permission prompt. It cannot be tested unattended, so it's
  unverified. Known gap: if ⌥ is still held when ⌘C is sent, some apps may see ⌥⌘C.
- ⌥⇧S uses macOS's own region picker (needs Screen Recording permission the first time). The selftest covers the
  OCR half with a real page screenshot; the picker itself is interactive.
- Tesseract's English data downloads once (~10 MB, from the jsDelivr CDN) into ~/Library/Application Support/loon/ocr.
- Bugs the new tests caught: calamari counted as vegetarian; "$9.99Add to cart" defeated shop detection;
  the "doing crimes" quip leaked into vegetarian picks; a mixed-unit basket claimed a "best value".
