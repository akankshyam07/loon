// Browser companion (DESIGN.md §3.2, §3.4, §3.14, §3.17): turns extension events into bubble sessions and tasks.
// Owns the current session: what context the bubble is about, which chips it offers, and the running task.
const { TASKS, SELECTION_CHIPS, pageChipsFor, handoffPrompt } = require('../brain/tasks');
const { keySentences } = require('../brain/textrank');
const { classifySelection } = require('../extension/lib/classify');
const { selectionPacket, pagePacket } = require('./context');
const { scopeOf } = require('../brain/memory');
const { parseCommand, describe, normalizeSpoken } = require('../brain/commands');
const { isAgentGoal } = require('../brain/agent');
const connectorsLib = require('../brain/connectors');
const { ConnectorHub } = require('./hub');

const HANDOFF_URLS = {
  claude: 'https://claude.ai/new',
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://gemini.google.com/app',
};
const HANDOFF_NAMES = { claude: 'Claude', chatgpt: 'ChatGPT', gemini: 'Gemini' };
const NUDGE_KINDS = ['shopping', 'menu', 'code'];
const HOUR = 60 * 60 * 1000;

const domainOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
const chip = (id) => ({ id, label: TASKS[id].label });

function createCompanion({ bridge, resolver, brain, ui, hooks, actions, notes, settings, hub, memory = null, agent = null }) {
  const session = { mode: 'ask', packet: null, threadStarted: false, lastTask: null, pendingTask: null };
  let activePage = null; // latest page report from the focused, visible tab
  let active = null; // { controller, id }
  const nudges = { shownFor: new Set(), byDomain: new Map(), times: [], ignored: new Map() };

  // "Send to <app>" chips for connected local apps that accept a URL.
  const sendChips = () => (hub ? hub.list().filter((x) => hub.senders.has(x.id)).map((x) => ({ id: `send:${x.id}`, label: `Send to ${x.name}` })) : []);

  // ---------- bubble context ----------
  function context() {
    const { mode, packet } = session;
    const domain = domainOf(packet?.url || activePage?.url || '');
    if (mode === 'selection') {
      return {
        mode,
        label: `Selection${domain ? ` · ${domain}` : ''}`,
        chips: [...(SELECTION_CHIPS[packet.selectionKind] || SELECTION_CHIPS.paragraph).map(chip), ...sendChips()],
        redactions: packet.redactions,
        editable: Boolean(packet.editable),
        placeholder: 'Ask about this…',
      };
    }
    if (mode === 'page') {
      const kindLabel = { shopping: 'Shopping page', menu: 'Menu', code: 'Code page', article: 'Article' }[activePage?.kind] || 'This page';
      return { mode, label: `${kindLabel}${domain ? ` · ${domain}` : ''}`, chips: [...pageChipsFor(activePage?.kind).map(chip), ...sendChips()], redactions: packet?.redactions || 0, placeholder: 'Ask about this page…' };
    }
    if (mode === 'app') {
      return {
        mode,
        label: packet.source === 'screenshot' ? 'Screenshot · read on this Mac' : packet.source === 'file' ? `File · ${packet.title}${packet.fileNote ? ` · ${packet.fileNote}` : ''}` : `Selection · ${packet.app || 'app'}`,
        chips: (SELECTION_CHIPS[packet.selectionKind] || SELECTION_CHIPS.paragraph).map(chip),
        redactions: packet.redactions,
        notice: packet.notice,
        placeholder: 'Ask about this…',
      };
    }
    if (mode === 'notice') {
      return { mode: 'ask', label: '', chips: [], notice: session.notice, placeholder: 'Ask me anything…' };
    }
    if (mode === 'sensitive') {
      return { mode, label: `Private page${domain ? ` · ${domain}` : ''}`, chips: [], sensitive: true, placeholder: 'Ask me anything…' };
    }
    if (bridge.clients.size && activePage?.sensitive) {
      return { mode: 'sensitive', label: `Private page · ${domainOf(activePage.url)}`, chips: [], sensitive: true, placeholder: 'Ask me anything…' };
    }
    // Typed questions; offer page chips when a readable page is in front, and research once notes exist.
    const pageChips = bridge.clients.size && activePage && !activePage.sensitive ? pageChipsFor(activePage.kind).slice(0, 3).map(chip) : [];
    const research = notes.files().length ? [chip('research_found')] : [];
    return {
      mode: 'ask',
      label: pageChips.length ? `About ${domainOf(activePage.url)}?` : '',
      chips: [...pageChips, ...(pageChips.length ? sendChips() : []), ...research],
      redactions: 0,
      placeholder: 'Ask me anything, or "remind me to…"',
      privacy: Boolean(settings.privacy),
    };
  }

  function startSession(mode, packet) {
    active?.controller.abort();
    brain.resetThread();
    Object.assign(session, { mode, packet, threadStarted: false, lastTask: null, pendingTask: null });
  }

  // ---------- extension events ----------
  function onBridgeMessage(message) {
    // Focus mode (§3.15): no chips popping up next to selections and no nudges; the ⌥Space and click paths still work.
    if (settings.focus && ['selection', 'selection-cleared'].includes(message.type)) return;
    if (message.type === 'page') {
      if (message.active && message.visible) {
        activePage = message;
        ui.cat('privacy', { on: Boolean(message.sensitive) });
        maybeNudge(message);
      }
    } else if (message.type === 'selection') {
      const packet = selectionPacket(message);
      startSession('selection', packet);
      ui.cat('selection', { anchor: message.anchor });
      showSelection(message, packet);
    } else if (message.type === 'selection-cleared') {
      if (session.mode === 'selection' && !session.threadStarted && !ui.bubbleFocused()) ui.hideBubble();
    } else if (message.type === 'selection-blocked') {
      ui.cat('privacy', { on: true, flash: true });
    } else if (message.type === 'context-menu') {
      const packet = selectionPacket({ ...message, kind: classifySelection(message.text) });
      startSession('selection', packet);
      ui.showBubble({ focus: true });
      ui.runInBubble(packet.selectionKind === 'word' ? 'define' : 'explain');
    }
  }

  // Instant answers where the intent is obvious and the answer is free (dictionary, error table, offline translator);
  // anything else waits behind a small paw so selecting text never throws a card in the user's face.
  async function showSelection(message, packet) {
    const kind = packet.selectionKind;
    let task = kind === 'word' ? 'define' : kind === 'stacktrace' ? 'explain_error' : null;
    if (!task && ['sentence', 'paragraph'].includes(kind) && resolver.translator) {
      const lang = await resolver.translator.detect(message.text).catch(() => null);
      if (lang && lang !== 'en') task = 'translate';
    }
    if (session.packet !== packet) return; // a newer selection arrived while detecting
    ui.showBubble({ anchor: message.anchor, focus: false, pill: !task });
    if (task) ui.runInBubble(task);
  }

  // ---------- nudges (§3.14): at most once per page, 30 min per domain, 6 per hour, back off when ignored ----------
  function maybeNudge(page) {
    if (page.sensitive || settings.focus) return;
    const kind = NUDGE_KINDS.includes(page.kind) ? page.kind : page.dense ? 'dense' : null;
    if (!kind) return;
    const now = Date.now();
    const pageKey = `${page.tabId}|${page.url}`;
    const domain = domainOf(page.url);
    const ignored = nudges.ignored.get(kind);
    if (nudges.shownFor.has(pageKey)) return;
    if (now - (nudges.byDomain.get(domain) || 0) < 30 * 60 * 1000) return;
    nudges.times = nudges.times.filter((t) => now - t < HOUR);
    if (nudges.times.length >= 6) return;
    if (ignored && ignored.count >= 3 && now - ignored.since < 24 * HOUR) return;
    nudges.shownFor.add(pageKey);
    nudges.byDomain.set(domain, now);
    nudges.times.push(now);
    ui.cat('nudge', { kind });
  }

  function onNudgeClick() {
    startSession('page', null);
    ui.showBubble({ focus: true });
  }

  function onNudgeIgnored(kind) {
    const entry = nudges.ignored.get(kind);
    const fresh = !entry || Date.now() - entry.since > 24 * HOUR;
    nudges.ignored.set(kind, fresh ? { count: 1, since: Date.now() } : { ...entry, count: entry.count + 1 });
  }

  // ---------- running tasks ----------
  async function ensurePagePacket(force = false) {
    if (session.packet?.source === 'page' && !force) return session.packet;
    const reply = await bridge.request({ type: 'get-page', tabId: activePage?.tabId, force });
    if (reply.error) throw new Error(reply.error);
    if (reply.sensitive) return null;
    return pagePacket(reply, activePage?.tabId);
  }

  // Commands ("remind me…", "open…") are parsed without a model and shown as a confirm card.
  // Local, append-only or read-only actions (notes, file search) run straight away.
  // Requests that name a connected app ("career: search python jobs") go to its API. Keyword routing picks the
  // endpoint; close calls become buttons. Reads with everything filled run straight away; the rest need ✓.
  async function connectorRequest(id, question, bubble) {
    if (!hub) return false;
    const named = connectorsLib.findConnector(question, hub.list());
    if (!named) return false;
    let ops;
    try {
      ops = await hub.ops(named.connector);
    } catch (err) {
      bubble('action-done', { id, ok: false, message: err.message });
      return true;
    }
    const pageContext = { url: session.packet?.url || activePage?.url, title: session.packet?.title || activePage?.title, text: session.packet?.source === 'selection' ? session.packet.text : undefined };
    const routed = connectorsLib.route(named.request, ops, pageContext);
    if (routed.kind === 'call') {
      const cmd = ConnectorHub.command(named.connector, routed.op, routed.values);
      if (routed.op.read && !routed.missing.length) {
        bubble('action-done', { id, ...(await actions.execute(cmd)), markdown: true });
      } else {
        bubble('confirm', { id, summary: `${named.connector.name}: ${routed.op.label}`, command: cmd });
      }
      return true;
    }
    const options = (routed.kind === 'choose' ? routed.options : ops.filter((o) => o.read).slice(0, 5));
    bubble('choices', {
      id,
      prompt: routed.kind === 'choose' ? `Which one in ${named.connector.name}?` : `I couldn't match that in ${named.connector.name}. It can:`,
      options: options.map((op) => ({ label: op.label, command: ConnectorHub.command(named.connector, op, connectorsLib.fill(op, named.request, pageContext).values), direct: op.read && !connectorsLib.fill(op, named.request, pageContext).missing.length })),
    });
    return true;
  }

  async function command(id, question, bubble, signal) {
    if (await connectorRequest(id, question, bubble)) return true;
    // "click…", "fill…", "open X and …": step-by-step with a confirm card per change (§3.13.1).
    if (agent && isAgentGoal(question)) {
      await agent.run(id, question, bubble, signal);
      return true;
    }
    // normalizeSpoken: voice transcripts say "at five"; typed text is unaffected unless it spells numbers out.
    const parsed = parseCommand(normalizeSpoken(question));
    if (!parsed) return false;
    if (parsed.action === 'shortcut') {
      const match = await actions.resolveShortcut(parsed.name);
      if (!match) {
        bubble('action-done', { id, ok: false, message: `I couldn't find a Shortcut called "${parsed.name}".` });
        return true;
      }
      parsed.name = match;
    }
    // Read-only or append-only actions run straight away; everything else gets a confirm card.
    if (['note', 'find', 'briefing', 'today', 'focus', 'recall'].includes(parsed.action)) {
      bubble('action-done', { id, ...(await actions.execute(parsed)) });
      return true;
    }
    bubble('confirm', { id, summary: describe(parsed), command: parsed });
    ui.cat('brain', { state: 'done', mood: 'curious' });
    return true;
  }

  async function confirm(command, bubble, id) {
    for (const key of ['when', 'start', 'end']) if (command[key]) command[key] = new Date(command[key]);
    const result = await actions.execute(command);
    bubble('action-done', { id, ...result });
    ui.cat('brain', { state: 'done', mood: result.ok ? 'happy' : 'confused' });
    return result;
  }

  function saveNote({ question, text }) {
    const packet = session.packet;
    return notes.save({ title: question, text, url: packet?.url });
  }

  async function run({ id, task, deeper = false, question }, bubble) {
    active?.controller.abort();
    const controller = new AbortController();
    active = { controller, id };
    try {
      if (!task && question && session.mode !== 'selection' && session.mode !== 'app' && (await command(id, question, bubble, controller.signal))) return;
      if (task?.startsWith('send:')) {
        const connector = hub?.get(task.slice(5));
        const ops = connector ? await hub.ops(connector) : [];
        const op = ops.find((o) => o.id === hub.senders.get(connector?.id));
        if (!op) throw new Error('That app is not available right now.');
        let packet = session.packet;
        if (!packet && activePage) packet = await ensurePagePacket().catch(() => null);
        const values = connectorsLib.fill(op, '', { url: packet?.url || activePage?.url, title: packet?.title || activePage?.title, text: packet?.source === 'selection' ? packet.text : undefined }).values;
        bubble('confirm', { id, summary: `Send to ${connector.name}: ${op.label}`, command: ConnectorHub.command(connector, op, values) });
        return;
      }
      let packet = session.packet;
      // In page mode every chip works on the page (e.g. Quiz me), not just the page-only tasks.
      if (TASKS[task]?.page || session.mode === 'page') {
        packet = await ensurePagePacket();
        if (!packet) {
          session.pendingTask = { id, task, deeper, question };
          session.mode = 'sensitive';
          bubble('sensitive', { id });
          ui.cat('privacy', { on: true });
          return;
        }
        if (session.packet?.source !== 'page') {
          session.packet = packet;
          session.mode = 'page';
          bubble('context', context());
        }
        if (task === 'page_summary') {
          bridge.request({ type: 'highlight', tabId: packet.tabId, quotes: keySentences(packet.text, 4) }).catch(() => {});
        }
      }
      const effectiveTask = task || (packet?.text ? 'ask' : 'ask');
      const firstInThread = !session.threadStarted;
      session.threadStarted = true;
      if (!question) session.lastTask = effectiveTask;
      ui.cat('brain', { state: 'thinking' });
      let talking = false;
      const result = await resolver.run(effectiveTask, packet || { source: 'typed', question }, {
        signal: controller.signal,
        firstInThread,
        deeper,
        question: packet?.text ? question : undefined,
        onText: (chunk) => {
          if (!talking) {
            talking = true;
            ui.cat('brain', { state: 'talking' });
          }
          bubble('chunk', { id, chunk });
        },
        // The self-check upgraded the answer: the bubble drops what it streamed and shows the new one.
        onRestart: () => {
          talking = false;
          ui.cat('brain', { state: 'thinking' });
          bubble('chunk', { id, chunk: '', restart: true });
        },
      });
      bubble('done', { id, ...result, model: brain.modelLabel(deeper || result.smart),counts: resolver.counts, memoryUsed: resolver.lastMemory || [], canGoDeeper: !['code', 'cloud'].includes(result.tier) || task === 'define' });
      // History for "what did I look up about…": local only, redacted text, never in Privacy mode.
      if (memory && !settings.privacy && result.text) {
        const subject = packet?.text ? ` · ${packet.text.replace(/\s+/g, ' ').slice(0, 80)}` : '';
        memory.logEpisode({ kind: effectiveTask, title: question || `${TASKS[effectiveTask]?.label || effectiveTask}${subject}`, text: result.text.slice(0, 300), scope: scopeOf(packet || {}) });
      }
      ui.cat('brain', { state: 'done', mood: result.mood });
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('[task]', err);
      bubble('error', { id, message: err.message });
      ui.cat('brain', { state: 'error' });
    } finally {
      if (active?.id === id) active = null;
    }
  }

  // One request only: the next page report puts the paws back (§4.1).
  async function lookAnyway(bubble) {
    const pending = session.pendingTask;
    const packet = await ensurePagePacket(true);
    Object.assign(session, { packet, mode: 'page', pendingTask: null });
    ui.cat('privacy', { on: false });
    bubble('context', context());
    if (pending) run(pending, bubble);
  }

  // Copies a ready-to-paste prompt and opens the official app/site: Loon never signs in to or scripts it.
  async function handoff({ app, task, question }) {
    const url = HANDOFF_URLS[app];
    if (!url) throw new Error(`Unknown app: ${app}`);
    let packet = session.packet;
    if (!packet && (session.mode === 'page' || TASKS[task]?.page)) packet = await ensurePagePacket();
    const prompt = handoffPrompt(task || session.lastTask || (packet ? 'explain' : 'ask'), packet || { question: question || '' }, question);
    // Screenshots hand off the picture too, so the official app can look at it.
    hooks.clipboard(prompt, packet?.imagePath);
    await hooks.openExternal(url);
    return { name: HANDOFF_NAMES[app], chars: prompt.length };
  }

  // Puts rewritten text back into the page's text field (the content script keeps the selection and undo).
  async function replace(text) {
    const tabId = session.packet?.tabId;
    if (!session.packet?.editable || !tabId) throw new Error('Nothing to replace here');
    const reply = await bridge.request({ type: 'replace', tabId, text });
    if (reply.error || !reply.ok) throw new Error(reply.error || 'The page would not accept the text');
    return { ok: true };
  }

  // ⌥Space with a selection in another app, or text read from a screenshot.
  function fromCapture({ text, app, source = 'selection', imagePath = null, lowText = false, kind = null, title = null, note = null }) {
    const packet = selectionPacket({ text, kind: kind || (source === 'screenshot' ? 'screenshot' : classifySelection(text)) });
    Object.assign(packet, { source, app, imagePath, title, fileNote: note, url: undefined, tabId: undefined });
    if (lowText) packet.notice = "I can't read much text in this picture. \u201cAsk in Claude\u201d sends the image itself.";
    startSession('app', packet);
  }

  function showNotice(notice) {
    startSession('notice', null);
    session.notice = notice;
  }

  function openAsk() {
    startSession('ask', null);
  }

  function cancel() {
    active?.controller.abort();
    active = null;
  }

  return {
    onBridgeMessage, run, lookAnyway, handoff, replace, openAsk, fromCapture, showNotice, context, cancel, onNudgeClick, onNudgeIgnored, confirm, saveNote,
    isBusy: () => Boolean(active),
    session,
    get activePage() { return activePage; },
    resetNudges: () => { nudges.shownFor.clear(); nudges.byDomain.clear(); nudges.times = []; nudges.ignored.clear(); },
  };
}

module.exports = { createCompanion };
