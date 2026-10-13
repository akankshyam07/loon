// End-to-end check of the running app: `npm run selftest`.
// Drives the real windows with synthetic input and the real brain, prints PASS/FAIL per check.
const { ipcMain, globalShortcut, screen } = require('electron');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs, stepMs = 100) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await wait(stepMs);
  }
  return false;
}

// Which parts to run: `--part=core,features` (CI runs them as parallel jobs). No flag runs core, features and browser,
// as before; fresh, migrate and smoke are separate launches (test/selftest-install.js).
function selectedParts() {
  const named = process.argv.find((a) => a.startsWith('--part='))?.slice(7);
  if (named) return named.split(',').filter(Boolean);
  if (process.argv.includes('--browser-only')) return ['browser'];
  if (process.argv.includes('--no-browser')) return ['core', 'features'];
  return ['core', 'features', 'browser'];
}

// Shared by every part: the windows, synthetic input and the bubble driven like a person would.
function helpers(ctx) {
  const { catWin, bubbleWin } = ctx;
  const cat = (js) => catWin.webContents.executeJavaScript(js);
  const bubble = (js) => bubbleWin.webContents.executeJavaScript(js);
  // Synthetic input also moves main's virtual pointer, which stands in for the real mouse during the run.
  const mouse = (type, x, y, extra = {}) => {
    const b = catWin.getBounds();
    ctx.setCursor({ x: b.x + x, y: b.y + y });
    catWin.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1, ...extra });
  };
  const click = async (x, y) => {
    mouse('mouseDown', x, y);
    await wait(60);
    mouse('mouseUp', x, y);
  };
  // Moves go in as real input. Only in a hidden run, and only if Chromium never delivered that input to the page,
  // the same mousemove is dispatched on the page, so the renderer's hit test, its request and main's handling are
  // still what's checked; the result says which path ran.
  const hover = async (x, y, ignore) => {
    await cat(`if (!window.__moves) { window.__moves = []; document.addEventListener('mousemove', (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      window.__moves.push({ x: e.clientX, y: e.clientY, at: el ? el.id || el.tagName : null, overCat: Boolean(el && (el.closest('#cat') || el.closest('.interactive'))), trusted: e.isTrusted });
    }, true); } true`);
    const seen = await cat('window.__moves.length');
    mouse('mouseMove', x, y);
    const reached = () => ctx.catIgnore().requested === ignore;
    if (await waitFor(reached, 1500, 50)) return 'input event';
    const delivered = (await cat('window.__moves.length')) > seen;
    if (ctx.hidden && !delivered) {
      await cat(`document.dispatchEvent(new MouseEvent('mousemove', { clientX: ${x}, clientY: ${y}, bubbles: true })); true`);
      if (await waitFor(reached, 1500, 50)) return 'page event (hidden run: the input move never reached the page)';
    }
    return `delivered ${delivered} · last move ${await cat('JSON.stringify(window.__moves.at(-1) || null)')} · page ${await cat('document.visibilityState')}`;
  };
  const openBubble = async () => {
    ipcMain.emit('open-bubble');
    await waitFor(() => bubbleWin.isVisible(), 1500);
    await wait(300);
  };
  const closeBubble = async () => {
    await bubble('window.loon.closeBubble()');
    await waitFor(() => !bubbleWin.isVisible(), 1500);
  };
  const tierCount = () => bubble(`document.querySelectorAll('.tier-icon').length`);
  // Types into the bubble that is already open (a follow-up stays in the same thread).
  const submit = (text) => bubble(`(() => { const i = document.getElementById('input'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input')); document.getElementById('askForm').requestSubmit(); })()`);
  const typeInBubble = async (text) => {
    await openBubble();
    await submit(text);
  };
  const lastAnswer = () => bubble(`(() => { const a = [...document.querySelectorAll('.a')].pop(); return a ? { text: a.textContent, tier: a.querySelector('.tier-icon')?.title || '' } : null; })()`);
  // Asks in the open bubble and waits for the answer's tier icon.
  const askHere = async (text, timeoutMs = 120000) => {
    const before = await tierCount();
    await submit(text);
    const done = await waitFor(async () => (await tierCount()) > before, timeoutMs, 250);
    return { done, ...(await lastAnswer()) };
  };
  const askViaBubble = async (text) => {
    await openBubble();
    const answer = await askHere(text);
    await closeBubble();
    return answer;
  };
  const confirmShown = () => waitFor(() => bubble(`Boolean(document.querySelector('.confirm'))`), 5000);
  const settingsWindow = async () => {
    const { BrowserWindow } = require('electron');
    ipcMain.emit('open-settings');
    let win = null;
    await waitFor(() => (win = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.getTitle() === 'Loon Settings')), 5000);
    if (win) await waitFor(() => !win.webContents.isLoading() && win.webContents.executeJavaScript('document.readyState === "complete"').catch(() => false), 5000);
    return win;
  };
  return { cat, bubble, mouse, click, hover, openBubble, closeBubble, submit, typeInBubble, askHere, askViaBubble, lastAnswer, tierCount, confirmShown, settingsWindow, waitFor, wait };
}

// Real notes, memory and the action log swapped for temporary ones; executors stubbed so nothing touches the Mac.
async function withTempData(ctx, fn) {
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const { actions, notes, memory } = ctx;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-selftest-data-'));
  const saved = { notesDir: notes.dir, memoryFile: memory.file, auditFile: actions.auditFile, executors: actions.executors };
  notes.dir = path.join(tmp, 'notes');
  memory.open(path.join(tmp, 'memory.db'));
  actions.auditFile = path.join(tmp, 'audit.jsonl');
  const executed = [];
  actions.executors = {
    reminder: async (c) => { executed.push(c); return 'Added to Reminders.'; },
    event: async (c) => { executed.push(c); return 'Added to Calendar.'; },
    open: async (c) => { executed.push(c); return 'Opened.'; },
    find: async () => [path.join(tmp, 'resume.pdf')],
    shortcuts: async () => ['Open Breethe', 'New Note with Date'],
    shortcut: async (c) => { executed.push(c); return `Ran "${c.name}".`; },
    events: async () => [{ start: new Date(Date.now() + 3600000), allDay: false, title: 'Selftest standup' }],
    dueReminders: async () => ['Water the cat grass'],
  };
  try {
    return await fn({ tmp, executed });
  } finally {
    Object.assign(notes, { dir: saved.notesDir });
    memory.open(saved.memoryFile);
    Object.assign(actions, { auditFile: saved.auditFile, executors: saved.executors });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function run(ctx) {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
    if (!ok && process.env.LOON_SHOTS) shoot(`fail-${results.length}`); // CI uploads these with the log
  };
  // The cat and the bubble as they were when a check failed.
  const shoot = (label) => {
    const fs = require('fs');
    const path = require('path');
    for (const [name, win] of [['cat', ctx.catWin], ['bubble', ctx.bubbleWin]]) {
      if (win.isDestroyed()) continue;
      win.webContents.capturePage().then((img) => fs.writeFileSync(path.join(process.env.LOON_SHOTS, `${label}-${name}.png`), img.toPNG())).catch(() => {});
    }
  };
  const h = helpers(ctx);
  for (const win of [ctx.catWin, ctx.bubbleWin]) {
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error' || event.level === 'warning') console.log(`  [${win === ctx.catWin ? 'cat' : 'bubble'} ${event.level}] ${event.message}`);
    });
  }
  await waitFor(() => h.cat('Boolean(window.__loon)'), 5000);
  const parts = selectedParts();
  const started = Date.now();
  for (const part of parts) {
    const t = Date.now();
    console.log(`\n— ${part} —`);
    try {
      if (part === 'core') await core(ctx, check, h);
      else if (part === 'features') await require('./selftest-features').run(ctx, check, h);
      else if (part === 'browser') await require('./selftest-browser').run(ctx, check);
      else if (['fresh', 'migrate', 'smoke'].includes(part)) await require('./selftest-install')[part](ctx, check, h);
      else check(`known part "${part}"`, false);
    } catch (err) {
      console.error(err);
      check(`${part}: ran to the end without throwing`, false, err.message);
    }
    console.log(`  (${part} took ${Math.round((Date.now() - t) / 1000)} s)`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed (${parts.join(', ')}; ${Math.round((Date.now() - started) / 1000)} s)`);
  return failed === 0 && results.length > 0;
}

async function core(ctx, check, h) {
  const { catWin, bubbleWin } = ctx;
  const { cat, bubble, mouse, hover, askViaBubble, typeInBubble } = h;
  const homeBounds = catWin.getBounds();
  const backHome = () => ctx.resetCatPosition(homeBounds);

  let dragStarted = false;
  let dragEnded = false;
  ipcMain.on('drag-start', () => { dragStarted = true; });
  ipcMain.on('drag-end', () => { dragEnded = true; });

  await wait(800); // let the first layout and mouse state settle
  const head = await cat(`(() => { const r = document.querySelector('#headShape').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  check('cat renders', head.x > 0 && head.y > 0, `head at ${head.x},${head.y}`);

  // Click-through: the renderer hit-tests each mouse move and asks main to capture or pass clicks. Checked on main's
  // record of the request, because a hidden run keeps the window itself ignoring the real mouse.
  const ignoreState = (via) => `${via} · ${JSON.stringify(ctx.catIgnore())}`;
  mouse('mouseMove', 3, 3); // start from a known state
  await wait(150);
  let via = await hover(head.x, head.y, false);
  check('hovering the cat captures clicks', ctx.catIgnore().requested === false && ctx.catIgnore().applied === ctx.hidden, ignoreState(via));
  via = await hover(3, 3, true);
  check('empty space passes clicks through', ctx.catIgnore().requested === true && ctx.catIgnore().applied === true, ignoreState(via));

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

  // Drag toward the middle of the screen so the move is never swallowed by the screen-edge clamp.
  const workArea = screen.getDisplayMatching(homeBounds).workArea;
  const dragDx = homeBounds.x + homeBounds.width / 2 > workArea.x + workArea.width / 2 ? -30 : 30;
  mouse('mouseDown', head.x, head.y);
  await wait(40);
  mouse('mouseMove', head.x + dragDx, head.y + 5, { modifiers: ['leftButtonDown'] });
  await wait(150);
  mouse('mouseUp', head.x + dragDx, head.y + 5);
  await wait(400);
  const moved = Math.sign(catWin.getBounds().x - homeBounds.x) === Math.sign(dragDx);
  check('dragging moves the window through main', dragStarted && dragEnded && moved, `started ${dragStarted} · ended ${dragEnded} · state ${await cat('window.__loon.state')} · bounds ${JSON.stringify(catWin.getBounds())} vs ${JSON.stringify(homeBounds)}`);
  backHome(); // the drag also moved the cat's home; put both back
  await waitFor(async () => (await cat('window.__loon.state')) === 'idle', 3000);

  for (const move of ['moonMagic', 'edgePeek', 'pounce']) {
    await waitFor(async () => (await cat('window.__loon.state')) === 'idle', 5000);
    catWin.webContents.send('debug', { move });
    const started = await waitFor(async () => (await cat('window.__loon.state')) === 'move', 1500, 50);
    const finished = await waitFor(async () => (await cat('window.__loon.state')) === 'idle', 9000);
    check(`cool move: ${move}`, started && finished, `started ${started} · finished ${finished} · state ${await cat('window.__loon.state')}`);
    backHome();
    await wait(300);
  }

  catWin.webContents.send('debug', { nap: true });
  const napping = await waitFor(async () => (await cat('window.__loon.state')) === 'napping', 1500);
  const pose = await cat('window.__loon.pose');
  mouse('mouseDown', head.x, head.y + 40);
  await wait(60);
  mouse('mouseUp', head.x, head.y + 40);
  const awake = await waitFor(async () => (await cat('window.__loon.state')) === 'idle', 3000);
  check('nap: loaf pose, click wakes', napping && pose === 'loaf' && awake, `napping ${napping} · pose ${pose} · awake ${awake}`);
  await waitFor(() => !bubbleWin.isVisible(), 500);

  check('⌥Space hotkey is registered', globalShortcut.isRegistered('Alt+Space'));

  catWin.webContents.send('debug', { brain: { state: 'error' } });
  check('brain error makes the cat confused', await waitFor(async () => (await cat('window.__loon.mood')) === 'confused', 1500));
  catWin.webContents.send('debug', { mood: 'neutral' });

  // Brain, through the real bubble UI.
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

  const card = await bubble(`({ footer: Boolean(document.querySelector('footer')), tools: document.querySelectorAll('.answer-tools > button').length })`);
  check('minimal card: no footer, at most 3 visible answer buttons', !card.footer && card.tools <= 3, JSON.stringify(card));

  // ---- M4: assistant (notes, memory, actions, toggles) with real files swapped for temp ones ----
  const fs = require('fs');
  const path = require('path');
  const { BrowserWindow } = require('electron');
  const { actions, notes, memory, setToggle, resolver } = ctx;
  await withTempData(ctx, async ({ tmp, executed }) => {
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

    await typeInBubble("what's my day");
    const day = await waitFor(() => bubble(`/Selftest standup[\\s\\S]*Water the cat grass/.test(document.getElementById('log').textContent)`), 3000);
    check('"what\'s my day" lists today\'s events and due reminders, no confirm needed', day);
    await bubble('window.loon.closeBubble()');
    await typeInBubble('focus for 30 minutes');
    const focusOn = await waitFor(() => ctx.settings.focus === true, 3000);
    await bubble('window.loon.closeBubble()');
    await typeInBubble('stop focus');
    check('"focus for 30 minutes" turns Focus on and "stop focus" turns it off', focusOn && await waitFor(() => ctx.settings.focus === false, 3000));
    await bubble('window.loon.closeBubble()');

    // unique per run: a cached answer from an earlier run would skip building a fresh prompt
    await typeInBubble(`What is a black hole? One sentence. (run ${Date.now() % 100000})`);
    await waitFor(() => bubble(`Boolean([...document.querySelectorAll('.tier-icon')].pop())`), 120000, 250);
    check('memory is included in the next prompt', /About the user[\s\S]*I like very short answers/.test(resolver.lastPrompt || ''));
    await bubble(`[...document.querySelectorAll('.answer-tools button')].find((b) => b.textContent === 'Save to notes').click()`);
    await waitFor(() => notes.files().length > 0, 3000);
    check('Save to notes writes a markdown file', notes.files().length === 1 && /black hole/i.test(fs.readFileSync(notes.files()[0], 'utf8')));
    await bubble('window.loon.closeBubble()');

    setToggle('privacy', true);
    await typeInBubble('What is a black hole? One sentence.');
    await waitFor(() => bubble(`Boolean([...document.querySelectorAll('.tier-icon')].pop())`), 120000, 250);
    const privateTier = await bubble(`[...document.querySelectorAll('.tier-icon')].pop().title`);
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

    // ---- M5: voice, driven by bundled recordings (test/fixtures/voice-*.wav; the mic is never opened; playback is muted) ----
    const { voice, voiceEngine } = ctx;
    if (voiceEngine.modelsReady()) {
      // Copied out first: sherpa-onnx is native code and can't read inside the packaged app's archive.
      const spoken = (name) => {
        const file = path.join(tmp, `voice-${name}.wav`);
        fs.copyFileSync(path.join(__dirname, 'fixtures', `voice-${name}.wav`), file);
        return require('sherpa-onnx-node').readWave(file, false).samples; // Electron's V8 sandbox forbids external buffers
      };
      // End of turn: the recording with silence around it, streamed in 100 ms chunks like the mic worklet sends.
      const turns = [];
      const detector = voiceEngine.createTurnDetector((samples) => turns.push(voiceEngine.transcribe(samples)));
      const clip = spoken('remind');
      const stream = new Float32Array(clip.length + 16000 * 2);
      stream.set(clip, 8000);
      for (let i = 0; i < stream.length; i += 1600) detector.push(stream.subarray(i, i + 1600));
      check('voice: Silero VAD ends the turn after the pause and Moonshine transcribes it', turns.length === 1 && /remind me to call mom/i.test(turns[0]), JSON.stringify(turns));
      const sayCalls = [];
      const savedSay = ctx.hooks.say;
      ctx.hooks.say = async (t) => { sayCalls.push(t); };
      await voiceEngine.loadTts();
      const tts = await voiceEngine.synthesize('Hi, I am Loon.').catch((err) => ({ error: err.message }));
      check('voice: Kokoro speaks on this Mac (audio samples, no macOS say)', tts?.samples?.length > tts?.sampleRate / 4 && sayCalls.length === 0, tts ? `${tts.samples?.length || 0} samples @ ${tts.sampleRate} Hz${tts.error ? ` · ${tts.error}` : ''}` : 'Kokoro did not load');
      const played = () => cat('window.__loon.played');
      try {
        executed.length = 0;
        const heard = voiceEngine.transcribe(spoken('remind'));
        voice.handleTranscript(heard);
        const confirmShown = await waitFor(() => bubble(`Boolean(document.querySelector('.confirm'))`), 5000);
        const promptSpoken = await waitFor(async () => (await played()) > 0 || sayCalls.length > 0, 30000);
        check('voice: a spoken reminder becomes a confirm card and Loon reads it back', confirmShown && promptSpoken && Boolean(voice.pendingConfirm), `${heard} · card ${confirmShown} · spoken ${promptSpoken} · pending ${Boolean(voice.pendingConfirm)}`);
        voice.handleTranscript(voiceEngine.transcribe(spoken('yes')));
        await waitFor(() => executed.length > 0, 5000);
        check('voice: saying "yes" runs it (stubbed) with no model call', executed[0]?.title === 'call mom' && new Date(executed[0].when).getHours() === 17);
        await bubble('window.loon.closeBubble()');

        const before = await played();
        voice.handleTranscript(voiceEngine.transcribe(spoken('capital')));
        await waitFor(() => bubble(`Boolean([...document.querySelectorAll('.tier-icon')].pop())`), 120000, 250);
        const answered = await bubble(`[...document.querySelectorAll('.a')].pop()?.textContent || ''`);
        const replied = await waitFor(async () => (await played()) > before, 30000);
        check('voice: an open question is answered in the bubble and spoken with Kokoro', /Paris/i.test(answered) && replied, answered.slice(0, 60));
        await bubble('window.loon.closeBubble()');

        voice.handleTranscript(voiceEngine.transcribe(spoken('focus')));
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
    // In the packaged app __dirname is inside app.asar (not a git repo), so fall back to LOON_SOURCE_DIR or the cwd.
    const loonDir = [path.join(__dirname, '..'), process.env.LOON_SOURCE_DIR, process.cwd()]
      .find((d) => d && fs.existsSync(path.join(d, '.git'))) || path.join(__dirname, '..');
    // Optional: point LOON_LEETCODE_DIR at a local Leetcode company-list repo to run that check.
    const leetcodeDir = process.env.LOON_LEETCODE_DIR || '';
    ctx.settings.projects = [loonDir, ...(leetcodeDir && fs.existsSync(leetcodeDir) ? [leetcodeDir] : [])];
    try {
      const before = resolver.counts.tiers.local || 0;
      await typeInBubble('what was I working on in loon');
      const briefed = await waitFor(() => bubble(`[...document.querySelectorAll('.a')].some((a) => /Recent commits/.test(a.textContent))`), 10000);
      check('"what was I working on in loon" gives a briefing from git and TODOs, no model', briefed && (resolver.counts.tiers.local || 0) === before);
      await bubble('window.loon.closeBubble()');

      if (leetcodeDir && fs.existsSync(leetcodeDir)) {
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
    const connector = ctx.hub.add({ name: 'Career Board', baseUrl: `http://127.0.0.1:${fakeApp.port}` });
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
  });

  backHome();
}

module.exports = { run, helpers, withTempData, waitFor, wait };
