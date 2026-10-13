// Memory as a folder you can open (brain/memory-files.js, DESIGN.md §3.12.4): memory.db → Markdown files → edits back,
// conflicts kept, Privacy mode writes nothing, "Forget everything" clears the folder. Real memory.db, temp folders.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Memory } = require('../brain/memory');
const { MemoryFiles, parseFile, linkify } = require('../brain/memory-files');

function setup({ privacy = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-mdmem-'));
  const memory = new Memory(path.join(root, 'memory.db'));
  const settings = { privacy, memoryFiles: true };
  const dir = path.join(root, 'Memory');
  const files = new MemoryFiles({ dir, memory, notesDir: root, enabled: () => settings.memoryFiles !== false && !settings.privacy });
  const read = (rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
  const edit = (rel, fn) => fs.writeFileSync(path.join(dir, rel), fn(read(rel)));
  const texts = () => memory.all().map((f) => f.text).sort();
  return { root, dir, memory, files, settings, read, edit, texts };
}

test('mirror: facts become Obsidian files with ids, wikilinks and a README', () => {
  const { dir, memory, files, read } = setup();
  const name = memory.add('My name is Akankshya');
  const veg = memory.add("I'm vegetarian");
  memory.add('My sister Priya is working on Loon with me');
  memory.add('My sister Priya likes chess');
  memory.add('I am working on Loon in JavaScript');
  memory.add('I prefer dark mode');
  const report = files.sync();
  assert.ok(report.written >= 4);

  const about = read('About me.md');
  assert.match(about, /^---\nloon: memory\nkind: about-me\n/);
  assert.match(about, new RegExp(`facts: \\[${name.id}\\]`));
  assert.match(about, new RegExp(`- My name is Akankshya \\^${name.id}`));
  assert.match(read('Food.md'), new RegExp(`- I'm vegetarian \\^${veg.id}`));
  assert.match(read('Preferences.md'), /- I prefer dark mode \^/);
  const priya = read(path.join('People', 'Priya.md'));
  assert.match(priya, /^---\nloon: memory\nkind: person\nid: "priya"/m);
  assert.match(priya, /- My sister Priya is working on \[\[Loon\]\] with me \^/);
  assert.match(priya, /- My sister Priya likes chess \^/);
  assert.match(priya, /Related: \[\[Loon\]\]/);
  const loon = read(path.join('Projects', 'Loon.md'));
  assert.match(loon, /- I am working on Loon in JavaScript \^/); // JavaScript is a node without a file: no dangling link
  assert.match(loon, /Related: .*\[\[Priya\]\]/);
  assert.ok(!fs.existsSync(path.join(dir, 'Tools')), 'only people and projects get their own files');
  assert.match(read('README.md'), /readable copy of what Loon remembers/);
  assert.match(read('README.md'), new RegExp(`notes are plain Markdown too, one file per day, in ${path.dirname(dir).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  // Nothing changed → nothing written again.
  assert.strictEqual(files.sync().written, 0);
});

test('round trip: edit a line → fact updated; delete a line → fact removed; new line → unpinned fact from the file', () => {
  const { memory, files, edit, read, texts } = setup();
  const dark = memory.add('I prefer dark mode');
  const tabs = memory.add('I prefer tabs over spaces');
  files.sync();

  edit('Preferences.md', (s) => s.replace('I prefer dark mode', 'I prefer light mode in the morning'));
  let report = files.sync();
  assert.strictEqual(report.updated, 1);
  assert.strictEqual(memory.get(dark.id).text, 'I prefer light mode in the morning');

  edit('Preferences.md', (s) => s.split('\n').filter((l) => !l.endsWith(`^${tabs.id}`)).join('\n'));
  report = files.sync();
  assert.strictEqual(report.removed, 1);
  assert.strictEqual(memory.get(tabs.id), null);

  edit('Preferences.md', (s) => `${s}- I avoid dairy in coffee\n`);
  report = files.sync();
  assert.strictEqual(report.added, 1);
  const added = memory.all().find((f) => f.text === 'I avoid dairy in coffee');
  assert.deepStrictEqual([added.source, added.pinned], ['file', false]);
  assert.match(read('Food.md'), new RegExp(`I avoid dairy in coffee \\^${added.id}`), 'the new line gets its id and moves to its topic file');
  assert.doesNotMatch(read('Preferences.md'), /oat milk/);
  assert.deepStrictEqual(texts(), ['I avoid dairy in coffee', 'I prefer light mode in the morning']);
  assert.strictEqual(files.sync().added, 0, 'a line is imported once');
});

test('pins follow About me.md; Loon-side changes flow out; wikilink aliases round-trip', () => {
  const { memory, files, edit, read } = setup();
  const f = memory.add('I prefer window seats');
  files.sync();
  const line = read('Preferences.md').split('\n').find((l) => l.endsWith(`^${f.id}`));
  edit('Preferences.md', (s) => s.replace(`${line}\n`, ''));
  // About me.md didn't exist yet: a file the user creates is read too.
  fs.writeFileSync(path.join(files.dir, 'About me.md'), `# About me\n\n${line}\n`);
  files.sync();
  assert.strictEqual(memory.get(f.id).pinned, true);
  assert.strictEqual(memory.get(f.id).text, 'I prefer window seats');

  memory.update(f.id, 'I prefer aisle seats');
  files.sync();
  assert.match(read('About me.md'), new RegExp(`- I prefer aisle seats \\^${f.id}`));

  assert.strictEqual(linkify('my sister priya called', ['Priya']), 'my sister [[Priya|priya]] called');
  assert.deepStrictEqual(parseFile('---\nfacts: [a]\n---\n# T\n\n- my sister [[Priya|priya]] called ^abc-1\n* [ ] plain one\nRelated: [[X]]\n'), [
    { id: 'abc-1', text: 'my sister priya called' },
    { id: null, text: 'plain one' },
  ]);
});

test('conflicts keep both and get flagged; deleting the review file clears the flags', () => {
  const { dir, memory, files, edit, read, texts } = setup();
  const f = memory.add('I prefer green tea');
  files.sync();
  edit('Preferences.md', (s) => s.replace('green tea', 'black tea'));
  memory.update(f.id, 'I prefer jasmine tea'); // changed in Loon too, before the file was synced
  const report = files.sync();
  assert.strictEqual(report.conflicts, 1);
  assert.deepStrictEqual(texts(), ['I prefer black tea', 'I prefer jasmine tea']);
  assert.match(read('Needs a look.md'), /You changed "I prefer green tea" to "I prefer black tea" in Preferences.md, and Loon has "I prefer jasmine tea". I kept both./);

  // A line deleted in the file after Loon edited it: Loon's newer text is kept.
  const g = memory.add('I prefer trains');
  files.sync();
  memory.update(g.id, 'I prefer night trains');
  edit('Preferences.md', (s) => s.split('\n').filter((l) => !l.endsWith(`^${g.id}`)).join('\n'));
  files.sync();
  assert.strictEqual(memory.get(g.id).text, 'I prefer night trains');

  // An edited line whose fact was deleted in Loon meanwhile: the user's words survive.
  const h = memory.add('I prefer paper books');
  files.sync();
  edit('Preferences.md', (s) => s.replace('paper books', 'paper books and audiobooks'));
  memory.remove(h.id);
  files.sync();
  assert.ok(texts().includes('I prefer paper books and audiobooks'));

  fs.rmSync(path.join(dir, 'Needs a look.md'));
  files.sync();
  assert.ok(!fs.existsSync(path.join(dir, 'Needs a look.md')));
});

test('safety: a wiped folder is rewritten, never read as "delete everything"', () => {
  const { dir, memory, files, texts } = setup();
  memory.add('I prefer dark mode');
  memory.add("I'm vegetarian");
  files.sync();
  for (const name of fs.readdirSync(dir)) if (name.endsWith('.md')) fs.rmSync(path.join(dir, name));
  const report = files.sync();
  assert.strictEqual(report.removed, 0);
  assert.strictEqual(texts().length, 2);
  assert.ok(fs.existsSync(path.join(dir, 'Food.md')));

  // Deleting one whole file is a choice the user made: its memories go.
  fs.rmSync(path.join(dir, 'Food.md'));
  assert.strictEqual(files.sync().removed, 1);
  assert.deepStrictEqual(texts(), ['I prefer dark mode']);
});

test('Privacy mode and the Settings toggle: no reads, no writes', () => {
  const { dir, memory, files, settings, edit } = setup({ privacy: true });
  memory.add('I prefer dark mode');
  assert.deepStrictEqual(files.sync(), { updated: 0, added: 0, removed: 0, conflicts: 0, written: 0 });
  assert.ok(!fs.existsSync(dir));
  settings.privacy = false;
  files.sync();
  assert.ok(fs.existsSync(path.join(dir, 'Preferences.md')));
  settings.memoryFiles = false;
  edit('Preferences.md', (s) => s.replace('dark', 'light'));
  memory.add('I prefer tea');
  files.sync();
  assert.strictEqual(memory.all()[0].text, 'I prefer dark mode', 'edits wait until the copy is back on');
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'Preferences.md'), 'utf8'), /tea/);
});

test('"Forget everything" clears the folder, keeping files the user made', () => {
  const { dir, memory, files } = setup();
  memory.add('My sister Priya likes chess');
  memory.add('I prefer dark mode');
  files.sync();
  fs.writeFileSync(path.join(dir, 'My own notes.txt'), 'mine');
  memory.clear();
  files.clear();
  assert.deepStrictEqual(fs.readdirSync(dir), ['My own notes.txt']);
  fs.rmSync(path.join(dir, 'My own notes.txt'));
  files.clear();
  assert.ok(!fs.existsSync(dir));
  files.sync(); // nothing remembered → nothing recreated
  assert.ok(!fs.existsSync(dir));
});
