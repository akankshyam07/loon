# Show HN (DRAFT, not posted)

**Title.** Show HN: Loon – a local-first pixel cat for macOS that explains what you highlight

**URL.** https://akankshyam07.github.io/loon/

**First comment.**

Hi HN. I made Loon, a small companion app for macOS. A pixel cat lives in the corner of your screen. You highlight something in Chrome, or press ⌥Space in any app, and it helps right there. It defines words, explains errors, compares prices per unit, picks lighter dishes on a menu, rewrites text, and can point at buttons on your screen when you ask how to do something.

The design idea is to use the language model as little as possible. Requests go cache, then plain code and open data (WordNet, a curated error table, unit price math), then small on-device models (Bergamot for translation, Tesseract for OCR, Harper for grammar), and only then a local Qwen3 through llama.cpp. The model writes words and never does the math. That keeps it useful on a 1.7B model on an 8 GB Mac.

Things I tried to get right.

- It never acts without asking. Anything that touches another app, a file or the web goes through a confirm card and an action log.
- It shows what it used. Every answer says which rung answered it.
- It looks away on bank, password and health pages, and secrets are redacted before any model sees the text.
- The README has a table of every network call. In the default setup that's model and data downloads on first use and nothing else.

Cloud is optional and off by default. You can bring your own API key, or use your Claude or ChatGPT plan through the official CLI with every tool turned off.

Caveats. Apple Silicon only. No signed app yet, so you install from GitHub with npm, and a self-built .dmg needs right-click and Open the first time. The Chrome extension is loaded unpacked. It's MIT licensed and free.

Code is at https://github.com/akankshyam07/loon. I'd love feedback, especially on what you'd want a screen companion to do and what would make you trust one.
