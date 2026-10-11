const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { estimate, pickTier, check } = require('../brain/router');
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
function setup({ fast = [], smart = [], cloud = [], hasSmart = true, settings = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-router-'));
  const calls = [];
  const reply = (queue, onText) => {
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    onText(next);
  };
  const brain = {
    modelId: () => 'fake',
    hasSmart: () => hasSmart,
    chat: async (_p, { onText, smart: useSmart }) => {
      calls.push(useSmart ? 'smart' : 'fast');
      reply(useSmart ? smart : fast, onText);
    },
  };
  const cli = {
    ask: async (_which, { onText, prompt }) => { calls.push('cloud'); cli.prompts.push(prompt); reply(cloud, onText); },
    label: () => 'Claude (your plan)',
    prompts: [],
  };
  const resolver = new Resolver({ brain, cli, settings: { privacy: false, cloudCli: 'off', ...settings }, cacheFile: path.join(dir, 'c.json'), countsFile: path.join(dir, 'n.json') });
  return { resolver, calls, cli };
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
