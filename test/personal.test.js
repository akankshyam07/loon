const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { extract, domainForTask, formatAbout, ME } = require('../brain/graph');
const { instructionsBlock, parseFeedback, suggestMemory, secondPerson, profileSummary, cleanPersonal } = require('../brain/personal');
const { Memory } = require('../brain/memory');
const { Resolver } = require('../brain/resolve');
const { SYSTEM_PROMPT } = require('../brain/ai');
const { parseCommand } = require('../brain/commands');
const { createCompanion } = require('../main/companion');
const { normalizeVector } = require('../brain/embed');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'loon-personal-'));
const entities = (text, opts) => extract(text, opts).entities.map((e) => [e.label, e.kind, e.domain, e.subdomain]);

test('graph: entities, kinds, domains and subdomains from plain facts', () => {
  const cases = [
    ["I'm learning Spring Boot for my internship at Acme", [['Acme', 'org', 'work', 'Acme'], ['Spring Boot', 'tool', 'code', 'Java']]],
    ['I work at Globex Corporation as a data analyst', [['Globex Corporation', 'org', 'work', 'Globex Corporation']]],
    ['I am vegetarian', [['vegetarian', 'preference', 'food', 'diet']]],
    ['I am allergic to peanuts', [['peanuts', 'preference', 'food', 'allergies']]],
    ['I prefer Sony headphones', [['headphones', 'topic', 'shopping', 'electronics'], ['Sony', 'org', 'shopping', 'brands']]],
    ['I hate cilantro', [['cilantro', 'topic', 'food', 'cuisine']]],
    ['My boss Priya likes short status updates', [['Priya', 'person', 'work', 'colleagues']]],
    ['I live in Berlin', [['Berlin', 'place', 'personal', 'home']]],
    ['Planning a trip to Lisbon in May', [['Lisbon', 'place', 'travel', 'destinations']]],
    ['I use github.com for side projects in Rust', [['Rust', 'tool', 'code', 'Rust'], ['github.com', 'site', 'code', 'sites']]],
    ['I love Thai food and spicy ramen', [['thai', 'topic', 'food', 'cuisine'], ['ramen', 'topic', 'food', 'cuisine']]],
    ['My CS 231 course is on Tuesdays', [['CS 231', 'topic', 'study', 'CS 231']]],
    ['I build apps in C++, C# and Node.js', [['Node.js', 'tool', 'code', 'JavaScript'], ['C++', 'tool', 'code', 'C++'], ['C#', 'tool', 'code', 'C#']]],
    ['I go to the gym three times a week', [['gym', 'topic', 'health', 'fitness']]],
    ['Dinner parties stress me out', []],
    ['Filler preference number 3 about gardening', []],
  ];
  for (const [fact, want] of cases) assert.deepStrictEqual(entities(fact), want, fact);
  // Local project names come from brain/projects.js discovery.
  assert.deepStrictEqual(entities('I am working on Loon with Electron', { projects: ['Loon'] })[0], ['Loon', 'project', 'code', 'Loon']);
  const typed = extract("I'm learning Spring Boot for my internship at Acme").entities;
  assert.deepStrictEqual(typed.map((e) => e.relation), ['works at', 'learning']);
  assert.strictEqual(extract('I prefer Sony headphones').entities.every((e) => e.relation === 'prefers'), true);
  assert.deepStrictEqual([domainForTask('food_lightest'), domainForTask('find_bug'), domainForTask('ask', 'amazon.com'), domainForTask('ask', 'example.org')], ['food', 'code', 'shopping', '']);
});

test('graph: facts become nodes with co-occurrence and typed edges; deleting a fact cleans up', () => {
  const memory = new Memory(path.join(tmp(), 'memory.db'));
  const a = memory.add("I'm learning Spring Boot for my internship at Acme");
  memory.add('Spring Boot annotations confuse me');
  const { nodes, edges } = memory.graph();
  assert.deepStrictEqual(nodes.map((n) => n.id).sort(), [ME, 'acme', 'spring boot']);
  const related = edges.find((e) => e.relation === 'related');
  assert.deepStrictEqual([related.src, related.dst, related.weight], ['acme', 'spring boot', 1]);
  assert.ok(edges.some((e) => e.src === ME && e.dst === 'acme' && e.relation === 'works at'));
  assert.deepStrictEqual(memory.nodeFacts('spring boot').facts.length, 2);

  memory.remove(a.id);
  assert.deepStrictEqual(memory.graph().nodes.map((n) => n.id).sort(), [ME, 'spring boot']);
  assert.deepStrictEqual(memory.graph().edges, []);
  memory.removeNode('spring boot');
  assert.strictEqual(memory.all().length, 1); // forgetting a node never deletes facts
  memory.clear();
  assert.deepStrictEqual(memory.graph().nodes.map((n) => n.id), [ME]);
});

test('graph recall: a mentioned node pulls in linked facts, one hop reaches facts with no shared words', () => {
  const memory = new Memory(path.join(tmp(), 'memory.db'));
  memory.add("I'm learning Spring Boot for my internship at Acme");
  memory.add('Spring Boot annotations confuse me');
  memory.add('I prefer Sony headphones'); // linked to "You" like the Acme fact, but the walk never goes through "You"
  memory.add('I own a red bicycle');
  const recalled = memory.forGroup('writing', 'what should I review for Acme');
  assert.deepStrictEqual(recalled, ["I'm learning Spring Boot for my internship at Acme", 'Spring Boot annotations confuse me']);
  assert.ok(memory.graph().nodes.find((n) => n.id === 'acme').uses >= 1);

  // Same-domain boost: a code task prefers the code fact when both match equally.
  const boosted = new Memory(path.join(tmp(), 'memory.db'));
  boosted.add('Python dinner recipes are my weekend thing');
  boosted.add('Python type hints confuse me');
  assert.strictEqual(boosted.forGroup('writing', 'python', '', 'code')[0], 'Python type hints confuse me');
  assert.strictEqual(boosted.forGroup('writing', 'python', '', 'food')[0], 'Python dinner recipes are my weekend thing');

  assert.deepStrictEqual(parseCommand('what do you know about Acme?'), { action: 'recall', about: 'Acme' });
  assert.deepStrictEqual(parseCommand('What do you know about me?'), { action: 'recall', facts: true });
  const answer = formatAbout(memory.about('acme'), 'Acme');
  assert.match(answer, /\*\*Acme\*\* · org · work/);
  assert.match(answer, /You: works at/);
  assert.match(answer, /Connected to: Spring Boot/);
  assert.match(answer, /internship at Acme/);
  assert.match(formatAbout(memory.about('bicycle'), 'bicycle'), /red bicycle/); // no node: falls back to text search
  assert.match(formatAbout(memory.about('volcanoes'), 'volcanoes'), /don't know anything/);
});

test('memory: an old database without the graph tables is migrated and its facts linked', () => {
  const file = path.join(tmp(), 'memory.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE facts (id TEXT PRIMARY KEY, text TEXT NOT NULL, category TEXT NOT NULL, scope TEXT NOT NULL DEFAULT '',
    pinned INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'user', created INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, uses INTEGER NOT NULL DEFAULT 0, vec BLOB);
    INSERT INTO facts (id, text, category, created) VALUES ('old1', 'I work at Initech', 'project', 1);`);
  old.close();
  const memory = new Memory(file);
  assert.deepStrictEqual(memory.all().map((f) => f.text), ['I work at Initech']);
  assert.deepStrictEqual(memory.graph().nodes.map((n) => n.id).sort(), [ME, 'initech']);
  assert.deepStrictEqual(memory.forGroup('writing', 'anything new at initech?'), ['I work at Initech']);
  memory.close();
  const again = new Memory(file); // reopening doesn't relink or duplicate
  assert.strictEqual(again.graph().edges.length, 1);
  again.close();
});

test('consolidation merges duplicates (same text or near-identical vectors) and nothing else', async () => {
  let clock = 1000;
  const vectors = { 'I love hiking': [1, 0, 0], 'Hiking is something I love': [0.99, 0.05, 0], 'I hate hiking': [0, 1, 0] };
  const embedder = { available: () => true, cached: () => null, embed: async (t) => (vectors[t] ? normalizeVector(vectors[t]) : null) };
  const memory = new Memory(path.join(tmp(), 'memory.db'), { now: () => clock++, embedder });
  const first = memory.add("I'm vegetarian.");
  memory.pin(first.id, true);
  memory.add('i’m  vegetarian'); // same normalized text, newer wording
  memory.add('I love hiking');
  memory.add('Hiking is something I love');
  memory.add('I hate hiking');
  memory.add("I'm vegetarian", 'user', { scope: 'doordash.com' }); // different scope: kept
  await new Promise((resolve) => setImmediate(resolve)); // vectors are stored in the background
  assert.strictEqual(memory.consolidate(), 2);
  const texts = memory.all().map((f) => f.text).sort();
  assert.deepStrictEqual(texts, ['Hiking is something I love', 'I hate hiking', "I'm vegetarian", 'i’m  vegetarian'].sort());
  assert.strictEqual(memory.all().find((f) => f.text === 'i’m  vegetarian').pinned, true); // inherits the pin
  assert.strictEqual(memory.consolidate(), 0);
});

test('custom instructions sit right after the fixed system prompt, identical across requests', async () => {
  const dir = tmp();
  const prompts = [];
  const caps = [];
  const brain = { modelId: () => 'fake', chat: async (p, { onText, maxTokens }) => { prompts.push(p); caps.push(maxTokens); onText('[mood:happy] Sure.'); } };
  const settings = { personal: { about: 'I am a CS student.', style: 'Use bullet points.', length: 'short', tone: 'formal', emoji: false, language: 'Spanish' } };
  const memory = new Memory(path.join(dir, 'memory.db'));
  memory.add('I like concrete examples');
  const resolver = new Resolver({ brain, memory, settings, cacheFile: path.join(dir, 'c.json'), countsFile: path.join(dir, 'n.json') });
  const systemBefore = SYSTEM_PROMPT;
  await resolver.ask('Why is the sky blue?', { onText: () => {} });
  await resolver.run('explain', { source: 'selection', text: 'Rayleigh scattering of sunlight.' }, { onText: () => {} });
  const block = instructionsBlock(settings.personal);
  assert.ok(block.startsWith('User preferences'));
  for (const p of prompts) assert.ok(p.startsWith(`${block}\n\n`), p);
  assert.match(block, /About the user: I am a CS student\.[\s\S]*How to reply: Use bullet points\.[\s\S]*very short[\s\S]*formal[\s\S]*Do not use emoji\.[\s\S]*Reply in Spanish\./);
  assert.ok(prompts[0].indexOf('I like concrete examples') > prompts[0].indexOf('Why is the sky blue?')); // memory stays last
  assert.strictEqual(SYSTEM_PROMPT, systemBefore);
  assert.ok(!SYSTEM_PROMPT.includes('CS student'));
  assert.deepStrictEqual(caps, [240, 192]); // short replies: 60% of the task's token cap
  assert.strictEqual(instructionsBlock({}), ''); // defaults add nothing, so the prompt is exactly as before
  assert.doesNotMatch(instructionsBlock(settings.personal, { privacy: true }), /CS student/);
  assert.strictEqual(cleanPersonal({ about: 'x'.repeat(2000), length: 'huge', tone: 1 }).about.length, 600);
  assert.deepStrictEqual([cleanPersonal({ length: 'huge' }).length, cleanPersonal({ tone: 1 }).tone], ['normal', 'playful']);
  // a language typed with an emoji, a region code or extra spaces stays readable in "Reply in X."
  assert.deepStrictEqual(['Español 🇪🇸', 'pt-BR', '  Brazilian   Portuguese '].map((language) => cleanPersonal({ language }).language), ['Español', 'pt-BR', 'Brazilian Portuguese']);
});

test('"Remember this?" detection: stated preferences and facts only', () => {
  const yes = {
    "I'm vegetarian, what should I order here?": "I'm vegetarian",
    'btw i prefer dark roast coffee': 'I prefer dark roast coffee',
    'I hate cilantro so skip anything with it': 'I hate cilantro',
    'My name is Akku.': 'My name is Akku',
    'I work at Acme as a backend dev': 'I work at Acme as a backend dev',
    'call me Akku': 'Call me Akku',
    "I'm allergic to shellfish. Is this safe?": "I'm allergic to shellfish",
    "I don't eat pork": "I don't eat pork",
  };
  for (const [message, fact] of Object.entries(yes)) assert.strictEqual(suggestMemory(message), fact, message);
  const no = ['Am I vegetarian?', 'Do I prefer tea or coffee?', 'If I were vegan what would I eat?', "I'm not sure about this", 'I love this!',
    'I like it', "I'm looking for a cheap laptop", 'What is the capital of France?', 'I prefer?', "I'm a bit confused", 'remember to call mom'];
  for (const message of no) assert.strictEqual(suggestMemory(message), null, message);
  assert.strictEqual(secondPerson("I'm vegetarian"), "you're vegetarian");
  assert.strictEqual(secondPerson('My name is Akku'), 'your name is Akku');
  assert.strictEqual(secondPerson('Call me Akku'), 'you go by Akku');
});

test('feedback messages change the reply style in code, before the model', async () => {
  assert.deepStrictEqual(parseFeedback('shorter please'), { patch: { length: 'short' }, note: 'Got it, shorter from now on. Change it in Settings.' });
  assert.deepStrictEqual(parseFeedback('That was too long!').patch, { length: 'short' });
  assert.deepStrictEqual(parseFeedback('more detail').patch, { length: 'detailed' });
  assert.deepStrictEqual(parseFeedback('shorter', { length: 'detailed' }).patch, { length: 'normal' });
  assert.deepStrictEqual(parseFeedback('less emoji pls').patch, { emoji: false });
  assert.deepStrictEqual(parseFeedback('no more emoji').patch, { emoji: false });
  assert.deepStrictEqual(parseFeedback('can you be shorter next time?').patch, { length: 'short' });
  assert.deepStrictEqual(parseFeedback('talk less').patch, { length: 'short' });
  assert.deepStrictEqual(parseFeedback('Be more formal.').patch, { tone: 'formal' });
  assert.deepStrictEqual(parseFeedback('no jokes').patch, { tone: 'plain' });
  assert.deepStrictEqual(parseFeedback('reply in Spanish from now on').patch, { language: 'Spanish' });
  assert.deepStrictEqual(parseFeedback('answer in english').patch, { language: '' });
  for (const other of ['make this shorter', 'tell me more', 'why is it too long to load?', 'reply in markdown', 'what is formal logic']) assert.strictEqual(parseFeedback(other), null, other);

  // Through the companion: settings change, the note is the answer, the model is never called.
  const settings = { privacy: false, personal: {}, dismissedSuggestions: [] };
  const sent = [];
  let saves = 0;
  let modelCalls = 0;
  const memory = new Memory(path.join(tmp(), 'memory.db'));
  const companion = createCompanion({
    bridge: { clients: new Set() },
    resolver: { run: async () => { modelCalls++; return { text: 'Sure.', tier: 'local' }; }, counts: {}, lastMemory: [] },
    brain: { resetThread() {}, modelLabel: () => 'fake' },
    ui: { cat() {} },
    notes: { files: () => [] },
    actions: {},
    memory,
    settings,
    saveSettings: () => { saves++; },
  });
  const bubble = (type, payload) => sent.push({ type, ...payload });
  await companion.run({ id: 1, question: 'too long' }, bubble);
  assert.deepStrictEqual([settings.personal.length, saves, modelCalls], ['short', 1, 0]);
  assert.match(sent[0].message, /shorter from now on/);

  // A stated preference gets a confirm chip after the answer; nothing is saved until ✓.
  await companion.run({ id: 2, question: "I'm vegetarian, what's good here?" }, bubble);
  const chip = sent.find((m) => m.type === 'suggest');
  assert.deepStrictEqual([chip.text, chip.label], ["I'm vegetarian", "Remember that you're vegetarian?"]);
  assert.strictEqual(memory.all().length, 0);
  companion.dismissSuggestion(chip.text);
  sent.length = 0;
  await companion.run({ id: 3, question: "I'm vegetarian, what's good here?" }, bubble);
  assert.ok(!sent.some((m) => m.type === 'suggest')); // dismissed: never asked again

  // Privacy mode: no suggestions.
  settings.privacy = true;
  sent.length = 0;
  await companion.run({ id: 4, question: 'I prefer dark roast coffee' }, bubble);
  assert.ok(!sent.some((m) => m.type === 'suggest'));
});

test('privacy mode: no memory or graph in prompts, profile text left out', async () => {
  const dir = tmp();
  const prompts = [];
  const brain = { modelId: () => 'fake', chat: async (p, { onText }) => { prompts.push(p); onText('[mood:happy] Ok.'); } };
  const settings = { privacy: true, personal: { about: 'I intern at Acme.', length: 'short' } };
  const memory = new Memory(path.join(dir, 'memory.db'));
  memory.add("I'm learning Spring Boot for my internship at Acme");
  const resolver = new Resolver({ brain, memory, settings, cacheFile: path.join(dir, 'c.json'), countsFile: path.join(dir, 'n.json') });
  await resolver.ask('what should I study for Acme', { onText: () => {} });
  assert.doesNotMatch(prompts[0], /Spring Boot|intern at Acme/);
  assert.match(prompts[0], /very short/); // reply style still applies
  assert.strictEqual(memory.graph().nodes.find((n) => n.id === 'acme').uses, 0); // the graph wasn't even walked

  assert.deepStrictEqual(profileSummary([{ id: '1', text: 'My name is Akku', pinned: true }, { id: '2', text: 'I like tea', pinned: false }], settings.personal),
    [{ source: 'fact', id: '1', text: 'My name is Akku' }, { source: 'setting', key: 'about', text: 'I intern at Acme.' }, { source: 'setting', key: 'style', text: 'Likes short replies.' }]);
});
