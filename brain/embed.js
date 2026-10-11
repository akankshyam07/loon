// Optional sentence embeddings (DESIGN.md §3.12, §2.10): a tiny open model that turns text into a vector, so
// "same meaning, different words" can match. Used by memory recall and the answer cache. It is an optional
// download: when the file isn't there, embed() returns null and everything works exactly as without it.
// Anything with { available(), embed(text), cached(text) } can stand in for it (the tests use a fake).
const fs = require('fs');
const path = require('path');

// BGE small en v1.5 (BAAI, MIT), the official llama.cpp GGUF build from ggml-org. 384 dimensions.
const EMBED_MODEL = {
  name: 'BGE small en v1.5',
  uri: 'hf:ggml-org/bge-small-en-v1.5-Q8_0-GGUF/bge-small-en-v1.5-q8_0.gguf',
  file: 'bge-small-en-v1.5-q8_0.gguf',
  sizeMb: 37,
};
const MAX_CHARS = 2000; // the model reads 512 tokens at most; longer text adds nothing but time
const LRU_SIZE = 256;

function normalizeVector(values) {
  const vec = Float32Array.from(values);
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

// Vectors are normalized, so cosine similarity is the dot product. Different lengths (another model) never match.
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// Compact storage: raw float32 bytes (SQLite BLOB) or base64 of them (JSON cache file).
function toBytes(vec) {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

function fromBytes(bytes) {
  if (!bytes || bytes.byteLength % 4) return null;
  return new Float32Array(Uint8Array.from(bytes).buffer);
}

const toBase64 = (vec) => toBytes(vec).toString('base64');
const fromBase64 = (text) => (typeof text === 'string' ? fromBytes(Buffer.from(text, 'base64')) : null);

class Embedder {
  // brain: shares its llama.cpp runtime when given.
  constructor({ modelsDir, brain = null }) {
    this.modelsDir = modelsDir;
    this.brain = brain;
    this.recent = new Map(); // text → vector, insertion order doubles as LRU order
    this.context = null;
    this.loading = null;
    this.download = null;
  }

  modelPath() {
    return path.join(this.modelsDir, EMBED_MODEL.file);
  }

  available() {
    return !this.download && fs.existsSync(this.modelPath());
  }

  status() {
    return { ready: this.available(), name: EMBED_MODEL.name, sizeMb: EMBED_MODEL.sizeMb, downloading: this.download };
  }

  // A vector embed() produced recently, without waiting. Lets synchronous code (memory recall) use vectors.
  cached(text) {
    const key = String(text || '').slice(0, MAX_CHARS);
    const vec = this.recent.get(key);
    if (vec) {
      this.recent.delete(key);
      this.recent.set(key, vec);
    }
    return vec || null;
  }

  async ensure() {
    if (this.context) return this.context;
    this.loading ??= (async () => {
      const { getLlama } = await import('node-llama-cpp');
      const llama = this.brain ? (this.brain.llama ??= await getLlama()) : await getLlama();
      this.model = await llama.loadModel({ modelPath: this.modelPath() });
      this.context = await this.model.createEmbeddingContext();
      return this.context;
    })().finally(() => { this.loading = null; });
    return this.loading;
  }

  // Normalized Float32Array, or null when the model isn't downloaded or fails. Never throws.
  async embed(text) {
    const key = String(text || '').slice(0, MAX_CHARS);
    if (!key.trim() || !this.available()) return null;
    const hit = this.cached(key);
    if (hit) return hit;
    try {
      const { vector } = await (await this.ensure()).getEmbeddingFor(key);
      const vec = normalizeVector(vector);
      this.recent.set(key, vec);
      while (this.recent.size > LRU_SIZE) this.recent.delete(this.recent.keys().next().value);
      return vec;
    } catch (err) {
      console.warn('[embed] failed:', err.message);
      return null;
    }
  }

  async downloadModel(onProgress = () => {}) {
    if (this.download) throw new Error('Download already running');
    const { createModelDownloader } = await import('node-llama-cpp');
    fs.mkdirSync(this.modelsDir, { recursive: true });
    this.download = { downloaded: 0, total: EMBED_MODEL.sizeMb * 2 ** 20 };
    try {
      const downloader = await createModelDownloader({
        modelUri: EMBED_MODEL.uri,
        dirPath: this.modelsDir,
        fileName: EMBED_MODEL.file,
        showCliProgress: false,
        onProgress: ({ totalSize, downloadedSize }) => {
          this.download = { downloaded: downloadedSize, total: totalSize };
          onProgress(this.download);
        },
      });
      await downloader.download();
    } finally {
      this.download = null;
    }
    return this.status();
  }
}

module.exports = { Embedder, EMBED_MODEL, cosine, normalizeVector, toBytes, fromBytes, toBase64, fromBase64 };
