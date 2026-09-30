// M2 end-to-end: real extension in Chrome for Testing (Playwright) ↔ real Loon app, on local fixture pages.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { PORT } = require('../main/bridge');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs, stepMs = 150) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await wait(stepMs);
  }
  return false;
}

function findChrome() {
  const root = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (!fs.existsSync(root)) return null;
  for (const dir of fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
    const exe = path.join(root, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (fs.existsSync(exe)) return exe;
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

async function run({ catWin, bubbleWin, bridge, companion, resolver, hooks, settings }, check) {
  const exe = findChrome();
  if (!exe) {
    console.log('SKIP  browser checks (no Chrome for Testing in ~/Library/Caches/ms-playwright)');
    return;
  }
  const { chromium } = require('playwright-core');
  const server = await serveFixtures();
  const base = `http://127.0.0.1:${server.address().port}`;
  const extension = path.join(__dirname, '..', 'extension');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-chrome-'));
  const browser = await chromium.launchPersistentContext(profile, {
    executablePath: exe,
    headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const cat = (js) => catWin.webContents.executeJavaScript(js);
  const bubble = (js) => bubbleWin.webContents.executeJavaScript(js);
  const tierCount = () => bubble(`document.querySelectorAll('.tier').length`);
  const lastAnswer = () => bubble(`(() => { const a = [...document.querySelectorAll('.a')].pop(); return a ? { text: a.textContent, tier: a.querySelector('.tier')?.textContent || '' } : null; })()`);
  const chips = () => bubble(`[...document.querySelectorAll('.chip')].map((c) => c.dataset.task)`);
  async function clickChip(task, timeoutMs = 150000) {
    const before = await tierCount();
    await bubble(`document.querySelector('.chip[data-task="${task}"]').click()`);
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
    check('selecting a word shows chips without stealing focus', shown && wordChips.includes('define') && !bubbleWin.isFocused(), wordChips.join(','));
    check('the cat perks up at the selection', ['curious', 'neutral'].includes(await cat('window.__loon.mood')));

    const defined = await clickChip('define', 10000);
    if (process.env.LOON_SHOTS) fs.writeFileSync(path.join(process.env.LOON_SHOTS, 'bubble-define.png'), (await bubbleWin.webContents.capturePage()).toPNG());
    check('Define answers from WordNet with no model', /lasting a very short time/.test(defined?.text) && /WordNet/.test(defined?.tier), defined?.tier);

    await selectAndWait('#fr');
    const translated = await clickChip('translate', 60000);
    check('Translate runs on the offline translator', /cat/i.test(translated?.text) && /offline translator/.test(translated?.tier), translated?.text.slice(0, 70));

    await selectAndWait('#s1');
    const explained = await clickChip('explain');
    if (process.env.LOON_SHOTS) fs.writeFileSync(path.join(process.env.LOON_SHOTS, 'bubble-explain.png'), (await bubbleWin.webContents.capturePage()).toPNG());
    check('Explain answers on the local model with the selection as context',
      /on your Mac/.test(explained?.tier) && /<context source="selection"/.test(resolver.lastPrompt || ''), explained?.text.slice(0, 70));

    const deeperBefore = await tierCount();
    await bubble(`[...document.querySelectorAll('.actions button')].find((b) => b.textContent === 'Go deeper').click()`);
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
    await bubble(`[...document.querySelectorAll('.actions button')].filter((b) => b.textContent === 'Claude').pop().click()`);
    await waitFor(() => opened.length > 0, 3000);
    check('hand-off copies the prompt and opens Claude', opened[0] === 'https://claude.ai/new' && /Explain this/.test(copied) && !/4111/.test(copied), opened[0]);
    Object.assign(hooks, original);
    await closeBubble();

    // ---- page summary + highlights ----
    const { ipcMain } = require('electron');
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

    // ---- nudges + code selections ----
    companion.resetNudges();
    await page.goto(`${base}/code.html`);
    check('code page: the cat offers help with a "?" nudge', await waitFor(() => cat('window.__loon.nudge'), 5000));
    await selectAndWait('#trace');
    check('a stack trace gets error chips', (await chips()).includes('explain_error'));
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
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

module.exports = { run };
