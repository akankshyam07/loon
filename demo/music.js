// An original chiptune loop and sound effects for the demo, synthesized from scratch (square, triangle and noise
// channels, like an old handheld), then mixed with the cats' voices: the music ducks while someone talks and fades in
// and out. Written for Loon; MIT like the rest of the repo. Deterministic: the same cues give the same file.
const fs = require('fs');

const RATE = 44100;
const BPM = 124;
const EIGHTH = 60 / BPM / 2;
const MUSIC_LEVEL = 0.65; // the tune sits well under the voices
const VOICE_LEVEL = 0.95;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const NOTE = Object.fromEntries(['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'].flatMap((name, i) => [2, 3, 4, 5, 6, 7].map((oct) => [`${name}${oct}`, 12 * (oct + 1) + i])));

// I–V–vi–IV in C, two passes; the lead is an 8th-note line ('-' holds, '.' rests), the bass bounces octaves.
const CHORDS = ['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F'];
const TONES = { C: ['C', 'E', 'G'], G: ['G', 'B', 'D'], Am: ['A', 'C', 'E'], F: ['F', 'A', 'C'] };
const LEAD = [
  'E5 G5 C6 G5 A5 G5 E5 -', 'D5 G5 B5 G5 D6 - B5 .', 'C6 B5 A5 E5 A5 - C6 -', 'A5 G5 F5 A5 G5 - - .',
  'E5 G5 C6 E6 D6 C6 G5 -', 'B5 D6 G5 B5 A5 G5 D5 -', 'E5 A5 C6 A5 B5 C6 D6 E6', 'F6 E6 D6 C6 D6 - C6 .',
].map((bar) => bar.split(' '));

// ---------- oscillators and envelopes ----------
let noiseSeed = 1;
const noise = () => ((noiseSeed = (noiseSeed * 1103515245 + 12345) & 0x7fffffff) / 0x3fffffff - 1);
const square = (phase, duty) => ((phase % 1) < duty ? 1 : -1);
const triangle = (phase) => 1 - 4 * Math.abs((phase % 1) - 0.5);

function addTone(bufL, bufR, { start, dur, freq, wave = 'square', duty = 0.25, vol = 0.1, pan = 0, attack = 0.004, decay = 0.09, sustain = 0.6, release = 0.03, vibrato = 0, sweep = 0 }) {
  const n0 = Math.floor(start * RATE);
  const n = Math.floor((dur + release) * RATE);
  const l = vol * Math.min(1, 1 - pan);
  const r = vol * Math.min(1, 1 + pan);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const k = n0 + i;
    if (k < 0 || k >= bufL.length) continue;
    const t = i / RATE;
    const env = t < attack ? t / attack : t < attack + decay ? 1 - (1 - sustain) * ((t - attack) / decay) : t < dur ? sustain : sustain * Math.max(0, 1 - (t - dur) / release);
    const f = freq * (1 + sweep * t) * (vibrato && t > 0.12 ? 1 + vibrato * Math.sin(2 * Math.PI * 5.5 * t) : 1);
    phase += f / RATE;
    const v = (wave === 'square' ? square(phase, duty) : wave === 'triangle' ? triangle(phase) : noise()) * env;
    bufL[k] += v * l;
    bufR[k] += v * r;
  }
}

// ---------- drums ----------
function kick(L, R, start) {
  const n0 = Math.floor(start * RATE);
  let phase = 0;
  for (let i = 0; i < 0.14 * RATE; i++) {
    const t = i / RATE;
    phase += (55 + 110 * Math.exp(-t * 30)) / RATE;
    const v = Math.sin(2 * Math.PI * phase) * Math.exp(-t * 22) * 0.32;
    if (n0 + i < L.length) { L[n0 + i] += v; R[n0 + i] += v; }
  }
}
function hiss(L, R, start, len, vol, bright) {
  const n0 = Math.floor(start * RATE);
  let last = 0;
  for (let i = 0; i < len * RATE; i++) {
    const t = i / RATE;
    const w = noise();
    const v = (bright ? w - last : w) * Math.exp(-t * (bright ? 90 : 26)) * vol; // a first difference brightens it
    last = w;
    if (n0 + i < L.length) { L[n0 + i] += v; R[n0 + i] += v; }
  }
}

function music(duration) {
  const L = new Float32Array(Math.ceil(duration * RATE));
  const R = new Float32Array(L.length);
  const bars = Math.ceil(duration / (EIGHTH * 8));
  for (let b = 0; b < bars; b++) {
    const t0 = b * EIGHTH * 8;
    const chord = CHORDS[b % 8];
    const tones = TONES[chord];
    const intro = b < 2; // bass and sparkles first, the tune comes in after the title
    for (let e = 0; e < 8; e++) {
      addTone(L, R, { start: t0 + e * EIGHTH, dur: EIGHTH * 0.8, freq: midi(NOTE[`${tones[0]}${e % 2 ? 3 : 2}`]), wave: 'triangle', vol: 0.16, decay: 0.05, sustain: 0.8 });
    }
    for (let s = 0; s < 16; s++) {
      const note = [...tones, tones[0]][s % 4];
      addTone(L, R, { start: t0 + s * EIGHTH / 2, dur: EIGHTH * 0.35, freq: midi(NOTE[`${note}${s % 4 === 3 ? 6 : 5}`]), duty: 0.125, vol: 0.022, pan: -0.45, decay: 0.04, sustain: 0.3 });
    }
    if (!intro) {
      LEAD[b % 8].forEach((tok, e) => {
        if (tok === '-' || tok === '.') return;
        let len = 1;
        while (LEAD[b % 8][e + len] === '-') len++;
        addTone(L, R, { start: t0 + e * EIGHTH, dur: EIGHTH * len * 0.85, freq: midi(NOTE[tok]), duty: 0.25, vol: 0.055, pan: 0.15, vibrato: 0.006 });
      });
      for (let beat = 0; beat < 4; beat++) {
        const bt = t0 + beat * EIGHTH * 2;
        if (beat % 2 === 0) kick(L, R, bt);
        else hiss(L, R, bt, 0.14, 0.07, false);
        hiss(L, R, bt + EIGHTH, 0.04, 0.035, true);
      }
    }
  }
  return { L, R };
}

// ---------- sound effects ----------
const SFX = {
  sparkle: (L, R, t) => ['C6', 'E6', 'G6', 'C7', 'E7'].forEach((n, i) => addTone(L, R, { start: t + i * 0.038, dur: 0.05, freq: midi(NOTE[n]), duty: 0.25, vol: 0.06, pan: -0.5 + i * 0.25, decay: 0.03, sustain: 0.4, release: 0.06 })),
  pop: (L, R, t) => addTone(L, R, { start: t, dur: 0.06, freq: 420, sweep: 9, duty: 0.5, vol: 0.07, decay: 0.05, sustain: 0.2, release: 0.03 }),
  click: (L, R, t) => addTone(L, R, { start: t, dur: 0.012, freq: 1800, duty: 0.5, vol: 0.03, decay: 0.01, sustain: 0, release: 0.005 }),
  munch: (L, R, t) => hiss(L, R, t, 0.05, 0.12, false),
  heart: (L, R, t) => {
    addTone(L, R, { start: t, dur: 0.09, freq: midi(NOTE.E6), wave: 'triangle', vol: 0.22, decay: 0.05, sustain: 0.5, release: 0.05 });
    addTone(L, R, { start: t + 0.11, dur: 0.24, freq: midi(NOTE.A6), wave: 'triangle', vol: 0.22, decay: 0.1, sustain: 0.5, release: 0.12 });
  },
};

// cues: { sfx: [{ t, kind }], voice: [{ t, id }] }; clips: { id: { samples } } at RATE → stereo Float32 arrays
function mix({ duration, cues, clips }) {
  const { L, R } = music(duration);
  // ducking: the music drops to 40% while a voice plays (with a little lead-in and tail), smoothed so it breathes
  const target = new Float32Array(L.length).fill(1);
  for (const { t, id } of cues.voice) {
    const a = Math.max(0, Math.floor((t - 0.08) * RATE));
    const b = Math.min(L.length, Math.floor((t + clips[id].samples.length / RATE + 0.15) * RATE));
    target.fill(0.35, a, b);
  }
  let g = 1;
  const k = 1 - Math.exp(-1 / (0.07 * RATE));
  for (let i = 0; i < L.length; i++) {
    g += (target[i] - g) * k;
    const fade = Math.min(1, i / (1.0 * RATE), (L.length - i) / (2.0 * RATE));
    L[i] *= g * fade * MUSIC_LEVEL;
    R[i] *= g * fade * MUSIC_LEVEL;
  }
  for (const { t, kind } of cues.sfx) SFX[kind](L, R, t);
  for (const { t, id } of cues.voice) {
    const s = clips[id].samples;
    const n0 = Math.floor(t * RATE);
    for (let i = 0; i < s.length && n0 + i < L.length; i++) { L[n0 + i] += s[i] * VOICE_LEVEL; R[n0 + i] += s[i] * VOICE_LEVEL; }
  }
  for (let i = 0; i < L.length; i++) { L[i] = Math.tanh(L[i] * 1.05); R[i] = Math.tanh(R[i] * 1.05); } // gentle safety limiter
  return { L, R };
}

function writeWav(file, { L, R }) {
  const data = Buffer.alloc(L.length * 4);
  for (let i = 0; i < L.length; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), i * 4 + 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8); head.write('fmt ', 12);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22); head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([head, data]));
}

module.exports = { mix, writeWav, RATE, BPM, SFX: Object.keys(SFX) };
