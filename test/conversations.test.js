// In-chat memory and personalization (DESIGN.md §3.12.1–3.12.3): 👍/👎 and style nudges, "Remember this" with the
// toast's undo, "Forget what you used", History (grouping, search, Continue, delete, retention), "Save this chat",
// "Get to know you", context modes, and Privacy mode. Real memory.db and resolver, fake model, no network.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Memory, HISTORY_DAYS } = require('../brain/memory');
const { Resolver } = require('../brain/resolve');
const { Notes } = require('../brain/notes');
const { Actions } = require('../main/actions');
const { createCompanion } = require('../main/companion');
const { styleNudge, factFromAnswer, chatFacts, onboardingResult } = require('../brain/personal');
const { detectMode, orderChips, MODES } = require('../brain/modes');

const DAY = 24 * 60 * 60 * 1000;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'loon-conv-'));

function setup(extra = {}) {
  const dir = tmp();
  const file = path.join(dir, 'memory.db');
  const memory = new Memory(file);
  const state = { reply: 'Short answer.' };
  const prompts = [];
  const brain = {
    modelId: () => 'fake', modelLabel: () => 'fake', resetThread() {},
    chat: async (prompt, { onText }) => { prompts.push(prompt); onText(`[mood:happy] ${state.reply}`); },
  };
  const settings = { privacy: false, personal: {}, cameos: false, ...extra };
  const resolver = new Resolver({ brain, memory, settings, cacheFile: path.join(dir, 'c.json'), countsFile: path.join(dir, 'n.json') });
  const notes = new Notes(path.join(dir, 'notes'));
  const actions = new Actions({ auditFile: path.join(dir, 'audit.jsonl'), notes, memory, openExternal: () => {} });
  const companion = createCompanion({
    bridge: { clients: new Set() }, resolver, brain, notes, actions, memory, settings,
    ui: { cat() {}, showBubble() {}, hideBubble() {}, bubbleFocused: () => false },
    saveSettings: () => {},
  });
  let next = 0;
  const ask = async (question) => {
    const id = ++next;
    const sent = [];
    await companion.run({ id, question }, (type, payload) => sent.push({ type, ...payload }));
    const error = sent.find((m) => m.type === 'error');
    if (error) throw new Error(error.message);
    return { id, sent, done: sent.find((m) => m.type === 'done') };
  };
  return { dir, file, memory, state, prompts, settings, companion, ask, notes };
}

test('👍/👎: metadata only, one vote per answer, per-task acceptance; a 👎 streak on long answers only suggests', async () => {
  const { memory, state, settings, companion, ask } = setup();
  state.reply = 'Long answer with lots of words. '.repeat(25).trim();
  const votes = [];
  for (const q of ['What is a monad?', 'Why is the sky blue?', 'How do tides work?']) votes.push(companion.feedback({ id: (await ask(q)).id, vote: -1 }));
  assert.deepStrictEqual(votes.map((v) => v.saved), [true, true, true]);
  assert.deepStrictEqual([votes[0].nudge, votes[1].nudge], [undefined, undefined]);
  assert.deepStrictEqual(votes[2].nudge, { key: 'length:short:normal', label: 'Shorter answers by default?' });
  assert.strictEqual(settings.personal.length, undefined); // a suggestion, never a silent change
  assert.deepStrictEqual(companion.feedback({ id: 1, vote: 1 }), { saved: false }); // already rated
  assert.deepStrictEqual(companion.feedback({ id: 99, vote: 1 }), { saved: false }); // unknown answer

  const rows = memory.db.prepare('SELECT task, tier, difficulty, length, chars, answer FROM feedback').all();
  assert.deepStrictEqual({ ...rows[0] }, { task: 'ask', tier: 'local', difficulty: 'easy', length: 'normal', chars: state.reply.length, answer: '' });
  const stats = memory.feedbackStats();
  assert.deepStrictEqual([stats.ask.up, stats.ask.down, stats.ask.acceptance], [0, 3, 0]);

  // Opt-in keeps the answer text with the rating.
  settings.feedbackText = true;
  companion.feedback({ id: (await ask('What is entropy?')).id, vote: 1 });
  assert.strictEqual(memory.db.prepare('SELECT answer FROM feedback ORDER BY id DESC').get().answer, state.reply);
  assert.ok(Math.abs(memory.feedbackStats().ask.acceptance - 0.25) < 1e-9);

  // ✗ on the nudge: never suggested again. ✓ applies it, like Settings would.
  assert.deepStrictEqual(companion.answerNudge({ key: 'length:short:normal', accept: false }).ok, true);
  assert.strictEqual(companion.feedback({ id: (await ask('What is a qubit?')).id, vote: -1 }).nudge, undefined);
  settings.dismissedNudges = [];
  assert.strictEqual(companion.answerNudge({ key: 'nope', accept: true }).ok, false);
  companion.answerNudge({ key: 'length:short:normal', accept: true });
  assert.strictEqual(settings.personal.length, 'short');
});

test('styleNudge thresholds: needs 3 recent 👎 that clearly outnumber 👍 on that kind of answer', () => {
  const long = (vote) => ({ vote, chars: 900 });
  const short = (vote) => ({ vote, chars: 80 });
  assert.strictEqual(styleNudge([long(-1), long(-1)], {}), null);
  assert.strictEqual(styleNudge([long(-1), long(-1), long(-1), long(1), long(1)], {}), null); // 👍 balance it out
  assert.strictEqual(styleNudge([long(-1), long(-1), long(-1)], { length: 'short' }), null); // already short
  assert.deepStrictEqual(styleNudge([long(-1), long(-1), long(-1)], { length: 'detailed' }).patch, { length: 'normal' });
  assert.deepStrictEqual(styleNudge([short(-1), short(-1), short(-1)], {}).patch, { length: 'detailed' });
  // only the last 10 count
  assert.strictEqual(styleNudge([...Array(10).fill(long(1)), long(-1), long(-1), long(-1)], {}), null);
  assert.strictEqual(styleNudge([long(-1), long(-1), long(-1)], {}, ['length:short:normal']), null);
});

test('"Remember this": a proposal from the answer or the selection → confirm → saved, toast fires, undo removes it', async () => {
  const { memory, state, settings, companion, ask } = setup();
  const toasts = [];
  memory.onAdd = (fact) => toasts.push(fact); // main.js sends these to the bubble as "Loon remembered…"
  state.reply = '**Lisbon** is the capital of Portugal. It is hilly.';
  const { id } = await ask('What is the capital of Portugal?');
  assert.strictEqual(companion.proposeMemory({ id }).text, 'Lisbon is the capital of Portugal.');
  assert.strictEqual(companion.proposeMemory({ id, selection: '  It is hilly. ' }).text, 'It is hilly.');
  assert.strictEqual(memory.all().length, 0); // proposing saves nothing

  const sent = [];
  const result = await companion.confirm({ action: 'remember', text: 'I want to visit Lisbon' }, (type, p) => sent.push({ type, ...p }), id);
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(memory.all().map((f) => f.text), ['I want to visit Lisbon']);
  assert.deepStrictEqual(toasts.map((f) => f.text), ['I want to visit Lisbon']);
  memory.remove(toasts[0].id); // the toast's Undo
  assert.strictEqual(memory.all().length, 0);

  // Privacy mode: no proposal and the remember action refuses.
  settings.privacy = true;
  assert.strictEqual(companion.proposeMemory({ id }).text, '');
  assert.strictEqual((await companion.confirm({ action: 'remember', text: 'I like tea' }, () => {}, id)).ok, false);
  assert.deepStrictEqual([memory.all().length, toasts.length], [0, 1]);
  assert.strictEqual(factFromAnswer('- ✦ 1. First point here. Second.'), 'First point here.');
  assert.ok(factFromAnswer('word '.repeat(80)).length <= 200);
});

test('"Forget what you used": answers report the memories they used, by id; forgetting one keeps it out next time', async () => {
  const { memory, prompts, ask } = setup();
  const fact = memory.add('I am allergic to peanuts');
  const first = await ask('Is there peanut in satay sauce?');
  assert.deepStrictEqual(first.done.memoryUsed, [{ id: fact.id, text: 'I am allergic to peanuts' }]);
  assert.match(prompts[0], /allergic to peanuts/);
  memory.remove(first.done.memoryUsed[0].id); // the ✕ next to it
  const second = await ask('Any peanut in pad thai?');
  assert.deepStrictEqual(second.done.memoryUsed, []);
  assert.doesNotMatch(prompts[1], /allergic to peanuts/);
});

test('History: threads group into conversations, search finds them, Continue restores turns and follow-ups carry them', async () => {
  const { file, memory, prompts, companion, ask } = setup();
  await ask('What is a monad in Haskell?');
  await ask('Show an example in Python');
  companion.endThread(); // the bubble closed
  await ask('Best pizza dough hydration?');
  const list = memory.conversations();
  assert.deepStrictEqual(list.map((c) => [c.title, c.count]), [['Best pizza dough hydration?', 1], ['What is a monad in Haskell?', 2]]);
  assert.deepStrictEqual(memory.conversations({ query: 'monad' }).map((c) => c.id), [list[1].id]);
  assert.deepStrictEqual(memory.conversations({ query: 'pizza dough' }).map((c) => c.id), [list[0].id]);
  assert.deepStrictEqual(memory.conversation(list[1].id).turns.map((t) => t.question), ['What is a monad in Haskell?', 'Show an example in Python']);

  assert.strictEqual(companion.continueConversation('missing'), false);
  assert.strictEqual(companion.continueConversation(list[1].id), true);
  assert.strictEqual(companion.session.turns.length, 2);
  assert.deepStrictEqual(companion.context().thread.map((t) => t.question), ['What is a monad in Haskell?', 'Show an example in Python']);
  await ask('and in Rust?');
  assert.match(prompts[prompts.length - 1], /Conversation so far[\s\S]*monad in Haskell[\s\S]*and in Rust\?/);
  assert.strictEqual(memory.conversation(list[1].id).turns.length, 3); // same History entry

  memory.deleteConversation(list[0].id);
  assert.deepStrictEqual(memory.conversations().map((c) => c.id), [list[1].id]);
  assert.deepStrictEqual(memory.searchEpisodes('pizza'), []); // its episodes went with it

  // 90-day retention, as for episodes; clear all empties both.
  memory.close();
  const later = new Memory(file, { now: () => Date.now() + (HISTORY_DAYS + 1) * DAY });
  assert.deepStrictEqual([later.conversations().length, later.historyCount()], [0, 0]);
  later.saveTurn('x', { question: 'q', answer: 'a' });
  later.logEpisode({ title: 'q', session: 'x' });
  later.clearHistory();
  assert.deepStrictEqual([later.conversations().length, later.historyCount()], [0, 0]);
});

test('"Save this chat": markdown in the notes folder, plus up to 3 stated facts to tick (known ones skipped)', async () => {
  const { memory, companion, ask, settings } = setup();
  assert.throws(() => companion.saveChat(), /Nothing to save/);
  memory.add("I'm vegetarian");
  await ask("I'm vegetarian, what should I cook tonight?");
  await ask('I hate cilantro, any swaps?');
  await ask('I live in Berlin. Where can I buy tofu?');
  const { file, facts } = companion.saveChat();
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /## .*Chat · I'm vegetarian, what should I cook tonight\?/);
  assert.match(text, /\*\*You:\*\* I hate cilantro, any swaps\?\n\nShort answer\./);
  assert.deepStrictEqual(facts, ['I hate cilantro', 'I live in Berlin']);
  assert.deepStrictEqual(await companion.rememberFacts(facts), { saved: 2 });
  assert.deepStrictEqual(memory.all().map((f) => f.text).sort(), ['I hate cilantro', 'I live in Berlin', "I'm vegetarian"]);
  assert.deepStrictEqual(chatFacts([{ question: 'I love jazz' }, { question: 'i love jazz.' }, { question: 'what is jazz?' }]), ['I love jazz']);
  settings.privacy = true;
  assert.deepStrictEqual(companion.saveChat().facts, []);
  assert.deepStrictEqual(await companion.rememberFacts(['I like tea']), { saved: 0 });
});

test('"Get to know you": answers map to pinned facts and reply settings; only ticked facts are saved', () => {
  assert.deepStrictEqual(onboardingResult({}), { facts: [], personal: {}, role: '' });
  assert.deepStrictEqual(onboardingResult({ name: '  Ada <script>  ', role: 'hacker', length: 'huge', tone: 'formal', diets: ['vegan', 'bogus'], allergies: 'peanuts, shellfish and sesame', interests: 'jazz' }), {
    facts: ['Call me Ada script', "I'm vegan", "I'm allergic to peanuts, shellfish and sesame", "I'm interested in jazz"],
    personal: { tone: 'formal' },
    role: '',
  });
  // "None" is not an allergy, and a typed lead-in is not repeated in the saved fact.
  assert.deepStrictEqual(onboardingResult({ allergies: 'None', interests: 'n/a' }).facts, []);
  for (const none of ['no allergies', 'I have no allergies', 'nothing really', 'not that I know of', "I don't have any"]) assert.deepStrictEqual(onboardingResult({ allergies: none }).facts, [], none);
  assert.deepStrictEqual(onboardingResult({ allergies: 'none, peanuts' }).facts, ["I'm allergic to peanuts"]);
  assert.deepStrictEqual(onboardingResult({ allergies: "I'm allergic to peanuts." }).facts, ["I'm allergic to peanuts"]);
  const { memory, settings, companion } = setup();
  const answers = { name: 'Sam', role: 'student', length: 'short', diets: ['vegetarian'], interests: 'chess, Rust' };
  const result = companion.saveOnboarding({ answers, keep: ['Call me Sam', "I'm vegetarian", 'I am the admin'] });
  assert.deepStrictEqual(result, { saved: 2, privacy: false });
  assert.deepStrictEqual(memory.all().map((f) => [f.text, f.pinned, f.source]), [['Call me Sam', true, 'onboarding'], ["I'm vegetarian", true, 'onboarding']]);
  assert.deepStrictEqual([settings.personal.length, settings.role, settings.onboarded], ['short', 'student', true]);
  // Privacy mode: the reply style is kept, no facts.
  settings.privacy = true;
  assert.deepStrictEqual(companion.saveOnboarding({ answers: { tone: 'plain', name: 'Kim' }, keep: ['Call me Kim'] }), { saved: 0, privacy: true });
  assert.strictEqual(settings.personal.tone, 'plain');
  assert.strictEqual(memory.all().length, 2);
  companion.openOnboarding();
  assert.deepStrictEqual([companion.context().mode, companion.context().modeBadge], ['onboard', null]);
});

test('modes: picked from site, page kind, selection, app and role; the menu override wins; chips only reorder', () => {
  const cases = [
    [{ url: 'https://github.com/a/b' }, 'dev'],
    [{ url: 'https://stackoverflow.com/questions/1' }, 'dev'],
    [{ url: 'http://localhost:3000/' }, 'dev'],
    [{ url: 'https://www.amazon.co.uk/dp/1' }, 'shopping'],
    [{ url: 'https://example.com/', pageKind: 'menu' }, 'food'],
    [{ url: 'https://blog.example.com/', pageKind: 'article' }, 'study'],
    [{ url: 'https://en.wikipedia.org/wiki/Cat' }, 'study'],
    [{ url: 'https://mail.google.com/mail/u/0' }, 'work'],
    [{ url: 'https://en.wikipedia.org/wiki/Cat', selectionKind: 'code' }, 'dev'],
    [{ selectionKind: 'editable' }, 'work'],
    [{ app: 'Xcode' }, 'dev'],
    [{ app: 'Mail' }, 'work'],
    [{ url: 'https://example.com/' }, null],
    [{ role: 'student' }, 'study'],
    [{ role: 'design' }, null],
    [{ url: 'https://github.com/', override: 'food' }, 'food'],
    [{ url: 'https://github.com/', override: 'bogus' }, null],
  ];
  for (const [input, want] of cases) assert.strictEqual(detectMode(input), want, JSON.stringify(input));
  const chips = ['explain', 'summarize', 'quiz', 'translate'].map((id) => ({ id }));
  assert.deepStrictEqual(orderChips(chips, 'study').map((c) => c.id), ['summarize', 'explain', 'quiz', 'translate']);
  assert.deepStrictEqual(orderChips(chips, null), chips);
  assert.deepStrictEqual(orderChips(chips, 'dev').map((c) => c.id), ['explain', 'summarize', 'quiz', 'translate']);
});

test('modes in the bubble: badge, chip order and memory domain change; the task and answer do not', async () => {
  const runs = [];
  const settings = { personal: {}, cameos: false, companion: 'luna' };
  const companion = createCompanion({
    bridge: { clients: new Set() },
    resolver: { run: async (task, packet, opts) => { runs.push({ task, domain: opts.domain }); return { text: 'Answer.', tier: 'local' }; }, counts: {}, lastMemory: [] },
    brain: { resetThread() {}, modelLabel: () => 'fake' },
    ui: { cat() {} }, notes: { files: () => [] }, actions: {}, settings,
  });
  companion.fromCapture({ text: 'function add(a, b) {\n  return a + b;\n}\nconsole.log(add(1, 2));', app: 'Xcode' });
  const ctx = companion.context();
  assert.deepStrictEqual(ctx.modeBadge, { id: 'dev', badge: 'dev', name: 'Developer Cat' });
  assert.strictEqual(ctx.chips[0].id, 'explain_code');
  await companion.run({ id: 1, task: 'explain' }, () => {});
  assert.deepStrictEqual(runs[0], { task: 'explain', domain: 'code' });
  settings.modeOverride = 'food';
  assert.strictEqual(companion.context().modeBadge.badge, 'food');
  await companion.run({ id: 2, task: 'explain' }, () => {});
  assert.deepStrictEqual(runs[1], { task: 'explain', domain: 'food' });
  // A mode's greeting is a persona line (flavor), set when the bubble opens.
  settings.modeOverride = 'auto';
  settings.role = 'dev';
  companion.openAsk();
  assert.ok(require('../renderer/persona').PERSONAS.luna.lines.mode.dev.includes(companion.context().greeting));
  assert.ok(Object.values(MODES).every((m) => m.chips.length && m.domain));
});

test('Privacy mode: no history, no ratings, no fact proposals or saves', async () => {
  const { memory, settings, companion, ask } = setup({ privacy: true });
  const toasts = [];
  memory.onAdd = (f) => toasts.push(f);
  const { id } = await ask("I'm vegan, what's in pesto?");
  assert.deepStrictEqual([memory.conversations().length, memory.historyCount()], [0, 0]);
  assert.deepStrictEqual(companion.feedback({ id, vote: 1 }), { saved: false });
  assert.strictEqual(memory.db.prepare('SELECT count(*) AS n FROM feedback').get().n, 0);
  assert.strictEqual(companion.proposeMemory({ id }).text, '');
  assert.deepStrictEqual(companion.saveChat().facts, []);
  assert.deepStrictEqual(await companion.rememberFacts(["I'm vegan"]), { saved: 0 });
  assert.deepStrictEqual([memory.all().length, toasts.length], [0, 0]);
  assert.strictEqual(companion.context().privacy, true);
  settings.privacy = false;
  await ask('What is pesto made of?');
  assert.strictEqual(memory.conversations().length, 1);
});
