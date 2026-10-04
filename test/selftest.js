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

async function run(ctx) {
  const { catWin, bubbleWin } = ctx;
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
  if (process.argv.includes('--browser-only')) {
    console.log('— browser companion —');
    await require('./selftest-browser').run(ctx, check);
    const failedEarly = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failedEarly}/${results.length} checks passed`);
    return failedEarly === 0;
  }
  await wait(800); // let the first layout and mouse state settle
  const head = await cat(`(() => { const r = document.querySelector('#headShape').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  check('cat renders', head.x > 0 && head.y > 0, `head at ${head.x},${head.y}`);

  // Start from a known state (the real pointer may be resting over the window), then hover.
  mouse('mouseMove', 3, 3);
  await wait(150);
  lastIgnore = null;
  mouse('mouseMove', head.x, head.y);
  check('hovering the cat captures clicks', await waitFor(() => lastIgnore === false, 1500, 50), `last=${lastIgnore}`);
  mouse('mouseMove', 3, 3);
  check('empty space passes clicks through', await waitFor(() => lastIgnore === true, 1500, 50), `last=${lastIgnore}`);

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

  // ---- M4: assistant (notes, memory, actions, toggles) with real files swapped for temp ones ----
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const { BrowserWindow } = require('electron');
  const { actions, notes, memory, setToggle, resolver } = ctx;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-selftest-m4-'));
  const saved = { notesDir: notes.dir, memoryFile: memory.file, auditFile: actions.auditFile, executors: actions.executors };
  notes.dir = path.join(tmp, 'notes');
  memory.file = path.join(tmp, 'memory.json');
  actions.auditFile = path.join(tmp, 'audit.jsonl');
  const executed = [];
  actions.executors = {
    reminder: async (c) => { executed.push(c); return 'Added to Reminders.'; },
    event: async (c) => { executed.push(c); return 'Added to Calendar.'; },
    open: async (c) => { executed.push(c); return 'Opened.'; },
    find: async () => [path.join(tmp, 'resume.pdf')],
    shortcuts: async () => ['Open Breethe', 'New Note with Date'],
    shortcut: async (c) => { executed.push(c); return `Ran "${c.name}".`; },
  };
  const typeInBubble = async (text) => {
    ipcMain.emit('open-bubble');
    await waitFor(() => bubbleWin.isVisible(), 1500);
    await wait(300);
    await bubble(`(() => { const i = document.getElementById('input'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input')); document.getElementById('askForm').requestSubmit(); })()`);
  };
  try {
    const localBefore = resolver.counts.tiers.local || 0;
    await typeInBubble('remind me to call mom at 5');
    const card = await waitFor(() => bubble(`Boolean(document.querySelector('.confirm'))`), 3000);
    const cardText = await bubble(`document.querySelector('.confirm')?.textContent || ''`);
    check('"remind me…" shows a confirm card with no model call', card && /call mom/.test(cardText) && (resolver.counts.tiers.local || 0) === localBefore, cardText.slice(0, 60));
    check('nothing runs before the click', executed.length === 0);
    await bubble(`document.querySelector('.confirm .primary').click()`);
    await waitFor(() => executed.length > 0, 3000);
    const done = await waitFor(() => bubble(`[...document.querySelectorAll('.note')].some((n) => /Reminders/.test(n.textContent))`), 3000);
    const audit = actions.recent();
    check('✓ runs the reminder and logs it (no content in the log)', done && executed[0]?.title === 'call mom' && new Date(executed[0].when).getHours() === 17 && audit[0]?.action === 'reminder' && !fs.readFileSync(actions.auditFile, 'utf8').includes('call mom'));

    await typeInBubble('remember that I like very short answers');
    await waitFor(() => bubble(`Boolean(document.querySelector('.confirm'))`), 3000);
    await bubble(`document.querySelector('.confirm .primary').click()`);
    await waitFor(() => memory.all().length > 0, 3000);
    check('"remember…" saves to memory after confirmation', memory.all()[0]?.text === 'I like very short answers');
    await bubble('window.loon.closeBubble()');

    // unique per run: a cached answer from an earlier run would skip building a fresh prompt
    await typeInBubble(`What is a black hole? One sentence. (run ${Date.now() % 100000})`);
    await waitFor(() => bubble(`Boolean([...document.querySelectorAll('.tier')].pop())`), 120000, 250);
    check('memory is included in the next prompt', /About the user[\s\S]*I like very short answers/.test(resolver.lastPrompt || ''));
    await bubble(`[...document.querySelectorAll('.actions button')].find((b) => b.textContent === 'Save to notes').click()`);
    await waitFor(() => notes.files().length > 0, 3000);
    check('Save to notes writes a markdown file', notes.files().length === 1 && /black hole/i.test(fs.readFileSync(notes.files()[0], 'utf8')));
    await bubble('window.loon.closeBubble()');

    setToggle('privacy', true);
    await typeInBubble('What is a black hole? One sentence.');
    await waitFor(() => bubble(`Boolean([...document.querySelectorAll('.tier')].pop())`), 120000, 250);
    const privateTier = await bubble(`[...document.querySelectorAll('.tier')].pop().textContent`);
    check('Privacy mode: no memory in the prompt and no cached answer', !/I like very short answers/.test(resolver.lastPrompt) && /on your Mac/.test(privateTier), privateTier);
    setToggle('privacy', false);
    await bubble('window.loon.closeBubble()');

    await typeInBubble('find my resume');
    const found = await waitFor(() => bubble(`Boolean(document.querySelector('.note button.linkish'))`), 3000);
    check('file search runs locally and lists results', found);
    await bubble('window.loon.closeBubble()');

    ipcMain.emit('open-bubble');
    await waitFor(() => bubbleWin.isVisible(), 1500);
    await wait(300);
    const research = await bubble(`[...document.querySelectorAll('.chip')].map((c) => c.dataset.task)`);
    check('saved notes add a "What have I found?" chip', research.includes('research_found'), research.join(','));
    await bubble('window.loon.closeBubble()');

    setToggle('focus', true);
    const focused = await waitFor(async () => (await cat('window.__loon.focus')) && (await cat('window.__loon.pose')) === 'loaf', 3000);
    catWin.webContents.send('debug', { move: 'moonMagic' });
    await wait(600);
    check('Focus mode: the cat naps and skips tricks', focused && (await cat('window.__loon.state')) !== 'move');
    setToggle('focus', false);
    await waitFor(async () => (await cat('window.__loon.pose')) === 'sit', 3000);

    // ---- M5: voice, driven by audio files made with macOS `say` (the mic is never opened; playback is muted) ----
    const { voice, voiceEngine } = ctx;
    if (voiceEngine.modelsReady()) {
      const { execFileSync } = require('child_process');
      const spoken = (text) => {
        const file = path.join(tmp, `${text.replace(/\W+/g, '-')}.wav`);
        execFileSync('say', ['-o', file, '--data-format=LEF32@16000', text]);
        return require('sherpa-onnx-node').readWave(file, false).samples; // Electron's V8 sandbox forbids external buffers
      };
      const sayCalls = [];
      const savedSay = ctx.hooks.say;
      ctx.hooks.say = async (t) => { sayCalls.push(t); };
      await voiceEngine.loadTts();
      const played = () => cat('window.__loon.played');
      try {
        executed.length = 0;
        const heard = voiceEngine.transcribe(spoken('Remind me to call mom at five.'));
        voice.handleTranscript(heard);
        const confirmShown = await waitFor(() => bubble(`Boolean(document.querySelector('.confirm'))`), 5000);
        const promptSpoken = await waitFor(async () => (await played()) > 0 || sayCalls.length > 0, 30000);
        check('voice: a spoken reminder becomes a confirm card and Loon reads it back', confirmShown && promptSpoken && Boolean(voice.pendingConfirm), `${heard} · card ${confirmShown} · spoken ${promptSpoken} · pending ${Boolean(voice.pendingConfirm)}`);
        voice.handleTranscript(voiceEngine.transcribe(spoken('Yes.')));
        await waitFor(() => executed.length > 0, 5000);
        check('voice: saying "yes" runs it (stubbed) with no model call', executed[0]?.title === 'call mom' && new Date(executed[0].when).getHours() === 17);
        await bubble('window.loon.closeBubble()');

        const before = await played();
        voice.handleTranscript(voiceEngine.transcribe(spoken('What is the capital of France?')));
        await waitFor(() => bubble(`Boolean([...document.querySelectorAll('.tier')].pop())`), 120000, 250);
        const answered = await bubble(`[...document.querySelectorAll('.a')].pop()?.textContent || ''`);
        const replied = await waitFor(async () => (await played()) > before, 30000);
        check('voice: an open question is answered in the bubble and spoken with Kokoro', /Paris/i.test(answered) && replied, answered.slice(0, 60));
        await bubble('window.loon.closeBubble()');

        voice.handleTranscript(voiceEngine.transcribe(spoken('Turn on focus mode.')));
        check('voice: "turn on focus mode" flips the toggle', await waitFor(async () => (await cat('window.__loon.focus')) === true, 3000));
        setToggle('focus', false);
      } finally {
        ctx.hooks.say = savedSay;
        voice.stopSpeaking();
      }
    } else {
      console.log('SKIP  voice checks (voice models not downloaded)');
    }

    // ---- M6: projects, Leetcode, Shortcuts (read-only reads of real repos; the Shortcut run is stubbed) ----
    const savedProjects = ctx.settings.projects;
    const loonDir = path.join(__dirname, '..');
    const leetcodeDir = path.join(os.homedir(), 'Desktop', 'Leetcode');
    ctx.settings.projects = [loonDir, ...(fs.existsSync(leetcodeDir) ? [leetcodeDir] : [])];
    try {
      const before = resolver.counts.tiers.local || 0;
      await typeInBubble('what was I working on in loon');
      const briefed = await waitFor(() => bubble(`[...document.querySelectorAll('.a')].some((a) => /Recent commits/.test(a.textContent))`), 10000);
      check('"what was I working on in loon" gives a briefing from git and TODOs, no model', briefed && (resolver.counts.tiers.local || 0) === before);
      await bubble('window.loon.closeBubble()');

      if (fs.existsSync(leetcodeDir)) {
        const lc = await resolver.run('leetcode_companies', { source: 'page', url: 'https://leetcode.com/problems/two-sum/description/' }, { onText: () => {} });
        check('Leetcode: which companies ask this, from the local repo', /asked at \*\*\d+\*\* companies/.test(lc.text) && lc.tier === 'code', lc.text.split('\n')[0]);
      }

      executed.length = 0;
      await typeInBubble('run new note');
      await waitFor(() => bubble(`Boolean(document.querySelector('.confirm'))`), 5000);
      const shortcutCard = await bubble(`document.querySelector('.confirm')?.textContent || ''`);
      await bubble(`document.querySelector('.confirm .primary').click()`);
      await waitFor(() => executed.length > 0, 5000);
      check('"run new note" matches the Shortcut, asks first, then runs it (stubbed)', /New Note with Date/.test(shortcutCard) && executed[0]?.name === 'New Note with Date');
      await bubble('window.loon.closeBubble()');
    } finally {
      ctx.settings.projects = savedProjects;
    }

    // ---- M6: files dropped on the cat (the drop handler's IPC path; Electron can't fake an OS file drag) ----
    const csvFile = path.join(tmp, 'water.csv');
    fs.writeFileSync(csvFile, 'name,price\nFizz,6.99\nBubbly,11.49\n');
    await ctx.openDroppedFile(csvFile);
    await waitFor(() => bubbleWin.isVisible(), 3000);
    await wait(400);
    const csvChips = await bubble(`[...document.querySelectorAll('.chip')].map((c) => c.dataset.task)`);
    await bubble(`document.querySelector('.chip[data-task="csv_overview"]').click()`);
    const csvDone = await waitFor(() => bubble(`[...document.querySelectorAll('.a')].some((a) => /2 rows × 2 columns/.test(a.textContent))`), 5000);
    check('drop a CSV on the cat: instant overview computed from the file', csvChips.includes('csv_overview') && csvDone, csvChips.join(','));
    await bubble('window.loon.closeBubble()');

    // ---- M6: a connected local app (a fake FastAPI-style app, never the user's real projects) ----
    const fakeApp = await require('./fixtures/openapi-app').start();
    const connector = ctx.hub.add({ name: 'Career Intel', baseUrl: `http://127.0.0.1:${fakeApp.port}` });
    try {
      await ctx.hub.refresh();
      await typeInBubble('career: search python jobs');
      const listed = await waitFor(() => bubble(`[...document.querySelectorAll('.a')].some((a) => /Backend Engineer/.test(a.textContent))`), 8000);
      check('"career: search python jobs" calls the app\'s search endpoint (a read, no confirm, no model)', listed);
      await bubble('window.loon.closeBubble()');

      await typeInBubble('career: save a job');
      await waitFor(() => bubble(`Boolean(document.querySelector('.confirm'))`), 5000);
      const fieldNames = await bubble(`[...document.querySelectorAll('.confirm label')].map((l) => l.firstChild.textContent).join(',')`);
      await bubble(`(() => { const inputs = document.querySelectorAll('.confirm input'); inputs[0].value = 'https://jobs.test/42'; inputs[1].value = 'ML Engineer'; document.querySelector('.confirm .primary').click(); })()`);
      const saved = await waitFor(() => fakeApp.jobs.some((j) => j.url === 'https://jobs.test/42'), 5000);
      check('writes ask first: confirm card with the API\'s fields, then the job is saved', /url \*,title \*/.test(fieldNames) && saved, fieldNames);
      await bubble('window.loon.closeBubble()');

      await typeInBubble('career: job');
      const choices = await waitFor(() => bubble(`Boolean(document.querySelector('.choices'))`), 5000);
      check('an ambiguous request shows buttons to pick from instead of guessing', choices);
      await bubble('window.loon.closeBubble()');
    } finally {
      ctx.hub.remove(connector.id);
      fakeApp.server.close();
    }

    ipcMain.emit('open-settings');
    const settingsWin = await (async () => {
      for (let i = 0; i < 30; i++) {
        const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === 'Loon Settings');
        if (w) return w;
        await wait(100);
      }
      return null;
    })();
    await waitFor(async () => settingsWin && (await settingsWin.webContents.executeJavaScript(`document.querySelectorAll('#memory input').length`)) > 0, 5000);
    const memoryShown = settingsWin && (await settingsWin.webContents.executeJavaScript(`[...document.querySelectorAll('#memory input')].map((i) => i.value).join('|')`));
    await settingsWin?.webContents.executeJavaScript(`document.querySelector('#memory button').click()`);
    await waitFor(() => memory.all().length === 0, 3000);
    check('Settings lists memory and deletes it', /very short answers/.test(memoryShown || '') && memory.all().length === 0, memoryShown);
    settingsWin?.close();
  } finally {
    Object.assign(notes, { dir: saved.notesDir });
    Object.assign(memory, { file: saved.memoryFile });
    Object.assign(actions, { auditFile: saved.auditFile, executors: saved.executors });
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  catWin.setBounds(homeBounds);
  if (!process.argv.includes('--no-browser')) {
    console.log('\n— browser companion —');
    await require('./selftest-browser').run(ctx, check);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  return failed === 0;
}

module.exports = { run };
