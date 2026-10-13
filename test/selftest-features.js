// End-to-end checks for the newer features (`--part=features`): how the cat looks (pixel skin, Luna/Soju, costumes,
// Classic), duo mode, "Teach me on my screen" on a fixture capture with real OCR, plan-first answers and follow-ups
// through a fake `claude` CLI, History → Continue, Loon's brain (the memory graph) in Settings, Routines, and in-chat
// memory (👍, "Remember this" with its Undo toast). Fakes only stand in for the outside
// world: the screen capture, the Claude Code binary and the macOS executors.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, screen, globalShortcut, BrowserWindow } = require('electron');
const { withTempData, waitFor, wait } = require('./selftest');
const { PERSONAS } = require('../renderer/persona');
const { cleanPersonal } = require('../brain/personal');

const fixture = (name) => path.join(__dirname, 'fixtures', name);

async function run(ctx, check, h) {
  const home = ctx.catWin.getBounds();
  const settingsWin = await h.settingsWindow();
  check('Settings window opens', Boolean(settingsWin));
  if (!settingsWin) return;
  const sw = (js) => settingsWin.webContents.executeJavaScript(js);
  try {
    await looks(ctx, check, h, sw);
    await duo(ctx, check, h, sw);
  } finally {
    ctx.resetCatPosition(home);
    settingsWin.close(); // closed for Teach: Loon leaves its own windows out of what it reads on screen
  }
  await withTempData(ctx, async (data) => {
    await teach(ctx, check, h);
    await planFirst(ctx, check, h);
    await brainGraph(ctx, check, h, data);
    await routinesFlow(ctx, check, h);
    await personalization(ctx, check, h);
  });
}

// ---------- the cat's looks, switched from Settings like a person would ----------
async function looks(ctx, check, h, sw) {
  const { cat } = h;
  const stats = () => cat('window.__loon.canvasStats()');
  const idle = () => waitFor(async () => (await cat('window.__loon.state')) === 'idle', 10000);
  const pick = (name, value) => sw(`document.querySelector('[name=${name}][value=${value}]').click(); true`);
  const saved = { catStyle: ctx.settings.catStyle, companion: ctx.settings.companion, costume: ctx.settings.costume };
  try {
    await idle();
    const first = await stats();
    check('pixel cat: the pixel skin is the default and draws a frame', (await cat('window.__loon.catStyle')) === 'pixel' && first.visible && first.opaque > 500, JSON.stringify(first));

    if ((await cat('window.__loon.companion')) !== 'luna') await pick('companion', 'luna');
    let luna = null;
    await waitFor(async () => { luna = await stats(); return (await cat('window.__loon.companion')) === 'luna' && luna.opaque > 500 && luna.light / luna.opaque < 0.1; }, 5000);
    await pick('companion', 'soju');
    let soju = null;
    const switched = await waitFor(async () => { soju = await stats(); return (await cat('window.__loon.companion')) === 'soju' && soju.light / soju.opaque > 0.3; }, 5000);
    check('pixel cat: picking Soju in Settings swaps the sprite live (black Luna → white Soju)', switched, `luna ${JSON.stringify(luna)} · soju ${JSON.stringify(soju)}`);

    await idle();
    const bare = await stats();
    await pick('costume', 'witch');
    let hat = null;
    const dressed = await waitFor(async () => { hat = await stats(); return (await cat('window.__loon.costume')) === 'witch' && hat.top !== null && hat.top <= bare.top - 3; }, 5000);
    check('pixel cat: a costume from the Wardrobe shows on the cat (witch hat makes it taller)', dressed, `top row ${bare.top} → ${hat?.top}`);
    await pick('costume', 'none');

    await pick('catStyle', 'classic');
    const classic = await waitFor(async () => (await cat('window.__loon.catStyle')) === 'classic' && !(await stats()).visible
      && (await cat(`getComputedStyle(document.querySelector('#catBox svg')).visibility !== 'hidden'`)), 5000);
    const head = await cat(`(() => { const r = document.querySelector('#headShape').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: r.width }; })()`);
    const over = await h.hover(head.x, head.y, false);
    const overCaptures = ctx.catIgnore().requested === false;
    const away = await h.hover(3, 3, true);
    const awayPasses = ctx.catIgnore().requested === true;
    await h.click(head.x, head.y);
    const opens = await waitFor(() => ctx.bubbleWin.isVisible(), 2000);
    check('Classic style still works: SVG cat drawn, hit-tested and clickable', classic && head.w > 20 && overCaptures && awayPasses && opens, `${over} · ${away} · bubble ${opens}`);
    if (opens) await h.closeBubble();
  } finally {
    for (const [key, value] of Object.entries(saved)) await sw(`window.loon.setSetting(${JSON.stringify(key)}, ${JSON.stringify(value)}).then(() => true)`);
    await waitFor(async () => (await cat('window.__loon.catStyle')) === saved.catStyle && (await cat('window.__loon.companion')) === saved.companion, 3000);
  }
}

// ---------- duo mode: both cats, per-cat hit-testing, idle scenes that stop on a click ----------
async function duo(ctx, check, h, sw) {
  const { cat, catWin } = { ...h, catWin: ctx.catWin };
  const helper = ctx.settings.companion || 'luna';
  const other = helper === 'luna' ? 'soju' : 'luna';
  const point = (who) => cat(`window.__loon.catPoint(${JSON.stringify(who)})`);
  const idle = () => waitFor(async () => (await cat('window.__loon.state')) === 'idle' && !ctx.bubbleWin.isVisible(), 10000);
  const base = catWin.getBounds();
  await sw(`(() => { const box = document.querySelector('[data-key=duo]'); if (!box.checked) box.click(); return true; })()`);
  try {
    let pts = {};
    const widened = await waitFor(async () => {
      pts = { [helper]: await point(helper), [other]: await point(other) };
      return catWin.getBounds().width > base.width * 1.3 && (await cat('window.__loon.duo')) && pts[helper] && pts[other];
    }, 5000);
    check('duo: turning it on widens the window and draws both cats', widened, `${base.width} → ${catWin.getBounds().width} px · ${JSON.stringify(pts)}`);
    if (!widened) return;

    // The cats settle into their duo spots after the window widens (and idle animation moves them a little), so each
    // point is read right before it's used, never from the first frame.
    await idle();
    let at = await point(other);
    const onOther = await h.hover(at.x, at.y, false);
    const otherCaptures = ctx.catIgnore().requested === false;
    const onEmpty = await h.hover(3, 3, true);
    const emptyPasses = ctx.catIgnore().requested === true;
    at = await point(helper);
    const onHelper = await h.hover(at.x, at.y, false);
    check('duo: each cat captures clicks, the transparent space between passes them through', otherCaptures && emptyPasses && ctx.catIgnore().requested === false, `${onOther} · ${onEmpty} · ${onHelper}`);

    at = await point(other);
    await h.click(at.x, at.y);
    let said = '';
    const petted = await waitFor(async () => PERSONAS[other].lines.pet.includes(said = await cat('window.__loon.say')), 2000);
    await wait(500);
    const noBubble = !ctx.bubbleWin.isVisible();
    at = await point(helper);
    await h.click(at.x, at.y);
    const helperOpens = await waitFor(() => ctx.bubbleWin.isVisible(), 2000);
    check(`duo: clicking ${PERSONAS[other].name} pets them; clicking ${PERSONAS[helper].name} opens the bubble`, petted && noBubble && helperOpens, `"${said}" · bubble after ${other}: ${!noBubble} · after ${helper}: ${helperOpens}`);
    if (helperOpens) await h.closeBubble();

    await idle();
    await wait(400);
    ctx.catWin.webContents.send('debug', { duoScene: 'groomSoju' });
    const playing = await waitFor(async () => (await cat('window.__loon.duoScene')) === 'groomSoju', 20000);
    at = await point(helper);
    if (at) h.mouse('mouseDown', at.x, at.y);
    const stopped = await waitFor(async () => (await cat('window.__loon.duoScene')) === null, 1000, 25);
    if (at) h.mouse('mouseUp', at.x, at.y);
    check('duo: a debug-triggered idle scene plays and a click stops it on the spot', playing && Boolean(at) && stopped, `playing ${playing} · stopped ${stopped}`);
    await waitFor(() => ctx.bubbleWin.isVisible(), 1500);
    if (ctx.bubbleWin.isVisible()) await h.closeBubble();
  } finally {
    await sw(`(() => { const box = document.querySelector('[data-key=duo]'); if (box.checked) box.click(); return true; })()`);
    const narrow = await waitFor(() => Math.abs(catWin.getBounds().width - base.width) <= 2, 3000);
    check('duo: turning it off puts the window back to one cat', narrow, `${catWin.getBounds().width} px`);
  }
}

// ---------- "Teach me on my screen": fixture capture → real OCR → overlay ----------
// Every image file under the temp folder and Loon's data folder (models aside), to prove no screenshot is written.
function imageFiles() {
  const out = new Set();
  const walk = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (depth > 0 && !/^(models|voice|translation-models)$/.test(e.name)) walk(p, depth - 1); }
      else if (/\.(png|jpe?g|bmp|tiff?|webp|heic|gif)$/i.test(e.name)) out.add(p);
    }
  };
  walk(os.tmpdir(), 2);
  walk(app.getPath('userData'), 4);
  return out;
}

async function teach(ctx, check, h) {
  const { teachScreen: seam, overlay, actions, bubbleWin } = ctx;
  const bubble = (js) => bubbleWin.webContents.executeJavaScript(js);
  const saved = { ...seam };
  const savedShow = overlay.show;
  const display = screen.getPrimaryDisplay();
  const png = fs.readFileSync(fixture('teach-app.png')); // 1280×800, the fake app "Inkwell" (teach-app.html)
  let grabs = 0;
  seam.grab = async () => { grabs++; return [{ display: { id: display.id, bounds: display.bounds, scaleFactor: display.scaleFactor }, png, width: 1280, height: 800 }]; };
  seam.frontApp = async () => 'Inkwell';
  seam.windowNames = async () => ['Inkwell — Garden report'];
  const shown = [];
  overlay.show = (payload) => { shown.push(payload); return savedShow(payload); };
  const overlayWin = () => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && /overlay\.html$/.test(w.webContents.getURL()) && w.isVisible());
  const ow = (js) => overlayWin()?.webContents.executeJavaScript(js);
  // The fixture's pixel boxes (teach-app.html), mapped onto the display the same way teach does (width ratio).
  const scale = 1280 / display.bounds.width;
  const onScreen = (b) => ({ x: display.bounds.x + b.x / scale, y: display.bounds.y + b.y / scale, w: b.w / scale, h: b.h / scale });
  const EXPORT = onScreen({ x: 344, y: 72, w: 146, h: 64 });
  const FILE = onScreen({ x: 30, y: 8, w: 54, h: 40 });
  const centerIn = (box, r) => box && box.x + box.w / 2 >= r.x && box.x + box.w / 2 <= r.x + r.w && box.y + box.h / 2 >= r.y && box.y + box.h / 2 <= r.y + r.h;
  const before = imageFiles();
  try {
    await h.openBubble();
    const answer = await h.askHere('where is the Export button?', 90000);
    const ann = shown.at(-1)?.annotations?.[0];
    const drawnOk = await waitFor(async () => overlayWin() && (await ow(`Boolean(document.querySelector('.target:not(.later)'))`)), 5000);
    const drawn = drawnOk && await ow(`(() => { const r = document.querySelector('.target:not(.later)').getBoundingClientRect(); return { x: r.x + 6, y: r.y + 5, w: r.width - 12, h: r.height - 10 }; })()`);
    const local = ann?.box && { x: ann.box.x - display.bounds.x, y: ann.box.y - display.bounds.y };
    const audit = actions.recent(1)[0];
    check('teach: "where is the Export button?" boxes Export on the overlay (fixture capture, real Tesseract OCR, no model)',
      answer.done && /Export/.test(answer.text) && centerIn(ann?.box, EXPORT) && drawn && Math.abs(drawn.x - local.x) <= 2 && Math.abs(drawn.y - local.y) <= 2 && audit?.action === 'teach' && audit.model === 'none',
      `box ${JSON.stringify(ann?.box)} vs Export ${JSON.stringify(EXPORT)} · drawn ${JSON.stringify(drawn)} · overlay window ${JSON.stringify(overlayWin()?.getBounds())} · ${answer.tier}`);

    // Esc: a global shortcut only while callouts are up; the overlay page's own Esc handler takes the key here.
    const escOwned = globalShortcut.isRegistered('Escape');
    overlayWin()?.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    let via = 'key event';
    if (!(await waitFor(() => !overlay.visible(), 1500))) {
      via = 'page event (hidden run: the key never reached the page)';
      await ow(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); true`);
    }
    const cleared = await waitFor(() => !overlay.visible() && !overlayWin(), 3000);
    check('teach: Esc clears the callouts and lets go of the Esc key', escOwned && cleared && !globalShortcut.isRegistered('Escape'), `${via} · Esc registered while shown ${escOwned}`);

    const steps = await h.askHere('show me where File > Export is', 90000);
    const first = shown.at(-1);
    const count = () => ow(`document.querySelector('.controls .count')?.textContent || ''`);
    await waitFor(async () => (await count()) === '1/2', 5000);
    const step1 = await count();
    await ow(`document.querySelector('.controls button').click(); true`);
    const step2 = await waitFor(async () => (await count()) === '2/2' && shown.at(-1)?.current === 2, 5000);
    await ow(`document.querySelector('.controls button').click(); true`);
    const finished = await waitFor(() => !overlay.visible(), 3000);
    check('teach: "show me where File > Export is" goes step by step with Next, then Done clears it',
      steps.done && first?.multi && first.total === 2 && centerIn(first.annotations[0].box, FILE) && centerIn(first.annotations[1].box, EXPORT) && step1 === '1/2' && step2 && finished,
      `steps ${first?.total} · ${step1} → ${step2 ? '2/2' : await count()} · cleared ${finished}`);

    seam.windowNames = async () => ['1Password — Personal Vault', 'Inkwell — Garden report'];
    grabs = 0;
    const shownBefore = shown.length;
    await h.submit('where is the Export button?');
    const refused = await waitFor(() => bubble(`[...document.querySelectorAll('.a.error')].some((e) => /private window/i.test(e.textContent))`), 10000);
    check('teach: a password manager window on screen means no capture at all', refused && grabs === 0 && shown.length === shownBefore && !overlay.visible(), `grabs ${grabs}`);
    await h.closeBubble();

    const added = [...imageFiles()].filter((f) => !before.has(f));
    check('teach: no screenshot or image is written to disk', added.length === 0, added.slice(0, 3).join(', '));
  } finally {
    Object.assign(seam, saved);
    overlay.show = savedShow;
    ctx.teacher.done();
  }
}

// ---------- plan-first answers and follow-ups through a fake `claude` CLI ----------
async function planFirst(ctx, check, h) {
  const cli = require('../brain/cli-provider');
  const { settings, resolver, setToggle } = ctx;
  // Copied to a real folder: a program inside the packaged app's archive can't be run.
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-fake-cli-'));
  fs.copyFileSync(fixture('fake-cli/claude'), path.join(bin, 'claude'));
  fs.chmodSync(path.join(bin, 'claude'), 0o755);
  const log = path.join(bin, 'prompts.jsonl');
  const env = { PATH: process.env.PATH, LOON_FAKE_CLI_LOG: process.env.LOON_FAKE_CLI_LOG, LOON_FAKE_CLI_AUTH: process.env.LOON_FAKE_CLI_AUTH };
  const saved = { cloudCli: settings.cloudCli, answerWith: settings.answerWith, personal: settings.personal };
  const prompts = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const runId = Date.now() % 100000; // a fresh question each run, so no cached answer skips the plan
  Object.assign(process.env, { PATH: `${bin}${path.delimiter}${process.env.PATH}`, LOON_FAKE_CLI_LOG: log, LOON_FAKE_CLI_AUTH: 'plan' });
  Object.assign(settings, { cloudCli: 'claude', answerWith: 'plan', personal: cleanPersonal({ ...settings.personal, about: 'My name is Selftest Sam and I mostly write Java.' }) });
  cli.shutdown();
  cli.resetPlanCheck();
  try {
    const cloudBefore = resolver.counts.tiers.cloud || 0;
    await h.openBubble();
    const first = await h.askHere(`Compare TCP and UDP for a chat app in two sentences (run ${runId})`, 60000);
    const p1 = prompts();
    check('plan-first: a medium question goes to your plan (fake Claude Code CLI, stream-json), with your custom instructions',
      first.done && /fake plan/.test(first.text) && p1.length === 1 && /Compare TCP and UDP/.test(p1[0].prompt) && /Selftest Sam/.test(p1[0].system + p1[0].prompt) && (resolver.counts.tiers.cloud || 0) === cloudBefore + 1 && p1[0].args.includes('--tools'),
      `${first.tier} · ${p1.length} prompt(s) · ${first.text.slice(0, 60)}`);

    const second = await h.askHere('and in Python?', 60000);
    const p2 = prompts().at(-1);
    check('plan-first: the follow-up "and in Python?" carries the last question and answer and stays on the plan',
      second.done && /SOCK_STREAM/.test(second.text) && prompts().length === 2 && /Compare TCP and UDP/.test(p2.prompt) && /TCP is reliable and ordered/.test(p2.prompt) && /and in Python/.test(p2.prompt),
      `${second.tier} · ${second.text.slice(0, 60)}`);
    await h.closeBubble();

    // History → Continue: closing the bubble ended the thread; Continue brings it back and the next question carries it.
    const historyWin = await h.settingsWindow();
    const hw = (js) => historyWin.webContents.executeJavaScript(js);
    const conv = `[...document.querySelectorAll('#historyList li.conv')].find((li) => /Compare TCP and UDP/.test(li.textContent))`;
    const listed = await waitFor(() => hw(`Boolean(${conv}) && /2 answers/.test(${conv}.textContent)`), 5000);
    if (listed) await hw(`[...${conv}.querySelectorAll('button')].find((b) => b.textContent === 'Continue').click(); true`);
    const bubble = (js) => ctx.bubbleWin.webContents.executeJavaScript(js);
    const restored = await waitFor(async () => ctx.bubbleWin.isVisible() && (await bubble(`document.querySelectorAll('#log .q').length === 2 && /Picked up from History/.test(document.getElementById('log').textContent)`)), 5000);
    const resumed = restored ? await h.askHere('and which one for video calls?', 60000) : {};
    const p3 = prompts().at(-1);
    check('History lists the conversation, and Continue brings it back so the next question carries it',
      listed && restored && resumed.done && prompts().length === 3 && /Compare TCP and UDP/.test(p3.prompt) && /SOCK_STREAM/.test(p3.prompt) && /video calls/.test(p3.prompt),
      `listed ${listed} · restored ${restored} · ${resumed.tier || ''}`);
    historyWin.close();
    await h.closeBubble();

    // Medium questions without a comparison: no thinking pass, so the CPU model answers in about a minute.
    process.env.LOON_FAKE_CLI_AUTH = 'api';
    cli.resetPlanCheck();
    await h.openBubble();
    const billed = await h.askHere(`Analyze why bread goes stale, in one short sentence (run ${runId})`, 240000);
    check('plan-first: a CLI signed in with API billing is refused and your Mac answers instead',
      billed.done && /API billing/.test(billed.text) && /on your Mac/.test(billed.tier) && prompts().length === 3 && cli.poolSize() === 0,
      `${billed.tier} · ${billed.text.slice(0, 90)}`);
    await h.closeBubble();

    process.env.LOON_FAKE_CLI_AUTH = 'plan';
    cli.resetPlanCheck();
    setToggle('privacy', true);
    await h.openBubble();
    const quiet = await h.askHere(`Analyze why ice floats on water, in one short sentence (run ${runId})`, 240000);
    check('plan-first: Privacy mode keeps even a medium question on your Mac (the plan is never called)', quiet.done && /on your Mac/.test(quiet.tier) && prompts().length === 3, quiet.tier);
    await h.closeBubble();
  } finally {
    setToggle('privacy', false);
    Object.assign(settings, saved);
    for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    cli.shutdown();
    cli.resetPlanCheck();
    fs.rmSync(bin, { recursive: true, force: true });
  }
}

// ---------- remember / forget and Loon's brain in Settings (temporary memory) ----------
async function brainGraph(ctx, check, h, { executed }) {
  const { memory, bubbleWin } = ctx;
  const bubble = (js) => bubbleWin.webContents.executeJavaScript(js);
  await h.typeInBubble('remember that I work at Acme on the Spring Boot migration');
  await h.confirmShown();
  await bubble(`document.querySelector('.confirm .primary').click()`);
  const saved = await waitFor(() => memory.all().length === 1, 3000);
  await h.closeBubble();

  const settingsWin = await h.settingsWindow();
  if (!settingsWin) return check("brain: Settings opens for Loon's brain", false);
  const sw = (js) => settingsWin.webContents.executeJavaScript(js);
  await waitFor(() => sw('Boolean(window.loonBrain)'), 5000);
  await sw('window.loonBrain.refresh().then(() => true)');
  const labels = await sw(`[...document.querySelectorAll('#brainNodes option')].map((o) => o.value)`);
  const drawn = await sw(`!document.getElementById('brainEmpty').hidden ? null : document.getElementById('brain').getBoundingClientRect().width`);
  check("brain: Settings → Loon's brain shows the remembered fact as a graph (Acme, Spring Boot)", saved && labels.includes('Acme') && labels.includes('Spring Boot') && drawn > 0, labels.join(', '));

  await sw(`window.loon.deleteNode('acme').then(() => window.loonBrain.refresh()).then(() => true)`);
  const after = await sw(`[...document.querySelectorAll('#brainNodes option')].map((o) => o.value)`);
  check('brain: forgetting a node removes it from the graph and keeps the fact', !after.includes('Acme') && memory.all().length === 1, after.join(', '));

  await h.typeInBubble('what do you know about me');
  const recalled = await waitFor(() => bubble(`/Acme/.test(document.getElementById('log').textContent)`), 5000);
  check('"what do you know about me?" lists what Loon remembers, no confirm needed', recalled && !(await bubble(`Boolean(document.querySelector('.confirm'))`)));
  await h.closeBubble();

  await h.typeInBubble('forget that I work at Acme');
  const asked = await h.confirmShown();
  const stillThere = memory.all().length === 1;
  await bubble(`document.querySelector('.confirm .primary').click()`);
  const forgotten = await waitFor(() => memory.all().length === 0, 3000);
  check('"forget that…" asks first, then removes the memory', asked && stillThere && forgotten && executed.length === 0);
  await h.closeBubble();
  settingsWin.close();
}

// ---------- Routines: made in the bubble behind a confirm card, listed in Settings, delivered by the cat's "?" ----------
// The scheduler isn't started in the selftest; a routine is made due by moving its next run back, then one tick runs.
async function routinesFlow(ctx, check, h) {
  const { routines, bubbleWin, setToggle } = ctx;
  const bubble = (js) => bubbleWin.webContents.executeJavaScript(js);
  const log = () => bubble(`document.getElementById('log').textContent`);
  const catIdle = () => waitFor(async () => (await h.cat('window.__loon.state')) === 'idle' && !bubbleWin.isVisible(), 5000);
  await h.typeInBubble('every weekday at 9 remind me to stretch');
  const asked = await h.confirmShown();
  const summary = asked ? await bubble(`document.querySelector('.confirm').textContent`) : '';
  const notYet = routines.list().length === 0;
  if (asked) await bubble(`document.querySelector('.confirm .primary').click(); true`);
  const made = await waitFor(() => routines.list().length === 1, 3000);
  const r = routines.list()[0];
  await h.closeBubble();
  if (!r) return check('routines: "every weekday at 9 remind me to stretch" asks with a card, then shows in Settings with its next run', false, summary.slice(0, 80));

  const settingsWin = await h.settingsWindow();
  const sw = (js) => settingsWin.webContents.executeJavaScript(js);
  const rows = () => sw(`[...document.querySelectorAll('#routines li')].map((li) => li.textContent).join(' | ')`);
  const refresh = () => sw('window.loon.getSettings().then((s) => { render(s); return true; })');
  try {
    const listed = await waitFor(async () => /Stretch.*weekdays at 9:00.*next /.test(await rows()), 5000);
    check('routines: "every weekday at 9 remind me to stretch" asks with a card, then shows in Settings with its next run',
      asked && /New routine: Stretch/.test(summary) && notYet && made && r.nextRun > Date.now() && listed, `${summary.slice(0, 50)} · ${(await rows()).slice(0, 90)}`);

    await sw(`[...document.querySelectorAll('#routines li.routine button')].find((b) => b.textContent === 'Run now').click(); true`);
    const ran = await waitFor(async () => bubbleWin.isVisible() && /⏰\s*stretch/i.test(await log()), 5000);
    check('routines: Run now in Settings shows the result in the bubble straight away', ran && routines.list()[0].lastStatus === 'ok', (await log()).slice(0, 60));
    await h.closeBubble();

    const due = async () => {
      routines.store.update(r.id, { nextRun: Date.now() - 1000 });
      await routines.tick();
    };
    await catIdle();
    await due();
    const nudged = await waitFor(() => h.cat('window.__loon.nudge'), 3000);
    await h.cat(`document.getElementById('nudge').click(); true`);
    const opened = await waitFor(async () => bubbleWin.isVisible() && /stretch/i.test(await log()), 3000);
    check('routines: when one comes due the cat shows its "?", and clicking it opens the reminder', nudged && opened, `nudge ${nudged} · bubble ${opened}`);
    await h.closeBubble();

    setToggle('focus', true);
    await due();
    const waiting = routines.list()[0].waiting;
    const quiet = !(await h.cat('window.__loon.nudge'));
    await refresh();
    const shownWaiting = await waitFor(async () => /waiting/.test(await rows()), 3000);
    setToggle('focus', false);
    await catIdle();
    await routines.tick();
    const delivered = await waitFor(() => h.cat('window.__loon.nudge'), 3000);
    check('routines: in Focus mode a due routine waits (no "?", "waiting" in Settings), then comes once Focus ends', waiting && quiet && shownWaiting && delivered && !routines.list()[0].waiting,
      `waiting ${waiting} · quiet ${quiet} · listed ${shownWaiting} · after ${delivered}`);
    if (delivered) {
      await h.cat(`document.getElementById('nudge').click(); true`);
      await waitFor(() => bubbleWin.isVisible(), 3000);
      await h.closeBubble();
    }

    await h.typeInBubble('delete the stretch routine');
    const askedDelete = await h.confirmShown();
    const kept = routines.list().length === 1;
    if (askedDelete) await bubble(`document.querySelector('.confirm .primary').click(); true`);
    const gone = await waitFor(() => routines.list().length === 0, 3000);
    await h.closeBubble();
    await refresh();
    const empty = await waitFor(async () => /No routines yet/.test(await rows()), 3000);
    check('routines: "delete the stretch routine" asks first, then it is gone from Settings', askedDelete && kept && gone && empty);
  } finally {
    setToggle('focus', false);
    for (const x of routines.list()) routines.remove(x.id);
    settingsWin.close();
  }
}

// ---------- in-chat memory: 👍 and "Remember this" with its toast and Undo ----------
async function personalization(ctx, check, h) {
  const { memory, bubbleWin } = ctx;
  const bubble = (js) => bubbleWin.webContents.executeJavaScript(js);
  const tools = `[...document.querySelectorAll('.answer-tools')].pop()`;
  await h.openBubble();
  const answer = await h.askHere('what time is it', 15000);
  const rated = memory.recentFeedback().length;
  await bubble(`${tools}.querySelector('.votes button').click(); true`);
  const stored = await waitFor(() => memory.recentFeedback().length === rated + 1 && memory.recentFeedback()[0].vote === 1, 3000);
  const row = memory.db.prepare('SELECT task, tier, answer FROM feedback ORDER BY id DESC LIMIT 1').get();
  check('👍 on an answer is stored on this Mac with the task and tier, not the answer text', answer.done && stored && row?.tier === 'code' && row.answer === '', JSON.stringify(row));

  const fact = 'I take my coffee black';
  const count = memory.all().length;
  await bubble(`[...${tools}.querySelectorAll('.menu-list button')].find((b) => b.textContent === 'Remember this').click(); true`);
  const card = await waitFor(() => bubble(`Boolean(document.querySelector('.remember-box textarea'))`), 3000);
  const notYet = memory.all().length === count;
  if (card) await bubble(`(() => { const box = document.querySelector('.remember-box'); box.querySelector('textarea').value = ${JSON.stringify(fact)}; box.querySelector('.primary').click(); return true; })()`);
  const saved = await waitFor(() => memory.all().some((f) => f.text === fact), 3000);
  const toast = await waitFor(() => bubble(`!document.getElementById('toast').hidden && /coffee black/.test(document.getElementById('toastText').textContent)`), 3000);
  check('"Remember this" asks first (an editable card), saves on ✓ and says so in a toast', card && notYet && saved && toast, `card ${card} · saved ${saved} · toast ${toast}`);
  await bubble(`document.getElementById('toastUndo').click(); true`);
  check("the toast's Undo forgets it again", await waitFor(() => !memory.all().some((f) => f.text === fact), 3000));
  await h.closeBubble();
}

module.exports = { run };
