# Reddit posts (DRAFTS, not posted)

Check each subreddit's self-promotion rules before posting. Post as a video where allowed
(`docs/loon-clip.mp4`), otherwise use `docs/loon-clip.gif` or a link.

---

## r/macapps

**Title.** I made Loon, a free pixel cat that lives on your Mac and explains whatever you highlight

**Body.**

Loon is a small companion app. A pixel cat sits in the corner of your screen. Highlight a word in Chrome and you get the definition right away. Highlight a stack trace and it's explained. Press ⌥Space in any app to ask about selected text. On shopping pages it works out price per unit, and on menus it picks the lighter dishes.

Everything runs on your Mac with a local model (Qwen3, picked by your RAM). It's free and MIT licensed, with no account and no API key.

Caveats so nobody is surprised.

- Apple Silicon only for now.
- No signed app yet. You install from GitHub with npm. If you build the .dmg, right-click it and choose Open the first time.
- The Chrome extension is loaded unpacked from the repo's `extension/` folder.

Site https://akankshyam07.github.io/loon/

Happy to answer questions and take feedback.

---

## r/LocalLLaMA

**Title.** Loon, a desktop cat that uses a local Qwen3 for words and plain code for everything else

**Body.**

I built a macOS companion that tries to need the LLM as little as possible. Every request goes cache, then deterministic code and open data (WordNet, unit prices, an error table), then small on-device models (Bergamot translation, Tesseract OCR, Harper grammar), and only then the local LLM.

Model details.

- Qwen3 GGUF through node-llama-cpp. 1.7B on 8 GB Macs, 4B on 16 to 24 GB, 8B on 32 GB and up.
- If you already run Ollama it uses that instead.
- Voice is Moonshine plus Silero VAD for listening and Kokoro for speaking, all local.
- A router rates each question easy, medium or hard. Cloud is optional and off by default (your own API key, or your Claude/ChatGPT plan through the official CLI). Secrets are redacted before anything leaves.

The README has a table of every network call Loon makes, which is basically model and data downloads on first use.

Free, MIT, macOS on Apple Silicon. Unsigned for now, and the Chrome extension is loaded unpacked.

https://akankshyam07.github.io/loon/

I'd like to hear how it does on your hardware and which small models you'd try.

---

## r/opensource

**Title.** Loon, an MIT-licensed local-first AI companion for macOS (a pixel cat)

**Body.**

Loon is a pixel cat that lives on your screen and helps you understand things. Highlight text, ask about a page, compare prices, read a menu, explain an error.

It's built entirely on open tools. Electron, llama.cpp with Qwen3, sherpa-onnx, Moonshine, Kokoro, Bergamot, WordNet, Harper, Tesseract, Defuddle and more. THIRD_PARTY.md lists every license.

Some house rules the code follows.

- No cloud calls in the default path.
- Code handles numbers and the model handles words.
- Anything that changes something outside Loon needs a confirm click.

Contributions are welcome, from bug fixes to new tricks for the cat. There's an AGENTS.md if you want your coding agent to set it up.

Caveats. Apple Silicon only, unsigned builds, and the Chrome extension is loaded unpacked.

https://akankshyam07.github.io/loon/

---

## r/SideProject

**Title.** I built a pixel cat that lives on my screen and helps me read, shop and cook

**Body.**

This started because my own cat is black with very green eyes, and I wanted her on my screen. It turned into Loon.

Luna (black cat) and Soju (white with an eye patch) sit in the corner. Highlight a word and Luna hops over and explains it. Open a menu and Soju runs in for the food. They nap, groom each other and wear little hats from a wardrobe.

Under the hood it's local-first. A local model on your Mac, plain code for prices and numbers, and a confirm card before anything touches another app.

It's free and open source. Mac with Apple Silicon only for now. No signed app yet, so the first launch of a built .dmg needs right-click and Open, and the Chrome extension loads unpacked.

https://akankshyam07.github.io/loon/

Would love feedback on what to teach the cats next.
