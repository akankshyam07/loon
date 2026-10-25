const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseCommand, describe } = require('../brain/commands');
const { Notes } = require('../brain/notes');
const { makeQuiz, grade } = require('../brain/quiz');
const { Memory, categorize } = require('../brain/memory');
const { Actions, appleDate } = require('../main/actions');
const { Resolver } = require('../brain/resolve');
const { recommend, extractMenu } = require('../brain/food');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'loon-m4-'));
const NOW = new Date('2026-09-30T14:00:00');

test('commands: reminders, events, open, find, notes, memory; questions fall through', () => {
  const at5 = parseCommand('remind me to call mom at 5', NOW);
  assert.strictEqual(at5.action, 'reminder');
  assert.strictEqual(at5.title, 'call mom');
  assert.strictEqual(at5.when.getHours(), 17);
  assert.strictEqual(at5.when.getDate(), 30); // today, since 5pm hasn't happened yet
  assert.strictEqual(parseCommand('remind me to water plants', NOW).when, null);
  const event = parseCommand('schedule meeting with Sam next Tuesday 10am', NOW);
  assert.deepStrictEqual([event.action, event.title, event.start.getDay(), event.start.getHours()], ['event', 'meeting with Sam', 2, 10]);
  assert.deepStrictEqual(parseCommand('open github.com', NOW), { action: 'open', target: 'https://github.com', kind: 'url' });
  assert.deepStrictEqual(parseCommand('open Spotify', NOW), { action: 'open', target: 'Spotify', kind: 'app' });
  assert.deepStrictEqual(parseCommand('find my resume', NOW), { action: 'find', query: 'resume' });
  assert.deepStrictEqual(parseCommand('note: buy cat food', NOW), { action: 'note', text: 'buy cat food' });
  assert.deepStrictEqual(parseCommand('remember that I am vegetarian', NOW), { action: 'remember', text: 'I am vegetarian' });
  assert.strictEqual(parseCommand('what is the capital of France?', NOW), null);
  assert.match(describe(at5), /^Reminder: call mom, /);
});

test('notes: markdown per day, entries with sources, search', () => {
  const notes = new Notes(tmp());
  const file = notes.save({ title: 'Why cats love boxes', text: 'Enclosed spaces feel safe.', url: 'https://example.com/cats' });
  notes.save({ title: 'Quick note', text: 'Buy cat food' });
  assert.match(fs.readFileSync(file, 'utf8'), /^# Loon notes · [\s\S]*## \d\d:\d\d( [AP]M)? · Why cats love boxes\n\nEnclosed spaces feel safe\.\n\nSource: <https:\/\/example\.com\/cats>/);
  const entries = notes.entries();
  assert.strictEqual(entries.length, 2);
  assert.strictEqual(entries[1].source, 'https://example.com/cats');
  assert.strictEqual(notes.search('enclosed spaces')[0].heading.endsWith('Why cats love boxes'), true);
});

test('quiz: cloze cards with distinct answers; forgiving grading', () => {
  const text = 'Researchers in the Netherlands found that shelter cats given a hiding box adapted much faster. ' +
    'Enclosed spaces make cats feel safe from predators, which lowers their stress levels a great deal. ' +
    'Boxes also keep cats warm, because cats are comfortable at temperatures well above what humans prefer. ' +
    'Scientists think the habit comes from wild ancestors that hid in small dens to ambush their prey.';
  const quiz = makeQuiz(text, 3);
  assert.strictEqual(quiz.length, 3);
  assert.strictEqual(new Set(quiz.map((q) => q.answer.toLowerCase())).size, 3);
  assert.ok(quiz.every((q) => q.prompt.includes('_____')));
  assert.ok(grade('netherland', 'Netherlands'));
  assert.ok(grade('PREDATORS!', 'predators'));
  assert.ok(!grade('dog', 'cat'));
  assert.ok(!grade('', 'cat'));
});

test('memory: categories, per-task groups, forget', () => {
  const memory = new Memory(path.join(tmp(), 'memory.db'));
  assert.deepStrictEqual(['I am vegetarian', 'Keep emails casual', 'I like short answers'].map(categorize), ['diet', 'tone', 'preference']);
  memory.add('I am vegetarian');
  memory.add('I like short answers');
  assert.deepStrictEqual(memory.forGroup('food'), ['I am vegetarian']);
  assert.deepStrictEqual(memory.forGroup('default'), ['I like short answers']);
  assert.strictEqual(memory.forget(parseCommand('forget that I am vegetarian').text).length, 1);
  assert.strictEqual(memory.forget("I'm not vegetarian any more").length, 0); // already gone
  assert.strictEqual(memory.all().length, 1);
});

test('actions: executors only via execute, audit keeps metadata not content', async () => {
  const dir = tmp();
  const calls = [];
  const actions = new Actions({
    auditFile: path.join(dir, 'audit.jsonl'),
    notes: new Notes(path.join(dir, 'notes')),
    memory: new Memory(path.join(dir, 'memory.json')),
    openExternal: async () => {},
    executors: { reminder: async (c) => { calls.push(c); return 'Added to Reminders.'; }, find: async () => ['/tmp/a.pdf'] },
  });
  const result = await actions.execute({ action: 'reminder', title: 'call mom', when: new Date('2026-09-30T17:00:00') });
  assert.deepStrictEqual([result.ok, calls.length, calls[0].title], [true, 1, 'call mom']);
  assert.strictEqual((await actions.execute({ action: 'remember', text: 'I like short answers' })).ok, true);
  assert.strictEqual((await actions.execute({ action: 'find', query: 'resume' })).results.length, 1);
  const failed = await actions.execute({ action: 'event', title: 'x', start: new Date(), end: new Date() });
  assert.strictEqual(failed.ok, false);
  const audit = actions.recent();
  assert.strictEqual(audit.length, 4);
  assert.ok(!fs.readFileSync(path.join(dir, 'audit.jsonl'), 'utf8').includes('call mom'));
  assert.match(appleDate('d', new Date(2026, 1, 28, 9, 30)), /set day of d to 1\nset year of d to 2026\nset month of d to 2\nset day of d to 28\nset time of d to 34200/);
});

test('memory reaches prompts; privacy mode skips memory and the cache', async () => {
  const dir = tmp();
  const memory = new Memory(path.join(dir, 'memory.json'));
  memory.add('I like short answers');
  const prompts = [];
  const brain = { modelId: () => 'fake', chat: async (p, { onText }) => { prompts.push(p); onText('[mood:happy] Sure.'); } };
  const settings = { privacy: false };
  const resolver = new Resolver({ brain, memory, settings, cacheFile: path.join(dir, 'c.json'), countsFile: path.join(dir, 'n.json') });
  const ask = (q) => resolver.ask(q, { onText: () => {}, firstInThread: true });
  await ask('Why is the sky blue?');
  assert.match(prompts[0], /About the user[\s\S]*I like short answers/);
  assert.strictEqual((await ask('Why is the sky blue?')).tier, 'cache');
  settings.privacy = true;
  const privateAnswer = await ask('Why is the sky blue?');
  assert.strictEqual(privateAnswer.tier, 'local');
  assert.doesNotMatch(prompts[1], /I like short answers/);
});

test('saved diet memory filters menu picks without a model', () => {
  const items = extractMenu('Grilled Chicken Salad $14.50\nMixed greens, grilled chicken breast\nSteamed Veggie Dumplings $9.00\nCabbage, carrot and tofu in a light wrapper');
  const picks = recommend(items, 'lightest', { vegetarianOnly: true }).text;
  assert.match(picks, /Dumplings/);
  assert.doesNotMatch(picks, /Chicken/);
  assert.match(picks, /because you asked me to remember/);
});

test('memory store: profile, BM25 recall with site boost, budget, history search, legacy import', () => {
  const { ftsQuery, scopeOf } = require('../brain/memory');
  const dir = tmp();
  const legacy = path.join(dir, 'memory.json');
  fs.writeFileSync(legacy, JSON.stringify([{ text: 'I like short answers', createdAt: '2026-01-01T00:00:00Z', source: 'user' }]));
  let clock = Date.parse('2026-10-05T12:00:00Z');
  const memory = new Memory(path.join(dir, 'memory.db'), { legacyJson: legacy, now: () => clock });
  assert.ok(fs.existsSync(`${legacy}.imported`) && !fs.existsSync(legacy));
  memory.add('My name is Akku');
  memory.add('I am allergic to peanuts');
  memory.add('I prefer Sony headphones', 'user', { scope: 'amazon.com' });
  memory.add('I prefer Bose headphones');
  for (let i = 0; i < 40; i++) memory.add(`Filler preference number ${i} about gardening`);

  assert.strictEqual(ftsQuery('Which "laptop" is the cheapest?'), '"laptop"* OR "cheapest"*');
  assert.strictEqual(ftsQuery('a an ?'), '');
  assert.strictEqual(scopeOf({ url: 'https://www.amazon.com/dp/1' }), 'amazon.com');

  // Pinned profile first, then BM25 matches; "peanut" finds "peanuts" (porter + prefix).
  const food = memory.forGroup('food', 'is there peanut in this satay?');
  assert.strictEqual(food[0], 'My name is Akku');
  assert.ok(food.includes('I am allergic to peanuts'));
  // The same request on Amazon prefers the Amazon-scoped fact.
  const onAmazon = memory.forGroup('shopping', 'which headphones should I buy', 'amazon.com');
  assert.ok(onAmazon.indexOf('I prefer Sony headphones') < onAmazon.indexOf('I prefer Bose headphones'));
  // Never more than the budget, whatever is stored.
  assert.ok(memory.forGroup('default', 'gardening preference').join('').length <= 1200);
  assert.ok(memory.forGroup('default', 'gardening preference').length <= 8);

  memory.logEpisode({ kind: 'explain', title: 'Explain · Kubernetes pods', text: 'A pod is the smallest deployable unit.', scope: 'kubernetes.io' });
  clock += 3 * 86400000;
  memory.logEpisode({ kind: 'ask', title: 'best rice cooker under $80', text: 'The Zojirushi is pricier but...', scope: 'amazon.com' });
  assert.strictEqual(memory.searchEpisodes('kubernetes')[0].title, 'Explain · Kubernetes pods');
  assert.strictEqual(memory.searchEpisodes('')[0].title, 'best rice cooker under $80');
  assert.deepStrictEqual(memory.searchEpisodes('volcano'), []);
  clock += 91 * 86400000;
  memory.open(memory.file); // old history is dropped on open
  assert.strictEqual(memory.historyCount(), 0);
  memory.close();
  assert.deepStrictEqual(parseCommand('what did I look up about kubernetes?'), { action: 'recall', query: 'kubernetes' });
  assert.deepStrictEqual(parseCommand('What do you know about me?'), { action: 'recall', facts: true });
  assert.deepStrictEqual(parseCommand('what did I ask today'), { action: 'recall', query: '' });
});

test('menus with the name, description, price and calories on separate lines', () => {
  const text = 'Bowls\nHarvest Bowl\nroasted chicken, wild rice, apples, goat cheese, balsamic vinaigrette\n$14.95\n705 cal\nShroomami\nroasted tofu, portobello mix, kale, miso sesame ginger dressing\n$13.95\n655 cal\nSalads\nSuper Green Goddess\nchickpeas, cucumbers, broccoli, cabbage, green goddess ranch, vegan\n$12.75\n385 cal\nSides\nRosemary Focaccia\n$2.95\n270 cal';
  const items = extractMenu(text);
  assert.deepStrictEqual(items.map((i) => [i.name, i.price, i.calories]), [['Harvest Bowl', 14.95, 705], ['Shroomami', 13.95, 655], ['Super Green Goddess', 12.75, 385], ['Rosemary Focaccia', 2.95, 270]]);
  const lightest = recommend(items, 'lightest').text;
  assert.match(lightest, /Rosemary Focaccia\*\* \$2\.95 · 270 cal[\s\S]*Super Green Goddess[\s\S]*Calories as printed/);
  const veg = recommend(items, 'vegetarian').text;
  assert.doesNotMatch(veg, /Harvest Bowl/);
  assert.match(veg, /Shroomami/);
});
