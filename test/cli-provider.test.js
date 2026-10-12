// "Cloud via your plan" (DESIGN.md §3.17) against FAKE claude/codex executables. Never runs the real CLIs.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cli = require('../brain/cli-provider');
const { Resolver } = require('../brain/resolve');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-fakecli-'));
const bin = path.join(dir, 'bin');
const log = path.join(dir, 'calls.jsonl');
fs.mkdirSync(bin);

// Records how it was called, then behaves per FAKE_MODE: ok | nologin | hang.
const FAKE = (which) => `#!${process.execPath}
const fs = require('fs');
if (process.argv[2] === '--version') { console.log('${which} 9.9.9-fake'); process.exit(0); }
const auth = process.env.FAKE_AUTH || 'plan';
if (process.argv[2] === 'auth' && process.argv[3] === 'status') {
  console.log(JSON.stringify({ loggedIn: auth !== 'none', authMethod: auth === 'plan' ? 'claude.ai' : 'console', apiProvider: 'firstParty' }));
  process.exit(0);
}
if (process.argv[2] === 'login' && process.argv[3] === 'status') {
  console.error(auth === 'plan' ? 'Logged in using ChatGPT' : auth === 'api' ? 'Logged in using an API key - sk-…' : 'Not logged in');
  process.exit(auth === 'none' ? 1 : 0);
}
const leaked = Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
fs.appendFileSync(process.env.FAKE_SPAWNS, JSON.stringify({ which: '${which}', pid: process.pid, leaked }) + '\\n');
if (leaked) { console.error('API key leaked into the CLI'); process.exit(3); }
const mode = process.env.FAKE_MODE; // read at spawn: a warm process keeps the mode it started with
if (mode === 'crash') process.exit(1); // dies while idle, before any question
let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  const args = process.argv.slice(2);
  fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ which: '${which}', pid: process.pid, args, cwd: process.cwd(), files: fs.readdirSync(process.cwd()), input }) + '\\n');
  if (mode === 'die') process.exit(1); // takes the question, then dies without a word
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
  if (mode === 'hang') { setInterval(() => {}, 1000); return; }
  if ('${which}' === 'claude') {
    out({ type: 'system', subtype: 'init' });
    if (mode === 'nologin') { out({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in · Please run /login' }); process.exit(1); }
    if (mode === 'echo') {
      const asked = input.trim().split('\\n').map((l) => JSON.parse(l).message.content[0].text).join(' + ');
      out({ type: 'assistant', message: { content: [{ type: 'text', text: 'You asked: ' + asked }] } });
      out({ type: 'result', subtype: 'success', is_error: false, result: 'You asked: ' + asked });
      setInterval(() => {}, 1000); // like the real CLI, may linger after the result; Loon must not wait for exit
      return;
    }
    for (const t of ['[mood:happy] ', 'Deep ', 'answer.']) out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: t } } });
    out({ type: 'assistant', message: { content: [{ type: 'text', text: '[mood:happy] Deep answer.' }] } });
    out({ type: 'result', subtype: 'success', is_error: false, result: '[mood:happy] Deep answer.' });
  } else {
    out({ type: 'thread.started', thread_id: 't1' });
    if (mode === 'nologin') { out({ type: 'error', message: 'unexpected status 401 Unauthorized' }); process.exit(1); }
    out({ type: 'item.completed', item: { id: 'i1', type: 'agent_message', text: '[mood:curious] Codex answer.' } });
    out({ type: 'turn.completed', usage: {} });
  }
});
`;
for (const which of ['claude', 'codex']) fs.writeFileSync(path.join(bin, which), FAKE(which), { mode: 0o755 });

process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
process.env.FAKE_LOG = log;
process.env.FAKE_SPAWNS = path.join(dir, 'spawns.jsonl');
const lines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const calls = () => lines(log);
const spawns = () => lines(process.env.FAKE_SPAWNS);
const userText = (input) => JSON.parse(input).message.content[0].text; // claude's stream-json user message
test.after(() => cli.shutdown());
const lastCall = () => calls().at(-1);

test('detect finds both CLIs first on PATH, with versions', async () => {
  const found = await cli.detect();
  assert.strictEqual(found.claude.path, path.join(bin, 'claude'));
  assert.strictEqual(found.claude.version, 'claude 9.9.9-fake');
  assert.strictEqual(found.codex.path, path.join(bin, 'codex'));
  assert.match(found.codex.label, /ChatGPT \(your plan, via Codex\)/);
});

test('claude runs with tools off, in an empty temp folder, no shell, and streams text', async () => {
  process.env.FAKE_MODE = 'ok';
  const pieces = [];
  const system = 'Be Loon; $(touch pwned) `id` && rm -rf ~';
  const text = await cli.ask('claude', { system, prompt: 'Explain "this" & that', onText: (t) => pieces.push(t) });
  assert.strictEqual(text, '[mood:happy] Deep answer.');
  assert.deepStrictEqual(pieces, ['[mood:happy] ', 'Deep ', 'answer.']); // streamed, not repeated from the final message
  const call = lastCall();
  assert.strictEqual(call.args[0], '-p');
  assert.strictEqual(call.args[call.args.indexOf('--tools') + 1], '');
  assert.ok(call.args.includes('--strict-mcp-config'));
  assert.ok(call.args.includes('--setting-sources') && call.args[call.args.indexOf('--setting-sources') + 1] === 'project'); // no user hooks or plugins leak in
  assert.strictEqual(call.args[call.args.indexOf('--permission-mode') + 1], 'dontAsk');
  assert.strictEqual(call.args[call.args.indexOf('--system-prompt') + 1], system); // arrived literally: no shell expansion
  assert.ok(call.args.includes('--no-session-persistence') && call.args.includes('--disable-slash-commands'));
  assert.strictEqual(call.args[call.args.indexOf('--input-format') + 1], 'stream-json');
  assert.ok(!call.args.includes('--model'), 'no level (e.g. the screen planner): the CLI default model, as before');
  assert.strictEqual(call.input.trim().split('\n').length, 1); // exactly one user message
  assert.strictEqual(userText(call.input), 'Explain "this" & that');
  assert.deepStrictEqual(call.files, []);
  assert.match(path.basename(call.cwd), /^loon-cli-/);
  assert.ok(!fs.existsSync(call.cwd), 'temp folder is removed afterwards');
  assert.ok(!fs.existsSync(path.join(call.cwd, 'pwned')) && !fs.existsSync(path.join(process.cwd(), 'pwned')));
});

test('codex runs read-only with shell and web search off and the system text on top of the prompt', async () => {
  process.env.FAKE_MODE = 'ok';
  const text = await cli.ask('codex', { system: 'You are Loon.', prompt: 'Hi' });
  assert.strictEqual(text, '[mood:curious] Codex answer.');
  const { args, input, files, cwd } = lastCall();
  assert.strictEqual(args[0], 'exec');
  assert.strictEqual(args[args.indexOf('--sandbox') + 1], 'read-only');
  for (const flag of ['--json', '--skip-git-repo-check', '--ephemeral']) assert.ok(args.includes(flag), flag);
  for (const c of ['approval_policy="never"', 'features.shell_tool=false', 'web_search="disabled"']) assert.ok(args.includes(c), c);
  assert.strictEqual(path.basename(args[args.indexOf('-C') + 1]), path.basename(cwd)); // same folder (macOS resolves /var to /private/var)
  assert.strictEqual(args.at(-1), '-');
  assert.strictEqual(input, 'You are Loon.\n\nHi');
  assert.deepStrictEqual(files, []);
});

test('a teach screenshot goes to Codex as --image from the temp folder (deleted after); Claude Code refuses it; plan check first', async () => {
  process.env.FAKE_MODE = 'ok';
  process.env.FAKE_AUTH = 'plan';
  await cli.ask('codex', { system: 'Teach.', prompt: 'ids only', image: Buffer.from('fake png') });
  const { args, files, cwd } = lastCall();
  const flag = args.find((a) => a.startsWith('--image='));
  assert.strictEqual(path.basename(flag.slice('--image='.length)), 'screen.png');
  assert.deepStrictEqual(files, ['screen.png']);
  assert.ok(args.indexOf(flag) < args.indexOf('-C') && args.at(-1) === '-', 'the prompt still comes on stdin');
  assert.ok(!fs.existsSync(cwd), 'the screenshot is gone with the temp folder');
  await assert.rejects(cli.ask('claude', { prompt: 'x', image: Buffer.from('png') }), /can't look at screenshots/);
  cli.resetPlanCheck();
  process.env.FAKE_AUTH = 'api';
  const before = calls().length;
  await assert.rejects(cli.ask('codex', { prompt: 'x', image: Buffer.from('png') }), /only uses your ChatGPT plan/);
  assert.strictEqual(calls().length, before);
  cli.resetPlanCheck();
  process.env.FAKE_AUTH = 'plan';
});

test('not-logged-in errors say how to log in', async () => {
  process.env.FAKE_MODE = 'nologin';
  await assert.rejects(cli.ask('claude', { prompt: 'x' }), /isn't logged in.*Run `claude`/);
  await assert.rejects(cli.ask('codex', { prompt: 'x' }), /isn't logged in.*codex login/);
});

test('a hung CLI times out, and cancelling stops it', async () => {
  process.env.FAKE_MODE = 'hang';
  await assert.rejects(cli.ask('claude', { prompt: 'x', timeoutMs: 400 }), /took too long/);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 200);
  const started = Date.now();
  await assert.rejects(cli.ask('codex', { prompt: 'x', signal: controller.signal }), /Cancelled/);
  assert.ok(Date.now() - started < 5000);
});

test('resolver uses the CLI only for "Go deeper" when enabled, never in Privacy mode, and redacts first', async () => {
  process.env.FAKE_MODE = 'ok';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-resolve-'));
  let localCalls = 0;
  const brain = { modelId: () => 'fake', chat: async (_p, { onText }) => { localCalls++; onText('[mood:focused] Local.'); } };
  const settings = { privacy: false, cloudCli: 'off', answerWith: 'mac' };
  const resolver = new Resolver({ brain, settings, cacheFile: path.join(tmp, 'c.json'), countsFile: path.join(tmp, 'n.json') });
  const secret = 'sk-ant-abcdefghijklmnopqrstuvwxyz0123456789';
  const deeper = (q) => resolver.run('ask', { source: 'typed', question: q }, { onText: () => {}, deeper: true, firstInThread: false });
  const before = calls().length;

  assert.strictEqual((await deeper('why?')).tier, 'local'); // off by default
  settings.cloudCli = 'claude';
  assert.strictEqual((await resolver.ask('plain question', { onText: () => {} })).tier, 'local'); // not deeper: local ladder
  const cloud = await deeper(`why is my key ${secret} failing?`);
  assert.deepStrictEqual([cloud.tier, cloud.text, cloud.mood], ['cloud', 'Deep answer.', 'happy']);
  assert.strictEqual(cloud.detail, 'Claude (your plan, via Claude Code) · opus'); // "Go deeper" = the strongest model
  assert.strictEqual(lastCall().args[lastCall().args.indexOf('--effort') + 1], 'high');
  assert.ok(!lastCall().input.includes(secret) && lastCall().input.includes('[redacted'), 'secrets are redacted before the CLI sees them');
  settings.privacy = true;
  assert.strictEqual((await deeper('why?')).tier, 'local');
  assert.strictEqual(calls().length - before, 1);
  assert.strictEqual(localCalls, 3);
  assert.strictEqual(resolver.counts.tiers.cloud, 1);
});

test('resolver falls back to the CLI when the local model is unavailable', async () => {
  process.env.FAKE_MODE = 'ok';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-resolve-'));
  const brain = { modelId: () => 'fake', chat: async () => { throw new Error('No model available'); } };
  const settings = { privacy: false, cloudCli: 'codex' };
  const resolver = new Resolver({ brain, settings, cacheFile: path.join(tmp, 'c.json'), countsFile: path.join(tmp, 'n.json') });
  const result = await resolver.ask('hello there', { onText: () => {} });
  assert.deepStrictEqual([result.tier, result.text], ['cloud', 'Codex answer.']);
  settings.privacy = true;
  await assert.rejects(resolver.ask('hello again', { onText: () => {} }), /No model available/);
});

test('never API billing: refuses CLIs signed in with an API key, and strips API keys from their environment', async () => {
  process.env.FAKE_MODE = 'ok';
  for (const which of ['claude', 'codex']) {
    cli.resetPlanCheck();
    process.env.FAKE_AUTH = 'api';
    const before = calls().length;
    await assert.rejects(cli.ask(which, { prompt: 'hi' }), /only uses your (Claude subscription|ChatGPT plan)/);
    assert.strictEqual(calls().length, before, 'no prompt is sent when the login bills per use');
    process.env.FAKE_AUTH = 'none';
    await assert.rejects(cli.ask(which, { prompt: 'hi' }), /log/i);
  }
  cli.resetPlanCheck();
  process.env.FAKE_AUTH = 'plan';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-fake';
  process.env.OPENAI_API_KEY = 'sk-fake';
  try {
    assert.match(await cli.ask('claude', { prompt: 'hi' }), /Deep answer/);
    assert.match(await cli.ask('codex', { prompt: 'hi' }), /Codex answer/);
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  }
});

// ---------- Plan-first speed: warm pool and model per difficulty (DESIGN.md §3.17.1) ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MEDIUM = { system: 'You are Loon.', level: 'medium' };

test('model and effort per difficulty; Settings can override; flag-like names are ignored', async () => {
  process.env.FAKE_MODE = 'ok';
  cli.resetPlanCheck();
  process.env.FAKE_AUTH = 'plan';
  await cli.ask('claude', { ...MEDIUM, prompt: 'hi' });
  let { args } = lastCall();
  assert.deepStrictEqual([args[args.indexOf('--model') + 1], args[args.indexOf('--effort') + 1]], ['haiku', 'low']);
  await cli.ask('claude', { ...MEDIUM, level: 'hard', models: { hard: 'sonnet' }, prompt: 'hi' });
  ({ args } = lastCall());
  assert.deepStrictEqual([args[args.indexOf('--model') + 1], args[args.indexOf('--effort') + 1]], ['sonnet', 'high']);
  await cli.ask('codex', { ...MEDIUM, models: { medium: 'gpt-test-mini' }, prompt: 'hi' });
  ({ args } = lastCall());
  assert.strictEqual(args[args.indexOf('-m') + 1], 'gpt-test-mini');
  assert.ok(args.includes('model_reasoning_effort="low"'));
  assert.strictEqual(cli.modelFor('claude', 'hard', { hard: '--dangerously-skip-permissions' }), 'opus');
  assert.strictEqual(cli.modelFor('codex', undefined, { medium: 'x' }), ''); // no level, no flags
});

test('a model the plan rejects gets a clear message that points to Settings', async () => {
  // The fake codex prints the error event Codex gives for a model a ChatGPT account can't use.
  const codexFake = path.join(bin, 'codex');
  const original = fs.readFileSync(codexFake, 'utf8');
  fs.writeFileSync(codexFake, original.replace("out({ type: 'thread.started', thread_id: 't1' });",
    "out({ type: 'thread.started', thread_id: 't1' }); if (mode === 'badmodel') { out({ type: 'error', message: \"The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account.\" }); process.exit(1); }"));
  try {
    process.env.FAKE_MODE = 'badmodel';
    await assert.rejects(cli.ask('codex', { prompt: 'hi' }), /Codex's configured model isn't available on your ChatGPT plan.*Loon's Settings/);
    await assert.rejects(cli.ask('codex', { ...MEDIUM, models: { medium: 'gpt-nope' }, prompt: 'hi' }), /Codex model "gpt-nope" isn't available/);
  } finally {
    fs.writeFileSync(codexFake, original);
  }
});

test('warm pool: a pre-spawned process answers, sends nothing until asked, and is replaced in the background', async () => {
  process.env.FAKE_MODE = 'echo';
  cli.shutdown();
  const before = calls().length;
  const spawned = spawns().length;
  assert.strictEqual(await cli.warm('claude', MEDIUM), true);
  await sleep(300);
  assert.strictEqual(cli.poolSize(), 1);
  assert.strictEqual(spawns().length, spawned + 1);
  assert.strictEqual(calls().length, before, 'warm-up sends no prompt');
  const warmPid = spawns().at(-1).pid;

  assert.strictEqual(await cli.ask('claude', { ...MEDIUM, prompt: 'first question', warm: true }), 'You asked: first question');
  assert.strictEqual(lastCall().pid, warmPid, 'the warm process answered');
  await sleep(300);
  assert.strictEqual(cli.poolSize(), 1, 'replenished');
  const nextPid = spawns().at(-1).pid;
  assert.notStrictEqual(nextPid, warmPid);

  // Isolation: the second question runs in a different process that saw only its own question.
  assert.strictEqual(await cli.ask('claude', { ...MEDIUM, prompt: 'second question', warm: true }), 'You asked: second question');
  assert.strictEqual(lastCall().pid, nextPid);
  assert.ok(!lastCall().input.includes('first question'));
  assert.strictEqual(await cli.warm('codex', MEDIUM), false, 'Codex reads stdin before starting, so it is not pre-spawned');
  cli.shutdown();
  assert.strictEqual(cli.poolSize(), 0);
});

test('warm pool: an idle process is dropped after the idle timeout', async () => {
  process.env.FAKE_MODE = 'echo';
  const saved = cli.tuning.warmIdleMs;
  cli.tuning.warmIdleMs = 200;
  try {
    await cli.warm('claude', MEDIUM);
    assert.strictEqual(cli.poolSize(), 1);
    await sleep(500);
    assert.strictEqual(cli.poolSize(), 0);
  } finally {
    cli.tuning.warmIdleMs = saved;
  }
});

test('warm pool: a crashed warm process falls back to a fresh spawn, invisibly', async () => {
  // Died while idle: never used.
  process.env.FAKE_MODE = 'crash';
  await cli.warm('claude', MEDIUM);
  await sleep(400);
  process.env.FAKE_MODE = 'echo';
  assert.strictEqual(await cli.ask('claude', { ...MEDIUM, prompt: 'after an idle crash' }), 'You asked: after an idle crash');
  // Died after taking the question, before a word: retried once on a fresh process.
  process.env.FAKE_MODE = 'die';
  await cli.warm('claude', MEDIUM);
  await sleep(300);
  process.env.FAKE_MODE = 'echo';
  const before = calls().length;
  assert.strictEqual(await cli.ask('claude', { ...MEDIUM, prompt: 'after a crash' }), 'You asked: after a crash');
  assert.strictEqual(calls().length - before, 2); // the dead warm one, then the fresh one
});

test('warm pool: cancelling a question on a warm process stops it', async () => {
  process.env.FAKE_MODE = 'hang';
  await cli.warm('claude', MEDIUM);
  await sleep(300);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 200);
  const started = Date.now();
  await assert.rejects(cli.ask('claude', { ...MEDIUM, prompt: 'x', signal: controller.signal }), /Cancelled/);
  assert.ok(Date.now() - started < 3000);
  assert.strictEqual(cli.poolSize(), 0);
});

test('warm pool never bills per use: plan check before warm-up and before each question, API keys stripped', async () => {
  process.env.FAKE_MODE = 'echo';
  cli.shutdown();
  cli.resetPlanCheck();
  process.env.FAKE_AUTH = 'api';
  const spawned = spawns().length;
  assert.strictEqual(await cli.warm('claude', MEDIUM), false);
  assert.strictEqual(spawns().length, spawned, 'no process for a login that bills per use');

  // Warmed on the plan, then the login changes: the next question is refused before any prompt, and the pool emptied.
  cli.resetPlanCheck();
  process.env.FAKE_AUTH = 'plan';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-fake';
  try {
    assert.strictEqual(await cli.warm('claude', MEDIUM), true);
    await sleep(300);
    assert.strictEqual(spawns().at(-1).leaked, false, 'API keys are stripped from warm processes too');
    cli.resetPlanCheck(); // the remembered pass expires (as it does every few minutes)
    process.env.FAKE_AUTH = 'api';
    const before = calls().length;
    await assert.rejects(cli.ask('claude', { ...MEDIUM, prompt: 'hi' }), /only uses your Claude subscription/);
    assert.strictEqual(calls().length, before);
    assert.strictEqual(cli.poolSize(), 0);
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.FAKE_AUTH = 'plan';
    cli.resetPlanCheck();
  }
});
