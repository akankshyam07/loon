// "Teach me on my screen" (DESIGN.md §3.18): grounding in code, the model's ids checked, the overlay's layout math,
// caption follow-along and the privacy gates. Fakes only: no screen capture, no Tesseract, no model, no network.
const test = require('node:test');
const assert = require('node:assert');
const teach = require('../brain/teach');
const { imageRoute } = require('../brain/vision');
const layout = require('../renderer/overlay-layout');
const api = require('../brain/api-provider');
const { createTeacher } = require('../main/teach');

// Tesseract's output shape (blocks → paragraphs → lines → words, bbox in image pixels).
const word = (text, x0, y0, x1, y1, confidence = 91) => ({ text, confidence, bbox: { x0, y0, x1, y1 } });
const ocrData = (lines) => ({ blocks: [{ paragraphs: [{ lines: lines.map((words) => ({ words })) }] }] });
// One line of text at (x, y) in points at scale 1: 8 px per character, 4 px between words.
function line(text, x, y, h = 14) {
  let at = x;
  return text.split(' ').map((w) => {
    const out = word(w, at, y, at + w.length * 8, y + h);
    at += w.length * 8 + 4;
    return out;
  });
}
const screenOf = (...items) => ocrData(items.map(([text, x, y]) => line(text, x, y)));
const DISPLAY = { id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 }, scaleFactor: 1 };

// ---------- OCR → elements ----------

test('OCR words → elements: menu items split on wide gaps, sentences stay whole, Retina and display offset applied', () => {
  const data = ocrData([
    [word('File', 120, 8, 160, 36), word('Edit', 210, 8, 250, 36), word('View', 300, 8, 348, 36)], // a menu bar: wide gaps
    [word('Export', 300, 100, 380, 128), word('as', 392, 100, 420, 128), word('PDF…', 432, 100, 490, 128)], // one item
    [word('~', 600, 100, 610, 128, 20), word('|', 620, 100, 624, 128, 10)], // OCR noise
  ]);
  const els = teach.ocrElements(data, { scale: 2, origin: { x: -1440, y: 0 } });
  assert.deepStrictEqual(els.map((e) => e.text), ['File', 'Edit', 'View', 'Export as PDF…']);
  assert.deepStrictEqual(els.map((e) => e.id), ['t1', 't2', 't3', 't4']);
  assert.deepStrictEqual(els[0].box, { x: -1380, y: 4, w: 20, h: 14 }); // pixels / 2, then the display's origin
  assert.strictEqual(els[3].words.length, 3);
  assert.deepStrictEqual(teach.ocrElements(null), []);
});

// ---------- DOM boxes → screen points ----------

const frame = (extra = {}) => ({ screenX: 100, screenY: 50, outerWidth: 1200, outerHeight: 800, innerWidth: 1200, innerHeight: 720, dpr: 2, ...extra });

test('DOM boxes → screen points: toolbar offset, Retina, page zoom, a display left of the primary', () => {
  assert.deepStrictEqual(teach.domToScreen({ x: 10, y: 20, w: 100, h: 30 }, frame(), 2), { x: 110, y: 150, w: 100, h: 30 }); // 80 px of toolbar
  // 125% page zoom on a Retina display: devicePixelRatio 2.5, viewport 960×576 CSS px
  assert.deepStrictEqual(teach.domToScreen({ x: 10, y: 20, w: 100, h: 30 }, frame({ dpr: 2.5, innerWidth: 960, innerHeight: 576 }), 2), { x: 113, y: 155, w: 125, h: 38 });
  // a plain display to the left of the primary one
  assert.deepStrictEqual(teach.domToScreen({ x: 0, y: 0, w: 50, h: 20 }, frame({ screenX: -1500, screenY: 120, dpr: 1 }), 1), { x: -1500, y: 200, w: 50, h: 20 });
  assert.deepStrictEqual(teach.viewportRect(frame(), 2), { x: 100, y: 130, w: 1200, h: 720 });
});

test('DOM elements replace OCR inside the browser viewport; out-of-view and empty ones are dropped', () => {
  const dom = teach.domElements([
    { id: 'e1', role: 'button', text: 'Export', label: '', box: { x: 10, y: 10, w: 80, h: 30 }, inView: true },
    { id: 'e2', role: 'link', text: 'Far below', label: '', box: { x: 10, y: 3000, w: 80, h: 30 }, inView: false },
    { id: 'e3', role: 'textbox', text: '', label: '', box: { x: 10, y: 60, w: 80, h: 30 }, inView: true },
  ], frame(), 2);
  assert.deepStrictEqual(dom.map((e) => e.id), ['e1']);
  const ocr = [{ id: 't1', text: 'Export', box: { x: 112, y: 142, w: 70, h: 20 } }, { id: 't2', text: 'Dock', box: { x: 20, y: 870, w: 40, h: 14 } }];
  const merged = teach.mergeElements(ocr, dom, teach.viewportRect(frame(), 2));
  assert.deepStrictEqual(merged.map((e) => e.id), ['e1', 't2']);
  assert.deepStrictEqual(teach.excludeRects(merged, [{ x: 0, y: 860, w: 200, h: 40 }]).map((e) => e.id), ['e1']); // Loon's own windows
});

// ---------- finding targets by text ----------

const ELS = [
  { id: 't1', text: 'File', box: { x: 60, y: 4, w: 20, h: 14 } },
  { id: 't2', text: 'Exit', box: { x: 90, y: 4, w: 20, h: 14 } },
  { id: 't3', text: 'Export as PDF…', box: { x: 150, y: 50, w: 95, h: 14 }, words: line('Export as PDF…', 150, 50).map((w) => ({ text: w.text, box: { x: w.bbox.x0, y: w.bbox.y0, w: w.bbox.x1 - w.bbox.x0, h: 14 } })) },
  { id: 't4', text: 'Click Export to save a copy of your poster in another format.', box: { x: 300, y: 300, w: 480, h: 14 } },
  { id: 't5', text: 'Settlngs', box: { x: 10, y: 400, w: 60, h: 14 } },
];

test('fuzzy matcher: exact, any case, part of a label with its own box, OCR typos, never short look-alikes', () => {
  assert.strictEqual(teach.findTarget(ELS, 'File').element.id, 't1');
  assert.strictEqual(teach.findTarget(ELS, 'file').element.id, 't1');
  const exp = teach.findTarget(ELS, 'export');
  assert.strictEqual(exp.element.id, 't3', 'the short menu item beats the sentence that mentions it');
  assert.deepStrictEqual(exp.box, { x: 150, y: 50, w: 48, h: 14 }, 'the box covers just "Export"');
  assert.strictEqual(teach.findTarget(ELS, 'Settings').element.id, 't5'); // OCR read "Settlngs"
  assert.strictEqual(teach.findTarget(ELS, 'Edit'), null); // "Exit" is not "Edit"
  assert.strictEqual(teach.findTarget(ELS, 'Export as PDF').element.id, 't3');
  assert.strictEqual(teach.findTarget([], 'x'), null);
});

test('menu paths: "File > Export" finds each part in order; a missing part means no match', () => {
  const found = teach.findPath(ELS, 'File > Export');
  assert.deepStrictEqual(found.map((m) => m.element.id), ['t1', 't3']);
  assert.deepStrictEqual(teach.findPath(ELS, 'File › Export as PDF…').map((m) => m.element.id), ['t1', 't3']);
  assert.strictEqual(teach.findPath(ELS, 'File > Print'), null);
});

// ---------- the model's JSON ----------

test('model JSON: steps keep valid ids, drop invented ones, "" means no target, odd kinds become boxes', () => {
  const raw = `Sure! {"steps":[{"say":"This is the File menu","target":"t1","kind":"box"},{"say":"Made up","target":"t99","kind":"box"},
    {"say":"General point","target":"","kind":"arrow"},{"say":"Weird kind","target":"t3","kind":"sparkles"},{"say":42,"target":"t1","kind":"box"}]}`;
  assert.deepStrictEqual(teach.parseTeach(raw, ELS), [
    { say: 'This is the File menu', target: 't1', kind: 'box' },
    { say: 'General point', target: null, kind: 'arrow' },
    { say: 'Weird kind', target: 't3', kind: 'box' },
  ]);
  assert.deepStrictEqual(teach.parseTeach('not json', ELS), []);
  assert.deepStrictEqual(teach.parseTeach('{"steps": "nope"}', ELS), []);
  const many = JSON.stringify({ steps: Array.from({ length: 10 }, (_, i) => ({ say: `s${i}`, target: 't1', kind: 'box' })) });
  assert.strictEqual(teach.parseTeach(many, ELS).length, teach.MAX_STEPS);
});

test('prompt: numbered, redacted element list with positions; no coordinates are asked for', () => {
  const els = [...ELS, { id: 't6', text: 'token=sk-proj-abcdefghijklmnopqrstuvwxyz123456', box: { x: 700, y: 850, w: 300, h: 14 } }];
  const prompt = teach.teachPrompt({ question: 'what is this?', mode: 'explain', elements: els, bounds: { x: 0, y: 0, w: 1440, h: 900 } });
  assert.match(prompt, /^t1 "File" @5,1$/m);
  assert.match(prompt, /<context>[\s\S]*<\/context>/);
  assert.ok(!prompt.includes('sk-proj-'), 'secrets on screen are redacted');
  assert.match(prompt, /Never invent ids or coordinates/);
  assert.ok(!teach.teachPrompt({ question: 'q', elements: els, bounds: { x: 0, y: 0, w: 1, h: 1 }, withSystem: false }).includes(teach.TEACH_SYSTEM));
});

// ---------- captions → instructions ----------

test('captions → instructions: clicks, menu paths, "then" chains, key combos, typing; chatter ignored', () => {
  const says = (text) => teach.parseInstructions(text).map((s) => s.say);
  assert.deepStrictEqual(says('So now click on File, then Export…'), ['Click "File"', 'Click "Export"']);
  assert.deepStrictEqual(says('go to File > Export > PDF'), ['Click "File"', 'Click "Export"', 'Click "PDF"']);
  assert.deepStrictEqual(says('select Export from the File menu'), ['Click "File"', 'Click "Export"']);
  assert.deepStrictEqual(says('okay so first you want to click on the Insert tab and then choose Table'), ['Click "Insert"', 'Click "Table"']);
  assert.deepStrictEqual(says('so what we are going to do is go to the view menu then click zoom in'), ['Click "view"', 'Click "zoom in"']);
  assert.deepStrictEqual(says('press command shift P to open the palette'), ['Press ⇧⌘P']);
  assert.deepStrictEqual(says('press ⌘S'), ['Press ⌘S']);
  assert.deepStrictEqual(says('press ctrl+c then ctrl+v'), ['Press ⌃C', 'Press ⌃V']);
  assert.deepStrictEqual(says('now type "hello world" into the box'), ['Type "hello world"']);
  assert.deepStrictEqual(says("hit save and you'll see a dialog"), ['Click "save"']);
  assert.deepStrictEqual(says("click Save, it's at the top right"), ['Click "Save"']);
  assert.deepStrictEqual(says('and then you just click it'), []);
  assert.deepStrictEqual(says('which will open the export dialog'), []);
  assert.deepStrictEqual(says(''), []);
  assert.strictEqual(teach.normalizeKeys('Option Command Escape'), '⌥⌘⎋');
  assert.strictEqual(teach.normalizeKeys('the big button'), null);
});

test('intents stay narrow: screen requests are caught, ordinary questions are not', () => {
  const t = teach.teachIntent;
  assert.deepStrictEqual(t('Where is the Export button?'), { mode: 'where', question: 'Where is the Export button', target: 'Export' });
  assert.deepStrictEqual(t('point at the save icon').target, 'save');
  assert.deepStrictEqual(t('show me how to export as PDF'), { mode: 'how', question: 'show me how to export as PDF', goal: 'export as PDF' });
  assert.strictEqual(t('where do I click to change the font').goal, 'change the font');
  assert.strictEqual(t("Loon, where's the share button on my screen").target, 'share');
  assert.strictEqual(t('teach me this').mode, 'explain');
  assert.strictEqual(t("explain what I'm looking at").mode, 'explain');
  assert.strictEqual(t('follow along with the video').mode, 'follow');
  for (const q of ['where is Paris?', 'how do I cook rice', 'explain this code', 'what time is it']) assert.strictEqual(t(q), null, q);
});

// ---------- overlay layout ----------

test('layout: cards stay on screen, avoid each other and the targets, and point back with an arrow', () => {
  const vp = { x: 0, y: 0, w: 1440, h: 900 };
  const items = [
    { box: { x: 1380, y: 40, w: 50, h: 24 }, text: 'Right at the edge: the card must go left or below' },
    { box: { x: 600, y: 400, w: 60, h: 24 }, text: 'Middle one' },
    { box: { x: 620, y: 440, w: 60, h: 24 }, text: 'A crowded neighbour right under it' },
    { box: { x: 10, y: 870, w: 60, h: 24 }, text: 'Bottom left corner' },
    { box: null, text: 'Press ⌘S' },
  ];
  const out = layout.layout(items, vp);
  for (const o of out) {
    const c = o.card;
    assert.ok(c.x >= layout.MARGIN && c.y >= layout.MARGIN && c.x + c.w <= vp.w - layout.MARGIN && c.y + c.h <= vp.h - layout.MARGIN, JSON.stringify(o));
    assert.ok(o.badge.x >= 0 && o.badge.y >= 0 && o.badge.x < vp.w && o.badge.y < vp.h);
  }
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) assert.strictEqual(layout.overlap(out[i].card, out[j].card), 0, `cards ${i} and ${j} overlap`);
  for (const o of out.filter((x) => x.box)) for (const t of items.filter((x) => x.box)) assert.strictEqual(layout.overlap(o.card, t.box), 0, 'a card covers a target');
  assert.notStrictEqual(out[0].side, 'right');
  assert.ok(out[1].arrow && Math.hypot(out[1].arrow.to.x - out[1].arrow.from.x, out[1].arrow.to.y - out[1].arrow.from.y) > 20);
  assert.strictEqual(out[4].arrow, null);
  assert.ok(layout.cardSize('x'.repeat(200)).h > layout.cardSize('short').h);
});

test('annotations split across displays, in each display\'s own coordinates; no box goes to the cursor\'s display', () => {
  const displays = [{ id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 } }, { id: 2, bounds: { x: -1920, y: -200, width: 1920, height: 1080 } }];
  const parts = layout.splitByDisplay([
    { n: 1, box: { x: 100, y: 100, w: 10, h: 10 } },
    { n: 2, box: { x: -1000, y: 0, w: 40, h: 20 } },
    { n: 3, box: null },
  ], displays, 2);
  assert.deepStrictEqual(parts.get(1).map((a) => a.n), [1]);
  assert.deepStrictEqual(parts.get(2).map((a) => [a.n, a.box && a.box.x, a.box && a.box.y]), [[2, 920, 200], [3, null, null]]);
});

// ---------- the teacher, end to end with fakes ----------

function rig({ ocr = [screenOf(['File', 60, 4], ['Edit', 110, 4], ['Export…', 900, 60])], front = 'Pixelpad', windows = ['poster.png'], page = null, settings = {}, brainReply = '{"steps":[]}', cloudReply = '{"steps":[]}', cloudError = null, bridge = null } = {}) {
  const calls = { grab: 0, ocr: 0, shows: [], hides: 0, audit: [], chat: [], cli: [], api: [], bubble: [] };
  const queue = [...ocr];
  const screen = {
    grab: async () => { calls.grab++; return [{ display: DISPLAY, png: Buffer.from('pixels'), width: 1440, height: 900 }]; },
    ocr: async () => { calls.ocr++; return queue.length > 1 ? queue.shift() : queue[0]; },
    frontApp: async () => front,
    windowNames: async () => windows,
    ownWindows: () => [],
    displays: () => [DISPLAY],
    cursorDisplayId: () => 1,
    downscale: () => Buffer.from('small'),
  };
  const overlay = { show: (p) => calls.shows.push(p), hide: () => { calls.hides++; }, visible: () => false };
  const brain = { chat: async (prompt, { onText, jsonSchema }) => { calls.chat.push({ prompt, jsonSchema }); onText(brainReply); return brainReply; } };
  const cli = { ask: async (which, opts) => { calls.cli.push({ which, ...opts }); if (cloudError) throw cloudError; return cloudReply; }, label: (w) => w };
  const apiRoute = { route: () => ({ label: () => 'API', ask: async (opts) => { calls.api.push(opts); return cloudReply; } }) };
  const teacher = createTeacher({ settings: { companion: 'luna', ...settings }, screen, overlay, bridge, activePage: () => page, brain, cli, api: apiRoute, audit: (e) => calls.audit.push(e), settleMs: 0 });
  return { teacher, calls, bubble: (type, payload) => calls.bubble.push({ type, ...payload }) };
}

test('"where is Export?" is matched in code: a box on the word, no model, metadata-only audit', async () => {
  const { teacher, calls, bubble } = rig();
  const r = await teacher.run(1, teach.teachIntent('where is the Export button?'), bubble);
  assert.ok(r.ok);
  assert.strictEqual(calls.chat.length + calls.cli.length, 0, 'no model call');
  assert.deepStrictEqual(calls.shows[0].annotations[0].box, { x: 900, y: 60, w: 56, h: 14 });
  assert.strictEqual(calls.shows[0].multi, false);
  assert.strictEqual(calls.bubble.find((b) => b.type === 'done').tier, 'code');
  assert.deepStrictEqual(Object.keys(calls.audit[0]).sort(), ['action', 'elements', 'image', 'mode', 'model', 'ok', 'source', 'steps']);
  assert.ok(!JSON.stringify(calls.audit).includes('Export'), 'no screen text in the audit log');
});

test('explain: the local model picks ids under the grammar; invented ids are dropped before drawing', async () => {
  const { teacher, calls, bubble } = rig({ brainReply: '{"steps":[{"say":"Menus live here","target":"t1","kind":"box"},{"say":"Nope","target":"t42","kind":"box"},{"say":"Save a copy","target":"t3","kind":"arrow"}]}' });
  const r = await teacher.run(1, { mode: 'explain', question: 'what am I looking at' }, bubble);
  assert.ok(r.ok);
  assert.strictEqual(calls.chat[0].jsonSchema, teach.TEACH_SCHEMA);
  assert.deepStrictEqual(calls.shows[0].annotations.map((a) => [a.n, a.say, a.kind]), [[1, 'Menus live here', 'box'], [2, 'Save a copy', 'arrow']]);
  assert.deepStrictEqual(calls.shows[0].annotations[1].box, { x: 900, y: 60, w: 56, h: 14 });
});

test('"show me how" steps advance with Next and finish with done', async () => {
  const { teacher, calls, bubble } = rig({ brainReply: '{"steps":[{"say":"Open File","target":"t1","kind":"box"},{"say":"Then Export","target":"t3","kind":"box"}]}' });
  await teacher.run(1, { mode: 'how', goal: 'save as pdf', question: 'show me how to save as pdf' }, bubble);
  assert.strictEqual(calls.shows[0].multi, true);
  assert.strictEqual(calls.shows[0].current, 1);
  await teacher.next();
  assert.strictEqual(calls.shows.at(-1).current, 2);
  await teacher.next();
  assert.strictEqual(teacher.active(), false);
  assert.ok(calls.hides >= 1);
});

test('follow along: captions → steps on the other window, captured again for each step', async () => {
  const before = screenOf(['File', 60, 4], ['Edit', 110, 4], ['Crop', 300, 60]);
  const menuOpen = screenOf(['File', 60, 4], ['Edit', 110, 4], ['New', 60, 30], ['Export…', 60, 50]);
  const bridge = { clients: { size: 1 }, request: async (m) => (m.type === 'agent-captions' ? { current: 'then export', recent: 'okay so click File, then Export', selection: '', frame: { screenX: 800, screenY: 0, outerWidth: 640, outerHeight: 900, innerWidth: 640, innerHeight: 820, dpr: 2 } } : {}) };
  const { teacher, calls, bubble } = rig({ ocr: [before, menuOpen], bridge });
  const r = await teacher.run(1, { mode: 'follow', question: 'follow along' }, bubble);
  assert.deepStrictEqual(r.instructions.map((s) => s.say), ['Click "File"', 'Click "Export"']);
  assert.deepStrictEqual(calls.shows[0].annotations[0].box, { x: 60, y: 4, w: 32, h: 14 });
  assert.strictEqual(calls.chat.length, 0, 'no model');
  await teacher.next(); // the user opened File; Loon looks again
  assert.strictEqual(calls.grab, 2);
  assert.deepStrictEqual(calls.shows.at(-1).annotations[0].box, { x: 60, y: 50, w: 56, h: 14 });
  assert.strictEqual(calls.shows.at(-1).current, 2);
  await teacher.next();
  assert.strictEqual(teacher.active(), false);
});

test('follow along: a step not on screen yet says so; no captions or no extension is a clear message', async () => {
  const bridge = { clients: { size: 1 }, request: async () => ({ recent: 'go to Window > Layers', frame: null }) };
  const { teacher, calls, bubble } = rig({ bridge });
  await teacher.run(1, { mode: 'follow' }, bubble);
  assert.match(calls.shows[0].annotations[0].say, /can't see "Window" yet/);
  assert.strictEqual(calls.shows[0].annotations[0].box, null);
  const silent = rig({ bridge: { clients: { size: 1 }, request: async () => ({ recent: '', current: '' }) } });
  await silent.teacher.run(2, { mode: 'follow' }, silent.bubble);
  assert.match(silent.calls.bubble[0].message, /captions/);
  const unpaired = rig();
  await unpaired.teacher.run(3, { mode: 'follow' }, unpaired.bubble);
  assert.match(unpaired.calls.bubble[0].message, /Pair/);
  assert.strictEqual(silent.calls.grab + unpaired.calls.grab, 0);
});

// ---------- privacy gates ----------

test('privacy: nothing is captured until asked, and never with a password manager, bank or private page on screen', async () => {
  const idle = rig();
  assert.strictEqual(idle.calls.grab, 0);
  assert.ok(teach.screenGate({}));
  for (const [opts, reason] of [
    [{ front: '1Password 8' }, /1Password/],
    [{ windows: ['poster.png', 'Chase Online Banking - Sign in'] }, /private window/],
    [{ page: { sensitive: true, visible: true, url: 'https://chase.com' } }, /private page/],
  ]) {
    const { teacher, calls, bubble } = rig(opts);
    const r = await teacher.run(1, { mode: 'explain' }, bubble);
    assert.strictEqual(r.ok, false);
    assert.match(calls.bubble[0].message, reason);
    assert.strictEqual(calls.grab, 0, 'refused before any capture');
    assert.deepStrictEqual(calls.audit[0], { action: 'teach', mode: 'explain', ok: false, refused: true });
  }
});

test('privacy: screen text is redacted before a cloud call, and the screenshot goes only when switched on', async () => {
  const secret = screenOf(['File', 60, 4], ['api_key=sk-proj-abcdefghijklmnopqrstuvwx1234', 300, 300]);
  const reply = '{"steps":[{"say":"Menus","target":"t1","kind":"box"}]}';
  const off = rig({ ocr: [secret], settings: { cloudCli: 'codex' }, cloudReply: reply });
  await off.teacher.run(1, { mode: 'explain' }, off.bubble);
  assert.strictEqual(off.calls.cli.length, 1);
  assert.ok(!off.calls.cli[0].prompt.includes('sk-proj-'), 'redacted');
  assert.strictEqual(off.calls.cli[0].image, undefined, 'no picture unless the user switched it on');
  assert.strictEqual(off.calls.chat.length, 0);

  const on = rig({ ocr: [secret], settings: { cloudCli: 'codex', teachScreenshots: true }, cloudReply: reply });
  await on.teacher.run(1, { mode: 'explain' }, on.bubble);
  assert.deepStrictEqual(on.calls.cli[0].image, Buffer.from('small'));
  assert.strictEqual(on.calls.audit[0].image, true);
  // ...but not for "how" steps, not via Claude Code, not via API without the switch, never in Privacy mode
  const how = rig({ settings: { cloudCli: 'codex', teachScreenshots: true }, cloudReply: reply });
  await how.teacher.run(1, { mode: 'how', goal: 'crop', question: 'show me how to crop' }, how.bubble);
  assert.strictEqual(how.calls.cli[0].image, undefined);
  assert.strictEqual(imageRoute({ cloudCli: 'claude', teachScreenshots: true }), null);
  assert.deepStrictEqual(imageRoute({ cloudCli: 'api', teachScreenshots: true }), { kind: 'api' });
  assert.strictEqual(imageRoute({ cloudCli: 'api' }), null);
  const privacy = rig({ settings: { cloudCli: 'api', teachScreenshots: true, privacy: true }, brainReply: reply });
  await privacy.teacher.run(1, { mode: 'explain' }, privacy.bubble);
  assert.strictEqual(privacy.calls.api.length, 0, 'Privacy mode: nothing leaves the Mac');
  assert.strictEqual(privacy.calls.chat.length, 1);
});

test('a failed cloud call falls back to the local model; no model at all is a clear message', async () => {
  const reply = '{"steps":[{"say":"Menus","target":"t1","kind":"box"}]}';
  const { teacher, calls, bubble } = rig({ settings: { cloudCli: 'claude' }, brainReply: reply, cloudError: new Error('offline') });
  const r = await teacher.run(1, { mode: 'explain' }, bubble);
  assert.ok(r.ok);
  assert.strictEqual(calls.cli.length, 1);
  assert.strictEqual(calls.chat.length, 1);
  assert.strictEqual(calls.bubble.find((b) => b.type === 'done').tier, 'local');
  const noBrain = createTeacher({ settings: {}, screen: { grab: async () => [{ display: DISPLAY, png: Buffer.alloc(1), width: 1440, height: 900 }], ocr: async () => screenOf(['File', 60, 4]), frontApp: async () => '', windowNames: async () => [], ownWindows: () => [], displays: () => [DISPLAY] }, overlay: { show() {}, hide() {}, visible: () => false }, brain: { chat: async () => { throw new Error('No model available'); } }, settleMs: 0 });
  const out = [];
  const res = await noBrain.run(1, { mode: 'explain' }, (type, p) => out.push(p));
  assert.strictEqual(res.ok, false);
  assert.match(out[0].message, /local model/);
});

// ---------- triggers through the companion (typed, spoken, chips) ----------

test('companion: teach phrases, the Teach bubble and the "Show me on screen" chip reach the teacher; other questions do not', async () => {
  const { createCompanion } = require('../main/companion');
  const runs = [];
  let active = false;
  const teacher = {
    run: async (id, intent) => { runs.push(intent); active = true; return { ok: true }; },
    next: async () => runs.push('next'),
    done: () => { runs.push('done'); active = false; },
    active: () => active,
  };
  const asked = [];
  const resolver = { run: async (task, packet) => { asked.push(packet.question || task); return { text: 'ok', tier: 'local' }; }, counts: {} };
  const companion = createCompanion({
    bridge: { clients: new Set() }, resolver, brain: { resetThread() {}, modelLabel: () => 'fake' },
    ui: { cat() {}, showBubble() {}, hideBubble() {}, bubbleFocused: () => false }, notes: { files: () => [] }, actions: {}, settings: { personal: {}, cameos: false }, teacher,
  });
  const send = (args) => companion.run({ id: 1, ...args }, (type, p) => { if (type === 'error') throw new Error(p.message); });
  await send({ question: 'where is the Export button?' });
  assert.deepStrictEqual(runs.at(-1), { mode: 'where', question: 'where is the Export button', target: 'Export' });
  await send({ question: 'next' });
  assert.strictEqual(runs.at(-1), 'next');
  await send({ question: 'done' });
  assert.strictEqual(runs.at(-1), 'done');
  await send({ question: 'how do I cook rice' });
  assert.deepStrictEqual(asked, ['how do I cook rice']);
  companion.openTeach();
  assert.deepStrictEqual(companion.context().chips.map((c) => c.id), ['teach_explain']); // no paired browser: no video chip
  await send({ question: 'crop the picture' });
  assert.deepStrictEqual(runs.at(-1), { mode: 'how', goal: 'crop the picture', question: 'crop the picture' });
  companion.fromCapture({ text: 'Error 42: disk full', source: 'screenshot' });
  assert.ok(companion.context().chips.some((c) => c.id === 'teach_explain' && c.label === 'Show me on screen'));
  await send({ task: 'teach_explain' });
  assert.strictEqual(runs.at(-1).mode, 'explain');
});

// ---------- vision-capable request shapes (own API key) ----------

test('API requests carry the screenshot as an image part only when one is given', () => {
  const base = { baseUrl: 'https://x', key: 'k', model: 'm', system: 's', prompt: 'p', maxTokens: 10 };
  const img = 'iVBORw0KGgo=';
  assert.strictEqual(api.PROVIDERS.anthropic.request(base).body.messages[0].content, 'p');
  assert.deepStrictEqual(api.PROVIDERS.anthropic.request({ ...base, image: img }).body.messages[0].content[0], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: img } });
  assert.strictEqual(api.PROVIDERS.openai.request(base).body.input, 'p');
  assert.strictEqual(api.PROVIDERS.openai.request({ ...base, image: img }).body.input[0].content[1].image_url, `data:image/png;base64,${img}`);
  assert.deepStrictEqual(api.PROVIDERS.gemini.request({ ...base, image: img }).body.contents[0].parts[0], { inline_data: { mime_type: 'image/png', data: img } });
  assert.strictEqual(api.PROVIDERS.gemini.request(base).body.contents[0].parts.length, 1);
  assert.strictEqual(api.PROVIDERS.custom.request({ ...base, image: img }).body.messages[1].content[1].type, 'image_url');
});
