// Runs "do it for me" tasks (DESIGN.md §3.13.1). brain/agent.js plans and checks each step; this file connects it to
// the browser extension, the macOS executors in actions.js, the bubble's step cards and the audit log.
const { runAgent, modelPlanner, siteOf, STEP_SCHEMA, PLANNER_SYSTEM, MAC_OPS } = require('../brain/agent');
const { redact } = require('../brain/redact');
const { permissionHint } = require('./actions');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function createAgentRunner({ bridge, actions, brain, settings, memory = null, ui, cli = require('../brain/cli-provider'), settleMs = 900 }) {
  const pending = new Map(); // stepId → resolve(decision)
  let nextStep = 1;

  function browserEnv() {
    let tabId; // bound on the first look, or to the tab Loon opened; the extension refuses any other tab
    return {
      async observe() {
        if (!bridge.clients.size) return null;
        let last;
        for (let tries = 0; tries < 4; tries++) {
          const reply = await bridge.request({ type: 'agent-list', tabId }).catch((err) => ({ error: err.message }));
          if (reply.sensitive) return { sensitive: true, url: reply.url, site: siteOf(reply.url || ''), elements: [] };
          if (!reply.error) {
            tabId = reply.tabId ?? tabId;
            return { url: reply.url, title: reply.title, site: siteOf(reply.url), kind: reply.kind, elements: reply.elements || [] };
          }
          if (/not the tab/i.test(reply.error)) throw new Error(reply.error);
          last = reply.error;
          await wait(700); // a page that is still loading has no content script yet
        }
        throw new Error(last);
      },
      highlight(step, el) {
        if (el) bridge.request({ type: 'agent-highlight', tabId, id: el.id, label: step.op }).catch(() => {});
      },
      async act(step, el) {
        if (step.op === 'open_url') {
          if (!bridge.clients.size) {
            await actions.openExternal(step.url);
            return { ok: true };
          }
          const reply = await bridge.request({ type: 'agent-open', url: step.url });
          if (reply.error) return { ok: false, error: reply.error };
          tabId = reply.tabId;
          await wait(settleMs * 1.5);
          return { ok: true };
        }
        const reply = await bridge.request({ type: 'agent-act', tabId, op: step.op, id: el?.id, text: step.text, direction: step.direction }, 15000);
        if (reply.error || reply.sensitive) return { ok: false, error: reply.error || 'Private page' };
        if (['click', 'enter', 'back'].includes(step.op)) await wait(settleMs);
        return { ok: true, text: reply.text };
      },
      end() {
        if (bridge.clients.size) bridge.request({ type: 'agent-end', tabId }).catch(() => {});
      },
    };
  }

  async function macAct(step) {
    const ex = actions.executors;
    try {
      if (step.op === 'open_app') await ex.open({ target: step.app, kind: 'app' }, { openExternal: actions.openExternal });
      else if (step.op === 'menu') {
        if (!step.app) return { ok: false, error: 'Say which app the menu belongs to' };
        await ex.menu({ app: step.app, path: step.path });
      }
      else if (step.op === 'keys') {
        if (step.app) await ex.activate({ app: step.app });
        await ex.keys({ text: step.text });
      } else if (step.op === 'shortcut') {
        const name = await actions.resolveShortcut(step.name);
        if (!name) return { ok: false, error: `I couldn't find a Shortcut called "${step.name}"` };
        await ex.shortcut({ name });
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: `${err.message}.${permissionHint(err.message)}` };
    }
  }

  // A card in the bubble; resolves with the user's choice, rejects when the task is stopped.
  function confirmVia(bubble, id, signal) {
    return (card) => new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error('Stopped'));
      const stepId = nextStep++;
      const onAbort = () => {
        pending.delete(stepId);
        reject(new Error('Stopped'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      pending.set(stepId, (decision) => {
        signal.removeEventListener('abort', onAbort);
        // The bubble sends back which facts were ticked by index; the texts come from here, never from the renderer.
        resolve({ decision: decision.decision, facts: (decision.facts || []).map((i) => card.facts?.[i]).filter(Boolean) });
      });
      bubble('agent', { id, type: 'confirm', stepId, ...card });
    });
  }

  function decide({ stepId, decision, facts }) {
    const resolve = pending.get(stepId);
    if (!resolve || !['do', 'skip', 'stop', 'allow'].includes(decision)) return;
    pending.delete(stepId);
    resolve({ decision, facts: Array.isArray(facts) ? facts.filter(Number.isInteger) : [] });
  }

  function planner() {
    const cloud = !settings.privacy && ['claude', 'codex'].includes(settings.cloudCli) ? settings.cloudCli : null;
    return modelPlanner({
      chat: async (prompt, { signal }) => {
        brain.resetThread(); // each step is planned fresh from the current page, not from a growing chat
        let out = '';
        await brain.chat(prompt, { onText: (t) => { out += t; }, signal, maxTokens: 160, jsonSchema: STEP_SCHEMA });
        return out;
      },
      // Prompt only, redacted, no tools: the CLI can propose a step, never take one.
      cloud: cloud && ((prompt, { signal }) => cli.ask(cloud, { system: PLANNER_SYSTEM, prompt: redact(prompt).text, signal })),
    });
  }

  async function run(id, goal, bubble, signal) {
    const env = browserEnv();
    const facts = settings.privacy || !memory ? [] : memory.all().map((f) => f.text).filter((t) => t && !redact(t).count).slice(0, 12);
    bubble('agent', { id, type: 'start', goal });
    ui.busy(true);
    let result = null;
    try {
      result = await runAgent({
        goal,
        signal,
        facts,
        planner: planner(),
        confirm: confirmVia(bubble, id, signal),
        onLog: (entry) => bubble('agent', { id, type: 'log', ...entry }),
        audit: (entry) => actions.audit(entry),
        env: { observe: env.observe, highlight: env.highlight, act: (step, el) => (MAC_OPS.has(step.op) ? macAct(step) : env.act(step, el)) },
      });
      bubble('agent', { id, type: 'end', ...result });
      return result;
    } catch (err) {
      result = { ok: false, message: err.message };
      bubble('agent', { id, type: 'end', ...result });
      return result;
    } finally {
      env.end();
      ui.busy(false, Boolean(result?.ok));
    }
  }

  return { run, decide, get waiting() { return pending.size; } };
}

module.exports = { createAgentRunner };
