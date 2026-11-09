const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMoodParser, stripFlattery, Resolver } = require('../brain/resolve');
const { worldTime } = require('../brain/worldtime');
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
  for (const q of ['what’s the time?', 'What time is it?!', 'what time is it right now?', 'Hey Loon, what time is it', 'tell me the time', 'today’s date', 'what can u do', 'help me!', 'hi', 'Hello!', 'hey loon', 'thanks!', 'thank you', 'Good morning', 'thx', 'ok thanks', 'Thanks, that helps!', 'great thank you so much', 'thanks loon', 'thanks a ton', 'tysm', 'got it thanks', 'many thanks', 'thanks again', 'hi again', 'thnx', 'thankyou', 'tyvm', 'hiya', 'howdy', 'wassup', 'good night', 'Goodnight!', 'bye', 'see ya', 'gn loon', 'thanks for that', 'thanks for the help', 'thank you for helping', 'thanks a bunch', 'much appreciated', 'appreciate it', 'appreciated', 'that helped, thanks']) {
    assert.strictEqual((await resolver.ask(q, { onText: () => {}, firstInThread: true })).tier, 'code', q);
  }
});

test('ladder: a bare "time" or "date" inside a conversation is a follow-up, not a clock question', async () => {
  const brain = { modelId: () => 'fake', chat: async () => ({ text: 'model' }), chatStream: async () => ({ text: 'model' }) };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-'));
  const resolver = new Resolver({ brain, cacheFile: path.join(dir, 'c.json'), countsFile: path.join(dir, 'n.json') });
  const history = [{ question: 'explain big o', answer: 'It measures growth.', target: 'fast' }];
  for (const q of ['time', 'time?', 'date', 'the date']) {
    assert.strictEqual((await resolver.ask(q, { onText: () => {}, firstInThread: true })).tier, 'code', q);
    let failed = false;
    const out = await resolver.ask(q, { onText: () => {}, firstInThread: false, history }).catch(() => { failed = true; });
    assert.ok(failed || out.tier !== 'code', `${q} mid-thread must not answer the clock`);
  }
});

test('ladder: date questions and trailing emoji are answered by code, not guessed by the model', async () => {
  const brain = { modelId: () => 'fake', chat: async () => { throw new Error('model should not run'); } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-'));
  const resolver = new Resolver({ brain, cacheFile: path.join(dir, 'c.json'), countsFile: path.join(dir, 'n.json') });
  const cases = [['what year is it', String(new Date().getFullYear())], ['what month is it?', new Date().toLocaleDateString([], { month: 'long' })], ['current date', 'It\u2019s|It\'s'], ["what's the day", "It's"], ['what day is tomorrow', 'Tomorrow is'], ['what day is yesterday', 'Yesterday is'], ['thanks 🙏', 'Anytime'], ['what time is it? 🕐', "It's"], ['how many days until christmas', /^\d+ days? until Christmas\.$|^Christmas is today\.$/], ['days till new year', /until New Year's Day\./]];
  for (const [q, re] of cases) {
    const r = await resolver.ask(q, { onText: () => {}, firstInThread: true });
    assert.strictEqual(r.tier, 'code', q);
    assert.match(r.text, new RegExp(re), q);
  }
});

test('ladder: time in another city is answered by code, unknown places go to the model', async () => {
  let asked = 0;
  const brain = { modelId: () => 'fake', chat: async (_p, { onText }) => { asked++; onText('Hm.'); } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-'));
  const resolver = new Resolver({ brain, cacheFile: path.join(dir, 'c.json'), countsFile: path.join(dir, 'n.json') });
  for (const q of ['what time is it in tokyo', "What's the time in London?", 'time in NYC', 'current time in new york right now']) {
    const r = await resolver.ask(q, { onText: () => {}, firstInThread: true });
    assert.strictEqual(r.tier, 'code', q);
    assert.match(r.text, /^It's \d{1,2}:\d{2}/, q);
  }
  assert.match(worldTime('what time is it in tokyo', new Date('2026-11-03T20:00:00Z')), /^It's 5:00\s?AM on Wednesday in Tokyo\.$/);
  await resolver.ask('what time is it in narnia', { onText: () => {}, firstInThread: true });
  assert.strictEqual(asked, 1);
});

test('ladder: praise in a thread gets an instant reply, praise with a request still goes to the model', async () => {
  let asked = 0;
  const brain = { modelId: () => 'fake', chat: async (_p, { onText }) => { asked++; onText('Sure.'); } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-'));
  const resolver = new Resolver({ brain, cacheFile: path.join(dir, 'c.json'), countsFile: path.join(dir, 'n.json') });
  const history = [{ question: 'explain tcp', answer: 'It is reliable.', target: 'fast' }];
  for (const q of ['nice one', 'good kitty', 'love it', 'you are great', 'Awesome!', 'perfect', 'good job', 'that was helpful', "you're so smart", 'well done']) {
    assert.strictEqual((await resolver.ask(q, { onText: () => {}, firstInThread: false, history })).tier, 'code', q);
  }
  assert.strictEqual(asked, 0);
  for (const q of ['good, now explain udp', 'perfect but shorter', 'nice, what about ports']) {
    assert.notStrictEqual((await resolver.ask(q, { onText: () => {}, firstInThread: false, history })).tier, 'code', q);
  }
});

test('ladder: thanks followed by a real request still goes to the model', async () => {
  const brain = { modelId: () => 'fake', chat: async (_p, { onText }) => onText('Sure.') };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-'));
  const resolver = new Resolver({ brain, cacheFile: path.join(dir, 'c.json'), countsFile: path.join(dir, 'n.json') });
  for (const q of ['thanks, now translate it to French', 'ok thanks but why is that', 'thanks for the help, now make it shorter', 'appreciate it but what about UDP']) {
    assert.notStrictEqual((await resolver.ask(q, { onText: () => {}, firstInThread: false, history: [{ question: 'a', answer: 'b' }] })).tier, 'code', q);
  }
});

test('ladder: a bare "help" inside a conversation goes to the model with the thread, not the feature list', async () => {
  const brain = { modelId: () => 'fake', chat: async (_p, { onText }) => onText('Sure, what part?') };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-'));
  const resolver = new Resolver({ brain, cacheFile: path.join(dir, 'c.json'), countsFile: path.join(dir, 'n.json') });
  const history = [{ question: 'explain bloom filters', answer: 'They test set membership.' }];
  for (const q of ['help', 'help me!']) {
    assert.notStrictEqual((await resolver.ask(q, { onText: () => {}, firstInThread: false, history })).tier, 'code', q);
  }
  assert.strictEqual((await resolver.ask('what can you do', { onText: () => {}, firstInThread: false, history })).tier, 'code');
});

test('ladder: arithmetic, percentages and unit conversions are answered by code', async () => {
  const brain = { modelId: () => 'fake', chat: async () => { throw new Error('model should not run'); } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-'));
  const resolver = new Resolver({ brain, cacheFile: path.join(dir, 'c.json'), countsFile: path.join(dir, 'n.json') });
  const cases = [['what is 15% of 80?', /^12\./], ['2+2', /= 4$/], ["what's 12 x 12", /144/], ['(3+4)*2', /= 14/], ['5 miles in km', /8\.0467 km/], ['100 f to c', /37\.7778 c/], ['convert 3 cups to ml', /709\.7647 ml/], ['15 percent of 80', /^12\./], ["what's 8 times 9", /= 72/], ['100 minus 37', /= 63/], ['100 divided by 4', /= 25/], ['what is 2 to the power of 10', /1,024/], ["what's 7 squared", /= 49/], ['15% of $80', /^\$12\.00\./], ['$45 * 1.08', /= \$48\.60/], ['20% off 80', /^64 after 20% off/], ['how many cups in a gallon', /1 gallon is about 16 cups/], ['how many oz in a lb', /16 oz/], ['tip on 45 at 18%', /^Tip 8\.10, total 53\.10/], ['15% tip on $80', /^Tip \$12\.00, total \$92\.00/], ['half of 50', /^25\./], ['sqrt(16)', /= 4$/], ['square root of 144', /= 12$/], ["what's 3 cubed", /= 27$/], ['how many days in a year', /1 year is about 365 days/], ['how many minutes in 3 hours', /3 hours is about 180 minutes/], ['1/0', /divides by zero/], ['5/0.5', /= 10$/], ['percent change from 50 to 75', /^Up 50% \(50 to 75\)/], ['% change from 80 to 60', /^Down 25%/], ['percent change from 0 to 5', /zero/], ['what is 20 degrees c in f', /^20 c is about 68 f/], ['18% of 250 dollars', /^\$45\.00/], ['$120 split 4 ways', /^\$30\.00 each/], ['split 100 between 3', /^33\.3333 each/], ['7 mod 3', /= 1$/], ['2 ** 3', /= 8$/], ['5 squared plus 3', /= 28$/], ['sqrt of 144', /= 12$/], ['$80 with 18% tip', /^Tip \$14\.40, total \$94\.40/], ['250 minus 10%', /^225\./], ['200 plus 15%', /^230\./], ['60 mph in kph', /96\.5606 kph/], ['whats 2+2', /= 4$/], ['whats 15% of 80', /^12\./]];
  for (const [q, re] of cases) {
    const r = await resolver.ask(q, { onText: () => {}, firstInThread: true });
    assert.strictEqual(r.tier, 'code', q);
    assert.match(r.text, re, q);
  }
  for (const q of ['555-1234', 'banana', 'what is 3 in']) {
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
  const synonym = await resolver.ask('synonym for big', { onText: () => {}, firstInThread: true });
  assert.strictEqual(synonym.tier, 'code');
  assert.match(synonym.text, /large/);
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

test('dictionaryTerm accepts a colon, a polite tail and "X meaning"', () => {
  const { dictionaryTerm } = require('../brain/define');
  assert.strictEqual(dictionaryTerm('define: ennui'), 'ennui');
  assert.strictEqual(dictionaryTerm('define ephemeral please'), 'ephemeral');
  assert.strictEqual(dictionaryTerm('ephemeral meaning'), 'ephemeral');
  assert.strictEqual(dictionaryTerm('Ephemeral definition?'), 'Ephemeral');
  assert.strictEqual(dictionaryTerm('this meaning'), null);
});

test('dictionaryTerm ignores polite openers, "in english" tails and emoji', () => {
  const { dictionaryTerm } = require('../brain/define');
  assert.strictEqual(dictionaryTerm('pls define ephemeral'), 'ephemeral');
  assert.strictEqual(dictionaryTerm('could you define ephemeral'), 'ephemeral');
  assert.strictEqual(dictionaryTerm('hey loon define ennui'), 'ennui');
  assert.strictEqual(dictionaryTerm('what does ephemeral mean in english'), 'ephemeral');
  assert.strictEqual(dictionaryTerm('whats ephemeral mean'), 'ephemeral');
  assert.strictEqual(dictionaryTerm('define ephemeral 🤔'), 'ephemeral');
  assert.strictEqual(dictionaryTerm('definition: ephemeral'), 'ephemeral');
  assert.strictEqual(dictionaryTerm('ephemeral means?'), 'ephemeral');
  assert.strictEqual(dictionaryTerm('what does it mean'), null);
});

test('dictionaryTerm handles typos and filler words in "what does X mean"', () => {
  const { dictionaryTerm } = require('../brain/define');
  assert.strictEqual(dictionaryTerm('wat does ephemeral mean'), 'ephemeral');
  assert.strictEqual(dictionaryTerm('whats the meaning of ennui'), 'ennui');
  assert.strictEqual(dictionaryTerm('what does ephemeral even mean'), 'ephemeral');
  assert.strictEqual(dictionaryTerm('what does ephemeral mean again'), 'ephemeral');
  assert.strictEqual(dictionaryTerm('what does ephemeral mean thanks'), 'ephemeral');
  assert.strictEqual(dictionaryTerm('what do you mean'), null);
});

test('antonymTerm reads "opposite of X"; antonyms follow WordNet word links and the resolver answers in code', async () => {
  const { antonymTerm, antonyms } = require('../brain/define');
  assert.strictEqual(antonymTerm('opposite of happy'), 'happy');
  assert.strictEqual(antonymTerm("what's the opposite of hot?"), 'hot');
  assert.strictEqual(antonymTerm('Antonym for "big" please'), 'big');
  assert.strictEqual(antonymTerm('opposite of this'), 'this');
  assert.strictEqual(antonymTerm('opposite day'), null);
  assert.match(await antonyms('hot'), /cold/);
  assert.match(await antonyms('big'), /small|little/);
  assert.strictEqual(await antonyms('zzqxv'), null);
  const brain = { modelId: () => 'fake', chat: async () => { throw new Error('model should not run'); } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-'));
  const resolver = new Resolver({ brain, cacheFile: path.join(dir, 'c.json'), countsFile: path.join(dir, 'n.json') });
  const reply = await resolver.ask('opposite of hot', { onText: () => {}, firstInThread: true });
  assert.strictEqual(reply.tier, 'code');
  assert.match(reply.text, /cold/);
});

test('synonymTerm reads "synonym for X" and "another word for X"; synonyms lists WordNet siblings', async () => {
  const { synonymTerm, synonyms } = require('../brain/define');
  assert.strictEqual(synonymTerm('synonym for happy'), 'happy');
  assert.strictEqual(synonymTerm('Synonyms of "big"?'), 'big');
  assert.strictEqual(synonymTerm('pls give me another word for big'), 'big');
  assert.strictEqual(synonymTerm('what is a word for ephemeral'), 'ephemeral');
  assert.strictEqual(synonymTerm('synonym for this sentence'), null);
  const text = await synonyms('big');
  assert.match(text, /^\*\*big\*\*: .*large/);
  assert.doesNotMatch(text, /\(a\)|_/);
  assert.strictEqual(await synonyms('zzqxv'), null);
});

test('dictionary, synonym and antonym asks accept "definition for" and "X synonym"', () => {
  const { dictionaryTerm, synonymTerm, antonymTerm } = require('../brain/define');
  assert.strictEqual(dictionaryTerm('definition for ephemeral'), 'ephemeral');
  assert.strictEqual(dictionaryTerm('meaning for ephemeral'), 'ephemeral');
  assert.strictEqual(synonymTerm('happy synonyms'), 'happy');
  assert.strictEqual(antonymTerm('happy antonym'), 'happy');
});

test('dictionaryTerm accepts "def", "look up" and "tell me" wordings but not pronouns', () => {
  const { dictionaryTerm } = require('../brain/define');
  assert.strictEqual(dictionaryTerm('def ephemeral'), 'ephemeral');
  assert.strictEqual(dictionaryTerm('look up ephemeral'), 'ephemeral');
  assert.strictEqual(dictionaryTerm('tell me what ephemeral means'), 'ephemeral');
  assert.strictEqual(dictionaryTerm('tell me the meaning of ephemeral'), 'ephemeral');
  assert.strictEqual(dictionaryTerm('what ephemeral means'), 'ephemeral');
  assert.strictEqual(dictionaryTerm('tell me what this means'), null);
  assert.strictEqual(dictionaryTerm('what it means'), null);
});

test('dictionaryTerm takes "explain the word X" and a ", loon" tail but leaves "meaning of life" to the model', () => {
  const { dictionaryTerm } = require('../brain/define');
  assert.strictEqual(dictionaryTerm('explain the word ennui'), 'ennui');
  assert.strictEqual(dictionaryTerm('what does ephemeral mean, loon'), 'ephemeral');
  assert.strictEqual(dictionaryTerm('meaning of life'), null);
  assert.strictEqual(dictionaryTerm('what is the meaning of the word life'), 'life');
  assert.strictEqual(dictionaryTerm('explain this error'), null);
});
