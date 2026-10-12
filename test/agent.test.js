// "Loon does it for you" (DESIGN.md §3.13.1): DOM layer, safety rules, fast paths, the model loop and the runner.
// Fakes only: no network, no real browser (except the optional headless check at the end), no models.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const agent = require('../brain/agent');
const { createAgentDom, sensitiveField } = require('../extension/lib/agent-dom');
const { createAgentRunner } = require('../main/agent');

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'agent.html'), 'utf8');
const fixtureDom = async () => {
  const { parseHTML } = await import('linkedom');
  const { document, window } = parseHTML(FIXTURE);
  return { document, window, dom: createAgentDom(document, window) };
};

// A page model as the extension reports it.
const page = (site, elements, extra = {}) => ({ url: `https://${site}/`, title: site, site, elements, ...extra });
const el = (id, role, text, extra = {}) => ({ id, role, text, label: '', ...extra });

// ---------- DOM layer ----------

test('element listing: stable short ids, roles, labels, private fields flagged, hidden skipped', async () => {
  const { dom } = await fixtureDom();
  const items = dom.list();
  const by = (pred) => items.find(pred);
  const search = by((e) => e.label === 'Search teas');
  assert.ok(search, JSON.stringify(items));
  assert.strictEqual(search.role, 'searchbox');
  assert.strictEqual(search.filled, false);
  assert.strictEqual(search.submitText, 'Go');
  assert.match(search.id, /^e\d+$/);
  assert.strictEqual(by((e) => e.text === 'Add to cart').role, 'button');
  assert.deepStrictEqual(by((e) => e.role === 'select').options, ['Small', 'Large']);
  assert.match(by((e) => e.role === 'link').href, /checkout/);
  assert.strictEqual(by((e) => e.label === 'Card number').sensitive, 'payment field');
  assert.strictEqual(by((e) => e.label === 'Code').sensitive, 'one-time code field');
  assert.strictEqual(by((e) => e.label === 'PIN').sensitive, 'private field');
  assert.strictEqual(by((e) => e.label === 'Gift note').role, 'textbox');
  assert.ok(!items.some((e) => e.text === 'Hidden button'));
  assert.ok(items.every((e) => e.box && typeof e.box.x === 'number'));
  // Same element, same id on the next look.
  assert.strictEqual(dom.list().find((e) => e.label === 'Search teas').id, search.id);
  // Serialized compactly for the planner, private fields marked.
  const line = agent.plannerPrompt({ goal: 'x', page: page('tea.test', items), history: [] });
  assert.match(line, new RegExp(`${search.id} searchbox "Search teas" \\(empty\\)`));
  assert.match(line, /"Card number" \(empty\) \(payment field: never type\)/);
  assert.match(line, /<context>[\s\S]*<\/context>/);
});

test('sensitive fields: never typed into, no override', async () => {
  const { document, dom } = await fixtureDom();
  const make = (html) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.firstElementChild;
  };
  assert.strictEqual(sensitiveField(make('<input type="password">')), 'password field');
  assert.strictEqual(sensitiveField(make('<input autocomplete="cc-csc">')), 'payment field');
  assert.strictEqual(sensitiveField(make('<input autocomplete="one-time-code">')), 'one-time code field');
  assert.strictEqual(sensitiveField(make('<input autocomplete="current-password">')), 'password field');
  assert.strictEqual(sensitiveField(make('<input name="cvv">')), 'private field');
  assert.strictEqual(sensitiveField(make('<input placeholder="Verification code">')), 'private field');
  assert.strictEqual(sensitiveField(make('<input name="passenger_name">')), null);
  assert.strictEqual(sensitiveField(make('<input name="email" type="email">')), null);
  assert.strictEqual(sensitiveField(make('<button>Pay</button>')), null);

  const items = dom.list();
  const card = items.find((e) => e.label === 'Card number');
  const result = await dom.act({ op: 'type', id: card.id, text: '4111 1111 1111 1111' }, { pauseMs: 0 });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.refused, true);
  assert.strictEqual(document.querySelector('[name="cardnumber"]').value || '', '');

  // The planner side refuses too, before anything reaches the page.
  const p = page('shop.test', [card]);
  assert.match(agent.refusal({ op: 'type', id: card.id, text: 'hi' }, card, p).message, /never type into a payment field/);
  const plain = el('e9', 'textbox', '', { label: 'Notes' });
  assert.match(agent.refusal({ op: 'type', id: 'e9', text: 'my card is 4111 1111 1111 1111' }, plain, p).message, /never type those/);
  assert.match(agent.refusal({ op: 'keys', text: 'password=hunter22' }, null, null).message, /never type those/);
  assert.strictEqual(agent.refusal({ op: 'type', id: 'e9', text: 'hello' }, plain, p), null);
  // Private pages: everything on the page is refused, and it ends the task.
  assert.strictEqual(agent.refusal({ op: 'click', id: 'e1' }, el('e1', 'button', 'Go'), page('bank.test', [], { sensitive: true })).hard, true);
  assert.strictEqual(agent.refusal({ op: 'read' }, null, page('bank.test', [], { sensitive: true })).hard, true);
  assert.strictEqual(agent.refusal({ op: 'open_app', app: '1Password' }, null, null).hard, true);
});

test('DOM actions: type (React-safe setter), select, click, enter submits, read', async () => {
  const { document, dom } = await fixtureDom();
  const items = dom.list();
  const id = (pred) => items.find(pred).id;
  assert.deepStrictEqual(await dom.act({ op: 'type', id: id((e) => e.label === 'Search teas'), text: 'oolong' }, { pauseMs: 0 }), { ok: true });
  assert.strictEqual(document.getElementById('q').value, 'oolong');
  assert.deepStrictEqual(await dom.act({ op: 'select', id: id((e) => e.role === 'select'), text: 'large' }, { pauseMs: 0 }), { ok: true });
  assert.strictEqual(document.querySelector('#size option[value="l"]').selected, true);
  let clicked = 0;
  document.getElementById('add').addEventListener('click', () => clicked++);
  assert.ok((await dom.act({ op: 'click', id: id((e) => e.text === 'Add to cart') }, { pauseMs: 0 })).ok);
  assert.strictEqual(clicked, 1);
  assert.strictEqual((await dom.act({ op: 'type', id: id((e) => e.text === 'Add to cart'), text: 'x' }, { pauseMs: 0 })).ok, false);
  assert.match((await dom.act({ op: 'read' }, { pauseMs: 0 })).text, /Tea shop/);
  assert.match((await dom.act({ op: 'click', id: 'e999' }, { pauseMs: 0 })).error, /gone/);
});

// ---------- safety rules ----------

test('purchase / delete / send buttons always need their own click, even after "allow the rest"', () => {
  const site = 'shop.test';
  const p = page(site, []);
  const grant = { site };
  const risky = [
    el('e1', 'button', 'Place order'), el('e2', 'button', 'Buy now'), el('e3', 'link', 'Proceed to checkout'),
    el('e4', 'button', 'Delete account'), el('e5', 'button', 'Send'), el('e6', 'button', 'Pay $12.00'),
    el('e7', 'button', 'Transfer'), el('e8', 'button', 'Confirm purchase'), el('e9', 'button', 'Remove account'),
    el('e10', 'link', 'Continue', { href: 'https://shop.test/checkout/step1' }), el('e11', 'button', '', { label: 'Submit payment' }),
  ];
  for (const e of risky) {
    const step = { op: 'click', id: e.id };
    assert.strictEqual(agent.isRisky(step, e), true, e.text || e.label);
    assert.strictEqual(agent.needsConfirm(step, e, p, grant, true), true);
    assert.strictEqual(agent.canGrant(step, e, p, true), false);
  }
  // Enter in a field whose form submits with "Place order" counts as pressing that button.
  assert.strictEqual(agent.isRisky({ op: 'enter', id: 'e12' }, el('e12', 'textbox', '', { submitText: 'Place order' })), true);
  assert.strictEqual(agent.isRisky({ op: 'menu', app: 'Mail', path: ['Message', 'Send'] }, null), true);
  for (const text of ['Add to cart', 'Search', 'Next page', 'PayPal info', 'Sender details']) {
    assert.strictEqual(agent.isRisky({ op: 'click', id: 'x' }, el('x', 'button', text)), false, text);
  }
});

test('"allow the rest" covers only clicks/typing in ordinary fields on the same site', () => {
  const site = 'shop.test';
  const p = page(site, []);
  const grant = { site };
  const button = el('e1', 'button', 'Add to cart');
  const field = el('e2', 'textbox', '', { label: 'Quantity' });
  const otp = el('e3', 'textbox', '', { label: 'Code', sensitive: 'one-time code field' });
  assert.strictEqual(agent.needsConfirm({ op: 'click', id: 'e1' }, button, p, null, false), true);
  assert.strictEqual(agent.needsConfirm({ op: 'click', id: 'e1' }, button, p, grant, false), false);
  assert.strictEqual(agent.needsConfirm({ op: 'type', id: 'e2', text: '2' }, field, p, grant, false), false);
  assert.strictEqual(agent.needsConfirm({ op: 'type', id: 'e3', text: '2' }, otp, p, grant, false), true);
  assert.strictEqual(agent.needsConfirm({ op: 'click', id: 'e1' }, button, page('other.test', []), grant, false), true);
  assert.strictEqual(agent.needsConfirm({ op: 'open_url', url: 'https://shop.test/x' }, null, p, grant, false), true);
  assert.strictEqual(agent.needsConfirm({ op: 'back' }, null, p, grant, false), true);
  assert.strictEqual(agent.needsConfirm({ op: 'keys', text: 'x' }, null, p, grant, false), true);
  // Read-only steps never need a card.
  assert.strictEqual(agent.needsConfirm({ op: 'scroll' }, null, p, null, false), false);
  assert.strictEqual(agent.needsConfirm({ op: 'read' }, null, p, null, false), false);
  assert.strictEqual(agent.canGrant({ op: 'open_url' }, null, p, false), false);
  assert.strictEqual(agent.canGrant({ op: 'click' }, button, p, false), true);
});

// ---------- routing and fast paths ----------

test('routing: action requests go to the agent, questions and existing commands do not', () => {
  for (const goal of ['click the Sign up button', 'fill this form with my info', 'search youtube for lofi and play the first video', 'open Notes and make a new note saying hi',
    'add these 3 items to my cart', 'scroll down', 'go back', 'type hello into the search box', 'Please book a table for me', 'play lofi on youtube']) {
    assert.ok(agent.isAgentGoal(goal), goal);
  }
  for (const text of ['what is a closure?', 'explain this for me', 'open Safari', 'open github.com', 'remind me to click the thing at 5', 'search for my tax files',
    'remember that I like tea', 'run my morning shortcut', 'type safety in TypeScript', 'note: click bait']) {
    assert.ok(!agent.isAgentGoal(text), text);
  }
});

test('fast paths: common goals become steps without a model', () => {
  const plan = (g) => agent.fastPlan(g);
  assert.deepStrictEqual(plan('search youtube for lofi and play the first video'), [
    { op: 'open_url', url: 'https://www.youtube.com/results?search_query=lofi' },
    { op: 'click', target: { result: 'youtube' } },
  ]);
  assert.deepStrictEqual(plan('open Notes and make a new note saying milk and eggs'), [
    { op: 'open_app', app: 'Notes' },
    { op: 'menu', app: 'Notes', path: ['File', 'New Note'] },
    { op: 'keys', app: 'Notes', text: 'milk and eggs' },
  ]);
  assert.deepStrictEqual(plan('open youtube and search for rain sounds'), [{ op: 'open_url', url: 'https://www.youtube.com/results?search_query=rain%20sounds' }]);
  assert.deepStrictEqual(plan('click the Sign up button'), [{ op: 'click', target: { text: 'Sign up' } }]);
  assert.deepStrictEqual(plan('scroll down'), [{ op: 'scroll', direction: 'down' }]);
  assert.deepStrictEqual(plan('scroll to the bottom'), [{ op: 'scroll', direction: 'bottom' }]);
  assert.deepStrictEqual(plan('go back'), [{ op: 'back' }]);
  assert.deepStrictEqual(plan('type "green tea" into the search box'), [{ op: 'type', target: { label: 'search' }, text: 'green tea' }]);
  assert.deepStrictEqual(plan('open github.com and click Explore'), [{ op: 'open_url', url: 'https://github.com' }, { op: 'click', target: { text: 'Explore' } }]);
  assert.deepStrictEqual(plan('search amazon for usb c cable'), [{ op: 'open_url', url: 'https://www.amazon.com/s?k=usb%20c%20cable' }]);
  assert.deepStrictEqual(plan('select Large from the size dropdown'), [{ op: 'select', target: { label: 'size' }, text: 'Large' }]);
  assert.strictEqual(plan('add this to my cart')[0].op, 'click');
  assert.strictEqual(plan('press enter')[0].op, 'enter');
  assert.strictEqual(plan('add these 3 items to my cart'), null); // needs the model
  assert.strictEqual(plan('fill this form with my info'), null);
});

test('fast-path targets resolve against the observed page', () => {
  const yt = page('youtube.com', [
    el('e1', 'link', 'Home', { href: 'https://www.youtube.com/' }),
    el('e2', 'link', 'Lofi girl radio', { href: 'https://www.youtube.com/watch?v=abc' }),
    el('e3', 'link', 'Second', { href: 'https://www.youtube.com/watch?v=def' }),
  ]);
  assert.strictEqual(agent.resolveStep({ op: 'click', target: { result: 'youtube' } }, yt).id, 'e2');
  assert.strictEqual(agent.resolveStep({ op: 'click', target: { result: 'current' } }, yt).id, 'e2');
  const shop = page('shop.test', [el('e1', 'link', 'Sign up for news'), el('e2', 'button', 'Sign up', { inView: true }), el('e3', 'searchbox', '', { label: 'Search products' })]);
  assert.strictEqual(agent.resolveStep({ op: 'click', target: { text: 'sign up' } }, shop).id, 'e2');
  assert.strictEqual(agent.resolveStep({ op: 'type', target: { label: 'search' }, text: 'x' }, shop).id, 'e3');
  assert.strictEqual(agent.resolveStep({ op: 'click', target: { text: 'Log out' } }, shop), null);
});

// ---------- the loop ----------

function fakeEnv(pages) {
  const env = { acted: [], highlighted: [], observed: 0 };
  let i = 0;
  env.observe = async () => { env.observed++; return pages[Math.min(i, pages.length - 1)]; };
  env.act = async (step) => { env.acted.push(step); i++; return { ok: true, text: step.op === 'read' ? 'Page says hi' : undefined }; };
  env.highlight = (step, e) => env.highlighted.push(e?.id);
  return env;
}
const always = (decision) => async (card) => ({ decision, card });

test('fast path end to end: search, then play the first video (each change confirmed, audit has no content)', async () => {
  const env = fakeEnv([page('youtube.com', [el('e7', 'link', 'Lofi', { href: 'https://www.youtube.com/watch?v=1' })])]);
  const cards = [];
  const audit = [];
  const result = await agent.runAgent({ goal: 'search youtube for lofi and play the first video', env, confirm: async (c) => { cards.push(c); return { decision: 'do' }; }, audit: (a) => audit.push(a) });
  assert.deepStrictEqual(result, { ok: true, message: 'Done.' });
  assert.deepStrictEqual(env.acted.map((s) => s.op), ['open_url', 'click']);
  assert.strictEqual(env.acted[1].id, 'e7');
  assert.deepStrictEqual(cards.map((c) => c.title), ['Open https://www.youtube.com/results?search_query=lofi', 'Click "Lofi"']);
  assert.deepStrictEqual(env.highlighted, [undefined, 'e7']);
  assert.strictEqual(env.observed, 1, 'opening a URL needs no page; the click does');
  assert.deepStrictEqual(audit.map((a) => [a.action, a.op, a.ok, a.auto]), [['agent-step', 'open_url', true, false], ['agent-step', 'click', true, false]]);
});

test('audit entries carry metadata only, never what was typed', async () => {
  const env = fakeEnv([page('form.test', [el('e1', 'textbox', '', { label: 'Search' })])]);
  const audit = [];
  await agent.runAgent({ goal: 'type "my secret plans" into the search box', env, confirm: always('do'), audit: (a) => audit.push(a) });
  assert.strictEqual(audit.length, 1);
  assert.strictEqual(audit[0].chars, 'my secret plans'.length);
  assert.doesNotMatch(JSON.stringify(audit), /secret plans/);
});

test('model planner loop: one step at a time, bad ids refused, read-only runs without a card, stops on done', async () => {
  const p = page('shop.test', [el('e1', 'button', 'Add to cart'), el('e2', 'textbox', '', { label: 'Qty' })]);
  const env = fakeEnv([p]);
  const replies = [
    { action: 'click', id: 'e99', text: '', reason: 'made up' },
    { action: 'read', id: '', text: '', reason: 'look first' },
    { action: 'type', id: 'e2', text: '3', reason: 'quantity' },
    { action: 'click', id: 'e1', text: '', reason: 'add it' },
    { action: 'done', id: '', text: '', reason: 'Added 3 to your cart.' },
  ];
  const prompts = [];
  const planner = agent.modelPlanner({ chat: async (prompt) => { prompts.push(prompt); return JSON.stringify(replies.shift()); } });
  const cards = [];
  const logs = [];
  const result = await agent.runAgent({ goal: 'add 3 of these to my cart', env, planner, confirm: async (c) => { cards.push(c.title); return { decision: c.title.startsWith('Type') ? 'allow' : 'do' }; }, onLog: (l) => logs.push(l.kind) });
  assert.deepStrictEqual(result, { ok: true, message: 'Added 3 to your cart.' });
  assert.deepStrictEqual(env.acted.map((s) => s.op), ['read', 'type', 'click']);
  assert.deepStrictEqual(cards, ['Type "3" into "Qty"'], 'the click after "allow the rest" ran without a card');
  assert.deepStrictEqual(logs, ['refused', 'read', 'done', 'auto']);
  assert.match(prompts[1], /refused: There's no element "e99"/);
  assert.match(prompts[2], /Read the page → ok, text: Page says hi/);
});

test('model planner: fail ends the task, garbage ends it, max steps caps it, cloud gets a second try', async () => {
  const p = page('a.test', [el('e1', 'button', 'Next')]);
  let r = await agent.runAgent({ goal: 'add stuff to my cart', env: fakeEnv([p]), planner: agent.modelPlanner({ chat: async () => '{"action":"fail","id":"","text":"","reason":"No such item here."}' }), confirm: always('do') });
  assert.deepStrictEqual(r, { ok: false, message: 'No such item here.' });
  r = await agent.runAgent({ goal: 'add stuff to my cart', env: fakeEnv([p]), planner: agent.modelPlanner({ chat: async () => 'not json' }), confirm: always('do') });
  assert.strictEqual(r.ok, false);
  const env = fakeEnv([p]);
  r = await agent.runAgent({ goal: 'add stuff to my cart', env, maxSteps: 5, planner: agent.modelPlanner({ chat: async () => '{"action":"click","id":"e1","text":"","reason":"again"}' }), confirm: always('do') });
  assert.strictEqual(r.ok, false);
  assert.match(r.message, /stopped after 5 steps/);
  assert.strictEqual(env.acted.length, 5);
  let cloudPrompts = 0;
  const planner = agent.modelPlanner({ chat: async () => '{"action":"click","id":"nope","text":"","reason":"x"}', cloud: async () => { cloudPrompts++; return 'Sure! {"action":"done","id":"","text":"","reason":"All set."}'; } });
  r = await agent.runAgent({ goal: 'add stuff to my cart', env: fakeEnv([p]), planner, confirm: always('do') });
  assert.deepStrictEqual(r, { ok: true, message: 'All set.' });
  assert.strictEqual(cloudPrompts, 1);
});

test('memory facts: only the ones ticked in the card reach the planner', async () => {
  const prompts = [];
  const planner = agent.modelPlanner({ chat: async (prompt) => { prompts.push(prompt); return '{"action":"done","id":"","text":"","reason":"ok"}'; } });
  const facts = ['My name is Ada', 'I live at 1 Loop Rd', 'I like tea'];
  let card;
  await agent.runAgent({ goal: 'fill this form with my info', env: fakeEnv([page('f.test', [])]), planner, facts, confirm: async (c) => { card = c; return { decision: 'do', facts: ['My name is Ada', 'not offered'] }; } });
  assert.strictEqual(card.kind, 'facts');
  assert.match(prompts[0], /Approved facts: My name is Ada\n/);
  assert.doesNotMatch(prompts[0], /Loop Rd|tea|not offered/);
});

test('skip and stop: skip moves on, stop ends without acting, Esc (abort) cancels a waiting card', async () => {
  let env = fakeEnv([page('a.test', [el('e1', 'button', 'Sign up')])]);
  let r = await agent.runAgent({ goal: 'click sign up', env, confirm: always('skip') });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(env.acted.length, 0);
  env = fakeEnv([page('a.test', [el('e1', 'button', 'Sign up')])]);
  r = await agent.runAgent({ goal: 'click sign up', env, confirm: always('stop') });
  assert.strictEqual(r.stopped, true);
  assert.strictEqual(env.acted.length, 0);

  const controller = new AbortController();
  env = fakeEnv([page('a.test', [el('e1', 'button', 'Sign up')])]);
  const confirm = () => new Promise((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error('Stopped')));
    setTimeout(() => controller.abort(), 5);
  });
  r = await agent.runAgent({ goal: 'click sign up', env, confirm, signal: controller.signal });
  assert.strictEqual(r.stopped, true);
  assert.strictEqual(env.acted.length, 0);
});

test('private page ends the task before anything happens', async () => {
  const env = fakeEnv([page('chase.com', [], { sensitive: true })]);
  const r = await agent.runAgent({ goal: 'click sign in', env, confirm: always('do') });
  assert.strictEqual(r.ok, false);
  assert.match(r.message, /private page/);
  assert.strictEqual(env.acted.length, 0);
});

// ---------- the runner (main/agent.js) with a fake bridge ----------

test('runner: bridge round trip, card decisions from the bubble, audit through actions, Esc stops', async () => {
  const elements = [el('e1', 'button', 'Sign up')];
  const requests = [];
  const bridge = {
    clients: new Set([1]),
    async request(msg) {
      requests.push(msg);
      if (msg.type === 'agent-list') return { url: 'https://news.test/', title: 'News', kind: 'other', elements, tabId: 4 };
      if (msg.type === 'agent-act') return { ok: true, tabId: 4 };
      return { ok: true };
    },
  };
  const audit = [];
  const busy = [];
  const actions = { audit: (a) => audit.push(a), executors: {}, openExternal: async () => {} };
  const runner = createAgentRunner({ bridge, actions, brain: {}, settings: {}, ui: { busy: (on) => busy.push(on) }, settleMs: 0 });
  const events = [];
  const bubble = (type, payload) => {
    events.push(payload);
    if (payload.type === 'confirm') setImmediate(() => runner.decide({ stepId: payload.stepId, decision: 'do' }));
  };
  const result = await runner.run(1, 'click sign up', bubble, new AbortController().signal);
  assert.deepStrictEqual(result, { ok: true, message: 'Done.' });
  assert.deepStrictEqual(events.map((e) => e.type), ['start', 'confirm', 'log', 'end']);
  assert.deepStrictEqual(requests.map((r) => r.type), ['agent-list', 'agent-highlight', 'agent-act', 'agent-end']);
  assert.deepStrictEqual([requests[1].tabId, requests[2].tabId, requests[2].id], [4, 4, 'e1']);
  assert.deepStrictEqual(busy, [true, false]);
  assert.strictEqual(audit[0].op, 'click');

  // Esc: the companion aborts the run's signal while a card waits.
  const controller = new AbortController();
  const stopBubble = (type, payload) => { events.push(payload); if (payload.type === 'confirm') setImmediate(() => controller.abort()); };
  const stopped = await runner.run(2, 'click sign up', stopBubble, controller.signal);
  assert.strictEqual(stopped.stopped, true);
  assert.strictEqual(runner.waiting, 0);
  assert.strictEqual(requests.filter((r) => r.type === 'agent-act').length, 1, 'nothing ran after the stop');
});

test('runner: macOS steps go to the executors, and missing Accessibility says where to fix it', async () => {
  const calls = [];
  const executors = {
    open: async (cmd) => calls.push(['open', cmd.target]),
    menu: async (cmd) => { calls.push(['menu', cmd.app, cmd.path.join('>')]); throw new Error('System Events got an error: Loon is not allowed assistive access. (-1719)'); },
    activate: async () => {},
    keys: async () => calls.push(['keys']),
  };
  const runner = createAgentRunner({ bridge: { clients: new Set() }, actions: { audit: () => {}, executors, openExternal: async () => {} }, brain: {}, settings: {}, ui: { busy: () => {} } });
  const events = [];
  const bubble = (type, payload) => { events.push(payload); if (payload.type === 'confirm') setImmediate(() => runner.decide({ stepId: payload.stepId, decision: 'do' })); };
  const result = await runner.run(1, 'open Notes and make a new note saying hi', bubble, new AbortController().signal);
  assert.deepStrictEqual(calls, [['open', 'Notes'], ['menu', 'Notes', 'File>New Note']]);
  assert.strictEqual(result.ok, false);
  assert.match(result.message, /Accessibility/);
});

// ---------- optional: the DOM layer in real headless Chrome ----------

// The headless shell (`npx playwright-core install --only-shell chromium`) or full Chrome for Testing, newest first.
function findHeadlessChrome() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (!fs.existsSync(root)) return null;
  const revision = (d) => Number(d.split('-').pop()) || 0;
  for (const dir of fs.readdirSync(root).sort((a, b) => revision(b) - revision(a))) {
    const candidates = [
      'chrome-headless-shell-mac-arm64/chrome-headless-shell',
      'chrome-mac/headless_shell',
      'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    ].map((c) => path.join(root, dir, c));
    const exe = candidates.find((c) => fs.existsSync(c));
    if (exe) return exe;
  }
  return null;
}

test('headless Chrome: listing, highlight overlay, typing and Enter on a real page', { skip: !findHeadlessChrome() && 'no Chrome for Testing installed', timeout: 30000 }, async () => {
  const { chromium } = require('playwright-core');
  const browser = await chromium.launch({ executablePath: findHeadlessChrome(), headless: true });
  try {
    const tab = await browser.newPage();
    await tab.setContent(FIXTURE);
    await tab.addScriptTag({ path: path.join(__dirname, '..', 'extension', 'lib', 'agent-dom.js') });
    const out = await tab.evaluate(async () => {
      const dom = globalThis.LoonAgentDom.createAgentDom(document, window);
      const items = dom.list();
      const id = (pred) => items.find(pred).id;
      const search = id((e) => e.label === 'Search teas');
      const shown = dom.highlight(search, 'type');
      const overlay = Boolean(document.querySelector('[data-loon-overlay]'));
      await dom.act({ op: 'type', id: search, text: 'oolong' }, { pauseMs: 0 });
      await dom.act({ op: 'enter', id: search }, { pauseMs: 0 });
      const afterEnter = document.getElementById('out').textContent;
      const refused = await dom.act({ op: 'type', id: id((e) => e.label === 'Card number'), text: '4111111111111111' }, { pauseMs: 0 });
      await dom.act({ op: 'select', id: id((e) => e.role === 'select'), text: 'Large' }, { pauseMs: 0 });
      await dom.act({ op: 'click', id: id((e) => e.text === 'Add to cart') }, { pauseMs: 0 });
      const hiddenListed = items.some((e) => e.text === 'Hidden button');
      return { shown, overlay, refused, afterEnter, out: document.getElementById('out').textContent, card: document.querySelector('[name=cardnumber]').value, hiddenListed, boxes: items.every((e) => e.box.w > 0) };
    });
    assert.strictEqual(out.shown, true);
    assert.strictEqual(out.overlay, true);
    assert.strictEqual(out.refused.refused, true);
    assert.strictEqual(out.card, '');
    assert.strictEqual(out.afterEnter, 'searched oolong');
    assert.strictEqual(out.out, 'added l');
    assert.strictEqual(out.hiddenListed, false);
    assert.strictEqual(out.boxes, true);
    const searched = await tab.evaluate(() => document.getElementById('q').value);
    assert.strictEqual(searched, 'oolong');
  } finally {
    await browser.close();
  }
});
