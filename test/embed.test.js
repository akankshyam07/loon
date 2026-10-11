const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { Embedder, cosine, normalizeVector, toBase64, fromBase64 } = require('../brain/embed');
const { ResponseCache, sameGist } = require('../brain/cache');
const { Memory } = require('../brain/memory');
const { Resolver } = require('../brain/resolve');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'loon-embed-'));
const settle = () => new Promise((resolve) => setImmediate(resolve));

// Deterministic stand-in for the real model: hashed bag of words, where a few words share a "concept" (so texts
// with no words in common can still mean the same) and other words count less.
const CONCEPTS = { dinner: 'food', meat: 'food', lunch: 'food', closures: 'closure' };
const IGNORED = new Set('what is a an the in explain me i any'.split(' '));
function fakeEmbedder() {
  const seen = new Map();
  const vectorFor = (text) => {
    const vec = new Float32Array(64);
    for (const raw of String(text).toLowerCase().match(/[a-z0-9]+/g) || []) {
      if (IGNORED.has(raw)) continue;
      const word = CONCEPTS[raw] || raw;
      let h = 0;
      for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      vec[h % 64] += CONCEPTS[raw] || Object.values(CONCEPTS).includes(raw) ? 1 : 0.3;
    }
    return normalizeVector(vec);
  };
  return {
    calls: 0,
    available: () => true,
    cached: (text) => seen.get(text) || null,
    async embed(text) {
      this.calls++;
      if (!seen.has(text)) seen.set(text, vectorFor(text));
      return seen.get(text);
    },
  };
}

function makeResolver({ embedder = fakeEmbedder(), settings = {} } = {}) {
  const dir = tmp();
  const prompts = [];
  const brain = { modelId: () => 'fake', chat: async (p, { onText }) => { prompts.push(p); onText(`[mood:happy] Answer ${prompts.length}.`); } };
  const resolver = new Resolver({ brain, embedder, settings, cacheFile: path.join(dir, 'c.json'), countsFile: path.join(dir, 'n.json') });
  return { resolver, prompts };
}

test('embed: vectors are normalized, serialize compactly, and a missing model means no embedder', async () => {
  const vec = normalizeVector([3, 4]);
  assert.ok(Math.abs(cosine(vec, vec) - 1) < 1e-6);
  assert.deepStrictEqual([...fromBase64(toBase64(vec))], [...vec]);
  assert.strictEqual(cosine(vec, normalizeVector([1, 2, 3])), 0); // different model/length never matches
  const missing = new Embedder({ modelsDir: tmp() });
  assert.strictEqual(missing.available(), false);
  assert.strictEqual(await missing.embed('hello'), null);
  assert.strictEqual(missing.status().ready, false);
});

test('semantic cache: guards against swapped words, negation and reordered direction', () => {
  assert.ok(sameGist('what is a closure in javascript?', 'explain javascript closures'));
  assert.ok(sameGist('what is the capital of france?', 'which city is the capital of france'));
  assert.ok(!sameGist('what is a closure in javascript?', 'what is a closure in python?'));
  assert.ok(!sameGist('is coffee bad for you?', 'is coffee good for you?'));
  assert.ok(!sameGist('is coffee bad for you?', 'is coffee not bad for you?'));
  assert.ok(!sameGist('convert 5 miles to km', 'convert 5 km to miles'));
  assert.ok(!sameGist('convert 5 miles to km', 'convert 6 miles to km'));
});

test('semantic cache: a paraphrase hits, labeled honestly; other topics, contexts and weak matches miss', async () => {
  const { resolver, prompts } = makeResolver();
  const ask = (question, extra = {}) => resolver.run('ask', { source: 'typed', question, ...extra }, { onText: () => {} });

  assert.strictEqual((await ask('What is a closure in JavaScript?')).tier, 'local');
  await settle(); // the vector is attached to the cache entry in the background
  const hit = await ask('explain javascript closures');
  assert.deepStrictEqual([hit.tier, hit.detail, hit.text], ['cache', 'remembered a similar question', 'Answer 1.']);
  assert.strictEqual(prompts.length, 1);

  assert.strictEqual((await ask('What is a closure in Python?')).tier, 'local'); // swapped word
  assert.strictEqual((await ask('javascript closure performance tips for loops')).tier, 'local'); // below threshold

  await ask('what is a closure in javascript?', { text: 'page A' });
  await settle();
  assert.strictEqual((await ask('explain javascript closures', { text: 'page B' })).tier, 'local'); // different context
  assert.strictEqual((await ask('explain javascript closures', { text: 'page A' })).tier, 'cache'); // same context
});

test('semantic cache: Privacy mode and a missing embedder skip it', async () => {
  const embedder = fakeEmbedder();
  const settings = { privacy: true };
  const priv = makeResolver({ embedder, settings });
  await priv.resolver.ask('what is a closure in javascript?', { onText: () => {} });
  await settle();
  assert.strictEqual((await priv.resolver.ask('explain javascript closures', { onText: () => {} })).tier, 'local');
  assert.strictEqual(embedder.calls, 0);

  const plain = makeResolver({ embedder: null });
  await plain.resolver.ask('what is a closure in javascript?', { onText: () => {} });
  assert.strictEqual((await plain.resolver.ask('what is a closure in javascript?', { onText: () => {} })).tier, 'cache'); // exact still works
  assert.strictEqual((await plain.resolver.ask('explain javascript closures', { onText: () => {} })).tier, 'local');

  const cache = new ResponseCache(path.join(tmp(), 'c.json'));
  assert.strictEqual(await cache.findSimilar({ group: 'g', question: 'anything' }), null);
});

test('memory: RRF fuses BM25 and vectors; a same-meaning fact with no shared words is recalled', async () => {
  const facts = ['Dinner parties stress me out', 'I avoid meat', 'I own a red bicycle'];
  const plain = new Memory(path.join(tmp(), 'memory.db'));
  for (const f of facts) plain.add(f);
  await plain.warm('any dinner ideas');
  assert.deepStrictEqual(plain.forGroup('writing', 'any dinner ideas'), ['Dinner parties stress me out']); // unchanged without embedder

  const memory = new Memory(path.join(tmp(), 'memory.db'), { embedder: fakeEmbedder() });
  for (const f of facts) memory.add(f);
  await memory.warm('any dinner ideas');
  assert.deepStrictEqual(memory.forGroup('writing', 'any dinner ideas'), ['Dinner parties stress me out', 'I avoid meat']);
  assert.deepStrictEqual(memory.forGroup('writing', ''), []); // no request text, no vector matches

  const [meat] = memory.all().filter((f) => f.text === 'I avoid meat');
  memory.update(meat.id, 'I own a blue bicycle');
  await settle();
  await memory.warm('any dinner ideas');
  assert.deepStrictEqual(memory.forGroup('writing', 'any dinner ideas'), ['Dinner parties stress me out']); // re-embedded on edit
});

test('memory: an old database without the vec column is migrated and backfilled lazily', async () => {
  const file = path.join(tmp(), 'memory.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE facts (id TEXT PRIMARY KEY, text TEXT NOT NULL, category TEXT NOT NULL, scope TEXT NOT NULL DEFAULT '',
    pinned INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'user', created INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, uses INTEGER NOT NULL DEFAULT 0);
    INSERT INTO facts (id, text, category, created) VALUES ('old1', 'I avoid meat', 'preference', 1);`);
  old.close();

  const memory = new Memory(file, { embedder: fakeEmbedder() });
  assert.deepStrictEqual(memory.all().map((f) => f.text), ['I avoid meat']);
  assert.strictEqual(memory.db.prepare('SELECT vec FROM facts').get().vec, null);
  await memory.warm('lunch plans');
  assert.ok(memory.db.prepare('SELECT vec FROM facts').get().vec.byteLength > 0);
  assert.deepStrictEqual(memory.forGroup('writing', 'lunch plans'), ['I avoid meat']);
  memory.close();
  new Memory(file).close(); // reopening a migrated database is fine
});
