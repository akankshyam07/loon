const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { estimate, pickTier, check, confidenceStats, thinkingFor, EscalationLog } = require('../brain/router');
const { buildPrompt } = require('../brain/tasks');
const { answerConfidence } = require('../brain/ai');
const { Skills } = require('../brain/skills');
const { normalizeVector } = require('../brain/embed');
const { Resolver } = require('../brain/resolve');

test('router: difficulty levels on representative requests', () => {
  const code = Array.from({ length: 200 }, (_, i) => `  const v${i} = compute(${i});`).join('\n');
  const cases = [
    ['easy', { request: 'What is the capital of France?' }],
    ['easy', { request: 'hello there' }],
    ['easy', { request: 'Define photosynthesis' }],
    ['easy', { request: 'Why do cats purr?' }],
    ['easy', { taskId: 'rewrite', request: 'Rewrite this to be clearer and more concise.', context: 'We should of gone earlier.' }],
    ['easy', { taskId: 'summarize', request: 'Summarize this in 2-3 short bullet points.', context: 'Short paragraph. '.repeat(20) }],
    ['medium', { request: 'Compare Postgres and MySQL for a small app' }],
    ['medium', { request: 'Explain step by step how TLS works' }],
    ['medium', { request: 'Why is the sky blue? And why are sunsets red?' }],
    ['medium', { taskId: 'explain_code', request: 'Explain what this code does, step by step, briefly.', context: 'x = 1' }],
    ['medium', { taskId: 'page_summary', request: 'Summarize this page in 3-5 short bullet points.', context: 'Long article text. '.repeat(1000) }],
    ['hard', { request: 'Compare REST and GraphQL and explain the trade-offs for a mobile app, then design a plan to migrate.' }],
    ['hard', { request: 'Prove that the square root of 2 is irrational, step by step.' }],
    ['medium', { request: 'Solve 3x + 7 = 22 and explain why each step is valid' }],
    ['hard', { request: 'What is the probability of drawing two aces in a row? Explain why, step by step.' }],
    ['hard', { taskId: 'find_bug', request: 'Point out likely bugs or risky lines in this code, quoting them.', context: code }],
  ];
  for (const [want, input] of cases) {
    const got = estimate(input);
    assert.strictEqual(got.level, want, `${input.request} → ${got.level} (${got.reasons.join(', ')})`);
  }
  assert.ok(estimate(cases[11][1]).reasons.includes('comparison'));
  assert.strictEqual(pickTier('easy', ['fast', 'smart', 'cloud']), 'fast');
  assert.strictEqual(pickTier('medium', ['fast', 'smart', 'cloud']), 'smart');
  assert.strictEqual(pickTier('medium', ['fast', 'cloud']), 'fast');
  assert.strictEqual(pickTier('hard', ['fast', 'smart']), 'smart');
  assert.strictEqual(pickTier('hard', ['fast', 'smart', 'cloud']), 'cloud');
});

test('self-check flags weak answers and passes good ones', () => {
  const ids = (answer, opts) => check(answer, opts).map((f) => f.id);
  assert.deepStrictEqual(ids(''), ['empty']);
  assert.deepStrictEqual(ids('Maybe.', { request: 'Can you explain how a bloom filter works and when I should use one?' }), ['short']);
  assert.deepStrictEqual(ids('Sure.', { request: 'Why is the sky blue?' }), []); // short question, short answer is fine
  assert.deepStrictEqual(ids("I'm not sure what that means. It might be a type of tree.", { request: 'What is a baobab?' }), ['hedge']);
  assert.deepStrictEqual(ids('As an AI, I cannot have opinions on this topic at all.', { request: 'Which phone is best?' }), ['hedge']);
  assert.deepStrictEqual(ids('It is probably fine, but I am not sure about the shipping.', { request: 'Is this deal good?' }), []); // honest caveat later on
  assert.deepStrictEqual(ids('How do I reset my router password?', { request: 'How do I reset my router password?' }), ['echo']);
  assert.deepStrictEqual(ids('You unplug it and then plug it back in after a while and it works again.', { request: 'Give me the steps to reset my router' }), ['format']);
  assert.deepStrictEqual(ids('1. Unplug it.\n2. Wait 30 seconds.\n3. Plug it back in.', { request: 'Give me the steps to reset my router' }), []);
  assert.deepStrictEqual(ids('You can loop over the list and add each number to a total.', { request: 'Write a Python function that sums a list' }), ['format']);
  assert.deepStrictEqual(ids('```python\ndef total(xs):\n    return sum(xs)\n```', { request: 'Write a Python function that sums a list' }), []);
  assert.deepStrictEqual(ids(`${'word '.repeat(80)}and then the`, { request: 'Explain it', maxTokens: 100 }), ['truncated']);
  assert.deepStrictEqual(ids('猫は箱の中で安全だと感じるからです。', { request: 'Why do cats like boxes?', typed: true }), ['language']);
  assert.deepStrictEqual(ids('猫は箱の中で安全だと感じるからです。', { request: 'Translate this into English.', typed: false }), []);
  assert.deepStrictEqual(ids('Cats feel safe in small enclosed spaces, so boxes calm them down.', { request: 'Why do cats like boxes?', typed: true }), []);
});

// Fake local brain: answers come from a queue per slot, so tests control what each tier says.
function setup({ fast = [], smart = [], cloud = [], hasSmart = true, settings = {}, embedder = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-router-'));
  const calls = [];
  const options = [];
  // A queue item is the answer text, an Error, or { text, confidence } for a local answer with token confidence.
  const reply = (queue, onText, onConfidence) => {
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    if (typeof next === 'object') {
      onText(next.text);
      onConfidence?.(next.confidence);
    } else onText(next);
  };
  const brain = {
    modelId: () => 'fake',
    hasSmart: () => hasSmart,
    chat: async (_p, { onText, smart: useSmart, onConfidence, ...rest }) => {
      calls.push(useSmart ? 'smart' : 'fast');
      options.push(rest);
      reply(useSmart ? smart : fast, onText, onConfidence);
    },
  };
  const cli = {
    ask: async (_which, { onText, prompt }) => { calls.push('cloud'); cli.prompts.push(prompt); reply(cloud, onText); },
    label: () => 'Claude (your plan)',
    prompts: [],
  };
  const resolver = new Resolver({ brain, cli, embedder, settings: { privacy: false, cloudCli: 'off', ...settings }, cacheFile: path.join(dir, 'c.json'), countsFile: path.join(dir, 'n.json') });
  return { resolver, calls, cli, options };
}

const run = (resolver, question, opts = {}) => {
  const events = [];
  const result = resolver.ask(question, { onText: (t) => events.push(t), onRestart: () => events.push('<restart>'), ...opts });
  return result.then((r) => ({ ...r, events }));
};

const HARD = 'Compare REST and GraphQL and explain the trade-offs for a mobile app, then design a plan to migrate.';
const GOOD = '[mood:focused] REST is simpler to cache; GraphQL saves round trips. Start by wrapping your REST endpoints.';

test('resolver routing: easy stays on the fast model, hard goes to the plan only when enabled and not private', async () => {
  const easy = setup({ fast: ['[mood:happy] Paris is the capital of France.'], settings: { cloudCli: 'claude' } });
  const r1 = await run(easy.resolver, 'What is the capital of France?');
  assert.deepStrictEqual([r1.tier, r1.detail, r1.smart, easy.calls], ['local', undefined, false, ['fast']]);

  const off = setup({ smart: [GOOD] });
  const r2 = await run(off.resolver, HARD);
  assert.deepStrictEqual([r2.tier, r2.smart, r2.detail, off.calls], ['local', true, 'routed: hard question', ['smart']]);

  const on = setup({ cloud: [GOOD], settings: { cloudCli: 'claude' } });
  const r3 = await run(on.resolver, HARD);
  assert.deepStrictEqual([r3.tier, r3.detail, on.calls], ['cloud', 'Claude (your plan) · routed: hard question', ['cloud']]);

  const priv = setup({ smart: [GOOD], settings: { cloudCli: 'claude', privacy: true } });
  const r4 = await run(priv.resolver, HARD);
  assert.deepStrictEqual([r4.tier, priv.calls], ['local', ['smart']]);

  const medium = setup({ fast: [GOOD], hasSmart: false, settings: { cloudCli: 'claude' } });
  const r5 = await run(medium.resolver, 'Compare Postgres and MySQL for a small app');
  assert.deepStrictEqual([r5.tier, r5.detail, medium.calls], ['local', undefined, ['fast']]);

  const failing = setup({ cloud: [new Error('Claude Code isn\'t logged in.')], smart: [GOOD], settings: { cloudCli: 'claude' } });
  const r6 = await run(failing.resolver, HARD);
  assert.deepStrictEqual([r6.tier, failing.calls], ['local', ['cloud', 'smart']]); // a routed plan call falls back to the Mac
});

test('resolver self-check: a weak answer is upgraded exactly once, replaces the first, and is cached', async () => {
  const unsure = "[mood:confused] I'm not sure. Maybe.";
  const { resolver, calls } = setup({ fast: [unsure], smart: [unsure], cloud: ['[mood:happy] Cats knead because it comforted them as kittens.'], settings: { cloudCli: 'claude' } });
  const r1 = await run(resolver, 'Why do cats knead blankets?');
  assert.deepStrictEqual(calls, ['fast', 'smart']); // once, even though the smart answer is weak too
  assert.strictEqual(r1.detail, 'upgraded: first answer looked unsure');
  assert.deepStrictEqual(r1.events.slice(r1.events.indexOf('<restart>')), ['<restart>', "I'm not sure. Maybe."]);
  assert.strictEqual((await run(resolver, 'Why do cats knead blankets?')).tier, 'local'); // still weak: not cached

  const good = setup({ fast: [unsure], smart: ['[mood:happy] Kneading is a leftover kitten habit that means they feel safe.'] });
  const r2 = await run(good.resolver, 'Why do cats knead blankets?');
  assert.deepStrictEqual([r2.tier, r2.smart, r2.mood, r2.text], ['local', true, 'happy', 'Kneading is a leftover kitten habit that means they feel safe.']);
  assert.strictEqual(r2.events.filter((e) => e === '<restart>').length, 1);
  const again = await run(good.resolver, 'why do cats knead   blankets?');
  assert.deepStrictEqual([again.tier, again.text, good.calls], ['cache', r2.text, ['fast', 'smart']]);
  assert.deepStrictEqual(good.resolver.counts.tiers, { code: 0, cache: 1, local: 1 });

  const priv = setup({ fast: [unsure], cloud: [GOOD], hasSmart: false, settings: { cloudCli: 'claude', privacy: true } });
  const r3 = await run(priv.resolver, 'Why do cats knead blankets?');
  assert.deepStrictEqual([r3.tier, r3.detail, priv.calls], ['local', undefined, ['fast']]); // never the plan in Privacy mode
});

test('resolver self-check: escalates to the plan, keeps the first answer if the upgrade fails, stops on abort', async () => {
  const unsure = "[mood:confused] I'm not sure.";
  const toPlan = setup({ fast: [unsure], cloud: [GOOD], hasSmart: false, settings: { cloudCli: 'claude' } });
  const r1 = await run(toPlan.resolver, 'Why do cats knead blankets?');
  assert.deepStrictEqual([r1.tier, r1.detail, toPlan.calls], ['cloud', 'Claude (your plan) · upgraded: first answer looked unsure', ['fast', 'cloud']]);

  const broken = setup({ fast: [unsure], smart: [new Error('out of memory')] });
  const r2 = await run(broken.resolver, 'Why do cats knead blankets?');
  assert.deepStrictEqual([r2.text, r2.detail, r2.events.filter((e) => e === '<restart>').length], ["I'm not sure.", undefined, 2]);
  assert.strictEqual(r2.events.at(-1), "I'm not sure.");

  const controller = new AbortController();
  const aborting = setup({ fast: [unsure], smart: [GOOD] });
  aborting.resolver.brain.chat = async (_p, { onText, smart }) => {
    aborting.calls.push(smart ? 'smart' : 'fast');
    onText(unsure);
    controller.abort(); // the user hit cancel while the first answer streamed
  };
  await run(aborting.resolver, 'Why do cats knead blankets?', { signal: controller.signal });
  assert.deepStrictEqual(aborting.calls, ['fast']);
});

test('prompt layout: the same task shares its leading bytes, volatile memory and context come last', () => {
  const a = buildPrompt('explain', { source: 'selection', text: 'Mitochondria make ATP.' }, { memory: ['I like short answers'] });
  const b = buildPrompt('explain', { source: 'selection', url: 'https://x.test/a', text: 'Photosynthesis needs light.' }, { memory: [] });
  const fixed = 'Explain this in plain language.\n\n<context source="selection"';
  assert.ok(a.startsWith(fixed) && b.startsWith(fixed), `${a}\n---\n${b}`);
  assert.match(a, /<\/context>\n\nAbout the user[\s\S]*I like short answers$/);
  assert.ok(!/\d{1,2}:\d{2}|20\d\d-\d\d/.test(a)); // no time or date anywhere in the prompt
  assert.strictEqual(buildPrompt('ask', { source: 'typed', question: 'hi?' }, { memory: ['m'] }), 'hi?\n\nAbout the user (they chose to share this; use it only when relevant):\n- m');
});

test('token confidence: stats, per-task thresholds, rewrites never escalate on it, absent means skipped', () => {
  assert.strictEqual(confidenceStats([0.9, 0.8]), null); // too few tokens
  const sure = confidenceStats(Array(20).fill(0.97));
  const shaky = confidenceStats([...Array(10).fill(0.3), ...Array(10).fill(0.9)]);
  assert.ok(sure.meanLogProb > -0.05 && sure.lowShare === 0 && sure.tokens === 20);
  assert.ok(shaky.meanLogProb < -0.6 && shaky.lowShare === 0.5);
  const answer = 'Paris has been the capital of France for centuries.';
  const ids = (opts) => check(answer, { request: 'What is the capital of France?', ...opts }).map((f) => f.id);
  assert.deepStrictEqual(ids({ confidence: sure }), []);
  assert.deepStrictEqual(ids({ confidence: shaky }), ['confidence']);
  assert.deepStrictEqual(ids({ confidence: null }), []); // Ollama, cloud, fakes: no signal, no flag
  assert.deepStrictEqual(ids({ confidence: shaky, taskId: 'rewrite' }), []);
  assert.deepStrictEqual(ids({ confidence: shaky, taskId: 'professional' }), []);
  const medium = { meanLogProb: -0.7, lowShare: 0.2, tokens: 30 };
  assert.deepStrictEqual([ids({ confidence: medium, taskId: 'ask' }), ids({ confidence: medium, taskId: 'explain' })], [['confidence'], []]);

  // The answer's tokens are the tail of what was generated: the <think> block and the end token are left out.
  const model = { tokenize: (t) => t.split(' '), isEogToken: (t) => t === 'eog' };
  const recorded = [{ token: '<think>', p: 1 }, { token: '</think>', p: 1 }, ...Array(10).fill({ token: 'w', p: 0.4 }), { token: 'eog', p: 1 }];
  assert.strictEqual(answerConfidence(model, recorded, `[mood:happy] ${Array(10).fill('w').join(' ')}`).lowShare, 1);
  assert.strictEqual(answerConfidence(model, [], 'anything at all'), null);
});

test('resolver: a shaky local answer is upgraded once; a shaky rewrite is not', async () => {
  const shaky = { meanLogProb: -1.2, lowShare: 0.4, tokens: 40 };
  const { resolver, calls } = setup({ fast: [{ text: '[mood:happy] The third book is The Shadow Heart, from 1992.', confidence: shaky }], smart: [GOOD] });
  const r = await run(resolver, 'Name the third book in the Wheel of Time series.');
  assert.deepStrictEqual([calls, r.detail], [['fast', 'smart'], 'upgraded: the model was unsure of its first answer']);

  const rw = setup({ fast: [{ text: '[mood:happy] We should have left earlier.', confidence: shaky }], smart: [GOOD] });
  await rw.resolver.run('rewrite', { source: 'selection', text: 'we should of went earlier' }, { onText: () => {} });
  assert.deepStrictEqual(rw.calls, ['fast']);
});

test('thinking: only hard, comparison and debugging routes think; <think> never reaches the answer', async () => {
  const route = (taskId, request) => thinkingFor({ taskId, route: estimate({ taskId, request }) });
  assert.strictEqual(route('ask', 'What is the capital of France?'), false);
  assert.strictEqual(route('rewrite', 'Rewrite this to be clearer.'), false);
  assert.strictEqual(route('ask', 'Compare Postgres and MySQL for a small app'), true);
  assert.strictEqual(route('ask', HARD), true);
  assert.strictEqual(route('find_bug', 'Point out likely bugs.'), true);
  assert.strictEqual(thinkingFor({ taskId: 'ask', route: null }), false); // "Go deeper" keeps its own rule

  const { resolver, options } = setup({ fast: ['<think>The user wants a city.</think>[mood:happy] Paris.'], smart: ['[mood:focused] <think>weigh it</think>Postgres, for its features.'] });
  const r1 = await run(resolver, 'What is the capital of France?');
  const r2 = await run(resolver, 'Compare Postgres and MySQL for a small app');
  assert.deepStrictEqual([r1.text, r2.text], ['Paris.', 'Postgres, for its features.']);
  assert.deepStrictEqual(options.map((o) => o.thinking), [false, true]);
  assert.ok(!r1.events.join('').includes('think'));
});

test('structured output: the site extractor asks for grammar-constrained JSON', async () => {
  const seen = [];
  const brain = {
    chat: async (_prompt, { onText, jsonSchema }) => { seen.push(jsonSchema); onText('{"item": ".card", "name": ".title", "price": ".price"}'); },
    resetThread: () => {},
  };
  const skills = new Skills({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'loon-skills-')), brain });
  const { parseHTML } = require('linkedom');
  const { document } = parseHTML(`<html><body>${['A', 'B', 'C'].map((n, i) => `<div class="card"><h2 class="title">Tea ${n}</h2><span class="price">$${i + 3}.99</span></div>`).join('')}</body></html>`);
  const { extractor, modelCalls } = await skills.generateExtractor(document);
  assert.deepStrictEqual([seen[0].type, seen[0].required], ['object', ['item', 'name', 'price']]);
  assert.deepStrictEqual([extractor, modelCalls], [{ item: '.card', name: '.title', price: '.price', source: 'model' }, 1]);
});

test('site extractor: bad selectors get one retry with the reason, then a page heuristic; labels stay honest', async () => {
  const prompts = [];
  const replies = ['{"item": "ul.results", "name": "span.title", "price": "span.cost"}', '{"item": "li.card > span.cost", "name": "b", "price": "i"}'];
  const brain = { chat: async (prompt, { onText }) => { prompts.push(prompt); onText(replies[prompts.length - 1]); }, resetThread: () => {} };
  const skills = new Skills({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'loon-skills-')), brain });
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'shop-plain.html'), 'utf8');
  const url = 'http://shop.test/beans';
  const first = await skills.run('shopping', 'shop_value', { html, url, text: '' });
  assert.strictEqual(prompts.length, 2);
  assert.match(prompts[1], /"item" matched 1 element and only 1 had both a name and a price/);
  assert.match(first.detail, /3 products · new site extractor \(page heuristic/);
  assert.strictEqual(first.usedModel, true);
  // The saved extractor answers the next visit with no model call.
  const again = await skills.run('shopping', 'shop_value', { html, url, text: '' });
  assert.deepStrictEqual([prompts.length, again.usedModel, /saved site extractor/.test(again.detail)], [2, false, true]);
  // A page where nothing works still says the model ran.
  const none = await new Skills({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'loon-skills-')), brain: { chat: async (_p, { onText }) => onText('{}'), resetThread: () => {} } })
    .run('shopping', 'shop_value', { html: '<body><p>$1 off</p><p>$2 off</p></body>', url, text: '' });
  assert.deepStrictEqual([none.detail, none.usedModel], ['no products found', true]);
});

// Fake embedder: a strong dimension per topic word plus a weak hashed bag of the other words, so questions about the
// same topic score ~0.83-0.9 (neighbours, not the same question) and different topics score near 0.
function topicEmbedder(available = true) {
  const topics = ['monad', 'kubernetes', 'paris', 'cat'];
  return {
    available: () => available,
    cached: () => null,
    async embed(text) {
      if (!available) return null;
      const vec = new Float32Array(topics.length + 64);
      for (const word of text.toLowerCase().match(/[a-z]+/g) || []) {
        const topic = topics.indexOf(word);
        if (topic >= 0) vec[topic] = 1;
        else vec[topics.length + ([...word].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 64)] += 0.25;
      }
      return normalizeVector(vec);
    },
  };
}

test('kNN escalation memory: questions like ones that escalated start one tier up; no embedder, no effect', async () => {
  const unsure = "[mood:confused] I'm not sure.";
  const fine = '[mood:happy] A monad wraps a value and chains computations on it.';
  const { resolver, calls } = setup({ fast: [unsure, unsure, fine], smart: [GOOD], embedder: topicEmbedder() });
  const followUp = { firstInThread: false }; // keeps the answer cache out of the way
  await run(resolver, 'What is a monad?', followUp);
  await run(resolver, 'Explain a monad simply', followUp);
  assert.deepStrictEqual(calls, ['fast', 'smart', 'fast', 'smart']); // both escalated through the self-check
  const r = await run(resolver, 'How does a monad work in Haskell?', followUp);
  assert.deepStrictEqual([calls.slice(4), r.detail], [['smart'], 'routed: similar questions needed a stronger model']);
  calls.length = 0;
  await run(resolver, 'Where is Paris?', followUp); // unrelated: stays fast
  assert.deepStrictEqual(calls, ['fast']);

  const log = new EscalationLog(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'loon-knn-')), 'e.json'), { embedder: topicEmbedder() });
  await log.record('What is a monad?', false);
  await log.record('What is a monad?', true); // "Go deeper" on the same question replaces its entry
  await log.record('Explain a monad simply', true);
  assert.deepStrictEqual([log.entries.length, await log.likelyHard('monad laws?')], [2, true]);
  assert.strictEqual(new EscalationLog(log.file, { embedder: topicEmbedder() }).entries.length, 2); // persisted
  log.clear();
  assert.strictEqual(await log.likelyHard('monad laws?'), false);

  const off = new EscalationLog(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'loon-knn-')), 'e.json'), { embedder: topicEmbedder(false) });
  await off.record('What is a monad?', true);
  assert.deepStrictEqual([off.entries.length, await off.likelyHard('What is a monad?')], [0, false]);
});
