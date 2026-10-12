// Renders the staged demo (demo/stage.html) off screen, frame by frame, and encodes docs/demo.mp4, docs/demo.gif and
// docs/demo-poster.png. Headless only: nothing opens on screen.
//
//   node demo/render.js                  everything
//   node demo/render.js --stills 5,12.5  just those moments as PNGs (for checking), printed paths
//
// Needs playwright-core's headless shell (npx playwright-core install chromium-headless-shell) and ffmpeg.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const FFMPEG = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find((p) => fs.existsSync(p)) || 'ffmpeg';
const WORKERS = 4;
const GIF_FPS = 15;
const GIF_CUTS = [[5.6, 9.7], [19.0, 23.6], [29.0, 32.6], [39.0, 40.8]]; // highlight → define, Soju's cameo, Teach me, dress-up
const POSTER_AT = 44.3;
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };

function headlessShell() {
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const dir = fs.existsSync(cache) && fs.readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().pop();
  const bin = dir && path.join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
  return bin && fs.existsSync(bin) ? bin : undefined;
}

// The stage loads ../renderer/*, so serve the repo root (fonts and fetch() need http, not file://).
function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function openStage(browser, port, scale) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: scale });
  page.on('pageerror', (err) => console.error('stage error:', err.message));
  await page.goto(`http://127.0.0.1:${port}/demo/stage.html`);
  await page.waitForFunction(() => window.stageReady === true);
  return page;
}

// Screenshots of the given times into dir/00000.png…, split across a few pages in parallel.
async function shoot(browser, port, times, dir, scale) {
  fs.mkdirSync(dir, { recursive: true });
  let next = 0;
  let done = 0;
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    const page = await openStage(browser, port, scale);
    while (next < times.length) {
      const i = next++;
      await page.evaluate((t) => window.DEMO.seek(t), times[i]);
      await page.screenshot({ path: path.join(dir, `${String(i).padStart(5, '0')}.png`) });
      if (++done % 100 === 0) process.stdout.write(`  ${done}/${times.length}\n`);
    }
    await page.close();
  }));
}

const ffmpeg = (...args) => execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const mb = (file) => `${(fs.statSync(file).size / 2 ** 20).toFixed(2)} MB`;

(async () => {
  const server = await serve();
  const { port } = server.address();
  const browser = await chromium.launch({ executablePath: headlessShell(), headless: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-demo-'));
  try {
    const probe = await openStage(browser, port, 1);
    const { DURATION, FPS } = await probe.evaluate(() => window.DEMO);
    await probe.close();

    const stills = arg('--stills');
    if (stills) {
      const out = arg('--out') || path.join(os.tmpdir(), 'loon-demo-stills');
      const times = stills.split(',').map(Number);
      await shoot(browser, port, times, out, 1);
      const files = times.map((t, i) => {
        const file = path.join(out, `t${t.toFixed(2)}.png`);
        fs.renameSync(path.join(out, `${String(i).padStart(5, '0')}.png`), file);
        return file;
      });
      // contact sheets: four stills per image, at half size
      for (let i = 0; i < files.length; i += 4) {
        const group = files.slice(i, i + 4);
        while (group.length < 4) group.push(group[group.length - 1]);
        ffmpeg(...group.flatMap((f) => ['-i', f]), '-filter_complex', `${group.map((_, j) => `[${j}]scale=800:500[v${j}]`).join(';')};[v0][v1][v2][v3]xstack=inputs=4:layout=0_0|800_0|0_500|800_500`, path.join(out, `sheet${i / 4 + 1}.png`));
      }
      console.log(`stills in ${out}`);
      return;
    }

    console.log(`video: ${Math.round(DURATION * FPS)} frames`);
    const frames = path.join(work, 'video');
    await shoot(browser, port, Array.from({ length: Math.round(DURATION * FPS) }, (_, i) => i / FPS), frames, 1);
    const mp4 = path.join(DOCS, 'demo.mp4');
    ffmpeg('-framerate', String(FPS), '-i', path.join(frames, '%05d.png'), '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', '22',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4);
    fs.copyFileSync(path.join(frames, `${String(Math.round(POSTER_AT * FPS)).padStart(5, '0')}.png`), path.join(DOCS, 'demo-poster.png'));

    // The GIF is rendered natively at half size (sharp text, crisp sprites) instead of scaling the video down.
    const gifTimes = GIF_CUTS.flatMap(([a, b]) => Array.from({ length: Math.round((b - a) * GIF_FPS) }, (_, i) => a + i / GIF_FPS));
    console.log(`gif: ${gifTimes.length} frames`);
    const gifFrames = path.join(work, 'gif');
    await shoot(browser, port, gifTimes, gifFrames, 0.5);
    const gif = path.join(DOCS, 'demo.gif');
    ffmpeg('-framerate', String(GIF_FPS), '-i', path.join(gifFrames, '%05d.png'),
      '-vf', 'split[a][b];[a]palettegen=max_colors=160:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle', gif);
    console.log(`${mp4} ${mb(mp4)}\n${gif} ${mb(gif)}`);
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
})();
