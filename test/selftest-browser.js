// M2 end-to-end: real extension in Chrome for Testing (Playwright) ↔ real Loon app, on local fixture pages.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { PORT } = require('../main/bridge');
const { app, ipcMain, globalShortcut } = require('electron');

// playwright-core is a dev dependency, so the packaged app doesn't carry it: there it comes from the source checkout
// (LOON_SOURCE_DIR, or the folder the app was started from).
function playwright() {
  try {
    return require('playwright-core');
  } catch {
    return require(require.resolve('playwright-core', { paths: [process.env.LOON_SOURCE_DIR, process.cwd()].filter(Boolean) }));
  }
}

// Chrome loads extensions from the real disk, never from inside app.asar: the packaged app ships the folder in
// Resources/extension (package.json build.extraResources), which is also the folder users pick in chrome://extensions.
const extensionDir = () => (app.isPackaged ? path.join(process.resourcesPath, 'extension') : path.join(__dirname, '..', 'extension'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs, stepMs = 150) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await wait(stepMs);
  }
  return false;
}

// Full Chrome (extensions need it, not the headless shell): first the build this playwright-core version installs
// (`npx playwright-core install chromium`), then any other one in the cache, newest revision first.
function findChrome() {
  try {
    const exe = playwright().chromium.executablePath();
    if (fs.existsSync(exe)) return exe;
  } catch {}
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (!fs.existsSync(root)) return null;
  const revision = (d) => Number(d.split('-')[1]);
  for (const dir of fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => revision(b) - revision(a))) {
    const exe = ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']
      .map((p) => path.join(root, dir, p)).find((p) => fs.existsSync(p));
    if (exe) return exe;
  }
  return null;
}

function serveFixtures() {
  const dir = path.join(__dirname, 'fixtures');
  const server = http.createServer((req, res) => {
    const file = path.join(dir, path.basename(new URL(req.url, 'http://x').pathname));
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function run(ctx, check) {
  const { catWin, bubbleWin, bridge, companion, resolver, hooks, settings } = ctx;
  const exe = findChrome();
  if (!exe) {
    console.log('SKIP  browser checks (no Chrome for Testing: run `npx playwright-core install chromium`)');
    return;
  }
  const { chromium } = playwright();
  const server = await serveFixtures();
  const base = `http://127.0.0.1:${server.address().port}`;
  const extension = extensionDir();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-chrome-'));
  const browser = await chromium.launchPersistentContext(profile, {
    executablePath: exe,
    headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const cat = (js) => catWin.webContents.executeJavaScript(js);
  const bubble = (js) => bubbleWin.webContents.executeJavaScript(js);
  const tierCount = () => bubble(`document.querySelectorAll('.tier-icon').length`);
  const lastAnswer = () => bubble(`(() => { const a = [...document.querySelectorAll('.a')].pop(); return a ? { text: a.textContent, tier: a.querySelector('.tier-icon')?.title || '' } : null; })()`);
  const chips = () => bubble(`(() => { document.querySelector('.chip[data-more]')?.click(); return [...document.querySelectorAll('.chip[data-task]')].map((c) => c.dataset.task); })()`);
  async function clickChip(task, timeoutMs = 150000) {
    const before = await tierCount();
    const found = await bubble(`(() => { document.querySelector('.chip[data-more]')?.click(); const c = document.querySelector('.chip[data-task="${task}"]'); if (c) c.click(); return Boolean(c); })()`);
    if (!found) {
      console.log(`  (no "${task}" chip; bubble offers: ${(await chips()).join(', ')}; mode ${companion.session.mode}, page kind ${companion.activePage?.kind})`);
      return null;
    }
    await waitFor(async () => (await tierCount()) > before, timeoutMs, 250);
    return lastAnswer();
  }
  const closeBubble = async () => {
    await bubble('window.loon.closeBubble()');
    await waitFor(() => !bubbleWin.isVisible(), 1500);
  };

  try {
    // ---- pairing + origin checks ----
    check('bridge is listening on 127.0.0.1', await waitFor(() => bridge.listening, 3000));
    let [worker] = browser.serviceWorkers();
    worker ??= await browser.waitForEvent('serviceworker');
    await worker.evaluate((code) => chrome.storage.local.set({ pairingCode: code }), settings.pairingCode);
    check('extension pairs and connects', await waitFor(() => bridge.clients.size > 0, 8000));

    const refused = (opts) => new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/?token=${settings.pairingCode}`, opts);
      ws.on('open', () => { ws.close(); resolve(false); });
      ws.on('error', () => resolve(true));
    });
    check('a web page origin is refused even with the code', await refused({ origin: 'https://evil.example' }));
    check('a wrong code is refused', await new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/?token=WRONG1`, { origin: 'chrome-extension://abc' });
      ws.on('open', () => { ws.close(); resolve(false); });
      ws.on('error', () => resolve(true));
    }));

    const page = await browser.newPage();
    // Selects an element's text and waits until the bubble belongs to *that* selection (not the previous one).
    const selectAndWait = async (selector) => {
      const expected = (await page.textContent(selector)).trim().slice(0, 20);
      await select(selector);
      const ok = await waitFor(() => bubbleWin.isVisible() && (companion.session.packet?.text || '').startsWith(expected), 5000);
      await wait(300);
      return ok;
    };
    const select = (selector) => page.evaluate((sel) => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector(sel));
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }, selector);

    // ---- page kind ----
    await page.goto(`${base}/article.html`);
    check('content script reports the page kind', await waitFor(() => companion.activePage?.kind === 'article', 5000), companion.activePage?.kind);

    // ---- highlight → chips ----
    await select('#word');
    const shown = await waitFor(() => bubbleWin.isVisible(), 4000);
    await wait(300);
    const wordChips = await chips();
    check('selecting a word shows chips without stealing focus', shown && wordChips.includes('define') && !ctx.isFocused(bubbleWin), wordChips.join(','));
    let mood = '';
    check('the cat perks up at the selection', await waitFor(async () => ['curious', 'neutral'].includes(mood = await cat('window.__loon.mood')), 2000), mood);

    const defined = await clickChip('define', 10000);
    if (process.env.LOON_SHOTS) fs.writeFileSync(path.join(process.env.LOON_SHOTS, 'bubble-define.png'), (await bubbleWin.webContents.capturePage()).toPNG());
    check('Define answers from WordNet with no model', /lasting a very short time/.test(defined?.text) && /WordNet/.test(defined?.tier), defined?.tier);

    await selectAndWait('#fr');
    const translated = await clickChip('translate', 60000);
    check('Translate runs on the offline translator', /cat/i.test(translated?.text) && /offline translator/.test(translated?.tier), translated?.text.slice(0, 70));

    await selectAndWait('#s1');
    const explained = await clickChip('explain');
    if (process.env.LOON_SHOTS) fs.writeFileSync(path.join(process.env.LOON_SHOTS, 'bubble-explain.png'), (await bubbleWin.webContents.capturePage()).toPNG());
    if (process.env.LOON_SHOTS) {
      await bubble(`[...document.querySelectorAll('button[title="More actions"]')].pop().click()`);
      await wait(300);
      fs.writeFileSync(path.join(process.env.LOON_SHOTS, 'bubble-menu.png'), (await bubbleWin.webContents.capturePage()).toPNG());
    }
    check('Explain answers on the local model with the selection as context',
      /on your Mac/.test(explained?.tier) && /<context source="selection"/.test(resolver.lastPrompt || ''), explained?.text.slice(0, 70));

    const deeperBefore = await tierCount();
    await bubble(`[...document.querySelectorAll('.answer-tools button')].find((b) => b.textContent === 'Go deeper').click()`);
    await waitFor(async () => (await tierCount()) > deeperBefore, 200000, 250);
    const deeper = await lastAnswer();
    check('Go deeper gives a longer answer', deeper && deeper.text.length > explained.text.length, `${explained?.text.length} → ${deeper?.text.length} chars`);

    await select('#secret');
    await waitFor(() => /\[redacted:card\]/.test(companion.session.packet?.text || ''), 5000);
    await waitFor(async () => (await bubble(`document.getElementById('redacted').textContent`)).includes('hidden'), 4000);
    await clickChip('explain');
    check('card numbers are redacted before the model sees them',
      /\[redacted:card\]/.test(resolver.lastPrompt) && !/4111/.test(resolver.lastPrompt));

    // ---- hand-off ----
    const opened = [];
    let copied = '';
    const original = { ...hooks };
    hooks.openExternal = async (url) => { opened.push(url); };
    hooks.clipboard = (text) => { copied = text; };
    await bubble(`[...document.querySelectorAll('.answer-tools button')].filter((b) => b.textContent === 'Ask in Claude').pop().click()`);
    await waitFor(() => opened.length > 0, 3000);
    check('hand-off copies the prompt and opens Claude', opened[0] === 'https://claude.ai/new' && /Explain this/.test(copied) && !/4111/.test(copied), opened[0]);
    Object.assign(hooks, original);
    await closeBubble();

    // ---- page summary + highlights ----
    ipcMain.emit('open-bubble');
    await waitFor(() => bubbleWin.isVisible(), 2000);
    await wait(300);
    const askChips = await chips();
    check('the ask bubble offers page chips for the page in front', askChips.includes('page_summary'), askChips.join(','));
    const summary = await clickChip('page_summary');
    const highlighted = await page.evaluate(() => (CSS.highlights.get('loon-key') ? CSS.highlights.get('loon-key').size : 0));
    check('Summarize page: instant key points, then a local summary', /Key points/.test(summary?.text) && /Summary/.test(summary?.text), summary?.text.slice(0, 80));
    check('key sentences are highlighted on the page', highlighted > 0, `${highlighted} ranges`);
    await closeBubble();

    companion.onNudgeClick(); // page mode on the article: every page chip
    await waitFor(() => bubbleWin.isVisible(), 2000);
    await wait(400);
    const quiz = await clickChip('quiz', 10000);
    const inputs = await bubble(`document.querySelectorAll('.quiz input').length`);
    await bubble(`document.querySelector('.quiz button').click()`);
    const graded = await bubble(`document.querySelector('.quiz .note').textContent`);
    check('Quiz me: cloze cards graded in code, no model', inputs === 3 && /no model/.test(quiz?.tier) && /^0\/3 right\. Answers: /.test(graded), graded.slice(0, 60));
    await closeBubble();

    // ---- nudges + code selections ----
    companion.resetNudges();
    await page.goto(`${base}/code.html`);
    check('code page: the cat offers help with a "?" nudge', await waitFor(() => cat('window.__loon.nudge'), 5000));
    await selectAndWait('#trace');
    check('a stack trace gets error chips', (await chips()).includes('explain_error'));
    await closeBubble();

    // ---- M3: shopping, food, developer, writing ----
    const skills = resolver.skills;
    const extractorFile = path.join(skills.extractorsDir, '127.0.0.1.json');
    fs.rmSync(extractorFile, { force: true });
    const savedBasket = skills.basket();
    skills.saveBasket([]);
    const localCalls = () => resolver.counts.tiers.local || 0;
    const openAsk = async () => {
      ipcMain.emit('open-bubble');
      await waitFor(() => bubbleWin.isVisible(), 2000);
      await wait(400);
    };

    await page.goto(`${base}/shop.html`);
    await waitFor(() => companion.activePage?.kind === 'shopping', 5000);
    await openAsk();
    const shopChips = await chips();
    check('shop page: shopping chips', shopChips.includes('shop_value') && shopChips.includes('shop_reviews'), shopChips.join(','));
    let before = localCalls();
    const value = await clickChip('shop_value', 20000);
    check('Best value: unit-price table with zero model calls',
      /Bubbly/.test(value?.text) && /per 100 ml/.test(value?.text) && localCalls() === before && /structured data/.test(value?.tier), value?.text.slice(0, 90));
    const reviews = await clickChip('shop_reviews', 10000);
    check('Reviews: summary from review keywords, no model', /Average 3\.7★/.test(reviews?.text) && localCalls() === before, reviews?.text.slice(0, 60));
    await clickChip('shop_add', 10000);
    await closeBubble();

    await page.goto(`${base}/shop-plain.html`);
    await waitFor(() => companion.activePage?.url?.includes('shop-plain'), 5000);
    await openAsk();
    before = localCalls();
    const plain = await clickChip('shop_value', 300000); // up to two CPU model calls before the page heuristic
    check('no structured data: a site extractor is written once (model, or page heuristic if its selectors fail)', /Espresso/.test(plain?.text) && /on your Mac.*new site extractor/.test(plain?.tier), plain?.tier);
    await closeBubble();
    await openAsk();
    before = localCalls();
    const plainAgain = await clickChip('shop_value', 20000);
    check('second visit reuses the saved extractor with zero model calls', /saved site extractor/.test(plainAgain?.tier) && localCalls() === before, plainAgain?.tier);
    await clickChip('shop_add', 10000);
    await closeBubble();
    companion.onNudgeClick(); // page mode: every chip for the page kind, like clicking the cat's "?"
    await waitFor(() => bubbleWin.isVisible(), 2000);
    await wait(400);
    const basket = await clickChip('shop_basket', 10000);
    check('compare basket compares products across pages (and admits when they differ)', /Fizz/.test(basket?.text) && /(House|Espresso|Ethiopia)/.test(basket?.text) && /different kinds of products/.test(basket?.text), basket?.text.slice(0, 80));
    await closeBubble();

    await page.goto(`${base}/menu.html`);
    await waitFor(() => companion.activePage?.kind === 'menu', 5000);
    // Cameos (§5.0.3): flavor only. The answer (without the flavor line and buttons) must not change with them off.
    const answerOnly = () => bubble(`(() => { const a = [...document.querySelectorAll('.a')].pop()?.cloneNode(true); if (!a) return ''; a.querySelectorAll('.flavor, .answer-tools, .tier-icon').forEach((n) => n.remove()); return a.textContent.trim(); })()`);
    const watchCameo = () => {
      const seen = { cameo: null, width: 0, light: 0 };
      const timer = setInterval(async () => {
        try {
          const guest = await cat('window.__loon.cameo');
          seen.width = Math.max(seen.width, catWin.getBounds().width);
          if (!guest) return;
          seen.cameo = guest;
          seen.light = Math.max(seen.light, (await cat('window.__loon.canvasStats()')).light);
        } catch { /* the window is busy; next tick */ }
      }, 100);
      return { seen, stop: () => clearInterval(timer) };
    };
    const savedCameos = settings.cameos;
    const narrowWidth = catWin.getBounds().width;
    const hostLight = (await cat('window.__loon.canvasStats()')).light;
    await openAsk();
    before = localCalls();
    const watch = watchCameo();
    const lightest = await clickChip('food_lightest', 20000);
    const withCameo = await answerOnly();
    await waitFor(async () => watch.seen.cameo && !(await cat('window.__loon.cameo')), 12000);
    watch.stop();
    check('menu: lightest picks from keywords, no model', /Lightest picks/.test(lightest?.text) && /(Dumplings|Sorbet|Salad)/.test(lightest?.text) && localCalls() === before, lightest?.text.slice(0, 80));
    if ((settings.companion || 'luna') === 'luna') {
      check('cameo: Luna calls Soju in for a food task (window widens, Soju drawn beside her)', watch.seen.cameo === 'soju' && watch.seen.width > narrowWidth * 1.3 && watch.seen.light > hostLight + 500,
        `guest ${watch.seen.cameo} · width ${narrowWidth} → ${watch.seen.width} · light pixels ${hostLight} → ${watch.seen.light}`);
    }
    await closeBubble();
    await waitFor(() => catWin.getBounds().width === narrowWidth, 3000);
    settings.cameos = false;
    try {
      await openAsk();
      const quiet = watchCameo();
      await clickChip('food_lightest', 20000);
      const withoutCameo = await answerOnly();
      await wait(1500);
      quiet.stop();
      check('cameo: with Cameos off nothing pops in and the answer text is exactly the same', withCameo.length > 20 && withCameo === withoutCameo && !quiet.seen.cameo && quiet.seen.width === narrowWidth,
        `${withCameo === withoutCameo ? 'same' : `"${withCameo.slice(0, 40)}" vs "${withoutCameo.slice(0, 40)}"`} · guest ${quiet.seen.cameo}`);
      await closeBubble();
    } finally {
      settings.cameos = savedCameos;
    }

    await page.goto(`${base}/code.html`);
    await selectAndWait('#json');
    const dto = await clickChip('make_dto_java', 20000);
    check('JSON → Java DTO with quicktype', /class Root/.test(dto?.text) && /quicktype/.test(dto?.tier), dto?.tier);
    await selectAndWait('#trace');
    before = localCalls();
    const known = await clickChip('explain_error', 10000);
    check('known errors answer from the table, no model', /NullPointerException \(Java\)/.test(known?.text) && localCalls() === before, known?.tier);
    await closeBubble();

    await page.goto(`${base}/write.html`);
    await page.evaluate(() => {
      const t = document.getElementById('draft');
      t.focus();
      t.setSelectionRange(0, t.value.length);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await waitFor(() => companion.session.packet?.editable, 5000);
    await wait(300);
    const fixed = await clickChip('fix_grammar', 20000);
    check('Fix grammar with Harper, no model', /There is an issue with the report/.test(fixed?.text) && /Harper/.test(fixed?.tier), fixed?.text.slice(0, 60));
    await bubble(`[...document.querySelectorAll('.answer-tools button')].find((b) => b.textContent === 'Replace').click()`);
    const replaced = await waitFor(async () => /There is an issue with the report\.$/.test(await page.inputValue('#draft')), 5000);
    check('Replace puts the fixed text back into the text box', replaced, await page.inputValue('#draft'));
    await closeBubble();
    // Screenshot → OCR (same path as ⌥⇧S, minus the interactive picker)
    await page.goto(`${base}/article.html`);
    const shotFile = path.join(os.tmpdir(), `loon-selftest-shot-${Date.now()}.png`);
    await page.screenshot({ path: shotFile, clip: { x: 0, y: 0, width: 800, height: 260 } });
    await ctx.openScreenshot(shotFile);
    await waitFor(() => bubbleWin.isVisible(), 60000);
    await wait(400);
    const ocrText = await clickChip('extract_text', 10000);
    check('screenshot text is read on this Mac (Tesseract)', /cats love boxes/i.test(ocrText?.text) && /Tesseract/.test(ocrText?.tier), ocrText?.text.slice(0, 60));
    await closeBubble();
    fs.rmSync(shotFile, { force: true });
    skills.saveBasket(savedBasket);
    fs.rmSync(extractorFile, { force: true });

    // ---- Send this page to a connected local app ----
    const fakeApp = await require('./fixtures/openapi-app').start();
    const connector = ctx.hub.add({ name: 'Career Board', baseUrl: `http://127.0.0.1:${fakeApp.port}` });
    try {
      await ctx.hub.refresh();
      await page.goto(`${base}/article.html`);
      await waitFor(() => companion.activePage?.kind === 'article', 5000);
      await selectAndWait('#s1');
      const sendChip = `send:${connector.id}`;
      const offered = (await chips()).includes(sendChip);
      await bubble(`document.querySelector('.chip[data-task="${sendChip}"]').click()`);
      await waitFor(() => bubble(`Boolean(document.querySelector('.confirm'))`), 5000);
      const prefilled = await bubble(`[...document.querySelectorAll('.confirm input')].map((i) => i.value).join(' | ')`);
      await bubble(`document.querySelector('.confirm .primary').click()`);
      const sent = await waitFor(() => fakeApp.jobs.some((j) => /article\.html/.test(j.url || '')), 5000);
      check('"Send to Career Board" offers the page, prefilled, and saves it after ✓', offered && /article\.html/.test(prefilled) && sent, prefilled.slice(0, 80));
      await closeBubble();
    } finally {
      ctx.hub.remove(connector.id);
      fakeApp.server.close();
    }

    // ---- Screen control (§3.13.1): Loon acts on a local page, one confirm card per change ----
    await page.goto(`${base}/signup.html`);
    await waitFor(() => companion.activePage?.url?.includes('signup'), 5000);
    const submit = (text) => bubble(`(() => { const i = document.getElementById('input'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input')); document.getElementById('askForm').requestSubmit(); })()`);
    const outText = () => page.textContent('#out');
    const stepCard = () => bubble(`(() => { const c = [...document.querySelectorAll('.agent .confirm')].pop(); return c ? { title: c.querySelector('.confirm-title')?.textContent || '', risky: Boolean(c.querySelector('.risky')), buttons: [...c.querySelectorAll('button')].map((b) => b.textContent) } : null; })()`);
    const cardFor = async (re, timeoutMs = 15000) => {
      let card = null;
      await waitFor(async () => re.test((card = await stepCard())?.title || ''), timeoutMs);
      return re.test(card?.title || '') ? card : null;
    };
    const press = (prefix) => bubble(`(() => { const b = [...document.querySelectorAll('.agent .confirm button')].find((x) => x.textContent.startsWith(${JSON.stringify(prefix)})); if (b) b.click(); return Boolean(b); })()`);
    // The task's last line once it has ended (the ✕ in its header is gone by then), else null.
    const taskEnd = () => bubble(`(() => { const p = [...document.querySelectorAll('.agent')].pop(); return !p || p.querySelector('.agent-stop') ? null : p.lastElementChild.textContent; })()`);
    const ended = async (re, timeoutMs = 10000) => (await waitFor(async () => re.test((await taskEnd()) || ''), timeoutMs)) && (await taskEnd());

    await openAsk();
    await submit('click Sign up');
    const signUpCard = await cardFor(/Sign up/);
    const beforeClick = await outText();
    const escWhileActing = globalShortcut.isRegistered('Escape');
    await press('✓ Do it');
    const signedUp = await waitFor(async () => (await outText()) === 'signed up', 8000);
    const doneA = await ended(/Done/);
    check('screen control: "click Sign up" asks with a card first, then clicks it on the page after ✓',
      Boolean(signUpCard) && beforeClick === 'waiting' && signedUp && Boolean(doneA) && escWhileActing,
      `card ${JSON.stringify(signUpCard?.title)} · page "${await outText()}" · Esc armed ${escWhileActing} · ${doneA}`);
    await closeBubble();

    await page.reload();
    await openAsk();
    await submit('click Sign up and then click Buy now');
    const allowCard = await cardFor(/Sign up/);
    const allowed = allowCard && (await press('Allow the rest'));
    await waitFor(async () => (await outText()) === 'signed up', 8000);
    const buyCard = await cardFor(/Buy now/);
    const notBought = (await outText()) === 'signed up';
    await press('✕ Stop');
    const stoppedB = await ended(/Stopped/);
    check('screen control: "Buy now" always needs its own click, even after "Allow the rest of this task"',
      allowed && buyCard?.risky && !buyCard.buttons.some((b) => b.startsWith('Allow')) && notBought && Boolean(stoppedB) && (await outText()) === 'signed up',
      `buy card ${JSON.stringify(buyCard)} · page "${await outText()}"`);
    await closeBubble();

    await openAsk();
    await submit('type hunter2 into the password field');
    const refusedC = await ended(/never type into a password field/i);
    check('screen control: typing into a password field is refused', Boolean(refusedC) && (await page.inputValue('#pw')) === '' && !(await stepCard()), refusedC || await taskEnd());
    await closeBubble();

    await page.reload();
    await openAsk();
    await submit('click Buy now');
    const buyAgain = await cardFor(/Buy now/);
    const escArmed = globalShortcut.isRegistered('Escape');
    companion.cancel(); // what the Esc shortcut runs while Loon acts (main.js agentRunner ui.busy)
    const stoppedD = await ended(/Stopped/, 5000);
    await wait(500);
    check('screen control: Esc stops the task before anything is clicked, and lets go of Esc',
      Boolean(buyAgain) && escArmed && Boolean(stoppedD) && (await outText()) === 'waiting' && !globalShortcut.isRegistered('Escape'),
      `card ${Boolean(buyAgain)} · Esc armed ${escArmed} · ${stoppedD} · page "${await outText()}"`);
    await closeBubble();

    // ---- sensitive page ----
    await page.goto(`${base}/bank.html`);
    check('private page: the cat covers its eyes', await waitFor(async () => (await cat('window.__loon.privacy')) && (await cat('window.__loon.pose')) === 'pawsUp', 5000));
    await select('#balance');
    await wait(1200);
    check('private page: selections are not sent', !bubbleWin.isVisible());
    ipcMain.emit('open-bubble');
    await waitFor(() => bubbleWin.isVisible(), 2000);
    await wait(300);
    const privateChips = await chips();
    const notice = await bubble(`!document.getElementById('sensitive').hidden`);
    check('private page: the bubble says it looked away and offers no page chips', notice && !privateChips.includes('page_summary'), privateChips.join(','));
    await bubble(`document.getElementById('lookAnyway').click()`);
    check('"Look anyway" reads the page for this one request', await waitFor(async () => (await chips()).includes('page_summary'), 5000));
    await closeBubble();

    await page.goto(`${base}/article.html`);
    check('leaving the private page uncovers the eyes', await waitFor(async () => !(await cat('window.__loon.privacy')), 5000));

    // ---- context mode: on github.com the bubble wears the Developer Cat badge (the site answered by a fixture) ----
    await page.route('https://github.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>akankshyam07/loon</title><h1>akankshyam07/loon</h1><p>A black cat that lives on your screen.</p>' }));
    await page.goto('https://github.com/akankshyam07/loon');
    const onGithub = await waitFor(() => /^https:\/\/github\.com\//.test(companion.activePage?.url || ''), 5000);
    ipcMain.emit('open-bubble');
    await waitFor(() => bubbleWin.isVisible(), 1500);
    const badge = await waitFor(() => bubble(`!document.getElementById('modeBadge').hidden && document.getElementById('modeBadge').textContent === 'dev'`), 3000);
    check('a github.com page puts the "dev" mode badge on the bubble', onGithub && badge, `${companion.activePage?.url} · badge "${await bubble(`document.getElementById('modeBadge').textContent`)}"`);
    await closeBubble();
    await page.unroute('https://github.com/**');
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

module.exports = { run };
