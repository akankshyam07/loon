const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const projects = require('../brain/projects');
const { LeetcodeIndex, looksLikeRepo, slugOf } = require('../brain/leetcode');
const { parseCommand } = require('../brain/commands');
const { Actions } = require('../main/actions');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'loon-m6-'));

function makeRepo() {
  const dir = path.join(tmp(), 'cat-tracker');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'README.md'), '# Cat Tracker\n\n![badge](x.svg)\n\nTracks how many naps the cat takes per day.\nIt is very important.\n');
  fs.writeFileSync(path.join(dir, 'TODO.md'), '- [x] count naps\n- [ ] add a chart\n- [~] export CSV\n');
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['add', '.'], { cwd: dir, env });
  execFileSync('git', ['commit', '-qm', 'Count naps'], { cwd: dir, env });
  fs.writeFileSync(path.join(dir, 'chart.js'), '// wip\n');
  return dir;
}

test('briefing: commits, open TODOs, uncommitted work, last edits; git is read without locks', async () => {
  const dir = makeRepo();
  const snap = await projects.snapshot(dir);
  assert.strictEqual(snap.title, 'Cat Tracker');
  assert.strictEqual(snap.summary, 'Tracks how many naps the cat takes per day.');
  assert.strictEqual(snap.branch, 'main');
  assert.strictEqual(snap.commits[0].subject, 'Count naps');
  assert.strictEqual(snap.changed, 1);
  assert.deepStrictEqual(snap.todos.map((t) => [t.text, t.partial]), [['add a chart', false], ['export CSV', true]]);
  assert.strictEqual(snap.files[0].file, 'chart.js');
  assert.ok(!fs.existsSync(path.join(dir, '.git', 'index.lock')));
  const { text } = await projects.briefing([dir], 'cat tracker');
  assert.match(text, /\*\*Cat Tracker\*\*[\s\S]*Count naps[\s\S]*1 uncommitted change[\s\S]*\(half done\) export CSV/);
  assert.match((await projects.briefing([], null)).text, /Settings → Projects/);
});

test('leetcode: companies per problem from local CSVs, recent ones first', () => {
  const repo = tmp();
  const write = (company, file, rows) => {
    fs.mkdirSync(path.join(repo, company), { recursive: true });
    fs.writeFileSync(path.join(repo, company, file), `ID,URL,Title,Difficulty,Acceptance %,Frequency %\n${rows.join('\n')}\n`);
  };
  write('google', 'all.csv', ['1,https://leetcode.com/problems/two-sum,Two Sum,Easy,57%,100.0%']);
  write('acme-corp', 'all.csv', ['1,https://leetcode.com/problems/two-sum,Two Sum,Easy,57%,40.0%', '20,https://leetcode.com/problems/valid-parentheses,"Valid Parentheses, Again",Easy,41%,30.0%']);
  write('acme-corp', 'thirty-days.csv', ['1,https://leetcode.com/problems/two-sum,Two Sum,Easy,57%,40.0%']);
  assert.ok(looksLikeRepo(repo));
  assert.strictEqual(slugOf('https://leetcode.com/problems/two-sum/description/'), 'two-sum');
  const index = new LeetcodeIndex(repo, path.join(tmp(), 'idx.json'));
  const found = index.lookup('https://leetcode.com/problems/two-sum/');
  assert.strictEqual(found.count, 2);
  assert.match(found.text, /\*\*Two Sum\*\* \(Easy\) is asked at \*\*2\*\* companies\.\n\nAcme Corp 🔥 · Google/);
  assert.match(index.lookup('valid-parentheses').text, /Valid Parentheses, Again/);
  assert.strictEqual(index.lookup('no-such-problem'), null);
});

test('hub commands: catch-up and Shortcuts, with fuzzy Shortcut names', async () => {
  assert.deepStrictEqual(parseCommand('Where did I leave off?'), { action: 'briefing', project: null });
  assert.deepStrictEqual(parseCommand('what was I working on in Moonshot'), { action: 'briefing', project: 'Moonshot' });
  assert.deepStrictEqual(parseCommand('run the new note shortcut'), { action: 'shortcut', name: 'new note' });
  const ran = [];
  const actions = new Actions({
    auditFile: path.join(tmp(), 'audit.jsonl'),
    notes: null,
    memory: null,
    projects: () => [],
    executors: { shortcuts: async () => ['Open Breethe', 'New Note with Date', '♡ Instagram ♡'], shortcut: async (c) => { ran.push(c.name); return 'ok'; } },
  });
  assert.strictEqual(await actions.resolveShortcut('new note'), 'New Note with Date');
  assert.strictEqual(await actions.resolveShortcut('instagram'), '♡ Instagram ♡');
  assert.strictEqual(await actions.resolveShortcut('spotify'), null);
  assert.strictEqual((await actions.execute({ action: 'shortcut', name: 'New Note with Date' })).ok, true);
  assert.deepStrictEqual(ran, ['New Note with Date']);
});

test('dropped files: CSV overview in code, text and PDF read locally, unknown types refused', async () => {
  const { readDropped, csvOverview, kindOf } = require('../brain/files');
  const csv = 'name,price,size\nFizz,6.99,12 x 330ml\nBubbly,11.49,24 x 355ml\nSpritz,"7,25",8 x 500ml\n';
  const overview = csvOverview(csv, 'water.csv');
  assert.match(overview, /\*\*water\.csv\*\*: 3 rows × 3 columns/);
  assert.match(overview, /\| price \| number \| 6\.99 – 725, avg/);
  assert.match(overview, /\| name \| text \| all 3 unique/);
  assert.deepStrictEqual(['a.pdf', 'b.CSV', 'c.png', 'd.ts', 'e.zip'].map(kindOf), ['pdf', 'csv', 'image', 'text', null]);
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'notes.md'), '# Notes\nCats like boxes.');
  assert.strictEqual((await readDropped(path.join(dir, 'notes.md'))).text, '# Notes\nCats like boxes.');
  assert.match((await readDropped(path.join(dir, 'x.zip'))).error, /not \.zip/);
  try {
    execFileSync('cupsfilter', [path.join(dir, 'notes.md')], { stdio: ['ignore', fs.openSync(path.join(dir, 'notes.pdf'), 'w'), 'ignore'] });
  } catch {
    return; // no cupsfilter: skip the PDF half
  }
  const pdf = await readDropped(path.join(dir, 'notes.pdf'));
  assert.strictEqual(pdf.kind, 'pdf');
  assert.match(pdf.text, /Cats like boxes\./);
});

test('daily assistant: day and focus commands, and a day summary that survives missing permissions', () => {
  const { formatDay } = require('../main/actions');
  for (const q of ['good morning', "what's my day", 'What is on my schedule today?', 'plan my day']) assert.deepStrictEqual(parseCommand(q), { action: 'today' }, q);
  assert.deepStrictEqual(parseCommand('focus for 25 minutes'), { action: 'focus', minutes: 25 });
  assert.deepStrictEqual(parseCommand('start a focus session for 1 hour'), { action: 'focus', minutes: 60 });
  assert.deepStrictEqual(parseCommand('pomodoro'), { action: 'focus', minutes: 25 });
  assert.deepStrictEqual(parseCommand('stop focus'), { action: 'focus', minutes: 0 });
  const now = new Date(2026, 9, 5, 9, 0);
  const at = (h, m = 0) => new Date(2026, 9, 5, h, m);
  const text = formatDay({
    events: { value: [{ start: at(7), allDay: false, title: 'Gym (over)' }, { start: at(0), allDay: true, title: 'Mom birthday' }, { start: at(10, 30), allDay: false, title: 'Standup' }] },
    reminders: { error: 'Not authorized to send Apple events to Reminders. (-1743)' },
  }, now);
  assert.match(text, /^\*\*Good morning!\*\*/);
  assert.match(text, /all day · Mom birthday/);
  assert.match(text, /10:30.*Standup/);
  assert.doesNotMatch(text, /Gym/);
  assert.match(text, /\*\*Reminders\*\*: needs permission/);
  assert.match(formatDay({ events: { value: [] }, reminders: { value: [] } }, now), /nothing left today[\s\S]*nothing due/);
});

test('questions about a dropped CSV that are sums, counts or averages are added up in code', () => {
  const { csvAnswer } = require('../brain/files');
  const csv = 'date,category,amount\n2026-10-01,groceries,82.10\n2026-10-03,rent,1800\n2026-10-05,coffee,4.50\n2026-10-09,coffee,5.10\n';
  assert.match(csvAnswer(csv, 'how much did I spend on coffee?'), /^\*\*\$9\.60\*\* in amount for "coffee", across 2 rows/);
  assert.match(csvAnswer(csv, 'how much did I spend in total?'), /\*\*\$1,891\.70\*\*/);
  assert.match(csvAnswer(csv, 'how many rows are coffee'), /^\*\*2\*\* rows for "coffee"/);
  assert.match(csvAnswer(csv, 'how much on pizza'), /No rows in this file mention "pizza"/);
  assert.strictEqual(csvAnswer(csv, 'what is this file about'), null);
});
