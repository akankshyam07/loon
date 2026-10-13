// Voice (DESIGN.md §3.16). Audio never leaves the Mac: the mic streams 16 kHz samples from the cat window,
// Silero VAD (sherpa-onnx) finds the end of the turn, Moonshine transcribes, brain/intents.js routes the text
// (templates before any model), and Kokoro speaks the reply sentence by sentence through the cat window,
// where Chromium's echo cancellation can hear it. macOS `say` covers the moments before Kokoro has loaded.
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { route, createSentenceSplitter, speakable, wakePhrase } = require('../brain/intents');
const { describe } = require('../brain/commands');

const MODELS = {
  vad: { file: 'silero_vad_v5.onnx', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad_v5.onnx', mb: 2 },
  stt: { dir: 'sherpa-onnx-moonshine-base-en-int8', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-moonshine-base-en-int8.tar.bz2', mb: 239 },
};
const SAMPLE_RATE = 16000;

class VoiceEngine {
  constructor(dir) {
    this.dir = dir;
    this.recognizer = null;
    this.vad = null;
    this.tts = null; // true once Kokoro has loaded in the host
    this.ttsLoading = null;
    this.ttsHost = null;
  }

  modelsReady() {
    return fs.existsSync(path.join(this.dir, MODELS.vad.file)) && fs.existsSync(path.join(this.dir, MODELS.stt.dir, 'tokens.txt'));
  }

  // One-time download (~241 MB) from the sherpa-onnx releases; progress 0..1.
  async downloadModels(onProgress = () => {}) {
    fs.mkdirSync(this.dir, { recursive: true });
    const vadFile = path.join(this.dir, MODELS.vad.file);
    if (!fs.existsSync(vadFile)) fs.writeFileSync(vadFile, Buffer.from(await (await fetch(MODELS.vad.url)).arrayBuffer()));
    if (!fs.existsSync(path.join(this.dir, MODELS.stt.dir, 'tokens.txt'))) {
      const archive = path.join(this.dir, 'stt.tar.bz2');
      const res = await fetch(MODELS.stt.url);
      const total = Number(res.headers.get('content-length')) || MODELS.stt.mb * 2 ** 20;
      const out = fs.createWriteStream(archive);
      let done = 0;
      for await (const chunk of res.body) {
        out.write(chunk);
        done += chunk.length;
        onProgress(done / total);
      }
      await new Promise((r) => out.end(r));
      await new Promise((resolve, reject) => execFile('tar', ['-xjf', archive, '-C', this.dir], (err) => (err ? reject(err) : resolve())));
      fs.rmSync(archive);
    }
    onProgress(1);
  }

  sherpa() {
    return require('sherpa-onnx-node');
  }

  transcribe(samples) {
    if (!this.recognizer) {
      const dir = path.join(this.dir, MODELS.stt.dir);
      this.recognizer = new (this.sherpa().OfflineRecognizer)({
        featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
        modelConfig: {
          moonshine: {
            preprocessor: path.join(dir, 'preprocess.onnx'),
            encoder: path.join(dir, 'encode.int8.onnx'),
            uncachedDecoder: path.join(dir, 'uncached_decode.int8.onnx'),
            cachedDecoder: path.join(dir, 'cached_decode.int8.onnx'),
          },
          tokens: path.join(dir, 'tokens.txt'),
          numThreads: 2,
          provider: 'cpu',
          debug: 0,
        },
      });
    }
    const stream = this.recognizer.createStream();
    stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples });
    this.recognizer.decode(stream);
    return this.recognizer.getResult(stream).text.trim();
  }

  // Streaming end-of-turn detection: ≥700 ms of silence ends an utterance (GLaDOS used 640 ms).
  createTurnDetector(onUtterance) {
    const sherpa = this.sherpa();
    const vad = new sherpa.Vad({
      sileroVad: { model: path.join(this.dir, MODELS.vad.file), threshold: 0.5, minSpeechDuration: 0.25, minSilenceDuration: 0.7, windowSize: 512 },
      sampleRate: SAMPLE_RATE,
      debug: false,
      numThreads: 1,
    }, 30);
    let pending = new Float32Array(0);
    const drain = () => {
      while (!vad.isEmpty()) {
        const segment = vad.front(false);
        vad.pop();
        onUtterance(Float32Array.from(segment.samples));
      }
    };
    return {
      push(chunk) {
        const merged = new Float32Array(pending.length + chunk.length);
        merged.set(pending);
        merged.set(chunk, pending.length);
        let offset = 0;
        for (; offset + 512 <= merged.length; offset += 512) vad.acceptWaveform(merged.subarray(offset, offset + 512));
        pending = merged.slice(offset);
        drain();
      },
      speaking: () => vad.isDetected(),
      flush() {
        vad.flush();
        drain();
      },
    };
  }

  // Kokoro runs in main/tts-host.js (a utility process), never on the main thread.
  ttsCall(payload, timeoutMs) {
    if (!this.ttsHost) {
      const script = path.join(__dirname, 'tts-host.js');
      const env = { ...process.env };
      let electron = null;
      try { electron = require('electron'); } catch { /* plain Node (tests) */ }
      const host = electron?.utilityProcess
        ? electron.utilityProcess.fork(script, [], { env, serviceName: 'loon-voice' })
        : require('child_process').fork(script, [], { env, stdio: 'ignore', serialization: 'advanced' });
      host.pending = new Map();
      host.nextId = 1;
      host.on('message', (m) => {
        const waiter = host.pending.get(m.id);
        host.pending.delete(m.id);
        if (m.error) waiter?.reject(new Error(m.error));
        else waiter?.resolve(m);
      });
      host.on('exit', () => {
        for (const { reject } of host.pending.values()) reject(new Error('Kokoro stopped'));
        if (this.ttsHost === host) Object.assign(this, { ttsHost: null, tts: null, ttsLoading: null });
      });
      this.ttsHost = host;
    }
    const host = this.ttsHost;
    const id = host.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { host.pending.delete(id); reject(new Error('Kokoro timed out')); }, timeoutMs);
      host.pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      if (host.send) host.send({ id, ...payload }); // child_process
      else host.postMessage({ id, ...payload }); // Electron utilityProcess
    });
  }

  loadTts() {
    this.ttsLoading ??= this.ttsCall({ type: 'load', cacheDir: path.join(this.dir, 'tts') }, 10 * 60000)
      .then(() => { this.tts = true; return true; })
      .catch((err) => {
        console.warn('[voice] Kokoro unavailable, using macOS say:', err.message);
        this.ttsLoading = null;
        return null;
      });
    return this.ttsLoading;
  }

  // → { samples: Float32Array, sampleRate } or null before Kokoro has loaded
  async synthesize(text, voice = 'af_heart') {
    if (!this.tts) return null;
    const { samples, sampleRate } = await this.ttsCall({ type: 'speak', text, voice }, 60000);
    return { samples, sampleRate };
  }

  stopTts() {
    this.ttsHost?.kill();
  }
}

// ---------- controller: one conversation turn at a time ----------
function createVoiceController({ engine, ui, session, setToggle, settings }) {
  let listening = false;
  let detector = null;
  let pendingConfirm = null; // { id, command }
  let speakQueue = Promise.resolve();
  let speechEpoch = 0; // bumps on stop, so queued sentences from an old turn are dropped
  let voiceTurn = null; // { spoken: 0, splitter, truncated } while the current answer came from voice
  let followUpTimer = null;
  let confirmedByVoice = null; // id of a confirm card the user said "yes" to
  let wake = null; // { detector } while the opt-in "Hey Loon" mode keeps the mic open

  const status = (state, extra = {}) => ui.cat('voice', { state, ...extra });

  async function start(reason = 'hotkey') {
    if (listening) return stop();
    if (!engine.modelsReady()) {
      ui.showNotice('Voice needs a one-time download of the speech models (~240 MB, open source, runs on this Mac).', true);
      return;
    }
    stopSpeaking();
    if (ui.micAllowed && !ui.micAllowed()) return; // the selftest drives voice with audio files, never the mic
    listening = true;
    detector = engine.createTurnDetector(onUtterance);
    status('listening', { reason });
    ui.mic(true);
    engine.loadTts(); // warm up while the user talks
    clearTimeout(followUpTimer);
    if (reason === 'followup') followUpTimer = setTimeout(() => { if (listening && !detector.speaking()) stop(); }, 5000);
  }

  function stop() {
    if (!listening) return;
    listening = false;
    if (!wake) ui.mic(false);
    detector?.flush();
    detector = null;
    status(wake ? 'wake' : 'idle');
  }

  function onChunk(samples) {
    if (listening && detector) detector.push(samples);
    else if (wake && !busy()) wake.detector.push(samples);
  }

  const busy = () => listening || voiceTurn || pendingConfirm;

  // "Hey Loon" (opt-in, off by default): the mic stays open, each utterance is transcribed on this Mac, and only
  // ones that start with the wake phrase are acted on. Everything else is dropped immediately, never stored.
  function setWake(on) {
    if (on && !wake && engine.modelsReady() && !settings.focus && !settings.privacy && (!ui.micAllowed || ui.micAllowed())) {
      wake = { detector: engine.createTurnDetector(onWakeUtterance) };
      ui.mic(true);
      status('wake');
    } else if (!on && wake) {
      wake = null;
      if (!listening) ui.mic(false);
      status('idle');
    }
  }

  function onWakeUtterance(samples) {
    if (busy() || samples.length > 16000 * 12) return; // long monologues aren't commands for Loon
    const heard = wakePhrase(engine.transcribe(samples));
    if (!heard) return;
    if (heard.rest.split(/\s+/).length >= 2) {
      status('thinking');
      handleTranscript(heard.rest);
    } else {
      say('Yes?').then(() => start('followup'));
    }
  }

  function onUtterance(samples) {
    if (!listening) return;
    stop(); // one utterance per turn; replies re-open the mic only for follow-ups
    status('thinking');
    const transcript = engine.transcribe(samples);
    handleTranscript(transcript);
  }

  function handleTranscript(transcript) {
    const r = route(transcript, { awaitingConfirmation: Boolean(pendingConfirm), speaking: false });
    ui.transcript(transcript);
    switch (r.type) {
      case 'empty':
        status('idle');
        return r;
      case 'stop':
        stopSpeaking();
        if (pendingConfirm) ui.cancelConfirm(pendingConfirm.id);
        pendingConfirm = null;
        return r;
      case 'yes':
        if (pendingConfirm) {
          confirmedByVoice = pendingConfirm.id;
          ui.confirm(pendingConfirm);
        }
        pendingConfirm = null;
        return r;
      case 'no':
        if (pendingConfirm) ui.cancelConfirm(pendingConfirm.id);
        pendingConfirm = null;
        say('Okay, cancelled.');
        return r;
      case 'toggle':
        setToggle(r.key, r.value);
        say(`${r.key === 'focus' ? 'Focus' : 'Privacy'} mode ${r.value ? 'on' : 'off'}.`);
        return r;
      case 'task':
        if (r.needs === 'selection' && session.mode !== 'selection' && session.mode !== 'app') {
          say('Select some text first, then ask me again.');
          return r;
        }
        voiceTurn = { spoken: 0, splitter: null };
        ui.runTask(r.task, r.text);
        return r;
      default: // command or question: goes through the bubble exactly like typing it
        voiceTurn = { spoken: 0, splitter: null };
        ui.ask(r.type === 'command' ? transcript : r.text);
        return r;
    }
  }

  // Watches what the bubble is shown, to speak the right parts of it.
  function observe(type, payload) {
    if (type === 'confirm' && voiceTurn) {
      pendingConfirm = { id: payload.id, command: payload.command };
      voiceTurn = null;
      say(`${describe(payload.command)}. Say yes, or click.`).then(() => start('followup'));
      return;
    }
    if (type === 'action-done' && payload.message) {
      if (voiceTurn || payload.id === confirmedByVoice) say(payload.ok ? 'Done.' : "That didn't work.");
      voiceTurn = null;
      confirmedByVoice = null;
      return;
    }
    if (!voiceTurn || settings.speakReplies === 'never') return;
    if (type === 'chunk' && payload.restart) {
      stopSpeaking();
      Object.assign(voiceTurn, { spoken: 0, splitter: null, truncated: false });
    } else if (type === 'chunk') {
      voiceTurn.splitter ??= createSentenceSplitter((sentence) => {
        if (voiceTurn.spoken >= 2) { voiceTurn.truncated = true; return; }
        const { text } = speakable(sentence, 1);
        if (!text) return;
        voiceTurn.spoken++;
        say(text);
      });
      voiceTurn.splitter.push(payload.chunk);
    } else if (type === 'done') {
      voiceTurn.splitter?.flush();
      const endsWithQuestion = /\?\s*$/.test(payload.text || '');
      if (voiceTurn.truncated || voiceTurn.spoken === 0) say(voiceTurn.spoken === 0 ? 'Here you go.' : 'The rest is in the bubble.');
      voiceTurn = null;
      if (endsWithQuestion) speakQueue.then(() => start('followup'));
    } else if (type === 'error') {
      say('Sorry, my brain hiccuped.');
      voiceTurn = null;
    }
  }

  // Queue sentences so they play in order; generation of the next overlaps playback of the current one.
  function say(text) {
    const epoch = speechEpoch;
    const audio = engine.synthesize(text).catch(() => null);
    speakQueue = speakQueue.then(async () => {
      if (epoch !== speechEpoch) return;
      const clip = await audio;
      if (epoch !== speechEpoch) return;
      status('speaking');
      if (clip) await ui.play(clip);
      else await ui.sayFallback(text);
      status('idle');
    });
    return speakQueue;
  }

  function stopSpeaking() {
    speechEpoch++;
    ui.stopAudio();
    speakQueue = Promise.resolve();
  }

  return {
    start, stop, onChunk, handleTranscript, observe, say, stopSpeaking, setWake,
    get waking() { return Boolean(wake); },
    get listening() { return listening; },
    get pendingConfirm() { return pendingConfirm; },
  };
}

module.exports = { VoiceEngine, createVoiceController, SAMPLE_RATE };
