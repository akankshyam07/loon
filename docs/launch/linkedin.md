# LinkedIn post (DRAFT, not posted)

Attach `docs/loon-clip.mp4` (square, 10 seconds, with sound).

---

I made a little pixel cat that lives on my Mac and helps me understand things.

Her name is Luna, and her goofy little brother is Soju. I highlight a word and Luna hops over and explains it. I open a menu and Soju runs in and picks the lightest dishes. It also compares prices, explains errors, rewrites text and points at buttons on my screen when I ask how to do something.

A few things I cared about while building it.

- It runs on my Mac. The language model is local (Qwen3), so it works offline after the first download.
- It never acts without asking. Anything that touches another app shows a confirm card first.
- It shows what it used for every answer, and looks away on bank and password pages.
- Numbers come from plain code, not the model. Prices, unit conversions and rankings are just math.

It's free and open source (MIT). No account, no subscription, no API key.

Honest caveats. It's macOS on Apple Silicon only for now. There's no signed app yet, so you install it from GitHub, and if you build the .dmg you right-click and choose Open the first time. The Chrome extension is loaded unpacked from the repo.

Try it here https://akankshyam07.github.io/loon/

I'd love to hear what you'd want a screen cat to help with.

#opensource #macos #localfirst #ai
