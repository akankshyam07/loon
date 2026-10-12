// Voices for the demo reel: Luna (warm, sing-songy, unhurried) and Soju (a squeaky, too-excited baby brother).
// Speech comes from Deepgram Aura only when DEEPGRAM_API_KEY is set in the environment (the key is read here and sent
// in one request header, never printed or stored); otherwise from Kokoro, which Loon already uses for its own voice.
// ffmpeg then gives each cat its character. Clips are cached in the temp dir, keyed by everything that shapes them.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const RATE = 44100;
const MOUTH_FPS = 12; // lip-sync steps, like the sprites' stepped animation
const VOICES = {
  deepgram: { luna: process.env.DEEPGRAM_LUNA_VOICE || 'aura-2-thalia-en', soju: process.env.DEEPGRAM_SOJU_VOICE || 'aura-2-andromeda-en' },
  kokoro: { luna: 'af_heart', soju: 'af_sky' },
};
// Luna: a small lift and a gentle lilt, slower than she was synthesized. Soju: a big pitch jump and faster: a baby.
const SHAPE = {
  luna: { speed: 0.9, pitch: 1.07, tempo: 0.97, extra: 'bass=g=2:f=200,treble=g=2.5:f=4500,' },
  soju: { speed: 1.05, pitch: 1.42, tempo: 0.88, extra: '' },
};

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

async function deepgram(text, voice) {
  const res = await fetch(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(voice)}&encoding=linear16&sample_rate=24000&container=wav`, {
    method: 'POST',
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Deepgram TTS failed for voice ${voice}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

let kokoro = null;
async function kokoroWav(text, voice, speed) {
  kokoro ??= (async () => {
    // the CommonJS builds: kokoro-js finds its voice files next to itself there
    const tf = await import(require.resolve('@huggingface/transformers'));
    (tf.env ?? tf.default.env).cacheDir = path.join(os.tmpdir(), 'loon-demo-kokoro'); // ~90 MB model, downloaded once
    const kk = await import(require.resolve('kokoro-js'));
    return (kk.KokoroTTS ?? kk.default.KokoroTTS).from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
  })();
  const audio = await (await kokoro).generate(text, { voice, speed });
  return wavFromFloat(audio.audio, audio.sampling_rate);
}

// Raw speech → the character's voice, as 44.1 kHz mono float samples.
function shape(wav, who, inRate) {
  const s = SHAPE[who];
  const filters = `aresample=${inRate},asetrate=${Math.round(inRate * s.pitch)},aresample=${RATE},atempo=${s.tempo},${s.extra}highpass=f=${who === 'soju' ? 160 : 90},`
    + 'acompressor=threshold=-20dB:ratio=2.5:attack=6:release=120:makeup=2,'
    + 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse';
  const out = execFileSync(ffmpegBin(), ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-af', filters, '-ac', '1', '-f', 'f32le', 'pipe:1'], { input: wav, maxBuffer: 1 << 28 });
  const samples = new Float32Array(out.buffer, out.byteOffset, out.length / 4).slice();
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    if (!Number.isFinite(samples[i])) samples[i] = 0;
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  if (peak > 0) for (let i = 0; i < samples.length; i++) samples[i] *= 0.85 / peak;
  return samples;
}

// Open/closed mouth per 1/12 s from the clip's loudness; long vowels still flap a little.
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

// lines: [{ id, who, say }] → { backend, voices, clips: { id: { samples, duration, mouth } } }
async function synthesize(lines) {
  const backend = process.env.DEEPGRAM_API_KEY ? 'deepgram' : 'kokoro';
  const voices = VOICES[backend];
  const dir = path.join(os.tmpdir(), 'loon-demo-voices');
  fs.mkdirSync(dir, { recursive: true });
  const clips = {};
  for (const { id, who, say } of lines) {
    const voice = voices[who];
    const key = crypto.createHash('sha1').update(JSON.stringify([backend, voice, say, SHAPE[who], 3])).digest('hex');
    const file = path.join(dir, `${key}.f32`);
    let samples;
    if (fs.existsSync(file)) {
      const buf = fs.readFileSync(file);
      samples = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4).slice();
    } else {
      const raw = backend === 'deepgram' ? await deepgram(say, voice) : await kokoroWav(say, voice, SHAPE[who].speed);
      samples = shape(raw, who, raw.readUInt32LE(24));
      fs.writeFileSync(file, Buffer.from(samples.buffer));
    }
    clips[id] = { samples, duration: samples.length / RATE, mouth: mouthTrack(samples) };
  }
  return { backend, voices, clips, RATE, MOUTH_FPS };
}

module.exports = { synthesize, RATE, MOUTH_FPS };
