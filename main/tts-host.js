// Kokoro text to speech in its own process. onnxruntime-node runs each inference synchronously, so in the main
// process every sentence Loon speaks would freeze the cat, the bubble and all IPC for as long as it takes to synthesize.
const send = (message) => (process.parentPort ? process.parentPort.postMessage(message) : process.send(message));
const onMessage = (handler) => (process.parentPort ? process.parentPort.on('message', (e) => handler(e.data)) : process.on('message', handler));

let tts = null;
async function load(cacheDir) {
  const [{ KokoroTTS }, { env }] = await Promise.all([import('kokoro-js'), import('@huggingface/transformers')]);
  env.cacheDir = cacheDir;
  return KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
}

onMessage(async ({ id, type, cacheDir, text, voice }) => {
  try {
    if (type === 'load') {
      tts ??= load(cacheDir);
      await tts;
      return send({ id });
    }
    const audio = await (await tts).generate(text, { voice });
    send({ id, samples: audio.audio, sampleRate: audio.sampling_rate });
  } catch (err) {
    if (type === 'load') tts = null;
    send({ id, error: String(err?.message || err) });
  }
});
