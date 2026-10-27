const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMoodParser, stripFlattery, Resolver } = require('../brain/resolve');
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

test('no flattery: the system prompt says so, and leading praise or agreement fillers are stripped from replies', () => {
  const { SYSTEM_PROMPT } = require('../brain/ai');
  assert.match(SYSTEM_PROMPT, /Never open with praise or agreement fillers/);
  assert.match(SYSTEM_PROMPT, /If the user is wrong, say so plainly/);
  const cases = [
    ['Great question! The answer is 42.', 'The answer is 42.'],
    ["You're absolutely right. it uses UTF-8.", 'It uses UTF-8.'],
    ['What a great question! You’re right! Sure, here it is.', 'Here it is.'],
    ['Absolutely, the second one is cheaper.', 'The second one is cheaper.'],
    ['That’s a really good point — prices vary.', 'Prices vary.'],
    ['Of course!\nStep 1: open it.', 'Step 1: open it.'],
    ["You're right that it's cheaper, but shipping costs more.", "You're right that it's cheaper, but shipping costs more."],
    ['Certainly not. That claim is false.', 'Certainly not. That claim is false.'],
    ['Sure-fire bets are rare.', 'Sure-fire bets are rare.'],
    ['Greatness takes time.', 'Greatness takes time.'],
    ['Absolutely!', 'Absolutely!'], // nothing but filler: left alone
    ['Actually, no. Paris is the capital.', 'Actually, no. Paris is the capital.'],
  ];
  for (const [input, want] of cases) assert.strictEqual(stripFlattery(input), want, input);
  // Streaming: the filter holds only the first clause, wherever the chunks split.
  assert.deepStrictEqual(parse(['[mood:happy] Gre', 'at ques', 'tion! ', "You're absolutely ", 'right. It is ', 'blue.']), { mood: 'happy', out: 'It is blue.' });
  assert.deepStrictEqual(parse(['[mood:focused] Here', ' is the fix: add a semicolon.']), { mood: 'focused', out: 'Here is the fix: add a semicolon.' });
  assert.deepStrictEqual(parse(['[mood:happy] Great question!']), { mood: 'happy', out: 'Great question!' });
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

test('ladder: instant answers survive smart quotes, "?!", "right now" and a wake word', async () => {
  const brain = { modelId: () => 'fake', chat: async () => { throw new Error('model should not run'); } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-'));
  const resolver = new Resolver({ brain, cacheFile: path.join(dir, 'c.json'), countsFile: path.join(dir, 'n.json') });
  for (const q of ['what’s the time?', 'What time is it?!', 'what time is it right now?', 'Hey Loon, what time is it', 'tell me the time', 'today’s date', 'what can u do', 'help me!', 'hi', 'Hello!', 'hey loon', 'thanks!', 'thank you', 'Good morning', 'thx']) {
    assert.strictEqual((await resolver.ask(q, { onText: () => {}, firstInThread: true })).tier, 'code', q);
  }
});

test('ladder: arithmetic, percentages and unit conversions are answered by code', async () => {
  const brain = { modelId: () => 'fake', chat: async () => { throw new Error('model should not run'); } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-'));
  const resolver = new Resolver({ brain, cacheFile: path.join(dir, 'c.json'), countsFile: path.join(dir, 'n.json') });
  const cases = [['what is 15% of 80?', /^12\./], ['2+2', /= 4$/], ["what's 12 x 12", /144/], ['(3+4)*2', /= 14/], ['5 miles in km', /8\.0467 km/], ['100 f to c', /37\.7778 c/], ['convert 3 cups to ml', /709\.7647 ml/]];
  for (const [q, re] of cases) {
    const r = await resolver.ask(q, { onText: () => {}, firstInThread: true });
    assert.strictEqual(r.tier, 'code', q);
    assert.match(r.text, re, q);
  }
  for (const q of ['555-1234', '1/0', 'banana', 'what is 3 in']) {
    await assert.rejects(resolver.ask(q, { onText: () => {}, firstInThread: true }), /model should not run/, q);
  }
});

test('ladder: typed dictionary questions use WordNet, not the model', async () => {
  const brain = { modelId: () => 'fake', chat: async () => { throw new Error('model should not run'); } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-'));
  const resolver = new Resolver({ brain, cacheFile: path.join(dir, 'c.json'), countsFile: path.join(dir, 'n.json') });
  for (const q of ['define ephemeral', 'What does ephemeral mean?', 'meaning of the word ephemeral', 'what’s the definition of ephemeral?']) {
    const r = await resolver.ask(q, { onText: () => {}, firstInThread: true });
    assert.strictEqual(r.tier, 'code', q);
    assert.match(r.text, /lasting a very short time/, q);
  }
  for (const q of ['what does that mean', 'what does this error mean', 'what is python']) {
    await assert.rejects(resolver.ask(q, { onText: () => {}, firstInThread: true }), /model should not run/, q);
  }
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
  const first = await ask('Why boxes?');
  assert.deepStrictEqual([first.text, first.mood, first.tier], ['Boxes feel safe.', 'curious', 'local']);
  assert.strictEqual((await ask('  why   BOXES? ')).tier, 'cache');
  assert.strictEqual((await ask('Why boxes?', false)).tier, 'local');
  assert.strictEqual(modelCalls, 2);
  assert.deepStrictEqual(resolver.counts.tiers, { code: 1, cache: 1, local: 2 });
});
