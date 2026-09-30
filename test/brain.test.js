const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMoodParser, Resolver } = require('../brain/resolve');
const { ResponseCache } = require('../brain/cache');

function parse(chunks) {
  let out = '';
  const parser = createMoodParser((t) => { out += t; });
  chunks.forEach((c) => parser.push(c));
  return { mood: parser.finish(), out };
}

test('mood tag is pulled out of a streamed reply', () => {
  assert.deepStrictEqual(parse(['[mo', 'od:ju', 'dgy] Hmm, ', 'pricey.']), { mood: 'judgy', out: 'Hmm, pricey.' });
  assert.deepStrictEqual(parse(['[mood: curious]\nWhat is it?']), { mood: 'curious', out: 'What is it?' });
  assert.deepStrictEqual(parse(['<think>', 'x</think>', '[mood:happy] Hi']), { mood: 'happy', out: 'Hi' });
});

test('replies without a valid tag pass through untouched', () => {
  assert.deepStrictEqual(parse(['Hello there', '!']), { mood: null, out: 'Hello there!' });
  assert.deepStrictEqual(parse(['[mood:grumpy] ok']), { mood: null, out: 'ok' });
  assert.deepStrictEqual(parse(['[m']), { mood: null, out: '[m' });
});

test('cache evicts least recently used and expires old entries', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'loon-')), 'cache.json');
  const cache = new ResponseCache(file, { maxEntries: 2, ttlMs: 1000 });
  cache.set('a', 1);
  cache.set('b', 2);
  cache.get('a');
  cache.set('c', 3);
  assert.strictEqual(cache.get('b'), null);
  assert.strictEqual(cache.get('a'), 1);
  cache.entries.get('a').savedAt -= 2000;
  assert.strictEqual(cache.get('a'), null);
});

test('ladder: templates skip the model, repeats hit the cache, follow-ups do not', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-'));
  let modelCalls = 0;
  const brain = {
    modelId: () => 'fake',
    chat: async (_q, { onText }) => { modelCalls++; onText('[mood:curious] Boxes feel safe.'); },
  };
  const resolver = new Resolver({ brain, cacheFile: path.join(dir, 'c.json'), countsFile: path.join(dir, 'n.json') });
  const ask = (q, firstInThread = true) => resolver.ask(q, { onText: () => {}, firstInThread });

  assert.strictEqual((await ask('What time is it?')).tier, 'code');
  assert.strictEqual(modelCalls, 0);
  assert.deepStrictEqual(await ask('Why boxes?'), { text: 'Boxes feel safe.', mood: 'curious', tier: 'local' });
  assert.strictEqual((await ask('  why   BOXES? ')).tier, 'cache');
  assert.strictEqual((await ask('Why boxes?', false)).tier, 'local');
  assert.strictEqual(modelCalls, 2);
  assert.deepStrictEqual(resolver.counts.tiers, { code: 1, cache: 1, local: 2 });
});
