# AGENTS.md — setting up and working on Loon

Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot, and friends). If a human handed you this
repo and said "get it running", follow **Setup** top to bottom. If they asked for a change, read **Working on the
code** first.

Loon is an Electron app for macOS plus a Chrome extension. Everything runs locally: no accounts, no API keys, no
servers to deploy.

## Setup

### 1. Check the machine

Loon needs all of these. Check each one and tell the human plainly if something is missing; don't try to work around
an unsupported platform.

| Requirement | How to check | Notes |
|---|---|---|
| macOS on Apple Silicon | `uname -sm` prints `Darwin arm64` | Intel Macs, Windows and Linux are not supported yet |
| Node.js 20 or newer | `node -v` | install from nodejs.org or `brew install node` |
| Google Chrome | `ls "/Applications/Google Chrome.app"` | only needed for the browser features |
| ~2–6 GB free disk | `df -h ~` | for the local language model, downloaded on first use |

### 2. Install and start

```bash
npm install
npm start
```

If `npm start` fails with "Electron failed to install correctly", npm skipped Electron's binary download. Fix it with:

```bash
node node_modules/electron/install.js
```

A black cat should appear in the bottom-right corner of the screen. It has no Dock icon (it's a menu-bar-style app),
so quit it by right-clicking the cat → **Quit Loon**, or with `pkill -f "node_modules/electron/dist"` if it's stuck.

`npm run demo` runs the cat's idle routines (naps, snacks, wandering) on a fast timer, handy for checking that animations work.

### 3. Steps only the human can do

Hand these to the human with clear instructions. You can't do them for them:

- **First model download.** On first use the cat offers to download its language model (Qwen3, 1.8–5 GB depending on
  RAM). The human clicks to accept. If they already run [Ollama](https://ollama.com), Loon uses it instead.
- **Chrome extension.** Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick
  this repo's `extension/` folder. Then right-click the cat → **Pair browser…**, copy the code, click the Loon
  extension icon in Chrome and paste it.
- **macOS permissions**, granted in System Settings → Privacy & Security only when a feature first asks:
  Accessibility (⌥Space on selected text in any app), Screen Recording (⌥⇧S screenshots), Microphone (⌥⇧V voice).
  Nothing else needs them.

### 4. Confirm it works

```bash
npm test
```

All tests should pass (115 at the time of writing). They don't need the app, a model or Chrome.

## Working on the code

### Where things live

| Path | What it is |
|---|---|
| `CLAUDE.md` | the product spec: **what** Loon is and how it should feel |
| `DESIGN.md` | **how** it's built: decisions (§0), architecture (§1), the resolver ladder (§2.10), milestones (§8) |
| `main.js`, `main/` | Electron main process: windows, the extension bridge, voice, actions, the hub |
| `brain/` | plain-Node logic: intent routing, shopping/food/dev helpers, memory, notes, the local model |
| `renderer/` | the cat (`cat.*`, `loon.svg`), the speech bubble (`bubble.*`) and Settings |
| `extension/` | the Chrome extension (Manifest V3) |
| `test/` | `*.test.js` unit tests (node:test) and the end-to-end selftests |
| `THIRD_PARTY.md` | licenses of everything Loon uses |

### Rules of the house

These come from `DESIGN.md` §0. Keep them when you change things:

1. **Code handles numbers; the model handles words.** Prices, unit conversions, rankings, dates and redaction are
   plain code, never the language model.
2. **Cheapest answer first.** Requests go cache → deterministic code/data → small on-device models → local LLM.
   Don't reach for the LLM when a lookup or a regex does the job.
3. **Loon never acts silently.** Anything that touches another app, a file or the outside world goes through a
   confirm card and the action log.
4. **Private by default.** No cloud calls in the default path. Sensitive pages (banks, passwords, health) make the
   cat look away. Secrets are redacted before anything is processed (`brain/redact.js`).
5. **The main process owns AI, keys, memory and actions.** Renderers only draw.
6. Match the style of the file you're in. Plain CommonJS, no build step, no TypeScript, few dependencies.

### Testing your change

```bash
npm test          # fast unit tests, run these after every change
npm run selftest  # drives the real app, real model and real extension end to end
```

The end-to-end selftest runs on GitHub Actions (macOS); don't run it on a contributor's machine unless asked.
See `.github/workflows/selftest.yml`; the log is uploaded as the `selftest-log` artifact.

`npm run selftest` needs a downloaded model, and for the browser half, Chrome for Testing
(`npx playwright-core install chromium`; without it those checks print SKIP). Before running it:

- Quit any running Loon first (`pkill -f "node_modules/electron/dist"`). The extension bridge uses port **47631**, and a stale
  instance makes the selftest fail in confusing ways.
- Its windows are invisible, ignore the real mouse and never take focus. Set `LOON_HIDDEN=0` to watch them.

To build the macOS app: `npm run dist` → `dist/Loon-<version>-arm64.dmg` (unsigned).
