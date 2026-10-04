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
  assert.deepStrictEqual(parseCommand('what was I working on in HackMIT'), { action: 'briefing', project: 'HackMIT' });
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
