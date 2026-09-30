// Bergamot translation host (MPL-2.0 engine, the one behind Firefox's offline translation).
// Runs in its own process: Bergamot replaces the global Worker unless a `window` exists, and its worker file is
// CommonJS inside an ESM package, so both need shims that must not leak into the main process.
import { Worker as NodeWorker } from 'node:worker_threads';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const cacheDir = process.env.LOON_TRANSLATION_CACHE;

class CommonJsWorker {
  #worker;
  constructor(url) {
    const file = fileURLToPath(url);
    const prelude = `var __filename = ${JSON.stringify(file)}; var __dirname = ${JSON.stringify(dirname(file))};\n`;
    this.#worker = new NodeWorker(prelude + readFileSync(file, 'utf8'), { eval: true });
  }
  addEventListener(name, callback) { this.#worker.on(name, (data) => callback({ data })); }
  postMessage(message) { this.#worker.postMessage(message); }
  terminate() { this.#worker.terminate(); }
}
globalThis.Worker = CommonJsWorker;
globalThis.window = { Worker: CommonJsWorker };

// Model files are downloaded once from Mozilla's registry and kept on disk.
const networkFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const href = String(url);
  if (!cacheDir || !href.startsWith('https://')) return networkFetch(url, options);
  const file = join(cacheDir, createHash('sha256').update(href).digest('hex'));
  if (existsSync(file)) return new Response(readFileSync(file));
  const response = await networkFetch(url, options);
  if (!response.ok) return response;
  const body = Buffer.from(await response.arrayBuffer());
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(file, body);
  return new Response(body);
};

const { LatencyOptimisedTranslator } = await import('@browsermt/bergamot-translator/translator.js');
const translator = new LatencyOptimisedTranslator({});

async function supportedPairs() {
  const registry = await translator.backing.registry;
  return registry.map((entry) => `${entry.from}-${entry.to}`);
}

const send = (message) => (process.parentPort ? process.parentPort.postMessage(message) : process.send(message));
const onMessage = (handler) => (process.parentPort ? process.parentPort.on('message', (e) => handler(e.data)) : process.on('message', handler));

onMessage(async ({ id, type, from, to, text }) => {
  try {
    if (type === 'pairs') return send({ id, pairs: await supportedPairs() });
    const response = await translator.translate({ from, to, text, html: false });
    send({ id, text: response.target.text });
  } catch (err) {
    send({ id, error: String(err?.message || err) });
  }
});
send({ type: 'ready' });
