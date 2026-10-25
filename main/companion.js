// Browser companion (DESIGN.md §3.2, §3.4, §3.14, §3.17): turns extension events into bubble sessions and tasks.
// Owns the current session: what context the bubble is about, which chips it offers, and the running task.
const { TASKS, SELECTION_CHIPS, pageChipsFor, handoffPrompt } = require('../brain/tasks');
const { keySentences } = require('../brain/textrank');
const { classifySelection } = require('../extension/lib/classify');
const { selectionPacket, pagePacket } = require('./context');
const { discardShot } = require('./capture');
const { scopeOf } = require('../brain/memory');
const { parseCommand, describe, normalizeSpoken } = require('../brain/commands');
const { isAgentGoal } = require('../brain/agent');
const { teachIntent } = require('../brain/teach');
const crypto = require('crypto');
const { cleanPersonal, parseFeedback, suggestMemory, secondPerson, normalizeFact, styleNudge, factFromAnswer, chatMarkdown, chatFacts, onboardingResult } = require('../brain/personal');
const { MODES, detectMode, orderChips, badgeFor } = require('../brain/modes');
const connectorsLib = require('../brain/connectors');
const { ConnectorHub, McpHub } = require('./hub');
const mcpLib = require('../brain/mcp');
const persona = require('../renderer/persona');
const { BROWSERS } = require('./teach');
const { windowKey } = require('./screen');
const { imageRoute } = require('../brain/vision');

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
// "Teach me on my screen" (§3.18): not resolver tasks; main/teach.js runs them.
const TEACH_CHIPS = { teach_explain: 'Show me on screen', teach_follow: 'Follow the video' };
const teachChip = (id) => ({ id, label: TEACH_CHIPS[id] });
const TEACH_DONE = /^(?:done|stop|hide(?: it| that| them)?|clear(?: it)?|close(?: it)?|got it|thanks?|ok(?:ay)?)$/i;
const TEACH_NEXT = /^(?:next(?: step)?|ok(?:ay)?,? next|what'?s next|continue)$/i;

// saveSettings: called after feedback like "shorter please" changes the reply style.
// routines: the scheduler (main/routines.js); "every morning at 9…", "show my routines" and friends go to it.
// mcp: the MCP servers (main/hub.js McpHub), or null.
// Questions that point at what's on screen, and the subset that just means "tell me what this is".
const PAGE_QUESTION = /\b(this|the|my|that) (page|site|website|tab|listing|product|item|article|post|shop|store|screen|menu)\b|\bwhat (do|can) you see\b|\bcan you see\b|\b(see|read|look at) (this|it|that)\b|\bwhat'?s (on here|here|on (the |my )?screen)\b|\bwhich (one|of these)\b|\b(these|those) (items|products|ones|options)\b|\bis (this|it) (a )?(good|worth)/i;
// Mid-conversation, "which one?" or "these" refer to the chat, not the screen; only an unmistakable reference counts.
// "the window" is often the topic itself (a TCP window, a window function), so only this/my/that count.
const CLEAR_SCREEN = /\b(this|my|that) (page|site|website|tab|listing|screen|window|product|item|article|menu)\b|\bwhat (do|can) you see\b|\bcan you see\b|\blook at (this|it|my screen)\b|\bon (my|the) screen\b/i;
// Typed questions that mean one of the page's own tasks ("which is the best value?", "what's lightest?"): the code
// answers from the page instead of the model guessing without it. kinds: page kinds it applies to (null: any page).
const PAGE_TASK_QUESTIONS = [
  { task: 'food_lightest', kinds: ['menu'], re: /\b(lightest|low(est)?[- ]?cal\w*|fewest calories|healthiest|least fattening|on a diet)\b/i },
  { task: 'food_protein', kinds: ['menu'], re: /\bprotein\b/i },
  { task: 'food_veg', kinds: ['menu'], re: /\b(vegetarian|vegan|meatless|plant[- ]based|no meat|don'?t eat meat)\b/i },
  { task: 'shop_value', kinds: null, re: /\b(best value|best deal|better deal|cheapest|cheaper|price per|unit price|most for (my|the) money|bang for (the|my) buck)\b/i },
];
const pageTaskFor = (question, kind) => PAGE_TASK_QUESTIONS.find((q) => (!q.kinds || q.kinds.includes(kind)) && q.re.test(question))?.task || null;
const GENERIC_LOOK = /^\s*(what (do|can) you see|can you see( this| it| my screen)?|see this( page)?|look at this( page)?|what'?s on (this|the|my) (page|screen)|what'?s this( page)?|(summari[sz]e|explain) (this|the) page)\s*[?.!]*\s*$/i;
// Seeing the screen (§3.20): only when asked, only the window in front, and only with the user's say-so once.
const CANT_SEE = "I can't see your screen right now 🙈\n\nTurn on **Look at my screen when I ask** in Settings, or allow Loon in System Settings → Privacy & Security → **Screen Recording**.";
const PRIVATE_EYES = "Privacy mode is on, so I'm not looking at your screen. Select some text and press **⌥Space** if you want me to read just that.";
const SCREEN_CONSENT = "I can look at the window you're on when you ask about it. The screenshot stays on your Mac and is thrown away right after.";
const LOOK_AGAIN = /^\s*(look again|look now|refresh|check again|take another look|have another look)\b/i;
const LOOK_CHIP = 'screen_look'; // the "Look at my screen" chip and "Look again" in the ⋯ menu

// screenSight: main/screen.js (frontWindow, look, downscale); without it a screen question gets the honest CANT_SEE.
function createCompanion({ bridge, resolver, brain, ui, hooks, actions, notes, settings, hub, mcp = null, memory = null, agent = null, teacher = null, routines = null, screenSight = null, saveSettings = () => {} }) {
  // turns: the bubble thread's answers so far [{ question, answer, tier, target }], for follow-ups (DESIGN.md §2.10).
  // Kept in memory only and cleared with the session, so Privacy mode never writes it anywhere.
  // historyId: this thread's row in History (memory.db conversations); answers: per bubble answer id, what 👍/👎 and
  // "Remember this" need (task, tier, difficulty, length, text), kept in memory only.
  const session = { mode: 'ask', packet: null, threadStarted: false, turns: [], lastTask: null, pendingTask: null, historyId: crypto.randomUUID(), answers: new Map(), restored: null };
  let activePage = null; // latest page report from the focused, visible tab
  let active = null; // { controller, id }
  const nudges = { shownFor: new Set(), byDomain: new Map(), times: [], ignored: new Map() };

  // "Send to <app>" chips for connected local apps that accept a URL.
  const sendChips = () => (hub ? hub.list().filter((x) => hub.senders.has(x.id)).map((x) => ({ id: `send:${x.id}`, label: `Send to ${x.name}` })) : []);

  // ---------- bubble context ----------
  // Context mode (brain/modes.js): from the selection, the page in front, the app, or the onboarding role; the cat menu
  // can pin one. Never on private pages.
  function currentMode() {
    const { mode, packet } = session;
    if (mode === 'sensitive' || mode === 'onboard' || (activePage?.sensitive && !packet)) return null;
    const page = bridge.clients.size && activePage && !activePage.sensitive ? activePage : null;
    const fromPacket = packet && ['selection', 'app'].includes(mode);
    return detectMode({
      url: packet?.url || page?.url || '',
      pageKind: fromPacket ? null : page?.kind,
      selectionKind: fromPacket ? (packet.editable ? 'editable' : packet.selectionKind) : null,
      app: packet?.app || '',
      role: settings.role,
      override: settings.modeOverride,
    });
  }

  function context() {
    const base = baseContext();
    const mode = currentMode();
    return { ...base, privacy: Boolean(settings.privacy), chips: orderChips(base.chips || [], mode), modeBadge: badgeFor(mode), ...(session.restored && base.mode === 'ask' ? { thread: session.restored } : {}) };
  }

  function baseContext() {
    const { mode, packet } = session;
    const domain = domainOf(packet?.url || activePage?.url || '');
    if (mode === 'selection') {
      return {
        mode,
        label: `Selection${domain ? ` · ${domain}` : ''}`,
        chips: [...(SELECTION_CHIPS[packet.selectionKind] || SELECTION_CHIPS.paragraph).map(chip), ...sendChips(), ...(teacher ? [teachChip('teach_explain')] : [])],
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
        chips: [...(SELECTION_CHIPS[packet.selectionKind] || SELECTION_CHIPS.paragraph).map(chip), ...(teacher && packet.source !== 'file' ? [teachChip('teach_explain')] : [])],
        redactions: packet.redactions,
        notice: packet.notice,
        placeholder: 'Ask about this…',
      };
    }
    if (mode === 'screen') {
      return {
        mode,
        label: `Looking at: ${[packet.app, packet.title].filter(Boolean).join(' · ')}`,
        chips: [...['screen_summary', 'explain', 'summarize'].map(chip), ...(teacher ? [teachChip('teach_explain')] : [])],
        redactions: packet.redactions,
        notice: packet.lowText ? "I can't read much text in this window. Press ⌥⇧S and pick just the part you mean." : undefined,
        placeholder: 'Ask about this window…',
      };
    }
    if (mode === 'teach') {
      const video = bridge.clients.size && activePage && !activePage.sensitive;
      return {
        mode: 'ask',
        label: 'Teach me on screen',
        chips: [teachChip('teach_explain'), ...(video ? [teachChip('teach_follow')] : [])],
        notice: 'Ask "where is the Export button?" or "show me how to…", and I\'ll point at it on your screen. I look only now, on this Mac, and keep nothing.',
        placeholder: 'Where is…? Show me how to…',
      };
    }
    if (mode === 'onboard') {
      return { mode: 'onboard', label: 'Get to know you', chips: [], onboard: { companion: settings.companion || 'luna', privacy: Boolean(settings.privacy) }, placeholder: '' };
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
      lookChip: Boolean(screenSight) && !pageChips.length && !settings.privacy && settings.screenSight !== 'off',
      greeting: session.greeting, // the companion's hello in an empty bubble (flavor, not an answer)
    };
  }

  function startSession(mode, packet) {
    active?.controller.abort();
    if (session.packet?.imagePath && session.packet.imagePath !== packet?.imagePath) discardShot(session.packet.imagePath);
    brain.resetThread();
    Object.assign(session, { mode, packet, threadStarted: false, turns: [], lastTask: null, pendingTask: null, historyId: crypto.randomUUID(), answers: new Map(), restored: null });
    const flavor = currentMode();
    session.greeting = (flavor && persona.line(settings.companion, `mode.${flavor}`)) || persona.line(settings.companion, 'greeting');
  }

  // The bubble closed: the next question starts a new thread (and a new History entry).
  function endThread() {
    brain.resetThread();
    if (session.packet?.imagePath && discardShot(session.packet.imagePath)) session.packet.imagePath = null;
    Object.assign(session, { threadStarted: false, turns: [], historyId: crypto.randomUUID(), answers: new Map(), restored: null });
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

  // ---------- seeing the screen (§3.20) ----------
  // Eyes ladder: Chrome in front with the extension paired → the page's exact text; anything else → the front window.
  async function chooseEyes() {
    if (!bridge.clients.size || !activePage) return 'screen';
    if (!screenSight) return 'page';
    const front = await screenSight.frontWindow();
    return !front || BROWSERS.test(front.app) ? 'page' : 'screen';
  }

  // A follow-up re-reads the screen only when another window came to the front.
  async function frontChanged() {
    if (!screenSight) return false;
    const front = await screenSight.frontWindow();
    return Boolean(front) && windowKey(front) !== session.packet.windowKey;
  }

  // → { packet, png } or null after telling the user why not (off, Privacy mode, first-time consent, private window,
  // no Screen Recording permission). pending: the request to run again once the user allows it.
  async function lookAtScreen(id, bubble, pending) {
    const say = (message) => {
      bubble('action-done', { id, ok: true, markdown: true, message });
      ui.cat('brain', { state: 'done', mood: 'confused' });
      return null;
    };
    if (!screenSight || settings.screenSight === 'off') return say(CANT_SEE);
    if (settings.privacy) return say(PRIVATE_EYES);
    if (settings.screenSight !== 'when-asked') {
      session.pendingTask = pending;
      bubble('confirm', { id, summary: SCREEN_CONSENT, command: { action: 'screen-consent' }, buttons: { yes: 'Allow when I ask', no: 'Not now', cancelled: "Okay, I won't look." } });
      ui.cat('brain', { state: 'done', mood: 'curious' });
      return null;
    }
    ui.cat('brain', { state: 'thinking' });
    const seen = await screenSight.look();
    if (seen.refused === 'sensitive') ui.cat('privacy', { on: true, flash: true });
    if (seen.refused) return say(seen.message);
    return seen;
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

  // MCP tools (§3.13.2), the same way: a request that names a server ("github: my open issues") or a tool outright
  // ("run search_issues") is routed by keywords. Close calls go to the local model, which may only pick a tool name
  // (grammar-constrained), and then to buttons. Read-only or auto-allowed tools with everything filled run straight
  // away; anything else, and any tool the model picked, gets a confirm card with the arguments to check and edit.
  async function mcpRequest(id, question, bubble, signal) {
    if (!mcp) return false;
    const servers = mcp.list();
    let server = null;
    let request = question;
    let ops;
    let routed = null;
    const pageContext = { url: session.packet?.url || activePage?.url, title: session.packet?.title || activePage?.title, text: session.packet?.source === 'selection' ? session.packet.text : undefined };
    const named = connectorsLib.findConnector(question, servers);
    try {
      if (named) {
        server = named.connector;
        request = named.request;
        const tools = await mcp.enabledTools(server);
        ops = mcpLib.toOps(tools, server.tools);
        const direct = mcpLib.namedTool(request, tools);
        routed = direct ? { kind: 'call', op: ops.find((o) => o.id === direct.name), ...connectorsLib.fill(ops.find((o) => o.id === direct.name), request, pageContext) } : connectorsLib.route(request, ops, pageContext);
      } else {
        for (const s of servers) {
          const tool = mcpLib.namedTool(question, mcp.cachedTools(s));
          if (!tool) continue;
          server = s;
          request = question.replace(new RegExp(tool.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');
          ops = mcpLib.toOps(mcp.cachedTools(s), s.tools);
          const op = ops.find((o) => o.id === tool.name);
          routed = { kind: 'call', op, ...connectorsLib.fill(op, request, pageContext) };
          break;
        }
        if (!server) return false;
      }
    } catch (err) {
      bubble('action-done', { id, ok: false, message: `${server.name}: ${err.message}` });
      return true;
    }
    if (!ops.length) {
      bubble('action-done', { id, ok: false, message: `${server.name} has no tools turned on. Check Settings → Tools (MCP).` });
      return true;
    }
    let picked = false;
    if (routed.kind !== 'call') {
      const op = await pickWithModel(request, ops, mcp.cachedTools(server), signal);
      if (op) {
        routed = { kind: 'call', op, ...connectorsLib.fill(op, request, pageContext) };
        picked = true;
      }
    }
    if (routed.kind === 'call') {
      const cmd = McpHub.command(server, routed.op, routed.values);
      if (routed.op.read && !routed.missing.length && !picked) {
        ui.cat('brain', { state: 'thinking' });
        const result = await actions.execute(cmd, { signal });
        rememberToolTurn(cmd, result);
        bubble('action-done', { id, ...result, markdown: true });
        ui.cat('brain', { state: 'done', mood: result.ok ? 'happy' : 'confused' });
      } else {
        bubble('confirm', { id, summary: `${server.name}: ${routed.op.label}`, command: cmd });
        ui.cat('brain', { state: 'done', mood: 'curious' });
      }
      return true;
    }
    const options = routed.kind === 'choose' ? routed.options : ops.slice(0, 5);
    bubble('choices', {
      id,
      prompt: routed.kind === 'choose' ? `Which one in ${server.name}?` : `I couldn't match that in ${server.name}. It can:`,
      options: options.map((op) => {
        const { values, missing } = connectorsLib.fill(op, request, pageContext);
        return { label: op.label, command: McpHub.command(server, op, values), direct: op.read && !missing.length };
      }),
    });
    return true;
  }

  // The local model as a fallback picker: only a tool name from the list, never arguments, never a direct run.
  async function pickWithModel(request, ops, tools, signal) {
    if (!brain?.chat || !tools.length) return null;
    try {
      let raw = '';
      await brain.chat(mcpLib.pickPrompt(request, tools), { onText: (t) => { raw += t; }, signal, maxTokens: 60, jsonSchema: mcpLib.pickSchema(tools) });
      const name = JSON.parse(raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()).tool;
      return ops.find((o) => o.id === name) || null;
    } catch {
      return null; // no model, or nothing usable: the buttons decide
    }
  }

  // A tool's output joins the thread as untrusted context, so "summarize that" works and can't be steered by it.
  function rememberToolTurn(cmd, result) {
    if (cmd.action === 'mcp' && result.ok && result.context) session.turns.push({ question: `${cmd.serverName}: ${cmd.label}`, answer: result.context, tier: 'code' });
  }

  async function command(id, question, bubble, signal) {
    if (teacher && (await teachRequest(id, question, bubble, signal))) return true;
    if (await connectorRequest(id, question, bubble)) return true;
    if (await mcpRequest(id, question, bubble, signal)) return true;
    // "click…", "fill…", "open X and …": step-by-step with a confirm card per change (§3.13.1).
    if (agent && isAgentGoal(question)) {
      await agent.run(id, question, bubble, signal);
      return true;
    }
    // normalizeSpoken: voice transcripts say "at five"; typed text is unaffected unless it spells numbers out.
    if (routines && (await routines.handleText(id, normalizeSpoken(question), bubble, { page: activePage, execute: (cmd) => actions.execute(cmd) }))) return true;
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
    if (['note', 'notes', 'find', 'briefing', 'today', 'focus', 'timer', 'recall'].includes(parsed.action)) {
      bubble('action-done', { id, ...(await actions.execute(parsed)) });
      return true;
    }
    bubble('confirm', { id, summary: describe(parsed), command: parsed });
    ui.cat('brain', { state: 'done', mood: 'curious' });
    return true;
  }

  // "where is…", "show me how to…", "follow along", or anything typed in the Teach bubble; "next" / "done" while
  // callouts are up. Only annotates the screen; the agent above is what acts.
  async function teachRequest(id, question, bubble, signal) {
    const text = String(question || '').trim().replace(/[.!?]+$/, '');
    if (teacher.active() && TEACH_NEXT.test(text)) {
      await teacher.next();
      bubble('action-done', { id, ok: true, message: 'Next step is on your screen.' });
      return true;
    }
    if (teacher.active() && TEACH_DONE.test(text)) {
      teacher.done();
      bubble('action-done', { id, ok: true, message: 'Cleared.' });
      return true;
    }
    const intent = teachIntent(text) || (session.mode === 'teach' ? { mode: 'how', goal: text, question: text } : null);
    if (!intent) return false;
    await runTeach(id, intent, bubble, signal);
    return true;
  }

  async function runTeach(id, intent, bubble, signal) {
    ui.cat('brain', { state: 'thinking' });
    const result = await teacher.run(id, intent, bubble, signal);
    if (result?.ok) session.turns.push({ question: intent.question || TEACH_CHIPS.teach_explain, answer: '(pointed at it on screen)', tier: 'code' });
    ui.cat('brain', { state: 'done', mood: result?.ok ? 'happy' : 'confused' });
  }

  async function confirm(command, bubble, id) {
    // "Allow when I ask" on the first-time card: remembered, then the question that asked runs.
    if (command.action === 'screen-consent') {
      settings.screenSight = 'when-asked';
      saveSettings();
      const pending = session.pendingTask;
      session.pendingTask = null;
      if (pending) return run(pending, bubble);
      bubble('action-done', { id, ok: true, message: 'Okay. Ask me about any window and I\'ll look.' });
      return { ok: true };
    }
    // Privacy mode remembers nothing, whichever chip or command asked.
    if (command.action === 'remember' && settings.privacy) {
      const result = { ok: false, message: "Privacy mode is on, so I'm not remembering anything." };
      bubble('action-done', { id, ...result });
      return result;
    }
    for (const key of ['when', 'start', 'end']) if (command[key]) command[key] = new Date(command[key]);
    const result = await actions.execute(command);
    rememberToolTurn(command, result);
    bubble('action-done', { id, ...result });
    ui.cat('brain', { state: 'done', mood: result.ok ? 'happy' : 'confused' });
    return result;
  }

  function saveNote({ question, text }) {
    const packet = session.packet;
    return notes.save({ title: question, text, url: packet?.url });
  }

  // "Remember this?" (§3.12.1): a stated preference in a typed message becomes a ✓/✗ chip after the answer. Never
  // saved without ✓; ✗ means don't ask about that text again. Nothing in Privacy mode.
  function memorySuggestion(question) {
    if (!memory || settings.privacy) return null;
    const fact = suggestMemory(question);
    if (!fact) return null;
    const key = normalizeFact(fact);
    if ((settings.dismissedSuggestions || []).includes(key) || memory.all().some((f) => normalizeFact(f.text) === key)) return null;
    return { text: fact, label: `Remember that ${secondPerson(fact)}?` };
  }

  function dismissSuggestion(text) {
    settings.dismissedSuggestions = [...(settings.dismissedSuggestions || []), normalizeFact(text)].slice(-200);
    saveSettings();
  }

  async function run({ id, task, deeper = false, question }, bubble) {
    active?.controller.abort();
    const controller = new AbortController();
    active = { controller, id };
    try {
      // Feedback about replies ("too long", "less emoji") changes the reply style in code, before any model. Inside a
      // thread, "make it shorter" is about the last answer, so it goes to the model as a follow-up instead.
      const feedback = !task && question && !session.turns.length && parseFeedback(question, settings.personal);
      if (feedback) {
        settings.personal = cleanPersonal({ ...settings.personal, ...feedback.patch });
        saveSettings();
        bubble('action-done', { id, ok: true, message: feedback.note });
        ui.cat('brain', { state: 'done', mood: 'happy' });
        return;
      }
      if (!task && question && session.mode !== 'selection' && session.mode !== 'app' && (await command(id, question, bubble, controller.signal))) return;
      if (teacher && TEACH_CHIPS[task]) {
        // From a selection or screenshot: point at that text and what's around it on the screen.
        const about = session.packet?.text && session.packet.source !== 'screenshot' ? `Explain "${session.packet.text.replace(/\s+/g, ' ').slice(0, 200)}" and point at it and the parts around it.` : 'Explain what I\'m looking at.';
        await runTeach(id, task === 'teach_follow' ? { mode: 'follow', question: 'follow along' } : { mode: 'explain', question: about }, bubble, controller.signal);
        return;
      }
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
      // A typed or spoken question about what's in front ("what do you see?", "is this a good deal?"), the "Look at my
      // screen" chip, or "look again" counts as asking Loon to look (§4, §3.20). Never a model pretending to see.
      const onScreen = session.packet?.source === 'screen';
      const lookChip = task === LOOK_CHIP;
      const again = Boolean(onScreen && question && LOOK_AGAIN.test(question));
      // A page task named on a menu or shop page is unmistakable even mid-conversation; "cheapest" on any page only at the start.
      const pageTask = !task && question && bridge.clients.size && activePage && !activePage.sensitive ? pageTaskFor(question, activePage.kind) : null;
      const namesPageTask = Boolean(pageTask && (['menu', 'shopping'].includes(activePage.kind) || !session.turns.length));
      const aboutScreen = Boolean(!task && question && session.mode === 'ask' && !session.packet && (namesPageTask || (session.turns.length ? CLEAR_SCREEN.test(question) : PAGE_QUESTION.test(question))));
      let image = null;
      if (lookChip || again || aboutScreen || (onScreen && !task && question && (await frontChanged()))) {
        const generic = lookChip || again || (aboutScreen && GENERIC_LOOK.test(question));
        if (namesPageTask || (await chooseEyes()) === 'page') { // page tasks need the page's data, whatever window is in front
          session.mode = 'page';
          if (generic) { task = 'page_summary'; question = undefined; } else if (namesPageTask) { task = pageTask; question = undefined; }
        } else {
          const seen = await lookAtScreen(id, bubble, { id, task, deeper, question });
          if (!seen) return;
          Object.assign(session, { packet: seen.packet, mode: 'screen' });
          bubble('context', context());
          // The picture goes along only when the user allowed screenshots for a route that takes them; then it's dropped.
          if (screenSight.downscale && imageRoute(settings)) image = screenSight.downscale(seen.png);
          if (generic) { task = 'screen_summary'; question = undefined; }
        }
      }
      // Already looking at the page: a follow-up that names a page task runs it ("and the most protein?").
      if (namesPageTask && !task && session.mode === 'page') { task = pageTask; question = undefined; }
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
      // Follow-up rule: any typed (or spoken) message, or "Go deeper", after an answer in this bubble carries the thread.
      // A chip is a fresh task on the same context, so it runs (and caches) like a first turn.
      const history = (question || deeper) ? session.turns.slice() : [];
      const firstInThread = !history.length;
      session.threadStarted = true;
      if (!question) session.lastTask = effectiveTask;
      ui.cat('brain', { state: 'thinking' });
      const sensitive = session.mode === 'sensitive' || Boolean(activePage?.sensitive);
      // Personality (§5.0.3) is flavor around the answer: a cameo in the cat window and a short line shown beside the
      // answer. It never reaches the resolver or the prompt, so the answer, its cost and its speed are the same.
      const cameo = persona.cameoFor({ companion: settings.companion, task: effectiveTask, pageKind: packet?.source === 'page' ? activePage?.kind : null, sensitive, enabled: settings.cameos !== false });
      if (cameo) ui.cat('cameo', cameo);
      const flavor = cameo ? cameo.line : persona.flavorFor({ companion: settings.companion, task: effectiveTask, judgmental: settings.judgmental });
      let talking = false;
      const result = await resolver.run(effectiveTask, packet || { source: 'typed', question }, {
        signal: controller.signal,
        firstInThread,
        deeper,
        question: packet?.text ? question : undefined,
        sensitive, // no cloud tier on private pages
        history,
        domain: MODES[currentMode()]?.domain || '',
        image,
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
      const turn = result.text && { question: question || `${TASKS[effectiveTask]?.label || effectiveTask}${deeper ? ' (go deeper)' : ''}`, answer: result.text, tier: result.tier, target: result.target };
      if (turn) session.turns.push(turn);
      if (result.text) session.answers.set(id, { task: effectiveTask, tier: result.tier, difficulty: result.difficulty || '', chars: result.text.length, text: result.text });
      bubble('done', { id, ...result, model: brain.modelLabel(deeper || result.smart),counts: resolver.counts, memoryUsed: resolver.lastMemory || [], canGoDeeper: !['code', 'cloud'].includes(result.tier) || task === 'define', fromScreen: packet?.source === 'screen', ...(flavor ? { flavor } : {}) });
      // History ("what did I look up about…", Settings → History → Continue): local only, redacted text, never in Privacy
      // mode or on a private page.
      if (memory && !settings.privacy && !sensitive && turn) {
        const subject = packet?.text && !question ? ` · ${packet.text.replace(/\s+/g, ' ').slice(0, 80)}` : '';
        const scope = scopeOf(packet || {});
        memory.logEpisode({ kind: effectiveTask, title: `${turn.question}${subject}`, text: result.text.slice(0, 300), scope, session: session.historyId });
        memory.saveTurn(session.historyId, { ...turn, question: `${turn.question}${subject}` }, { scope });
      }
      const suggestion = !task && question && memorySuggestion(question);
      if (suggestion) bubble('suggest', { id, ...suggestion });
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

  // ---------- per-answer actions (§3.12.1) ----------
  // 👍/👎 on bubble answer `id`: metadata into memory.db (the answer text only with settings.feedbackText), one vote
  // per answer, nothing in Privacy mode. A 👎 may come back with a reply-style nudge chip; settings never change here.
  function feedback({ id, vote }) {
    const meta = session.answers.get(id);
    if (!memory || settings.privacy || !meta || meta.voted || ![1, -1].includes(vote)) return { saved: false };
    meta.voted = vote;
    const personal = cleanPersonal(settings.personal);
    memory.recordFeedback({ vote, task: meta.task, tier: meta.tier, difficulty: meta.difficulty, length: personal.length, chars: meta.chars, answer: settings.feedbackText ? meta.text : '' });
    const nudge = vote < 0 ? styleNudge(memory.recentFeedback(), personal, settings.dismissedNudges || []) : null;
    return { saved: true, ...(nudge ? { nudge: { key: nudge.key, label: nudge.label } } : {}) };
  }

  // The nudge chip's ✓ applies the change (the same as Settings would); ✗ means never suggest that one again.
  function answerNudge({ key, accept }) {
    const nudge = memory && styleNudge(memory.recentFeedback(), settings.personal, settings.dismissedNudges || []);
    if (!nudge || nudge.key !== key) return { ok: false };
    if (accept) settings.personal = cleanPersonal({ ...settings.personal, ...nudge.patch });
    else settings.dismissedNudges = [...(settings.dismissedNudges || []), key].slice(-50);
    saveSettings();
    return { ok: true, message: accept ? `Done: ${cleanPersonal(settings.personal).length} answers by default. Change it in Settings.` : "Okay, I won't suggest that again." };
  }

  // "Remember this": a proposed fact from the selected sentence or the answer's first sentence. Saved only from the
  // confirm card (the remember action), never here.
  function proposeMemory({ id, selection = '' }) {
    if (settings.privacy) return { text: '', privacy: true };
    return { text: factFromAnswer(session.answers.get(id)?.text || '', String(selection).slice(0, 1000)) };
  }

  // Ticked facts from "Save this chat", through the normal remember action.
  async function rememberFacts(texts = []) {
    if (!memory || settings.privacy) return { saved: 0 };
    let saved = 0;
    for (const text of texts.filter((t) => typeof t === 'string' && t.trim()).slice(0, 5)) {
      if ((await actions.execute({ action: 'remember', text: text.trim().slice(0, 200) })).ok) saved++;
    }
    return { saved };
  }

  // "Save this chat": the thread as markdown in the notes folder, plus up to 3 facts the user stated in it to tick.
  function saveChat() {
    const turns = session.turns;
    if (!turns.length) throw new Error('Nothing to save yet');
    const file = notes.save({ title: `Chat · ${turns[0].question.replace(/\s+/g, ' ').slice(0, 60)}`, text: chatMarkdown(turns), url: session.packet?.url });
    const facts = memory && !settings.privacy ? chatFacts(turns, { known: memory.all().map((f) => f.text), dismissed: settings.dismissedSuggestions || [] }) : [];
    return { file, facts };
  }

  // History → Continue: the stored turns become this bubble's thread, so a follow-up carries them; new answers are
  // added to the same History entry.
  function continueConversation(id) {
    const saved = memory?.conversation(id);
    if (!saved) return false;
    startSession('ask', null);
    Object.assign(session, {
      turns: saved.turns.map(({ question, answer, tier, target }) => ({ question, answer, tier, target })),
      historyId: saved.id,
      threadStarted: true,
      restored: saved.turns.map(({ question, answer }) => ({ question, answer })),
    });
    return true;
  }

  // ---------- "Get to know you" (onboarding) ----------
  function openOnboarding() {
    startSession('onboard', null);
  }

  // answers come from the bubble; facts are re-derived here and only the ticked ones (keep) are saved, pinned. In
  // Privacy mode only the reply style is kept.
  function saveOnboarding({ answers = {}, keep = [] } = {}) {
    const result = onboardingResult(answers);
    const facts = result.facts.filter((f) => keep.includes(f));
    const store = Boolean(memory) && !settings.privacy;
    if (store) for (const text of facts) memory.add(text, 'onboarding', { pinned: true });
    settings.personal = cleanPersonal({ ...settings.personal, ...result.personal });
    if (result.role) settings.role = result.role;
    settings.onboarded = true;
    saveSettings();
    return { saved: store ? facts.length : 0, privacy: Boolean(settings.privacy) };
  }

  function skipOnboarding() {
    settings.onboarded = true;
    saveSettings();
  }

  function openTeach() {
    startSession('teach', null);
  }

  function cancel() {
    active?.controller.abort();
    active = null;
  }

  return {
    onBridgeMessage, run, endThread, lookAnyway, dismissSuggestion, handoff, replace, openAsk, openTeach, fromCapture, showNotice, context, cancel, onNudgeClick, onNudgeIgnored, confirm, saveNote,
    feedback, answerNudge, proposeMemory, rememberFacts, saveChat, continueConversation, openOnboarding, saveOnboarding, skipOnboarding, currentMode,
    isBusy: () => Boolean(active),
    session,
    get activePage() { return activePage; },
    resetNudges: () => { nudges.shownFor.clear(); nudges.byDomain.clear(); nudges.times = []; nudges.ignored.clear(); },
  };
}

module.exports = { createCompanion };
