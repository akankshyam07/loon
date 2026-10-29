// Actions (DESIGN.md §3.13): run only after the user clicks ✓ on a confirm card, and every run is written to the
// audit log (metadata only, no content). Executors that touch other apps are swappable so tests never do.
const { execFile } = require('child_process');
const fs = require('fs');
const { describeSchedule } = require('../brain/routines');
const { when } = require('./routines');
const { redact } = require('../brain/redact');
const { coerceArgs, untrusted } = require('../brain/mcp');

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

// ["File", "New", "Note"] → menu item "Note" of menu "New" of menu item "New" of menu "File" of menu bar item "File" of menu bar 1
function menuRef(items) {
  let ref = `menu "${q(items[0])}" of menu bar item "${q(items[0])}" of menu bar 1`;
  for (const item of items.slice(1, -1)) ref = `menu "${q(item)}" of menu item "${q(item)}" of ${ref}`;
  return `menu item "${q(items.at(-1))}" of ${ref}`;
}

// macOS permission errors, turned into where to fix them.
function permissionHint(message) {
  if (/assistive|accessibility|-1719|-25211|1002\b/i.test(message)) return ' Loon needs Accessibility: System Settings → Privacy & Security → Accessibility → Loon.';
  if (/not allowed|1743|authoriz/i.test(message)) return ' macOS needs permission: System Settings → Privacy & Security → Automation → Loon.';
  return '';
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
  async activate({ app }) {
    await run('osascript', ['-e', `tell application "${q(app)}" to activate`]);
    return `${app} is in front.`;
  },
  // Clicks a menu item by its path, e.g. ["File", "New Note"], through System Events (needs Accessibility).
  async menu({ app, path: items }) {
    if (!app || !Array.isArray(items) || items.length < 2) throw new Error('A menu path needs an app, a menu and an item');
    await run('osascript', ['-e', `tell application "${q(app)}" to activate\ndelay 0.3\ntell application "System Events" to tell process "${q(app)}" to click ${menuRef(items)}`]);
    return `Clicked ${items.join(' › ')}.`;
  },
  // Types into whatever app is in front. Password managers and the login window are refused.
  async keys({ text }) {
    const front = await run('osascript', ['-e', 'tell application "System Events" to get name of first process whose frontmost is true']);
    if (/1password|keychain|lastpass|bitwarden|dashlane|loginwindow|securityagent/i.test(front)) throw new Error(`I don't type into ${front}`);
    await run('osascript', ['-e', `tell application "System Events" to keystroke "${q(text)}"`]);
    return `Typed into ${front}.`;
  },
  async shortcuts() {
    const out = await run('shortcuts', ['list']);
    return out.split('\n').map((l) => l.trim()).filter(Boolean);
  },
  async shortcut({ name }) {
    await run('shortcuts', ['run', name]);
    return `Ran "${name}".`;
  },
  // Read-only. ponytail: Calendar's AppleScript skips repeating events' later instances; EventKit would catch them.
  async events() {
    const out = await run('osascript', ['-e', [
      'set s to current date',
      'set time of s to 0',
      'set e to s + 86400',
      'set out to ""',
      'tell application "Calendar"',
      '  repeat with c in calendars',
      '    repeat with ev in (every event of c whose start date ≥ s and start date < e)',
      '      set out to out & ((start date of ev) as «class isot» as string) & tab & (allday event of ev) & tab & (summary of ev) & linefeed',
      '    end repeat',
      '  end repeat',
      'end tell',
      'return out',
    ].join('\n')]);
    return out.split('\n').filter(Boolean).map((line) => {
      const [start, allDay, ...title] = line.split('\t');
      return { start: new Date(start), allDay: allDay === 'true', title: title.join('\t') };
    }).sort((a, b) => a.start - b.start);
  },
  async dueReminders() {
    const out = await run('osascript', ['-e', [
      'set e to (current date)',
      'set time of e to 86399',
      'set out to ""',
      'tell application "Reminders"',
      '  repeat with r in (every reminder whose completed is false and due date ≤ e)',
      '    set out to out & (name of r) & linefeed',
      '  end repeat',
      'end tell',
      'return out',
    ].join('\n')]);
    return out.split('\n').map((l) => l.trim()).filter(Boolean);
  },
  async find({ query }) {
    const out = await run('mdfind', ['-name', query]);
    const paths = out.split('\n').filter((p) => p && !/\/(Library|node_modules|\.)/.test(p)).slice(0, 8);
    return paths.length ? paths : [];
  },
};

class Actions {
  // routines: the scheduler (main/routines.js), set by main.js once it exists.
  constructor({ auditFile, notes, memory, openExternal, projects = () => [], hub = null, mcp = null, onFocus = () => '', routines = null, executors = realExecutors }) {
    this.routines = routines;
    this.mcp = mcp;
    this.onFocus = onFocus;
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
  // signal: cancels a running MCP tool call (Esc / a new question).
  async execute(command, { signal } = {}) {
    const started = Date.now();
    try {
      let message;
      let results;
      switch (command.action) {
        case 'note':
          message = `Saved to ${this.notes.save({ title: 'Quick note', text: command.text })}.`;
          break;
        case 'remember':
          // Every memory goes into later prompts, so a password or key must not be saved.
          if (redact(command.text).count) { message = "That looks like a password or secret, so I won't keep it. Tell me something else to remember."; break; }
          this.memory.add(command.text);
          message = "Got it. I'll remember that. (You can edit or delete it in Settings.)";
          break;
        case 'forget': {
          // A voice command is too easy to say by accident to wipe everything; word matching would also delete odd facts.
          if (command.all) { message = 'To wipe everything I remember, use Settings → Memory. I can forget one thing at a time here.'; break; }
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
        // MCP tools (§3.13.2): reached only after ✓, or directly for read-only / auto-allowed tools. The log gets the
        // server and tool names, never the arguments or the output. Output goes back to a model only as untrusted context.
        case 'mcp': {
          const result = await this.mcp.call(command.serverId, command.tool, coerceArgs(command.fields), { signal });
          this.audit({ action: 'mcp', ok: !result.isError, server: command.serverName, tool: command.tool, write: !command.read, ms: Date.now() - started });
          return { ok: !result.isError, message: `**${command.serverName}** · ${command.label}\n\n${result.text}`, markdown: true, context: untrusted(result.text, command.serverName, command.tool) };
        }
        case 'briefing': {
          const { briefing } = require('../brain/projects');
          const result = await briefing(this.projects(), command.project);
          return { ok: true, message: result.text, markdown: true };
        }
        case 'today': {
          const settle = (p) => p.then((value) => ({ value }), (err) => ({ error: err.message }));
          const [events, reminders] = await Promise.all([settle(this.executors.events()), settle(this.executors.dueReminders())]);
          return { ok: true, message: formatDay({ events, reminders }), markdown: true };
        }
        case 'recall':
          if (command.about) return { ok: true, message: require('../brain/graph').formatAbout(this.memory.about(command.about), command.about), markdown: true };
          return { ok: true, message: command.facts ? formatFacts(this.memory.all()) : formatHistory(this.memory.searchEpisodes(command.query), command.query), markdown: true };
        case 'focus':
          message = this.onFocus(command.minutes);
          break;
        // Routines (§3.19): created and deleted only from a confirm card; pause/resume are reversible.
        case 'routine': {
          const r = this.routines.createFromCommand(command);
          message = `Saved "${r.label}", ${describeSchedule(r.schedule)}.${r.nextRun ? ` First run ${when(r.nextRun)}.` : ''} Pause, edit or delete it in Settings → Routines.`;
          break;
        }
        case 'routineDelete':
          this.routines.remove(command.routineId);
          message = "Deleted. That routine won't run again.";
          break;
        case 'routinePause': {
          const r = this.routines.setEnabled(command.routineId, command.on);
          message = command.on ? `"${r.label}" is back on.${r.nextRun ? ` Next run ${when(r.nextRun)}.` : ''}` : `Paused "${r.label}". Say "resume ${r.label}" to turn it back on.`;
          break;
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
      // Error text can come from another app or tool server, so secrets are redacted before it's logged.
      this.audit({ action: command.action, ok: false, ...(command.action === 'mcp' ? { server: command.serverName, tool: command.tool } : {}), error: redact(err.message).text.slice(0, 200) });
      return { ok: false, message: `That didn't work: ${err.message}.${permissionHint(err.message)}` };
    }
  }
}

// events/reminders are { value } or { error }; a missing macOS permission shows as a hint instead of failing the briefing.
function formatDay({ events, reminders }, now = new Date()) {
  const hour = now.getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const time = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const denied = (err) => (/not allowed|1743|authoriz/i.test(err) ? 'needs permission: System Settings → Privacy & Security → Automation → Loon' : "couldn't read it");
  const lines = [`**${hello}!** Here's ${now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}.`, ''];
  if (events.error) lines.push(`**Calendar**: ${denied(events.error)}`);
  else {
    const left = events.value.filter((e) => e.allDay || e.start >= new Date(now.getTime() - 15 * 60 * 1000));
    lines.push(left.length ? '**Calendar**' : '**Calendar**: nothing left today.');
    for (const e of left) lines.push(`- ${e.allDay ? 'all day' : time(e.start)} · ${e.title}`);
  }
  lines.push('');
  if (reminders.error) lines.push(`**Reminders**: ${denied(reminders.error)}`);
  else {
    lines.push(reminders.value.length ? '**Reminders due**' : '**Reminders**: nothing due.');
    for (const r of reminders.value.slice(0, 8)) lines.push(`- ${r}`);
  }
  return lines.join('\n').trim();
}

function formatFacts(facts) {
  if (!facts.length) return 'Nothing yet. Tell me "remember that…" and I\'ll keep it here, on this Mac.';
  return ['**What I remember about you**', '', ...facts.map((f) => `- ${f.pinned ? '📌 ' : ''}${f.text}${f.scope ? ` _(on ${f.scope})_` : ''}`), '', '_Edit or delete any of these in Settings → Memory._'].join('\n');
}

function ago(at, now = Date.now()) {
  const days = Math.floor((now - at) / 86400000);
  if (days < 1) return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'yesterday';
  return days < 7 ? `${days} days ago` : new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatHistory(episodes, query, now = Date.now()) {
  if (!episodes.length) return query ? `I don't have anything about "${query}" in your history.` : 'Your history is empty so far.';
  const lines = [query ? `**About "${query}"**` : '**Recently**', ''];
  for (const e of episodes) {
    lines.push(`- **${e.title}** · ${ago(e.at, now)}${e.scope ? ` · ${e.scope}` : ''}`);
    if (e.text) lines.push(`  ${e.text.replace(/\s+/g, ' ').slice(0, 140)}${e.text.length > 140 ? '…' : ''}`);
  }
  return lines.join('\n');
}

module.exports = { Actions, appleDate, formatDay, formatHistory, menuRef, permissionHint };
