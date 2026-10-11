// Optional "Cloud via your plan" (DESIGN.md §3.17): answers through the official Claude Code or Codex CLI that the user
// installed and logged into themselves. Loon only spawns the binary (no shell) in an empty temp folder with every tool
// turned off; it never reads, copies or stores the CLIs' logins or config.
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
    // Prompt goes in on stdin. --tools "" removes every built-in tool, --strict-mcp-config with no --mcp-config loads
    // no MCP servers, dontAsk denies anything that would need permission, and --system-prompt replaces the coding prompt.
    args: (system) => ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--tools', '', '--strict-mcp-config', '--setting-sources', 'project', '--disable-slash-commands', '--permission-mode', 'dontAsk', '--no-session-persistence',
      '--system-prompt', system],
    input: (system, prompt) => prompt,
  },
  codex: {
    label: 'ChatGPT (your plan, via Codex)',
    loginHint: "Codex isn't logged in. Run `codex login` once in Terminal, then try again.",
    missing: "Codex isn't installed. Install the Codex CLI, run `codex login` once, then try again.",
    // Read-only sandbox, never ask for approval, shell and web search turned off, nothing saved to disk.
    // codex exec has no system-prompt flag, so Loon's instructions go at the top of the prompt.
    args: (_system, cwd) => ['exec', '--json', '--color', 'never', '--sandbox', 'read-only', '--skip-git-repo-check',
      '--ephemeral', '-c', 'approval_policy="never"', '-c', 'features.shell_tool=false', '-c', 'features.unified_exec=false',
      '-c', 'web_search="disabled"', '-C', cwd, '-'],
    input: (system, prompt) => `${system}\n\n${prompt}`,
  },
};

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
  return { ...process.env, PATH: searchPath().join(path.delimiter) };
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

function friendlyError(which, message) {
  const cli = CLIS[which];
  if (LOGIN_ERROR.test(message)) return new Error(cli.loginHint);
  return new Error(`${which === 'claude' ? 'Claude Code' : 'Codex'} said: ${message.trim().slice(0, 300)}`);
}

// Streams the answer through onText; resolves with the full text.
function ask(which, { system = '', prompt, onText = () => {}, signal, timeoutMs = 120000 } = {}) {
  const cli = CLIS[which];
  if (!cli) return Promise.reject(new Error(`Unknown CLI: ${which}`));
  const bin = findBinary(which);
  if (!bin) return Promise.reject(new Error(cli.missing));
  if (signal?.aborted) return Promise.reject(new Error('Cancelled'));

  // A fresh empty folder each time: nothing for the CLI to read, and no project config or hooks to pick up.
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-cli-'));
  return new Promise((resolve, reject) => {
    const child = spawn(bin, cli.args(system, cwd), { cwd, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    const state = {};
    let text = '';
    let buffer = '';
    let stderr = '';
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (child.exitCode === null && !child.killed) child.kill('SIGTERM');
      fs.rmSync(cwd, { recursive: true, force: true });
      if (err) reject(err);
      else resolve(text);
    };
    const onAbort = () => finish(new Error('Cancelled'));
    const timer = setTimeout(() => finish(new Error(`${which === 'claude' ? 'Claude Code' : 'Codex'} took too long to answer.`)), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });

    const handleLine = (line) => {
      if (!line.trim()) return;
      let event;
      try { event = JSON.parse(line); } catch { return; } // ignore stray non-JSON lines (warnings)
      const piece = parseEvent(which, event, state);
      if (piece) { text += piece; onText(piece); }
    };
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(handleLine);
    });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    child.on('error', (err) => finish(err.code === 'ENOENT' ? new Error(cli.missing) : err));
    child.on('close', (code) => {
      handleLine(buffer);
      if (state.error) return finish(friendlyError(which, state.error));
      if (code !== 0 && !text) return finish(friendlyError(which, stderr || `exited with code ${code}`));
      if (!text) return finish(friendlyError(which, stderr || 'no answer'));
      finish();
    });
    child.stdin.on('error', () => {}); // the CLI may exit before reading everything; 'close' reports why
    child.stdin.end(cli.input(system, prompt));
  });
}

module.exports = { detect, ask, label, findBinary, CLIS };
