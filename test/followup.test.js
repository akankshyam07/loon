// Follow-up questions (DESIGN.md §2.10 "Follow-ups"): the bubble thread's history reaches whichever tier answers, the
// tier sticks, caching is thread-keyed, budgets hold and secrets are redacted. Fake brain and fake plan CLI, no network.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Resolver } = require('../brain/resolve');
const { Brain, SYSTEM_PROMPT } = require('../brain/ai');
const { historyBlock, followUpContext, FOLLOW_UP_BUDGET } = require('../brain/tasks');
const { createCompanion } = require('../main/companion');

const SELECTION = 'Mitochondria turn nutrients into ATP, the energy currency of the cell. They have their own DNA.';

function setup(settings = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-followup-'));
  const calls = []; // { tier, prompt, system? } in order
  const brain = {
    modelId: () => 'fake-4b',
    modelLabel: () => 'fake',
    resetThread() {},
    chat: async (prompt, { onText }) => { calls.push({ tier: 'local', prompt }); onText(`[mood:curious] Local answer ${calls.length}.`); },
  };
  const cli = {
    ask: async (which, { system, prompt, onText }) => { calls.push({ tier: 'cloud', which, system, prompt }); onText(`[mood:happy] Plan answer ${calls.length}.`); },
    label: () => 'Claude (your plan, via Claude Code)',
    modelFor: (_w, level) => (level === 'hard' ? 'opus' : 'haiku'),
  };
  const all = { privacy: false, cloudCli: 'claude', answerWith: 'plan', personal: {}, cameos: false, ...settings };
  const resolver = new Resolver({ brain, cli, settings: all, cacheFile: path.join(tmp, 'c.json'), countsFile: path.join(tmp, 'n.json') });
  const companion = createCompanion({
    bridge: { clients: new Set() },
    resolver,
    brain,
    ui: { cat() {}, showBubble() {}, hideBubble() {}, bubbleFocused: () => false },
    notes: { files: () => [] },
    actions: {},
    settings: all,
  });
  let id = 0;
  const send = async (args) => {
    const sent = [];
    await companion.run({ id: ++id, ...args }, (type, payload) => sent.push({ type, ...payload }));
    const error = sent.find((m) => m.type === 'error');
    if (error) throw new Error(error.message);
    return sent.find((m) => m.type === 'done');
  };
  return { companion, resolver, calls, settings: all, ask: (question) => send({ question }), chip: (task, deeper = false) => send({ task, deeper }), last: () => calls[calls.length - 1] };
}

test('a follow-up after a plan answer carries the question, answer and selection into the CLI prompt, and stays on the plan', async () => {
  const t = setup();
  t.companion.fromCapture({ text: SELECTION, app: 'Safari' });
  const first = await t.ask('Compare this with how chloroplasts work, step by step'); // hard → plan
  assert.strictEqual(first.tier, 'cloud');
  const second = await t.ask('and in plants?'); // rates easy on its own; sticky keeps it on the plan
  assert.strictEqual(second.tier, 'cloud');
  assert.match(second.detail, /follow-up: same model/);
  const { prompt } = t.last();
  assert.ok(prompt.includes('Compare this with how chloroplasts work, step by step'), 'previous question');
  assert.ok(prompt.includes(first.text), 'previous answer');
  assert.ok(prompt.includes(SELECTION), 'selection text');
  assert.ok(prompt.trimEnd().endsWith('and in plants?'), 'new question comes last');
});

test('"and in Python?" after a plan answer in an ask thread stays on the plan; a fresh thread routes it locally', async () => {
  const t = setup();
  t.companion.openAsk();
  assert.strictEqual((await t.ask('Compare JavaScript Map vs Object: what are the trade-offs?')).tier, 'cloud'); // medium
  assert.strictEqual((await t.ask('and in Python?')).tier, 'cloud');
  assert.ok(t.last().prompt.includes('Compare JavaScript Map vs Object'));
  t.companion.endThread(); // bubble closed
  assert.strictEqual((await t.ask('and in Python?')).tier, 'local');
  assert.ok(!t.last().prompt.includes('<conversation>'), 'a new thread has no history');
});

test('a follow-up after a local answer carries history into the local prompt; a harder follow-up still escalates', async () => {
  const t = setup();
  t.companion.fromCapture({ text: SELECTION, app: 'Safari' });
  const first = await t.chip('explain'); // easy → fast local
  assert.strictEqual(first.tier, 'local');
  assert.strictEqual((await t.ask('why?')).tier, 'local');
  const { prompt } = t.last();
  assert.ok(prompt.includes('User: Explain') && prompt.includes(first.text) && prompt.includes(SELECTION));
  assert.strictEqual((await t.ask('make it shorter')).tier, 'local', 'inside a thread this reshapes the last answer, not Settings');
  assert.ok(t.last().prompt.trimEnd().endsWith('make it shorter') && t.last().prompt.includes(first.text));
  assert.strictEqual(t.settings.personal.length, undefined);
  const hard = await t.ask('Why? Compare the trade-offs step by step against glycolysis');
  assert.strictEqual(hard.tier, 'cloud', 'router rates it hard: escalation is allowed');
});

test('"Go deeper" includes the history up to that answer and the whole context', async () => {
  const t = setup();
  const long = `${SELECTION} `.repeat(40); // longer than the follow-up context budget
  t.companion.fromCapture({ text: long.trim(), app: 'Safari' });
  const first = await t.chip('explain');
  await t.chip('explain', true);
  const { tier, prompt } = t.last();
  assert.strictEqual(tier, 'cloud');
  assert.ok(prompt.includes(first.text) && prompt.includes('<conversation>'));
  assert.ok(prompt.includes(long.trim()), 'deeper keeps the full context');
});

test('budgets: long history keeps the newest turns within the limit; context is trimmed for follow-ups', () => {
  const turns = Array.from({ length: 10 }, (_, i) => ({ question: `Question ${i} ${'q'.repeat(400)}`, answer: `Answer ${i} starts here. ${'Lots of detail. '.repeat(200)}` }));
  const block = historyBlock(turns);
  const inner = block.slice(block.indexOf('<conversation>\n') + 15, block.indexOf('\n</conversation>'));
  assert.ok(inner.length <= FOLLOW_UP_BUDGET.turns, `history ${inner.length} chars`);
  assert.ok(inner.includes('Answer 9 starts here.'), 'newest turn kept');
  assert.ok(!inner.includes('Answer 3 '), 'turns beyond the last six are dropped');
  const entries = inner.split('\n\nUser: ');
  assert.ok(entries[entries.length - 1].length <= FOLLOW_UP_BUDGET.question + FOLLOW_UP_BUDGET.latestAnswer + 20);
  assert.ok(entries.slice(0, -1).every((e) => e.length <= FOLLOW_UP_BUDGET.question + FOLLOW_UP_BUDGET.olderAnswer + 20), 'older answers shrink to first sentences');
  const page = 'Cats sleep a lot. Kittens play at night. '.repeat(300);
  assert.ok(followUpContext(page).length <= FOLLOW_UP_BUDGET.context);
  assert.strictEqual(followUpContext('short text'), 'short text');
});

test('secrets in history are redacted before the plan sees the follow-up', async () => {
  const t = setup();
  const secret = 'sk-ant-abcdefghijklmnopqrstuvwxyz0123456789';
  t.companion.openAsk();
  await t.ask(`is ${secret} a key?`); // easy → local, so the secret sits in history
  await t.ask('Why? Compare the trade-offs of key rotation step by step'); // hard → plan
  const { tier, prompt } = t.last();
  assert.strictEqual(tier, 'cloud');
  assert.ok(prompt.includes('<conversation>') && !prompt.includes(secret) && prompt.includes('[redacted'));
});

test('cache: a follow-up never gets a first turn\'s answer; the same follow-up in the same thread can', async () => {
  const t = setup({ cloudCli: 'off' });
  const thread = async (...questions) => {
    t.companion.endThread();
    const out = [];
    for (const q of questions) out.push((await t.ask(q)).tier);
    return out;
  };
  t.companion.openAsk();
  assert.deepStrictEqual(await thread('What is a closure?', 'What is a closure?'), ['local', 'local'], 'repeat inside a thread is a follow-up, not the cached first turn');
  assert.deepStrictEqual(await thread('What is a closure?', 'and an example?'), ['cache', 'local']);
  assert.deepStrictEqual(await thread('What is a closure?', 'and an example?'), ['cache', 'cache'], 'same history + same follow-up hits its thread-keyed entry');
});

test('Privacy mode: the thread still reaches the local model, nothing is cached and the plan is never used', async () => {
  const t = setup({ privacy: true });
  t.companion.openAsk();
  await t.ask('Compare JavaScript Map vs Object: what are the trade-offs?');
  await t.ask('and in Python?');
  assert.deepStrictEqual(t.calls.map((c) => c.tier), ['local', 'local']);
  assert.ok(t.last().prompt.includes('Compare JavaScript Map vs Object'));
  assert.strictEqual(t.resolver.cache.entries.size, 0);
  assert.strictEqual(t.companion.session.turns.length, 2);
  t.companion.endThread();
  assert.strictEqual(t.companion.session.turns.length, 0);
});

test('the fixed prefix stays byte-identical across turns; history comes after it', async () => {
  const t = setup({ personal: { emoji: false } }); // a non-empty preferences block
  t.companion.fromCapture({ text: SELECTION, app: 'Safari' });
  await t.ask('Compare this with how chloroplasts work, step by step');
  await t.ask('and in plants?');
  await t.ask('and in fungi?');
  const [, second, third] = t.calls;
  assert.ok([second, third].every((c) => c.system === SYSTEM_PROMPT));
  const prefix = second.prompt.slice(0, second.prompt.indexOf('Conversation so far'));
  assert.ok(prefix.startsWith('User preferences') && prefix.includes('</context>'));
  assert.ok(third.prompt.startsWith(prefix));
});

test('the local brain sends one stateless message per call (no hidden chat history)', async () => {
  const brain = new Brain({ modelsDir: os.tmpdir(), settings: {} });
  brain.backend = { kind: 'ollama', model: 'fake' };
  const bodies = [];
  const realFetch = global.fetch;
  global.fetch = async (_url, { body }) => {
    bodies.push(JSON.parse(body));
    return { body: [Buffer.from(`${JSON.stringify({ message: { content: 'ok' } })}\n`)] };
  };
  try {
    await brain.chat('first', { onText() {} });
    await brain.chat('second', { onText() {} });
  } finally {
    global.fetch = realFetch;
  }
  assert.deepStrictEqual(bodies[1].messages, [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: 'second' }]);
});

test('asking about the page reads it when Chrome is paired; with no way to see the screen it says so plainly', async () => {
  // No browser and no screen sight (main/screen.js): an honest answer from code, no model call, no pretending to see.
  const t = setup({ cloudCli: 'off' });
  const sent = [];
  await t.companion.run({ id: 1, question: 'what do you see' }, (type, payload) => sent.push({ type, ...payload }));
  assert.strictEqual(t.calls.length, 0, 'no model call');
  assert.match(sent.find((m) => m.type === 'action-done').message, /can't see your screen right now/);

  // Paired, on a shop page: the question is answered from the page text.
  const page = { type: 'page', active: true, visible: true, tabId: 7, url: 'https://www.etsy.com/listing/1', title: 'Handmade mug', kind: 'shopping', sensitive: false };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-pageq-'));
  const brain = { modelId: () => 'fake', modelLabel: () => 'fake', resetThread() {}, chat: async (prompt, { onText }) => { t.calls.push({ tier: 'local', prompt }); onText('[mood:curious] A handmade mug for $24.'); } };
  const settings = { privacy: false, cloudCli: 'off', personal: {}, cameos: false };
  const resolver = new Resolver({ brain, settings, cacheFile: path.join(tmp, 'c.json'), countsFile: path.join(tmp, 'n.json') });
  const bridge = {
    clients: new Set([{}]),
    request: async (msg) => (msg.type === 'get-page' ? { url: page.url, title: page.title, html: '<html><body><main><h1>Handmade ceramic mug</h1><p>Price $24. Ships in 3 days. Glazed in sea green by a small studio in Portland.</p></main></body></html>' } : {}),
  };
  const companion = createCompanion({ bridge, resolver, brain, ui: { cat() {}, showBubble() {}, hideBubble() {}, bubbleFocused: () => false }, notes: { files: () => [] }, actions: {}, settings });
  companion.onBridgeMessage(page);
  companion.openAsk();
  const out = [];
  await companion.run({ id: 2, question: 'is this a good deal?' }, (type, payload) => out.push({ type, ...payload }));
  const prompt = t.calls[t.calls.length - 1].prompt;
  assert.match(prompt, /Handmade ceramic mug/, 'the page text reached the model');
  assert.match(prompt, /is this a good deal\?/);
  assert.ok(out.find((m) => m.type === 'done'));
});
