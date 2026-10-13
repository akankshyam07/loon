// First-launch and upgrade checks, plus a packaging smoke test. Each runs as its own launch:
//   LOON_USER_DATA=<empty dir>                     electron . --selftest --part=fresh
//   LOON_USER_DATA=<copy of fixtures/old-userdata> electron . --selftest --part=migrate
//   electron . --selftest --part=smoke   (CI runs it from the packaged Loon.app: native modules, wasm, data files)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, screen } = require('electron');
const { waitFor } = require('./selftest');

const fixture = (name) => path.join(__dirname, 'fixtures', name);
// Native code and child processes can't read inside app.asar; tests hand them a real copy.
function realCopy(name) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'loon-fixture-')), path.basename(name));
  fs.copyFileSync(fixture(name), file);
  return file;
}

// An empty data folder: the welcome in the bubble and the offer to download the brain, nothing downloaded.
async function fresh(ctx, check, h) {
  const data = app.getPath('userData');
  check('fresh: started from the empty data folder', Boolean(process.env.LOON_USER_DATA) && data === process.env.LOON_USER_DATA, data);
  const welcomed = await waitFor(async () => ctx.bubbleWin.isVisible() && /Hi, I'm Loon/.test(await h.bubble(`document.getElementById('notice').textContent`)), 10000);
  check('fresh: first launch says hello in the bubble', welcomed);
  const offer = await waitFor(() => h.bubble(`!document.getElementById('setup').hidden && /^Download /.test(document.getElementById('download').textContent)`), 5000);
  const offerText = await h.bubble(`document.getElementById('setupText').textContent`);
  check('fresh: the bubble offers the model download (one click, nothing starts by itself)', offer && /downloads once/.test(offerText) && (await h.bubble(`document.getElementById('input').disabled`)), offerText.slice(0, 80));
  const models = path.join(data, 'models');
  const downloaded = fs.existsSync(models) ? fs.readdirSync(models) : [];
  check('fresh: no model download started', !(await ctx.brain.status()).downloading && downloaded.length === 0, downloaded.join(', '));
  const saved = await waitFor(() => { try { return JSON.parse(fs.readFileSync(path.join(data, 'settings.json'), 'utf8')).welcomed === true; } catch { return false; } }, 5000);
  check('fresh: settings are saved, so the welcome shows only once', saved && /^[A-Z0-9]{6}$/.test(ctx.settings.pairingCode || ''));
  const stats = await h.cat('window.__loon.canvasStats()');
  check('fresh: the pixel cat (Luna) is the default look', stats.visible && stats.opaque > 500 && (await h.cat('window.__loon.companion')) === 'luna', JSON.stringify(stats));
}

// settings.json and memory.json from an older Loon (before the pixel cat and the SQLite memory).
async function migrate(ctx, check, h) {
  const data = app.getPath('userData');
  const { settings, memory, catWin } = ctx;
  check('migrate: started on the old data folder', Boolean(process.env.LOON_USER_DATA) && data === process.env.LOON_USER_DATA && fs.existsSync(path.join(data, 'memory.json.imported')), data);
  check('migrate: old settings kept, new ones get their defaults', settings.size === 'L' && settings.judgmental === false && settings.pairingCode === 'K7Q2PX'
    && settings.catStyle === 'pixel' && settings.companion === 'luna' && settings.cameos === true && settings.answerWith === 'plan' && typeof settings.personal === 'object',
    JSON.stringify({ size: settings.size, catStyle: settings.catStyle, companion: settings.companion }));
  const texts = memory.all().map((f) => f.text);
  const nodes = memory.graph().nodes.map((n) => n.label);
  check('migrate: memory.json is imported into the SQLite memory, with graph links', texts.length === 3 && texts.includes('I am vegetarian') && nodes.includes('vegetarian') && !fs.existsSync(path.join(data, 'memory.json')), `${texts.length} facts · nodes ${nodes.join(', ')}`);
  const b = catWin.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  check('migrate: an off-screen saved position is pulled back onto the screen', b.x >= wa.x && b.y >= wa.y && b.x + b.width <= wa.x + wa.width && b.y + b.height <= wa.y + wa.height, `${JSON.stringify(b)} in ${JSON.stringify(wa)}`);
  const stats = await h.cat('window.__loon.canvasStats()');
  check('migrate: the cat renders in the new pixel style', stats.visible && stats.opaque > 500, JSON.stringify(stats));
  await new Promise((r) => setTimeout(r, 2500));
  check('migrate: no welcome again for an existing user', !ctx.bubbleWin.isVisible());
  const win = await h.settingsWindow();
  const shown = win && await waitFor(async () => (await win.webContents.executeJavaScript(`document.querySelectorAll('#memory input').length`)) === 3, 5000);
  const projects = win && await win.webContents.executeJavaScript(`document.body.textContent.includes('old-project')`);
  check('migrate: Settings opens on the old settings and lists the imported memories', Boolean(shown) && projects, `memories shown ${shown} · old project listed ${projects}`);
  win?.close();
}

// What breaks first in a packaged app: native modules, wasm, worker scripts and data files inside app.asar.
async function smoke(ctx, check, h) {
  const { resolver, voiceEngine } = ctx;
  const { selectionPacket } = require('../main/context');
  const capture = require('../main/capture');
  console.log(`  app ${app.isPackaged ? `packaged (${process.resourcesPath})` : 'from source'} · ${__dirname}`);
  const stats = await h.cat('window.__loon.canvasStats()');
  check('smoke: the pixel sprites draw', stats.visible && stats.opaque > 500, JSON.stringify(stats));
  await h.openBubble();
  const font = await h.bubble(`document.fonts.load('12px "Press Start 2P"').then(() => document.fonts.check('12px "Press Start 2P"'))`);
  check('smoke: the pixel font loads', font === true);
  await h.closeBubble();

  const run = async (task, packet, label) => {
    const t = Date.now();
    try {
      const result = await resolver.run(task, packet, { onText: () => {} });
      return { ...result, ms: Date.now() - t };
    } catch (err) {
      return { text: '', error: `${label}: ${err.message}`, ms: Date.now() - t };
    }
  };
  const detail = (r) => r.error || `${r.ms} ms · ${r.tier}${r.detail ? ` · ${r.detail}` : ''} · ${String(r.text).replace(/\s+/g, ' ').slice(0, 60)}`;
  const define = await run('define', selectionPacket({ text: 'ephemeral', kind: 'word' }), 'define');
  check('smoke: WordNet definitions (wordpos data files)', /short time/.test(define.text) && define.tier === 'code', detail(define));
  const french = await run('translate', selectionPacket({ text: 'Les chats aiment les boîtes parce que les espaces clos les rassurent et les protègent du froid.', kind: 'paragraph' }), 'translate');
  check('smoke: offline translation (Bergamot in a utility process)', /cat/i.test(french.text) && /offline translator/.test(french.detail || ''), detail(french));
  const dto = await run('make_dto_java', selectionPacket({ text: '{"id": 7, "name": "Loon", "tags": ["cat"]}', kind: 'json' }), 'dto');
  check('smoke: JSON → Java with quicktype', /class/.test(dto.text) && /quicktype/.test(dto.detail || ''), detail(dto));
  const grammar = await run('fix_grammar', selectionPacket({ text: 'Their is a issue with teh report.', kind: 'editable' }), 'grammar');
  check('smoke: grammar fixes with Harper (wasm)', /an issue/.test(grammar.text) && /Harper/.test(grammar.detail || ''), detail(grammar));
  const t = Date.now();
  const read = await capture.ocr(realCopy('teach-app.png'), path.join(app.getPath('userData'), 'ocr')).catch((err) => `error: ${err.message}`);
  check('smoke: OCR with Tesseract (worker + wasm)', /Export/.test(read) && /garden report/i.test(read), `${Date.now() - t} ms · ${read.replace(/\s+/g, ' ').slice(0, 80)}`);
  const pdf = await require('../brain/files').readDropped(realCopy('hello.pdf')).catch((err) => ({ text: `error: ${err.message}` }));
  check('smoke: PDFs read with pdf.js', /Loon reads this PDF/.test(pdf.text), pdf.text.slice(0, 60));
  const { Memory } = require('../brain/memory');
  const db = new Memory(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'loon-smoke-')), 'memory.db'));
  db.add('I am vegetarian');
  check('smoke: SQLite memory with full-text search', db.recall({ query: 'vegetarian food' }).some((f) => /vegetarian/.test(f.text || f)));
  db.close();
  const answer = await run('ask', { source: 'typed', question: `In one short sentence, what is a kitten? (smoke ${Date.now() % 100000})` }, 'model');
  check('smoke: the local model answers (node-llama-cpp)', answer.tier === 'local' && answer.text.length > 10, detail(answer));
  if (voiceEngine.modelsReady()) {
    const samples = require('sherpa-onnx-node').readWave(realCopy('voice-remind.wav'), false).samples;
    const heard = voiceEngine.transcribe(samples);
    check('smoke: speech to text with sherpa-onnx (Moonshine)', /remind me to call mom/i.test(heard), heard);
    await voiceEngine.loadTts();
    const tts = await voiceEngine.synthesize('Hello from Loon.').catch(() => null);
    check('smoke: Kokoro text to speech (onnxruntime)', tts?.samples?.length > 1000, tts ? `${tts.samples.length} samples` : 'no audio');
  } else {
    console.log('SKIP  smoke voice checks (voice models not downloaded)');
  }
}

module.exports = { fresh, migrate, smoke };
