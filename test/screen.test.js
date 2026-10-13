// "Loon sees your screen when you ask" (DESIGN.md §3.20): the eyes ladder, consent, privacy gates, follow-ups and
// vision. Fakes for the front window, the capture and Tesseract; no real screen, model or network.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Resolver } = require('../brain/resolve');
const { createCompanion } = require('../main/companion');
const { createScreenSight, NO_PERMISSION } = require('../main/screen');

const PNG = Buffer.from('fake-png-bytes-of-the-window');
const SAFARI = { id: 42, app: 'Safari', title: 'Cozy Throw Blanket – Shop', bounds: { x: 0, y: 25, w: 1200, h: 800 } };
const SHOP_TEXT = 'Cozy Throw Blanket\nPrice $39.99, was $59.99\nFree returns within 30 days\nAdd to cart';

function setup({ settings = {}, front = SAFARI, ocrText = SHOP_TEXT, permission = 'granted', grab = null, paired = null, api = null, cli = null } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-screen-'));
  const calls = []; // model prompts, in order
  const seen = { fronts: 0, grabs: 0, ocrs: 0, cat: [], saved: 0, downscaled: 0 };
  const state = { front, ocrText };
  const brain = { modelId: () => 'fake', modelLabel: () => 'fake', resetThread() {}, chat: async (prompt, { onText }) => { calls.push({ tier: 'local', prompt }); onText('[mood:curious] Looks like a blanket shop.'); } };
  const all = { privacy: false, cloudCli: 'off', personal: {}, cameos: false, screenSight: 'when-asked', ...settings };
  const resolver = new Resolver({ brain, settings: all, api, cli: cli || undefined, cacheFile: path.join(tmp, 'c.json'), countsFile: path.join(tmp, 'n.json') });
  const screenSight = createScreenSight({
    frontWindow: async () => { seen.fronts++; return state.front; },
    permission: () => permission,
    grab: grab || (async () => { seen.grabs++; return { png: PNG, width: 2400, height: 1600 }; }),
    ocr: async (png) => { seen.ocrs++; assert.strictEqual(png, PNG); return state.ocrText; },
  });
  screenSight.downscale = (png) => { seen.downscaled++; return Buffer.concat([png, Buffer.from('-small')]); };
  const page = paired && { type: 'page', active: true, visible: true, tabId: 7, url: 'https://shop.example/blanket', title: 'Blanket', kind: 'shopping', sensitive: false, ...paired };
  const bridge = {
    clients: new Set(page ? [{}] : []),
    request: async (msg) => (msg.type === 'get-page' ? { url: page.url, title: page.title, html: '<html><body><main><h1>Blanket from the page</h1><p>Exact page text says $39.99 and ships free.</p></main></body></html>' } : {}),
  };
  const companion = createCompanion({
    bridge, resolver, brain, screenSight, settings: all,
    ui: { cat: (channel, payload) => seen.cat.push({ channel, ...payload }), showBubble() {}, hideBubble() {}, bubbleFocused: () => false },
    notes: { files: () => [] },
    actions: {},
    saveSettings: () => { seen.saved++; },
  });
  if (page) companion.onBridgeMessage(page);
  companion.openAsk();
  let id = 0;
  const run = async (args) => {
    const sent = [];
    const bubble = (type, payload) => sent.push({ type, ...payload });
    await companion.run({ id: ++id, ...args }, bubble);
    return { sent, bubble, id, done: sent.find((m) => m.type === 'done'), said: sent.find((m) => m.type === 'action-done')?.message, context: sent.filter((m) => m.type === 'context').pop() };
  };
  return { companion, settings: all, calls, seen, state, ask: (question) => run({ question }), chip: (task) => run({ task }), last: () => calls[calls.length - 1] };
}

test('eyes ladder: Chrome in front with the extension paired reads the page, not the screen', async () => {
  const t = setup({ front: { ...SAFARI, app: 'Google Chrome', title: 'Blanket' }, paired: {} });
  const r = await t.ask('is this a good deal?');
  assert.ok(r.done);
  assert.match(t.last().prompt, /Blanket from the page/);
  assert.strictEqual(t.seen.grabs, 0, 'no screenshot when the page text is there');
});

test('eyes ladder: Safari (or a PDF, Slack, Chrome without the extension) is read from the window on this Mac', async () => {
  for (const paired of [null, {}]) { // paired Chrome in the background doesn't matter when Safari is in front
    const t = setup({ paired });
    const r = await t.ask('is this a good deal?');
    assert.strictEqual(t.seen.grabs, 1);
    assert.strictEqual(r.context.label, 'Looking at: Safari · Cozy Throw Blanket – Shop');
    assert.strictEqual(r.context.mode, 'screen');
    const { prompt } = t.last();
    assert.match(prompt, /<context source="screen" app="Safari" window="Cozy Throw Blanket – Shop">/);
    assert.match(prompt, /Price \$39\.99, was \$59\.99/);
    assert.match(prompt, /is this a good deal\?/);
    assert.strictEqual(r.done.fromScreen, true, 'the tier tooltip says it was read from the screen');
  }
  const pdf = setup({ front: { ...SAFARI, app: 'Preview', title: 'lease.pdf' }, ocrText: 'Tenant shall pay rent on the first day of each month.' });
  await pdf.ask('what does this page say about rent?');
  assert.match(pdf.last().prompt, /Tenant shall pay rent/);
});

test('generic "what do you see?" describes the screen; a specific question asks with the screen text', async () => {
  const t = setup();
  const r = await t.ask('what do you see?');
  assert.match(t.last().prompt, /Describe what's on the user's screen and what they can do there, briefly\./);
  assert.ok(!t.last().prompt.includes('what do you see'), 'the generic question becomes the screen_summary task');
  assert.ok(r.done);
  const chip = setup();
  await chip.chip('screen_look'); // the "Look at my screen" chip in the empty bubble
  assert.match(chip.last().prompt, /Describe what's on the user's screen/);
});

test('Privacy mode never captures; sensitive windows are refused before capture with the look-away', async () => {
  const p = setup({ settings: { privacy: true } });
  const r = await p.ask('what do you see?');
  assert.match(r.said, /Privacy mode is on/);
  assert.strictEqual(p.seen.grabs + p.calls.length, 0);

  for (const front of [{ ...SAFARI, app: '1Password 7', title: 'Vault' }, { ...SAFARI, title: 'Chase Online Banking – Accounts' }]) {
    const s = setup({ front });
    const out = await s.ask('what do you see?');
    assert.match(out.said, /won't look|private window/i);
    assert.strictEqual(s.seen.grabs, 0, 'refused before any capture');
    assert.strictEqual(s.calls.length, 0);
    assert.ok(s.seen.cat.some((c) => c.channel === 'privacy' && c.on && c.flash), 'the cat looks away');
  }
});

test('no Screen Recording permission (denied, or a blank capture) gets the friendly message, never a crash', async () => {
  const denied = setup({ permission: 'denied' });
  assert.strictEqual((await denied.ask('what do you see?')).said, NO_PERMISSION);
  assert.match(NO_PERMISSION, /System Settings → Privacy & Security → Screen Recording/);
  assert.match(NO_PERMISSION, /⌥⇧T/);
  assert.strictEqual(denied.seen.grabs, 0);
  const blank = setup({ grab: async () => null });
  assert.strictEqual((await blank.ask('what do you see?')).said, NO_PERMISSION);
  const throws = setup({ grab: async () => { throw new Error('capture failed'); } });
  assert.strictEqual((await throws.ask('what do you see?')).said, NO_PERMISSION);
  assert.strictEqual(blank.calls.length + throws.calls.length, 0);
});

test('screen sight off, or no screen helper at all: the honest "can\'t see" message, no model call', async () => {
  const off = setup({ settings: { screenSight: 'off' } });
  const r = await off.ask('what do you see?');
  assert.match(r.said, /can't see your screen right now/);
  assert.match(r.said, /Look at my screen when I ask/);
  assert.strictEqual(off.seen.grabs + off.calls.length, 0);
});

test('consent: the first time shows a one-time card; "Allow when I ask" runs the question and never asks again', async () => {
  const t = setup({ settings: { screenSight: 'ask-first' } });
  const first = await t.ask('what do you see?');
  const card = first.sent.find((m) => m.type === 'confirm');
  assert.ok(card, 'a confirm card');
  assert.match(card.summary, /The screenshot stays on your Mac and is thrown away right after/);
  assert.deepStrictEqual([card.buttons.yes, card.buttons.no], ['Allow when I ask', 'Not now']);
  assert.strictEqual(t.seen.grabs, 0, 'nothing captured before the user allows it');

  const after = [];
  await t.companion.confirm(card.command, (type, payload) => after.push({ type, ...payload }), first.id);
  assert.strictEqual(t.settings.screenSight, 'when-asked');
  assert.strictEqual(t.seen.saved, 1);
  assert.strictEqual(t.seen.grabs, 1);
  assert.ok(after.find((m) => m.type === 'done' && m.id === first.id), 'the waiting question is answered in the same bubble');

  t.companion.openAsk();
  const second = await t.ask('can you see this?');
  assert.ok(!second.sent.some((m) => m.type === 'confirm'), 'no card the second time');
  assert.strictEqual(t.seen.grabs, 2);
});

test('follow-ups reuse the same reading; another window in front or "look again" reads it again', async () => {
  const t = setup();
  await t.ask('what do you see?');
  await t.ask('which one is cheaper?');
  assert.strictEqual(t.seen.grabs, 1, 'same window: no new capture');
  assert.match(t.last().prompt, /<conversation>/);
  assert.match(t.last().prompt, /Price \$39\.99/);

  t.state.front = { ...SAFARI, app: 'Slack', title: 'general – Team' };
  t.state.ocrText = 'Maya: the launch moved to Thursday';
  const moved = await t.ask('what did Maya say?');
  assert.strictEqual(t.seen.grabs, 2, 'front window changed: captured again');
  assert.strictEqual(moved.context.label, 'Looking at: Slack · general – Team');
  assert.match(t.last().prompt, /launch moved to Thursday/);
  assert.match(t.last().prompt, /<conversation>/, 'still the same thread');

  t.state.ocrText = 'Maya: the launch moved to Friday';
  await t.ask('look again');
  assert.strictEqual(t.seen.grabs, 3);
  assert.match(t.last().prompt, /moved to Friday/);
  await t.chip('screen_look'); // "Look again" in the ⋯ menu
  assert.strictEqual(t.seen.grabs, 4);
});

test('secrets in the OCR text are redacted before any model, and the plan only sees the redacted text', async () => {
  const secret = 'sk-ant-abcdefghijklmnopqrstuvwxyz0123456789';
  const prompts = [];
  const cli = { ask: async (_w, { prompt, onText }) => { prompts.push(prompt); onText('[mood:happy] A terminal with an API key.'); }, label: () => 'plan', modelFor: () => 'm' };
  const t = setup({ ocrText: `export ANTHROPIC_API_KEY=${secret}\n$ npm test\n12 passing`, settings: { cloudCli: 'claude', answerWith: 'plan' }, cli });
  const r = await t.ask('Compare the trade-offs of what is on my screen step by step'); // hard → plan
  assert.strictEqual(r.done.tier, 'cloud');
  assert.ok(prompts.length && prompts.every((p) => !p.includes(secret) && p.includes('[redacted')));
  assert.ok(t.companion.session.packet.redactions >= 1);
  assert.ok(!t.companion.session.packet.text.includes(secret));
  assert.ok(r.context.redactions >= 1, 'the bubble shows the redaction count');
});

test('the screenshot never touches disk and is not kept on the session', async () => {
  const writes = [];
  const originals = { writeFileSync: fs.writeFileSync, writeFile: fs.writeFile, promisesWriteFile: fs.promises.writeFile };
  const spy = (name, fn) => function (file, data, ...rest) { writes.push({ name, file: String(file), data }); return fn.call(this, file, data, ...rest); };
  fs.writeFileSync = spy('writeFileSync', originals.writeFileSync);
  fs.writeFile = spy('writeFile', originals.writeFile);
  fs.promises.writeFile = spy('promises.writeFile', originals.promisesWriteFile);
  try {
    const t = setup();
    await t.ask('what do you see?');
    await t.ask('and what does it cost?');
    assert.strictEqual(t.seen.grabs, 1);
    const pictures = writes.filter((w) => /\.png$/i.test(w.file) || (Buffer.isBuffer(w.data) && w.data.includes(PNG)));
    assert.deepStrictEqual(pictures, []);
    assert.ok(!JSON.stringify(Object.keys(t.companion.session.packet)).includes('png'), 'packet keeps text only');
  } finally {
    Object.assign(fs, { writeFileSync: originals.writeFileSync, writeFile: originals.writeFile });
    fs.promises.writeFile = originals.promisesWriteFile;
  }
});

test('vision: the window picture goes to the API only when "Send screenshots" is on, and never by default', async () => {
  const sentImages = [];
  const api = { route: () => ({ provider: 'fake', model: () => 'fake-vision', label: () => 'your API key', ask: async ({ image, onText }) => { sentImages.push(image || null); onText('[mood:happy] A blanket for $39.99.'); } }) };
  const off = setup({ settings: { cloudCli: 'api' }, api });
  await off.ask('Compare the trade-offs of buying this step by step'); // hard → API, no picture
  assert.deepStrictEqual(sentImages, [null]);
  assert.strictEqual(off.seen.downscaled, 0);

  const on = setup({ settings: { cloudCli: 'api', teachScreenshots: true }, api });
  const r = await on.ask('what do you see?'); // easy, but a picture only helps a model that can see it
  assert.strictEqual(r.done.tier, 'cloud');
  assert.ok(Buffer.isBuffer(sentImages[1]) && sentImages[1].toString().endsWith('-small'), 'the downscaled window picture');
  assert.match(r.done.detail, /with the screenshot/);
  await on.ask('and the return policy?');
  assert.strictEqual(sentImages[2], null, 'follow-ups reuse the text; the picture went with that one question');
});
