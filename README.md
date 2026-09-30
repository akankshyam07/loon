# Loon

A small black cat with green eyes that lives on your screen and helps you understand, compare, write and get things
done. Free, open source, and private by default: everything runs on your Mac, with no account or API key.

## What it does today

- **A living cat.** Loon breathes, blinks, follows your cursor, naps, gets snack and break reminders, and now and then
  does something cool (moon magic, a pounce, peeking over the screen edge). Pet it by pressing and holding.
- **Ask anything.** Click the cat or press **⌥Space**. Answers stream from a model running on your Mac.
- **Highlight help in Chrome.** Select text and chips appear: Define (dictionary, instant), Translate (offline),
  Explain, Simplify, Summarize, Rewrite, Go deeper.
- **Explain this page.** Instant key points (highlighted on the page), then a summary, notes or a checklist.
- **Shopping Cat.** Unit-price table, best value, warnings, review summary, and a compare basket across stores.
  No model involved.
- **Food Cat.** Lightest, highest-protein or likely-vegetarian picks, with tips like "dressing on the side".
  Calorie numbers only on request, always labelled as estimates.
- **Developer Cat.** Common errors explained instantly, JSON → Java/TypeScript types, code explanations.
- **Writing.** Fix grammar instantly, make text shorter, more professional or warmer, and replace it in place.
- **Screenshots.** Press **⌥⇧S**, pick a region, and Loon reads the text on your Mac.
- **Privacy.** On bank, password and health pages the cat covers its eyes and reads nothing (unless you click
  "Look anyway"). Card numbers, API keys and passwords are removed before anything is processed.
- **Use a plan you already have.** "Ask in Claude / ChatGPT / Gemini" copies the question and opens the official app.

## Install (developer preview)

Requirements: macOS on Apple Silicon, Node 20+, Google Chrome.

```bash
git clone https://github.com/akankshyam07/loon.git
cd loon
npm install
node node_modules/electron/install.js   # only if npm skipped Electron's download
npm start
```

On first use Loon offers to download its model (Qwen3, Apache-2.0; about 1.8–5 GB depending on your RAM).
If you already run [Ollama](https://ollama.com), Loon uses it instead.

### Connect Chrome

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the `extension/` folder.
2. Right-click the cat → **Pair browser…** to copy your pairing code.
3. Click the Loon extension icon and paste the code.

The extension only talks to the Loon app on your own computer (127.0.0.1), and only after pairing.

## Keyboard

| Keys | Does |
|---|---|
| ⌥Space | Ask Loon, or help with text selected in any app (needs Accessibility permission) |
| ⌥⇧S | Explain a screenshot region (needs Screen Recording permission) |
| Esc | Close the bubble |

## How it stays fast, free and private

Every request tries the cheapest option first: a remembered answer, then plain code and open data (dictionary, unit
prices, error table), then small on-device models (translation, OCR, grammar), and only then the local language model.
The bubble footer shows a weekly count of how many answers needed a model at all. See [DESIGN.md](DESIGN.md) for the full design
and the research behind it.

## Open-source parts

Electron · llama.cpp via node-llama-cpp · Qwen3 · Bergamot (Firefox Translations) · WordNet · Harper · Tesseract ·
Defuddle · quicktype · franc · linkedom · ws. Each keeps its own license.

## Tests

```bash
npm test          # unit tests
npm run selftest  # drives the real app, the real model and the real extension (needs Chrome for Testing via Playwright)
```

## License

MIT
