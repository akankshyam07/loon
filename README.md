<p align="center">
  <img src="build/icon.png" width="180" alt="Loon, a small black cat with big green eyes and a moon pendant">
</p>

<h1 align="center">Loon</h1>

<p align="center">
  <b>A tiny black cat who lives on your screen and helps you understand things.</b><br>
  Explain, compare, write and get stuff done, without leaving what you're doing.
</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-8fdc5a?style=flat-square"></a>
  <img alt="macOS on Apple Silicon" src="https://img.shields.io/badge/macOS-Apple%20Silicon-1f1d24?style=flat-square&logo=apple">
  <img alt="Runs 100% on your Mac" src="https://img.shields.io/badge/runs-100%25%20on%20your%20Mac-3f8f2c?style=flat-square">
  <img alt="No account, no API key" src="https://img.shields.io/badge/API%20keys-none%20needed-c9f59a?style=flat-square">
</p>

<p align="center"><i>"Private page detected. I'll look away unless you ask." — Loon</i></p>

---

## 🐈‍⬛ Meet Loon

Loon is a personal AI familiar: a little black cat with bright green eyes who sits in the corner of your screen, blinks
at you, follows your cursor, and naps when you're busy. Highlight something confusing, click the cat, or just talk to
it, and it helps right where you are.

It's **free, open source and private by default.** Everything runs on your Mac with open models. No account, no API
key, no cloud, and it keeps working offline after the first download.

## ✨ What Loon can do

**🐾 Be a cat**
- Breathes, blinks, follows your cursor, naps, stretches, and reminds you about snacks and breaks.
- Now and then does something cool: moon magic, a pounce, peeking over the edge of your screen.
- Press and hold to pet it. (Recommended.)

**💬 Help you understand**
- **Ask anything.** Click the cat or press **⌥Space**. Answers stream from a model running on your Mac.
- **Highlight help in Chrome.** Select text and chips appear: Define (instant), Translate (offline), Explain,
  Simplify, Summarize, Rewrite, Go deeper.
- **Explain this page.** Key points highlighted right on the page, then a summary, notes or a checklist.
- **Screenshots.** Press **⌥⇧S**, pick a region, and Loon reads it.
- **Drop a file on the cat.** PDFs, text, code, images (read with OCR) and CSVs (instant overview).

**🛒 Shopping Cat.** Unit-price table, best value, warnings, review summary, and a compare basket across stores. Pure
math, no model guessing at numbers.

**🥗 Food Cat.** Lightest, highest-protein or likely-vegetarian picks, with tips like "dressing on the side". Calorie
numbers only on request, always labelled as estimates.

**👩‍💻 Developer Cat.** Common errors explained instantly, JSON → Java/TypeScript types, code explanations, "where did
I leave off?" briefings for your projects, and "which companies ask this?" on Leetcode problems.

**✍️ Writing Cat.** Fix grammar, make text shorter, more professional or warmer, and replace it in place.

**🗂️ Personal assistant.** "Remind me to call mom at 5", "add dentist Friday 3pm", "open Spotify", "find my resume",
"run new note" (macOS Shortcuts). Each becomes a confirm card, and nothing happens until you click ✓. Notes are plain
markdown in `~/Documents/Loon`, and "Quiz me" turns them into flashcards.

**🔌 Your local apps.** Connect apps running on your Mac that publish an OpenAPI description (FastAPI does by
default), then ask them things in plain words. Reads run directly; anything that changes data asks first.

**🎙️ Voice.** Press **⌥⇧V** and talk. Loon listens until you pause, answers, and reads the first sentences aloud.
Say "yes" to confirm, "stop" to interrupt. An optional "Hey Loon" wake word lives in Settings (off by default).

**🌙 Moods.** Focus (the cat naps, no pop-ups), Privacy (no memory), and Judgmental (sass about prices and heavy food:
*"this looks healthy, but the sauce is probably doing crimes"*).

**🧠 Memory you control.** "Remember that I'm vegetarian" and menu picks respect it. Edit or delete memories any time.

## 🚀 Quick start

You need **macOS on Apple Silicon**, **Node 20+**, and **Google Chrome** (for the browser features).

```bash
git clone https://github.com/akankshyam07/loon.git
cd loon
npm install
npm start
```

A black cat appears in the bottom-right corner of your screen. Say hi. 👋

On first use Loon offers to download its brain (Qwen3, Apache-2.0, about 1.8–5 GB depending on your RAM). Already run
[Ollama](https://ollama.com)? Loon uses it instead.

<details>
<summary>"Electron failed to install correctly"?</summary>

npm sometimes skips Electron's download. Run this, then `npm start` again:

```bash
node node_modules/electron/install.js
```
</details>

### 🤖 Or let your coding agent do it

Not sure about any of the above? Loon ships with an [AGENTS.md](AGENTS.md) written for AI coding agents (Claude Code,
Codex, Cursor, Copilot…). Paste this into yours:

```text
Set up Loon (https://github.com/akankshyam07/loon) on my Mac. Clone it, read AGENTS.md,
and follow the Setup section step by step. Check my machine first, and tell me clearly
whenever I need to click something myself.
```

The agent will check your machine, install everything, start the cat, and walk you through the few clicks only you
can do (the model download, loading the Chrome extension, and macOS permissions).

### 🧩 Connect Chrome

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the `extension/` folder.
2. Right-click the cat → **Pair browser…** to copy your pairing code.
3. Click the Loon extension icon and paste the code.

The extension only talks to the Loon app on your own computer (127.0.0.1), and only after pairing.

### 📦 Prefer an app?

`npm run dist` builds `dist/Loon-<version>-arm64.dmg`. It isn't signed (that needs a paid Apple developer account), so
the first time: drag Loon to Applications, then right-click it → **Open** → **Open**.

## ⌨️ Keyboard

| Keys | Does |
|---|---|
| ⌥Space | Ask Loon, or get help with text selected in any app (needs Accessibility permission) |
| ⌥⇧S | Explain a screenshot region (needs Screen Recording permission) |
| ⌥⇧V | Talk to Loon (needs Microphone permission; speech models download once, ~240 MB) |
| Esc | Close the bubble |

Right-click the cat for everything else: modes, size, Settings, and **Quit Loon**.

## 🔒 Fast, free and private, on purpose

- **Cheapest answer first.** Every request tries a remembered answer, then plain code and open data (dictionary, unit
  prices, error table), then small on-device models (translation, OCR, grammar), and only then the local language
  model. The bubble shows how many answers this week needed a model at all.
- **Code does the math.** Prices, rankings, dates and redaction are computed, never guessed by a model.
- **The cat looks away.** On bank, password and health pages Loon covers its eyes and reads nothing unless you click
  "Look anyway". Card numbers, API keys and passwords are stripped before anything is processed.
- **Nothing happens behind your back.** Reminders, events, app launches and anything else that touches the world
  needs your ✓, and lands in an action log.

## 🛠️ For developers

| Read this | To learn |
|---|---|
| [AGENTS.md](AGENTS.md) | setup, project map, house rules, how to test (great for humans too) |
| [CLAUDE.md](CLAUDE.md) | the product spec: what Loon is and how it should feel |
| [DESIGN.md](DESIGN.md) | how it's built, the decisions, and the research behind them |
| [THIRD_PARTY.md](THIRD_PARTY.md) | every open-source part and its license |

```bash
npm test          # unit tests, fast, no app or model needed
npm run selftest  # drives the real app, real model and real extension end to end
npm run demo      # the cat's idle routines on a fast timer, for animation work
```

The stack is plain CommonJS with no build step: Electron for the cat, a Manifest V3 Chrome extension, and Node for
the brain.

## 💚 Contributing

Issues and pull requests are very welcome, whether it's a bug, a new trick for the cat, or a better way to explain
things. A few house rules (more in [AGENTS.md](AGENTS.md)):

- Keep it local and private. No cloud calls in the default path.
- Code handles numbers; the model handles words.
- Anything that changes something outside Loon needs a confirm click.
- Run `npm test` before you open a PR.

## 🙏 Standing on the shoulders of giants

Loon is a showcase of how far open tools can go: Electron · llama.cpp via node-llama-cpp · Qwen3 · sherpa-onnx ·
Moonshine · Silero VAD · Kokoro · Bergamot (Firefox Translations) · WordNet · Harper · Tesseract · Defuddle ·
quicktype · chrono · franc · linkedom · pdf.js · ws. Thank you to everyone who built them.

## 📜 License

[MIT](LICENSE) for Loon's own code. Packaged builds include eSpeak NG (GPL-3.0) through the voice, so a distributed
`.dmg` follows GPL-3.0 as a whole; [THIRD_PARTY.md](THIRD_PARTY.md) has the details.

```
   /\_/\
  ( -.- )  zzz
   > ^ <    Loon is napping. Pet gently.
```
