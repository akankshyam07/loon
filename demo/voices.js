// Voices for the demo reel, synthesized from scratch: cute-game "babble" (every syllable a short chirpy vowel blip, the
// meaning carried by the on-screen balloons) and procedural cat noises (meow, purr, trill, chirp). No samples, no TTS.
//   Luna: melodious. Syllables snap to C major pentatonic notes (the soundtrack's key) along a phrase contour that
//         arches, falls at full stops and rises on questions; soft sine/triangle timbre, unhurried.
//   Soju: a baby. Higher, faster, squeaky narrow pulse, a little off-key, excited jumps; when he copies Luna he sings
//         her melody an octave up, too fast and a bit wrong.
// Variant B (render.js --variant B) lets Soju speak his real words with Kokoro (or Deepgram Aura when DEEPGRAM_API_KEY
// is set; the key is only sent in the request header, never printed or stored). Those clips are cached in the temp dir.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const RATE = 44100;
const MOUTH_FPS = 12; // lip-sync steps, like the sprites' stepped animation
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

// ---------- small DSP ----------
function rng(text) {
  let s = parseInt(crypto.createHash('sha1').update(text).digest('hex').slice(0, 8), 16) || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
function bandpass() {
  let b0 = 0, b2 = 0, a1 = 0, a2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return {
    set(freq, q) {
      const w = (2 * Math.PI * Math.min(freq, RATE * 0.45)) / RATE;
      const alpha = Math.sin(w) / (2 * q);
      const a0 = 1 + alpha;
      b0 = alpha / a0; b2 = -alpha / a0; a1 = (-2 * Math.cos(w)) / a0; a2 = (1 - alpha) / a0;
    },
    run(x) {
      const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      return y;
    },
  };
}
const VOWELS = { a: [800, 1250], e: [480, 1900], i: [320, 2350], o: [520, 900], u: [360, 800], y: [320, 2200] };
const normalize = (samples, peak = 0.85) => {
  let max = 0;
  for (const v of samples) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < samples.length; i++) samples[i] *= peak / max;
  return samples;
};
const silence = (sec) => new Float32Array(Math.round(sec * RATE));
function concat(parts) {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

// ---------- babble ----------
const CHARACTER = {
  luna: { scale: [67, 69, 72, 74, 76, 79], home: 2, syl: 0.088, gap: 0.016, last: 0.15, word: 0.02, stop: 0.17, comma: 0.11, wave: 'soft', jitter: 0, jump: 0 },
  soju: { scale: [72, 74, 76, 79, 81, 84, 86], home: 2, syl: 0.058, gap: 0.01, last: 0.1, word: 0.012, stop: 0.12, comma: 0.08, wave: 'pulse', jitter: 0.35, jump: 0.22 },
};

// "Did someone say food?!" → phrases of syllables: { vowel, onset, wordEnd }, each phrase with its ending mark.
function phrases(text) {
  const out = [];
  let current = [];
  for (const token of text.match(/[A-Za-z']+|[.?!,…]+/g) || []) {
    if (/^[.?!,…]+$/.test(token)) {
      if (token.includes(',')) { if (current.length) current[current.length - 1].comma = true; continue; }
      if (current.length) out.push({ syllables: current, end: token.includes('?') ? '?' : token.includes('!') ? '!' : '.' });
      current = [];
      continue;
    }
    const word = token.toLowerCase().replace(/'/g, '');
    const parts = word.match(/[^aeiouy]*[aeiouy]+/g) || [word];
    parts.forEach((p, i) => {
      const vowel = (p.match(/[aeiouy]/) || ['u'])[0];
      current.push({ vowel, onset: p.match(/^[^aeiouy]*/)[0], wordEnd: i === parts.length - 1 });
    });
  }
  if (current.length) out.push({ syllables: current, end: '.' });
  return out;
}

const MOTIF = [0, 2, 1, 3, 2, 1, 2, 3, 1, 0]; // a little pentatonic walk, so lines sing instead of droning
// Scale steps for each syllable: an arch over the phrase, small text-seeded wiggles, then the ending shape.
function contour(ph, who, rand) {
  const c = CHARACTER[who];
  const n = ph.syllables.length;
  const offset = Math.floor(rand() * MOTIF.length);
  return ph.syllables.map((_, k) => {
    let step = c.home - 1 + MOTIF[(k + offset) % MOTIF.length] + Math.round(0.8 * Math.sin((Math.PI * (k + 0.5)) / n));
    if (rand() < c.jump) step += 2;
    if (k === n - 1) step = ph.end === '?' ? c.scale.length - 1 : ph.end === '!' ? c.home + 2 : Math.max(0, c.home - 2);
    if (k === n - 2 && ph.end === '.') step = Math.min(step, c.home);
    return Math.max(0, Math.min(c.scale.length - 1, step));
  });
}

// One syllable: a short vowel blip with a soft consonant onset, gliding from the previous pitch.
function syllable(out, at, { freq, from, dur, vowel, onset, who, rand }) {
  const c = CHARACTER[who];
  const [f1, f2] = VOWELS[vowel] || VOWELS.u;
  const bp1 = bandpass(); bp1.set(f1 * (who === 'soju' ? 1.25 : 1.1), 4);
  const bp2 = bandpass(); bp2.set(f2 * (who === 'soju' ? 1.25 : 1.1), 6);
  const n = Math.round(dur * RATE);
  const n0 = Math.round(at * RATE);
  const hiss = /^(s|sh|f|h|th|ch|z)/.test(onset);
  const pluck = /^(t|k|p|c|q|d|b|g)/.test(onset);
  let phase = rand();
  for (let i = 0; i < n + 0.03 * RATE; i++) {
    const t = i / RATE;
    const glide = Math.min(1, t / 0.025);
    const bend = !hiss && !pluck && onset && t < 0.02 ? 0.94 + 0.06 * (t / 0.02) : 1;
    const f = (from + (freq - from) * glide) * bend * (1 + 0.006 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t / 0.05));
    phase += f / RATE;
    const ph = phase % 1;
    const src = c.wave === 'soft'
      ? 0.7 * Math.sin(2 * Math.PI * ph) + 0.25 * (1 - 4 * Math.abs(ph - 0.5)) + 0.12 * Math.sin(4 * Math.PI * ph)
      : (ph < 0.16 ? 1 : -0.19) * 0.9;
    const voiced = 0.55 * src + 0.9 * bp1.run(src) + 0.6 * bp2.run(src);
    const env = t < 0.008 ? t / 0.008 : t < dur ? 1 - 0.3 * ((t - 0.008) / dur) : Math.max(0, 0.7 * (1 - (t - dur) / 0.03));
    let v = voiced * env;
    if ((hiss && t < 0.025) || (pluck && t < 0.008)) v += (rand() * 2 - 1) * 0.18 * (1 - t / 0.025);
    const k = n0 + i;
    if (k < out.length) out[k] += v;
  }
}

// text → { samples, melody } for who; `melody` (MIDI per syllable) lets Soju copy Luna's tune.
function babble(text, who, { melody = null } = {}) {
  const c = CHARACTER[who];
  const rand = rng(`${who}|${text}`);
  const plan = [];
  let at = 0.01;
  const notes = [];
  phrases(text).forEach((ph) => {
    const steps = contour(ph, who, rand);
    ph.syllables.forEach((s, k) => {
      let midi = c.scale[steps[k]];
      if (melody) {
        midi = melody[notes.length % melody.length] + 12; // her tune, an octave up
        if (notes.length % 3 === 2) midi += rand() < 0.5 ? 2 : -1; // …and a bit wrong
      }
      const detune = c.jitter ? (rand() * 2 - 1) * c.jitter : 0;
      const last = k === ph.syllables.length - 1;
      const dur = last ? c.last : c.syl * (0.9 + rand() * 0.2);
      plan.push({ at, freq: midiHz(midi + detune), dur, vowel: s.vowel, onset: s.onset });
      notes.push(midi);
      at += dur + c.gap + (s.wordEnd ? c.word : 0) + (s.comma ? c.comma : 0);
    });
    at += c.stop;
  });
  const out = new Float32Array(Math.ceil((at + 0.05) * RATE));
  let prev = plan[0]?.freq || 440;
  for (const p of plan) { syllable(out, p.at, { ...p, from: prev, who, rand }); prev = p.freq; }
  return { samples: trimEnd(normalize(out)), melody: notes };
}
function trimEnd(s) {
  let end = s.length;
  while (end > 0 && Math.abs(s[end - 1]) < 1e-3) end--;
  return s.slice(0, Math.min(s.length, end + Math.round(0.02 * RATE)));
}

// ---------- cat noises ----------
function meow(who) {
  const up = who === 'soju' ? 1.35 : 1;
  const dur = who === 'soju' ? 0.32 : 0.42;
  const out = new Float32Array(Math.round(dur * RATE));
  const f1 = bandpass();
  const f2 = bandpass();
  const lerp3 = (p, a, b, c) => (p < 0.4 ? a + (b - a) * (p / 0.4) : b + (c - b) * ((p - 0.4) / 0.6));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const p = t / dur;
    if (i % 32 === 0) { f1.set(lerp3(p, 320, 900, 480) * up, 5); f2.set(lerp3(p, 2300, 1350, 850) * up, 7); } // "mi-a-ow"
    const f = 560 * up * (0.82 + 0.5 * Math.sin(Math.PI * Math.pow(p, 0.8))) * (1 + 0.01 * Math.sin(2 * Math.PI * 6 * t));
    phase += f / RATE;
    const saw = 2 * (phase % 1) - 1;
    const env = Math.min(1, t / 0.04) * Math.min(1, (dur - t) / 0.13);
    out[i] = (0.25 * saw + f1.run(saw) * 1.2 + f2.run(saw) * 0.8) * env;
  }
  return normalize(out);
}
function purr(who) {
  const dur = 1.0;
  const rate = who === 'soju' ? 28 : 24;
  const out = new Float32Array(Math.round(dur * RATE));
  const rand = rng(`purr|${who}`);
  let lp1 = 0, lp2 = 0, phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    lp1 += 0.035 * ((rand() * 2 - 1) - lp1); // two one-pole lowpasses: a soft rumble
    lp2 += 0.035 * (lp1 - lp2);
    const am = Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * rate * t), 2);
    phase += (who === 'soju' ? 95 : 80) / RATE;
    const hum = Math.sin(2 * Math.PI * phase) + 0.3 * Math.sin(4 * Math.PI * phase);
    const env = Math.min(1, t / 0.12) * Math.min(1, (dur - t) / 0.25);
    out[i] = (lp2 * 9 + hum * 0.35) * am * env;
  }
  return normalize(out, 0.55);
}
function trill(who) {
  const up = who === 'soju' ? 1.4 : 1;
  const dur = 0.32;
  const out = new Float32Array(Math.round(dur * RATE));
  const bp = bandpass();
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const p = t / dur;
    if (i % 32 === 0) bp.set((400 + 1500 * p) * up, 3);
    const f = (520 + 240 * p + (p > 0.8 ? 600 * (p - 0.8) : 0)) * up; // "brrrp", rising at the end
    phase += f / RATE;
    const src = Math.sin(2 * Math.PI * phase) + 0.3 * (1 - 4 * Math.abs((phase % 1) - 0.5));
    const roll = 1 - 0.75 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 30 * t)) * (p < 0.8 ? 1 : 0);
    const env = Math.min(1, t / 0.02) * Math.min(1, (dur - t) / 0.06);
    out[i] = (0.7 * src + bp.run(src)) * roll * env;
  }
  return normalize(out);
}
function chirp(who) {
  const up = who === 'soju' ? 1 : 0.75;
  const dur = 0.16;
  const out = new Float32Array(Math.round(dur * RATE));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const p = t / dur;
    phase += (900 + 700 * Math.sqrt(p)) * up / RATE;
    const ph = phase % 1;
    const src = (ph < 0.2 ? 1 : -0.25) * 0.8 + 0.4 * Math.sin(2 * Math.PI * ph);
    const env = Math.min(1, t / 0.01) * Math.min(1, (dur - t) / 0.05) * (1 - 0.3 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 35 * t)));
    out[i] = src * env;
  }
  return normalize(out, 0.7);
}
const NOISES = { meow, purr, trill, chirp };

// ---------- variant B: Soju's real words through TTS ----------
const ffmpegBin = () => ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find((p) => fs.existsSync(p)) || 'ffmpeg';
function wavFromFloat(samples, sampleRate) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8); head.write('fmt ', 12);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(sampleRate, 24);
  head.writeUInt32LE(sampleRate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}
let kokoro = null;
async function speak(text) {
  if (process.env.DEEPGRAM_API_KEY) {
    const voice = process.env.DEEPGRAM_SOJU_VOICE || 'aura-2-andromeda-en';
    const res = await fetch(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(voice)}&encoding=linear16&sample_rate=24000&container=wav`, {
      method: 'POST', headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`Deepgram TTS failed for voice ${voice}: HTTP ${res.status}`);
    return { wav: Buffer.from(await res.arrayBuffer()), voice };
  }
  kokoro ??= (async () => {
    // the CommonJS builds: kokoro-js finds its voice files next to itself there
    const tf = await import(require.resolve('@huggingface/transformers'));
    (tf.env ?? tf.default.env).cacheDir = path.join(os.tmpdir(), 'loon-demo-kokoro'); // ~90 MB model, downloaded once
    const kk = await import(require.resolve('kokoro-js'));
    return (kk.KokoroTTS ?? kk.default.KokoroTTS).from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
  })();
  const audio = await (await kokoro).generate(text, { voice: 'af_sky', speed: 1.05 });
  return { wav: wavFromFloat(audio.audio, audio.sampling_rate), voice: 'kokoro af_sky' };
}
async function sojuWords(text) {
  const key = crypto.createHash('sha1').update(JSON.stringify([process.env.DEEPGRAM_API_KEY ? 'deepgram' : 'kokoro', text, 1])).digest('hex');
  const dir = path.join(os.tmpdir(), 'loon-demo-voices');
  const file = path.join(dir, `${key}.f32`);
  if (fs.existsSync(file)) { const b = fs.readFileSync(file); return new Float32Array(b.buffer, b.byteOffset, b.length / 4).slice(); }
  const { wav } = await speak(text);
  const inRate = wav.readUInt32LE(24);
  const filters = `aresample=${inRate},asetrate=${Math.round(inRate * 1.42)},aresample=${RATE},atempo=0.88,highpass=f=160,`
    + 'acompressor=threshold=-20dB:ratio=2.5:attack=6:release=120:makeup=2,silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse';
  const raw = execFileSync(ffmpegBin(), ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-af', filters, '-ac', '1', '-f', 'f32le', 'pipe:1'], { input: wav, maxBuffer: 1 << 28 });
  const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4).slice().map((v) => (Number.isFinite(v) ? v : 0));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, Buffer.from(normalize(samples).buffer));
  return samples;
}

// Open/closed mouth per 1/12 s from the clip's loudness; long sounds still flap a little.
function mouthTrack(samples) {
  const win = Math.round(RATE / MOUTH_FPS);
  const rms = [];
  for (let i = 0; i < samples.length; i += win) {
    let sum = 0;
    const end = Math.min(samples.length, i + win);
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    rms.push(Math.sqrt(sum / Math.max(1, end - i)));
  }
  const max = Math.max(...rms, 1e-6);
  let run = 0;
  return rms.map((r) => {
    const open = r > max * 0.22;
    run = open ? run + 1 : 0;
    return open && run % 3 !== 0 ? 1 : 0;
  });
}

// lines: [{ id, who, sound }] → { backend, clips: { id: { samples, duration, mouth } } }
// variant 'A': everything synthesized · 'B': Soju's real words spoken by TTS, everything else synthesized
async function synthesize(lines, { variant = 'A' } = {}) {
  const clips = {};
  const melodies = {};
  for (const { id, who, sound } of lines) {
    const parts = [];
    for (const [kind, ...args] of sound) {
      if (parts.length) parts.push(silence(0.06));
      if (NOISES[kind]) { parts.push(NOISES[kind](who)); continue; }
      const text = kind === 'copy' ? args[1] : args[0];
      const words = kind === 'copy' ? args[2] : args[1];
      if (variant === 'B' && who === 'soju' && words) { parts.push(await sojuWords(text)); continue; }
      const { samples, melody } = babble(text, who, kind === 'copy' ? { melody: melodies[args[0]] } : {});
      if (kind === 'babble') melodies[id] = melody;
      parts.push(samples);
    }
    const samples = concat(parts);
    clips[id] = { samples, duration: samples.length / RATE, mouth: mouthTrack(samples) };
  }
  const tts = process.env.DEEPGRAM_API_KEY ? `Deepgram ${process.env.DEEPGRAM_SOJU_VOICE || 'aura-2-andromeda-en'}` : 'Kokoro af_sky';
  return { backend: variant === 'B' ? `babble + cat noises; Soju's words via ${tts}` : 'synthesized babble + cat noises', clips, RATE, MOUTH_FPS };
}

module.exports = { synthesize, babble, NOISES, RATE, MOUTH_FPS };
