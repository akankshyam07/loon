# Third-party components

Loon's own code is MIT. It builds on these open-source projects and open-weight models, each under its own license.
Models are downloaded at first use, not stored in this repository.

## Code (bundled in the app)

| Component | Use | License |
|---|---|---|
| Electron | app shell | MIT |
| node-llama-cpp / llama.cpp | local language model runtime | MIT |
| sherpa-onnx (node addon) | speech-to-text, voice activity detection | Apache-2.0 |
| onnxruntime-node | model runtime for Kokoro | MIT |
| @huggingface/transformers | loads Kokoro | Apache-2.0 |
| kokoro-js | text-to-speech | Apache-2.0 |
| phonemizer (eSpeak NG compiled to WASM) | pronunciation for Kokoro | package says Apache-2.0; **eSpeak NG itself is GPL-3.0-or-later** (see note) |
| @browsermt/bergamot-translator | offline translation engine | MPL-2.0 |
| harper.js | grammar checking | Apache-2.0 |
| tesseract.js | OCR | Apache-2.0 |
| quicktype-core | JSON → types | Apache-2.0 |
| defuddle | article extraction | MIT |
| linkedom | DOM for extraction | ISC |
| franc-min | language detection | MIT |
| chrono-node | date parsing | MIT |
| wordpos / wordnet-db | dictionary lookups | MIT (package); WordNet data under the WordNet 3.1 license |
| ws | extension bridge | MIT |
| pdfjs-dist | reading dropped PDFs | Apache-2.0 |

## Models and data (downloaded on first use)

| Model / data | Use | License |
|---|---|---|
| Qwen3 1.7B / 4B / 8B (official GGUF) | language model | Apache-2.0 |
| BGE small en v1.5 (BAAI; Q8_0 GGUF by ggml-org, optional ~37 MB) | embeddings for memory recall and the answer cache | MIT |
| Moonshine base (English, int8) | speech-to-text | MIT |
| Silero VAD v5 | end-of-turn detection | MIT |
| Kokoro-82M (ONNX, q8) | voice | Apache-2.0 |
| Bergamot / Firefox Translations models | translation | per model pack (Mozilla); check before redistributing |
| Tesseract `eng` traineddata | OCR | Apache-2.0 |
| WordNet 3.1 | definitions | WordNet 3.1 license (permissive) |

## eSpeak NG (GPL-3.0) and the packaged app

Kokoro's phonemizer embeds eSpeak NG, which is GPL-3.0-or-later. It is an npm dependency, not part of this repository.

- **The source code in this repository is MIT.** MIT code can be combined with GPL code, so nothing here changes.
- **The packaged app (`.dmg`) bundles eSpeak NG**, so anyone distributing a built Loon must follow GPL-3.0 for that
  bundle as a whole: ship the license texts and offer the complete corresponding source (this repository at the
  matching tag, plus the dependency sources from `package-lock.json`).
- If that ever becomes a problem, the clean way out is to make macOS's built-in voice the default and offer Kokoro as
  an optional download, or to swap in a permissively licensed phonemizer.
