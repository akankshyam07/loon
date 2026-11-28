const test = require('node:test');
const assert = require('node:assert');
const { Translator } = require('../brain/translate');

test('translator: a failed first language lookup is retried, not remembered', async () => {
  const translator = new Translator({ cacheDir: 'unused' });
  let calls = 0;
  translator.call = async (payload) => {
    assert.strictEqual(payload.type, 'pairs');
    calls += 1;
    if (calls === 1) throw new Error('Translator stopped');
    return { pairs: ['fr-en', 'en-fr'] };
  };
  assert.strictEqual(await translator.supports('fr', 'en'), false, 'the failed lookup answers "no" this once');
  assert.strictEqual(await translator.supports('fr', 'en'), true, 'the next call asks again and gets the real list');
  assert.strictEqual(await translator.supports('en', 'fr'), true);
  assert.strictEqual(calls, 2, 'a good list is kept, so there is no third lookup');
});

test('translator: callers waiting on the same failed lookup all get "no" and the next one retries', async () => {
  const translator = new Translator({ cacheDir: 'unused' });
  let calls = 0;
  translator.call = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (calls === 1) throw new Error('Translation timed out');
    return { pairs: ['de-en', 'en-de'] };
  };
  const [a, b] = await Promise.all([translator.supports('de', 'en'), translator.supports('de', 'en')]);
  assert.deepStrictEqual([a, b], [false, false]);
  assert.strictEqual(calls, 1, 'both callers shared one lookup');
  assert.strictEqual(await translator.supports('de', 'en'), true);
});

test('translator: pivots through English when there is no direct model', async () => {
  const translator = new Translator({ cacheDir: 'unused' });
  translator.call = async () => ({ pairs: ['fr-en', 'en-es'] });
  assert.strictEqual(await translator.supports('fr', 'es'), true);
  assert.strictEqual(await translator.supports('es', 'fr'), false);
});
