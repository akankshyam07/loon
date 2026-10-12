// Optional "Cloud via your plan" (DESIGN.md §3.17): answers through the official Claude Code or Codex CLI that the user
// installed and logged into themselves. Loon only spawns the binary (no shell) in an empty temp folder with every tool
// turned off; it never reads, copies or stores the CLIs' logins or config.
// Subscription only, never pay-per-use API billing: before each use Loon asks the CLI how it is signed in and refuses
// anything but a Claude or ChatGPT plan login, and API-key environment variables are removed from the child process.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');

// Apps opened from Finder get a minimal PATH, so also look where these CLIs usually install.
const EXTRA_DIRS = ['.local/bin', '.npm-global/bin', '.claude/local', '.bun/bin'].map((d) => path.join(os.homedir(), d))
  .concat(['/opt/homebrew/bin', '/usr/local/bin']);

const CLIS = {
  claude: {
    label: 'Claude (your plan, via Claude Code)',
    loginHint: "Claude Code isn't logged in. Run `claude` once in Terminal and log in, then try again.",
    missing: "Claude Code isn't installed. Install it from claude.com/code, run `claude` once to log in, then try again.",
    // The question goes in on stdin as one stream-json user message, so a process can be started before the question
    // exists (warm pool below). --tools "" removes every built-in tool, --strict-mcp-config with no --mcp-config loads
    // no MCP servers, dontAsk denies anything that would need permission, and --system-prompt replaces the coding prompt.
    args: (system, _cwd, { model, effort } = {}) => ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      ...(model ? ['--model', model] : []), ...(effort ? ['--effort', effort] : []),
      '--tools', '', '--strict-mcp-config', '--setting-sources', 'project', '--disable-slash-commands', '--permission-mode', 'dontAsk', '--no-session-persistence',
      '--system-prompt', system],
    input: (system, prompt) => `${JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: prompt }] }, parent_tool_use_id: null })}\n`,
    warmable: true,
    authArgs: ['auth', 'status'],
    // claude.ai = signed in with a Claude subscription; anything else (Console/API key, Bedrock, Vertex) bills per use.
    onPlan: (out) => {
      try {
        const s = JSON.parse(out);
        return s.loggedIn === true && s.authMethod === 'claude.ai' && s.apiProvider === 'firstParty';
      } catch {
        return false;
      }
    },
    billingHint: 'Claude Code is signed in with API billing, and Loon only uses your Claude subscription. Run `claude`, type /login and pick "Claude account with subscription".',
  },
  codex: {
    label: 'ChatGPT (your plan, via Codex)',
    loginHint: "Codex isn't logged in. Run `codex login` once in Terminal, then try again.",
    missing: "Codex isn't installed. Install the Codex CLI, run `codex login` once, then try again.",
    // Read-only sandbox, never ask for approval, shell and web search turned off, nothing saved to disk.
    // codex exec has no system-prompt flag, so Loon's instructions go at the top of the prompt.
    args: (_system, cwd, { model, effort } = {}) => ['exec', '--json', '--color', 'never', '--sandbox', 'read-only', '--skip-git-repo-check',
      '--ephemeral', '-c', 'approval_policy="never"', '-c', 'features.shell_tool=false', '-c', 'features.unified_exec=false',
      '-c', 'web_search="disabled"', ...(model ? ['-m', model] : []), ...(effort ? ['-c', `model_reasoning_effort="${effort}"`] : []), '-C', cwd, '-'],
    input: (system, prompt) => `${system}\n\n${prompt}`,
    authArgs: ['login', 'status'],
    onPlan: (out) => /logged in using chatgpt/i.test(out) && !/api key/i.test(out),
    billingHint: 'Codex is signed in with an API key, and Loon only uses your ChatGPT plan. Run `codex logout`, then `codex login` and choose "Sign in with ChatGPT".',
  },
};

// Never handed to the CLIs: any of these would switch them to pay-per-use billing or another provider.
const BILLING_ENV = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'CODEX_API_KEY', 'AZURE_OPENAI_API_KEY'];

// Per difficulty (DESIGN.md §2.10): normal questions get a fast model with little reasoning, hard ones and "Go deeper"
// the strongest model with more. Settings can name other models. Claude takes aliases (haiku, sonnet, opus, fable);
// the Codex names come from `codex debug models` (0.146.0) and must exist on the user's ChatGPT plan.
const MODEL_DEFAULTS = { claude: { medium: 'haiku', hard: 'opus' }, codex: { medium: 'gpt-5.6-luna', hard: 'gpt-5.6-sol' } };
const EFFORT = { medium: 'low', hard: 'high' };
// Model names become one argv entry (no shell), but one starting with "-" would read as a flag.
const MODEL_NAME = /^[A-Za-z0-9][\w.:/[\]-]{0,79}$/;

// → the model to pass for this level, or '' for the CLI's own default. No level (e.g. the screen planner) = no flags.
function modelFor(which, level, models = {}) {
  if (!level) return '';
  const chosen = String(models?.[level] || '').trim();
  if (chosen && MODEL_NAME.test(chosen)) return chosen;
  return MODEL_DEFAULTS[which]?.[level] || '';
}

const MODEL_ERROR = /model_not_found|unknown model|invalid model|model\b.{0,100}\b(not supported|not available|isn'?t available|does not exist|not found|unsupported|not enabled|no access)/i;
const LOGIN_ERROR = /not logged in|\/login|codex login|log ?in again|unauthori[sz]ed|authenticat|invalid api key|\b401\b|\b403\b|credential/i;

function searchPath() {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  return [...new Set([...dirs, ...EXTRA_DIRS])];
}

function findBinary(name) {
  for (const dir of searchPath()) {
    const file = path.join(dir, name);
    try {
      fs.accessSync(file, fs.constants.X_OK);
      if (fs.statSync(file).isFile()) return file;
    } catch {
      // not in this folder
    }
  }
  return null;
}

// Child env: the user's own environment plus the wider PATH (an npm-installed codex needs `node` on it).
function childEnv() {
  const env = { ...process.env, PATH: searchPath().join(path.delimiter) };
  for (const key of BILLING_ENV) delete env[key];
  return env;
}

// Confirms the CLI is signed in with the user's plan. A pass is remembered for a few minutes; a failure never is.
const PLAN_CHECK_MS = 5 * 60 * 1000;
const planChecked = new Map();
function checkPlan(which, bin) {
  const cli = CLIS[which];
  if (Date.now() - (planChecked.get(which) || 0) < PLAN_CHECK_MS) return Promise.resolve();
  return new Promise((resolve, reject) => {
    execFile(bin, cli.authArgs, { timeout: 15000, env: childEnv() }, (err, stdout, stderr) => {
      const out = `${stdout || ''}\n${stderr || ''}`;
      if (cli.onPlan(stdout || '') || (which === 'codex' && cli.onPlan(out))) {
        planChecked.set(which, Date.now());
        return resolve();
      }
      reject(new Error(/not logged in|logged out|loggedIn": false/i.test(out) ? cli.loginHint : cli.billingHint));
    });
  });
}

function version(bin) {
  return new Promise((resolve) => {
    execFile(bin, ['--version'], { timeout: 5000, env: childEnv() }, (err, stdout) => {
      resolve(err ? null : String(stdout).trim().split('\n')[0] || null);
    });
  });
}

// → { claude: { found, path?, version?, label }, codex: { … } }
async function detect() {
  const out = {};
  for (const [which, cli] of Object.entries(CLIS)) {
    const bin = findBinary(which);
    out[which] = bin ? { found: true, path: bin, version: await version(bin), label: cli.label } : { found: false, label: cli.label };
  }
  return out;
}

function label(which) {
  return CLIS[which]?.label || which;
}

// Reads one JSON event per line and returns new answer text (or throws a mapped error).
function parseEvent(which, event, state) {
  if (which === 'claude') {
    if (event.type === 'stream_event' && event.event?.delta?.type === 'text_delta') {
      state.streamed = true;
      return event.event.delta.text;
    }
    if (event.type === 'assistant' && !state.streamed) {
      return (event.message?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    }
    if (event.type === 'result') {
      state.done = true;
      if (event.is_error || (event.subtype && event.subtype !== 'success')) state.error = String(event.result || event.subtype || 'Claude Code failed');
    }
    return '';
  }
  if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
    const sep = state.emitted ? '\n\n' : '';
    state.emitted = true;
    return sep + (event.item.text || '');
  }
  if (event.type === 'turn.failed') state.error = String(event.error?.message || 'Codex failed');
  if (event.type === 'error') state.error = String(event.message || 'Codex failed');
  if (event.type === 'turn.completed') state.done = true;
  return '';
}

function friendlyError(which, message, model = '') {
  const cli = CLIS[which];
  if (MODEL_ERROR.test(message)) {
    if (which === 'codex') {
      return new Error(model ? `Codex model "${model}" isn't available on your ChatGPT plan. Set another model in Loon's Settings.`
        : "Codex's configured model isn't available on your ChatGPT plan. Set a model in Loon's Settings.");
    }
    return new Error(`Claude Code can't use the model "${model || 'default'}" on your plan. Pick another in Loon's Settings (for example haiku, sonnet or opus).`);
  }
  if (LOGIN_ERROR.test(message)) return new Error(cli.loginHint);
  return new Error(`${which === 'claude' ? 'Claude Code' : 'Codex'} said: ${message.trim().slice(0, 300)}`);
}

// Warm pool: each question gets its own CLI process (so it never sees another question), but that process can be
// started ahead of time. A warm process has done its startup and sits waiting on stdin, having sent nothing; the
// question is written when it arrives. Stream-json input has no "new conversation" message, so one process answers
// exactly one question and a replacement is spawned in the background.
// Claude only: `codex exec -` reads all of stdin before it starts, so a waiting Codex process saves nothing (measured:
// ~4.1 s to first token either way) and Codex keeps a fresh process per question.
// ponytail: one idle process per (CLI, model, effort, system prompt), dropped after tuning.warmIdleMs. More only if two
// questions at once ever matter.
// Every question re-runs the plan check before it is written, so an idle process never answers on a stale check.
const tuning = { warmIdleMs: 3 * 60 * 1000 };
const pool = new Map();

function flagsFor(which, { level, models } = {}) {
  return { model: modelFor(which, level, models), effort: level ? EFFORT[level] || '' : '' };
}

function poolKey(which, bin, system, flags) {
  return JSON.stringify([which, bin, flags.model, flags.effort, system]);
}

// Spawns a CLI (no shell) in a fresh empty folder: nothing to read, no project config or hooks. Whatever it prints
// before a question is attached is buffered.
function spawnProc(which, bin, system, flags) {
  const cli = CLIS[which];
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-cli-'));
  const child = spawn(bin, cli.args(system, cwd, flags), { cwd, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
  const proc = { which, child, cwd, model: flags.model, early: [], stderr: '', exited: false, code: null, error: null, on: null, idle: null };
  const cleanup = () => fs.rmSync(cwd, { recursive: true, force: true });
  proc.kill = () => {
    clearTimeout(proc.idle);
    if (!proc.exited && !child.killed) child.kill('SIGTERM');
    cleanup();
  };
  child.stdout.on('data', (chunk) => (proc.on ? proc.on.data(chunk) : proc.early.push(chunk)));
  child.stderr.on('data', (chunk) => { proc.stderr = (proc.stderr + chunk).slice(-4000); });
  child.on('error', (err) => { proc.error = err; proc.on?.error(err); });
  child.on('close', (code) => {
    proc.exited = true;
    proc.code = code;
    clearTimeout(proc.idle);
    if (pool.get(proc.key) === proc) pool.delete(proc.key);
    cleanup();
    proc.on?.close(code);
  });
  child.stdin.on('error', () => {}); // the CLI may exit before reading everything; 'close' reports why
  return proc;
}

function take(key) {
  const proc = pool.get(key);
  if (!proc) return null;
  pool.delete(key);
  clearTimeout(proc.idle);
  return proc.exited || proc.error ? null : proc;
}

// Starts (or keeps) one idle process for these options; resolves false when nothing was warmed, never throws.
// The plan-only check runs first, so a login that bills per use never gets a process.
async function warm(which, { system = '', level, models } = {}) {
  try {
    const bin = findBinary(which);
    if (!CLIS[which]?.warmable || !bin) return false;
    const flags = flagsFor(which, { level, models });
    const key = poolKey(which, bin, system, flags);
    const existing = pool.get(key);
    if (existing && !existing.exited) {
      existing.idle.refresh();
      return true;
    }
    await checkPlan(which, bin);
    if (pool.has(key)) return true;
    const proc = spawnProc(which, bin, system, flags);
    proc.key = key;
    proc.idle = setTimeout(() => { pool.delete(key); proc.kill(); }, tuning.warmIdleMs);
    pool.set(key, proc);
    return true;
  } catch {
    return false;
  }
}

// Kills every idle process (app quit, Privacy mode, a failed plan check, tests).
function shutdown() {
  for (const proc of pool.values()) proc.kill();
  pool.clear();
}

// Streams the answer through onText; resolves with the full text. Refuses unless the CLI is on the user's plan.
// `level` ('medium' | 'hard') picks model and effort; `warm: true` keeps a replacement process ready afterwards.
async function ask(which, options = {}) {
  const cli = CLIS[which];
  if (!cli) throw new Error(`Unknown CLI: ${which}`);
  const bin = findBinary(which);
  if (!bin) throw new Error(cli.missing);
  try {
    await checkPlan(which, bin); // before every question, warm process or not
  } catch (err) {
    shutdown();
    throw err;
  }
  if (options.signal?.aborted) throw new Error('Cancelled');
  const system = options.system || '';
  const flags = flagsFor(which, options);
  const ready = take(poolKey(which, bin, system, flags));
  if (options.warm) setImmediate(() => warm(which, { system, level: options.level, models: options.models }));
  if (ready) {
    try {
      return await run(ready, options);
    } catch (err) {
      // A warm process that died before saying anything is replaced by a fresh one, invisibly.
      if (!err.retryable || options.signal?.aborted) throw err;
      console.warn(`[cli] warm ${which} process failed (${err.message}); starting a fresh one`);
    }
  }
  return run(spawnProc(which, bin, system, flags), options);
}

function run(proc, { system = '', prompt, onText = () => {}, signal, timeoutMs = 120000 } = {}) {
  const { which, child } = proc;
  const cli = CLIS[which];
  if (signal?.aborted) {
    proc.kill();
    return Promise.reject(new Error('Cancelled'));
  }
  return new Promise((resolve, reject) => {
    const state = {};
    let text = '';
    let buffer = '';
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      proc.kill();
      if (err) reject(err);
      else resolve(text);
    };
    // Nothing came back at all: the process died before reading the question, so a fresh one may retry it.
    const failed = (err) => {
      err.retryable = !state.events && !text;
      finish(err);
    };
    const onAbort = () => finish(new Error('Cancelled'));
    const timer = setTimeout(() => finish(new Error(`${which === 'claude' ? 'Claude Code' : 'Codex'} took too long to answer.`)), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });

    const handleLine = (line) => {
      if (!line.trim()) return;
      let event;
      try { event = JSON.parse(line); } catch { return; } // ignore stray non-JSON lines (warnings)
      state.events = true;
      const piece = parseEvent(which, event, state);
      if (piece) { text += piece; onText(piece); }
      // The answer is complete at the final event; don't wait for the CLI's own shutdown.
      if (state.done && !settled) settle();
    };
    const settle = (code = 0) => {
      if (state.error) return finish(friendlyError(which, state.error, proc.model));
      if (code !== 0 && !text) return failed(friendlyError(which, proc.stderr || `exited with code ${code}`, proc.model));
      if (!text) return failed(friendlyError(which, proc.stderr || 'no answer', proc.model));
      finish();
    };
    const onData = (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(handleLine);
    };
    const onClose = (code) => {
      handleLine(buffer);
      if (!settled) settle(code);
    };
    const onError = (err) => failed(err.code === 'ENOENT' ? new Error(cli.missing) : err);
    proc.on = { data: onData, close: onClose, error: onError };
    proc.early.splice(0).forEach(onData);
    if (proc.error) return onError(proc.error);
    if (proc.exited) return onClose(proc.code);
    child.stdin.end(cli.input(system, prompt));
  });
}

module.exports = {
  detect, ask, warm, shutdown, label, modelFor, findBinary, CLIS, BILLING_ENV, MODEL_DEFAULTS, MODEL_NAME, tuning,
  resetPlanCheck: () => planChecked.clear(), poolSize: () => pool.size,
};
