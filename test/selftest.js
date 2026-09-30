// End-to-end check of the running app: `npm run selftest`.
// Drives the real windows with synthetic input and the real brain, prints PASS/FAIL per check.
const { ipcMain, globalShortcut } = require('electron');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs, stepMs = 100) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await wait(stepMs);
  }
  return false;
}

async function run({ catWin, bubbleWin }) {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  };
  const cat = (js) => catWin.webContents.executeJavaScript(js);
  const bubble = (js) => bubbleWin.webContents.executeJavaScript(js);
  const mouse = (type, x, y, extra = {}) => catWin.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1, ...extra });
  const homeBounds = catWin.getBounds();
  catWin.webContents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 'warning') console.log(`  [cat ${event.level}] ${event.message}`);
  });

  let lastIgnore = null;
  let dragStarted = false;
  let dragEnded = false;
  ipcMain.on('set-ignore-mouse', (_e, ignore) => { lastIgnore = ignore; });
  ipcMain.on('drag-start', () => { dragStarted = true; });
  ipcMain.on('drag-end', () => { dragEnded = true; });

  await waitFor(() => cat('Boolean(window.__loon)'), 5000);
  await wait(800); // let the first layout and mouse state settle
  const head = await cat(`(() => { const r = document.querySelector('#headShape').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  check('cat renders', head.x > 0 && head.y > 0, `head at ${head.x},${head.y}`);

  mouse('mouseMove', head.x, head.y);
  await wait(150);
  check('hovering the cat captures clicks', lastIgnore === false);
  mouse('mouseMove', 3, 3);
  await wait(150);
  check('empty space passes clicks through', lastIgnore === true);

  mouse('mouseDown', head.x, head.y);
  await wait(60);
  mouse('mouseUp', head.x, head.y);
  check('click opens the bubble', await waitFor(() => bubbleWin.isVisible(), 1500));
  await bubble('window.loon.closeBubble()');
  await waitFor(() => !bubbleWin.isVisible(), 1500);

  mouse('mouseDown', head.x, head.y);
  const petted = await waitFor(async () => (await cat('window.__loon.state')) === 'petted', 1200);
  mouse('mouseUp', head.x, head.y);
  check('press and hold pets the cat', petted);
  check('letting go ends petting', await waitFor(async () => (await cat('window.__loon.state')) === 'idle', 1500));
  await wait(1200); // endPet may start a moon-magic move; let it settle
  await waitFor(async () => (await cat('window.__loon.state')) === 'idle', 6000);

  mouse('mouseDown', head.x, head.y);
  await wait(40);
  mouse('mouseMove', head.x + 30, head.y + 5, { modifiers: ['leftButtonDown'] });
  await wait(150);
  mouse('mouseUp', head.x + 30, head.y + 5);
  await wait(400);
  check('dragging moves the window through main', dragStarted && dragEnded);
  catWin.setBounds(homeBounds);
  await waitFor(async () => (await cat('window.__loon.state')) === 'idle', 3000);

  for (const move of ['moonMagic', 'edgePeek', 'pounce']) {
    catWin.webContents.send('debug', { move });
    const started = await waitFor(async () => (await cat('window.__loon.state')) === 'move', 1500, 50);
    const finished = await waitFor(async () => (await cat('window.__loon.state')) === 'idle', 9000);
    check(`cool move: ${move}`, started && finished);
    catWin.setBounds(homeBounds);
    await wait(300);
  }

  catWin.webContents.send('debug', { nap: true });
  const napping = await waitFor(async () => (await cat('window.__loon.state')) === 'napping', 1500);
  const pose = await cat('window.__loon.pose');
  mouse('mouseDown', head.x, head.y + 40);
  await wait(60);
  mouse('mouseUp', head.x, head.y + 40);
  const awake = await waitFor(async () => (await cat('window.__loon.state')) === 'idle', 3000);
  check('nap: loaf pose, click wakes', napping && pose === 'loaf' && awake);
  await waitFor(() => !bubbleWin.isVisible(), 500);

  check('⌥Space hotkey is registered', globalShortcut.isRegistered('Alt+Space'));

  catWin.webContents.send('debug', { brain: { state: 'error' } });
  check('brain error makes the cat confused', await waitFor(async () => (await cat('window.__loon.mood')) === 'confused', 1500));
  catWin.webContents.send('debug', { mood: 'neutral' });

  // Brain, through the real bubble UI.
  const askViaBubble = async (text) => {
    ipcMain.emit('open-bubble');
    await waitFor(() => bubbleWin.isVisible(), 1500);
    await wait(300);
    await bubble(`(() => { const i = document.getElementById('input'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input')); document.getElementById('askForm').requestSubmit(); })()`);
    const done = await waitFor(() => bubble(`Boolean([...document.querySelectorAll('.tier')].pop())`), 120000, 250);
    const out = await bubble(`(() => { const a = [...document.querySelectorAll('.a')].pop(); return { text: a.textContent, tier: a.querySelector('.tier')?.textContent || '' }; })()`);
    await bubble('window.loon.closeBubble()');
    await waitFor(() => !bubbleWin.isVisible(), 1500);
    return { done, ...out };
  };

  const timeAnswer = await askViaBubble('what time is it');
  check('code tier answers the time instantly', timeAnswer.done && /no model/.test(timeAnswer.tier), timeAnswer.text.slice(0, 60));

  // unique per run so the first ask always reaches the model
  const question = `In one short sentence, why do cats love boxes? (run ${Date.now() % 100000})`;
  const started = Date.now();
  const first = await askViaBubble(question);
  const firstMs = Date.now() - started;
  check('local model answers through the bubble', first.done && /on your Mac/.test(first.tier) && first.text.length > 20, `${firstMs} ms: ${first.text.slice(0, 80)}`);

  const again = Date.now();
  const second = await askViaBubble(question);
  check('same question again is a cache hit', second.done && /remembered/.test(second.tier), `${Date.now() - again} ms`);

  const counts = await bubble(`document.getElementById('counts').textContent`);
  check('weekly counters show in the footer', /instant/.test(counts) && /on-device/.test(counts), counts);

  catWin.setBounds(homeBounds);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  return failed === 0;
}

module.exports = { run };
