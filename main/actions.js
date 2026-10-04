// Actions (DESIGN.md §3.13): run only after the user clicks ✓ on a confirm card, and every run is written to the
// audit log (metadata only, no content). Executors that touch other apps are swappable so tests never do.
const { execFile } = require('child_process');
const fs = require('fs');

const run = (cmd, args) => new Promise((resolve, reject) => {
  execFile(cmd, args, { timeout: 20_000 }, (err, stdout, stderr) => (err ? reject(new Error((stderr || err.message).trim())) : resolve(stdout.trim())));
});

const q = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// Builds an AppleScript date without locale-dependent date strings. Day goes to 1 first so no month overflows.
function appleDate(name, d) {
  return [
    `set ${name} to current date`,
    `set day of ${name} to 1`,
    `set year of ${name} to ${d.getFullYear()}`,
    `set month of ${name} to ${d.getMonth() + 1}`,
    `set day of ${name} to ${d.getDate()}`,
    `set time of ${name} to ${d.getHours() * 3600 + d.getMinutes() * 60}`,
  ].join('\n');
}

const realExecutors = {
  async reminder({ title, when }) {
    const lines = [];
    if (when) lines.push(appleDate('d', new Date(when)));
    lines.push(`tell application "Reminders" to make new reminder with properties {name:"${q(title)}"${when ? ', remind me date:d' : ''}}`);
    await run('osascript', ['-e', lines.join('\n')]);
    return `Added to Reminders.`;
  },
  async event({ title, start, end }) {
    const script = [
      appleDate('s', new Date(start)),
      appleDate('e', new Date(end)),
      'tell application "Calendar"',
      '  set target to first calendar whose writable is true',
      `  make new event at end of events of target with properties {summary:"${q(title)}", start date:s, end date:e}`,
      'end tell',
    ].join('\n');
    await run('osascript', ['-e', script]);
    return 'Added to Calendar.';
  },
  async open({ target, kind }, { openExternal }) {
    if (kind === 'url') {
      if (!/^https?:\/\//i.test(target)) throw new Error('Only web links can be opened.');
      await openExternal(target);
      return `Opened ${target}.`;
    }
    await run('open', ['-a', target]);
    return `Opened ${target}.`;
  },
  async shortcuts() {
    const out = await run('shortcuts', ['list']);
    return out.split('\n').map((l) => l.trim()).filter(Boolean);
  },
  async shortcut({ name }) {
    await run('shortcuts', ['run', name]);
    return `Ran "${name}".`;
  },
  async find({ query }) {
    const out = await run('mdfind', ['-name', query]);
    const paths = out.split('\n').filter((p) => p && !/\/(Library|node_modules|\.)/.test(p)).slice(0, 8);
    return paths.length ? paths : [];
  },
};

class Actions {
  constructor({ auditFile, notes, memory, openExternal, projects = () => [], hub = null, executors = realExecutors }) {
    this.projects = projects;
    this.hub = hub;
    this.auditFile = auditFile;
    this.notes = notes;
    this.memory = memory;
    this.openExternal = openExternal;
    this.executors = executors;
  }

  audit(entry) {
    fs.appendFileSync(this.auditFile, `${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`);
  }

  recent(limit = 30) {
    try {
      return fs.readFileSync(this.auditFile, 'utf8').trim().split('\n').filter(Boolean).slice(-limit).reverse().map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  }

  // Fuzzy-matches a spoken/typed name to one of the user's Shortcuts (exact, then prefix, then word overlap).
  async resolveShortcut(name) {
    const all = await this.executors.shortcuts().catch(() => []);
    const norm = (x) => x.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const want = norm(name);
    const words = want.split(' ').filter(Boolean);
    return all.find((s) => norm(s) === want)
      || all.find((s) => norm(s).startsWith(want))
      || all.map((s) => ({ s, hits: words.filter((w) => norm(s).split(' ').includes(w)).length })).filter((x) => x.hits).sort((a, b) => b.hits - a.hits)[0]?.s
      || null;
  }

  // command comes from the (possibly user-edited) confirm card. Returns { ok, message, results? }.
  async execute(command) {
    const started = Date.now();
    try {
      let message;
      let results;
      switch (command.action) {
        case 'note':
          message = `Saved to ${this.notes.save({ title: 'Quick note', text: command.text })}.`;
          break;
        case 'remember':
          this.memory.add(command.text);
          message = "Got it. I'll remember that. (You can edit or delete it in Settings.)";
          break;
        case 'forget': {
          const removed = this.memory.forget(command.text);
          message = removed.length ? `Forgot ${removed.length} thing${removed.length > 1 ? 's' : ''}.` : "I didn't have anything like that saved.";
          break;
        }
        case 'api': {
          const values = Object.fromEntries((command.fields || []).map((f) => [f.name, f.value]));
          const result = await this.hub.call(command.connectorId, command.opId, values);
          this.audit({ action: 'api', ok: true, connector: command.connectorName, op: command.opId, write: !command.read });
          return { ok: true, message: `**${command.connectorName}** · ${command.label}\n\n${result}`, markdown: true };
        }
        case 'briefing': {
          const { briefing } = require('../brain/projects');
          const result = await briefing(this.projects(), command.project);
          return { ok: true, message: result.text, markdown: true };
        }
        case 'find':
          results = await this.executors.find(command);
          message = results.length ? `Found ${results.length} file${results.length > 1 ? 's' : ''}:` : 'No files matched.';
          break;
        default: {
          const executor = this.executors[command.action];
          if (!executor) throw new Error(`Unknown action: ${command.action}`);
          message = await executor(command, { openExternal: this.openExternal });
        }
      }
      this.audit({ action: command.action, ok: true, ms: Date.now() - started, titleChars: String(command.title || command.text || command.target || command.query || '').length });
      return { ok: true, message, results };
    } catch (err) {
      this.audit({ action: command.action, ok: false, error: err.message.slice(0, 200) });
      const hint = /not allowed|1743|authoriz/i.test(err.message) ? ' macOS needs permission: System Settings → Privacy & Security → Automation → Loon.' : '';
      return { ok: false, message: `That didn't work: ${err.message}.${hint}` };
    }
  }
}

module.exports = { Actions, appleDate };
