#!/usr/bin/env bash
# Puts what the selftest needs into Loon's data folder, skipping anything a cache already restored.
#   download-models.sh model   the local language model (MODEL_FILE from MODEL_URL)
#   download-models.sh voice   Silero VAD + Moonshine (sherpa-onnx releases) and Kokoro (Hugging Face)
set -euo pipefail
DATA="$HOME/Library/Application Support/loon"
fetch() { curl -fL --retry 3 --retry-delay 5 -o "$2.part" "$1" && mv "$2.part" "$2"; }

case "$1" in
  model)
    mkdir -p "$DATA/models"
    [ -s "$DATA/models/$MODEL_FILE" ] || fetch "$MODEL_URL" "$DATA/models/$MODEL_FILE"
    ls -lh "$DATA/models"
    ;;
  voice)
    VOICE="$DATA/voice"
    mkdir -p "$VOICE"
    [ -s "$VOICE/silero_vad_v5.onnx" ] || fetch "$VAD_URL" "$VOICE/silero_vad_v5.onnx"
    if [ ! -f "$VOICE/sherpa-onnx-moonshine-base-en-int8/tokens.txt" ]; then
      fetch "$STT_URL" "$VOICE/stt.tar.bz2"
      tar -xjf "$VOICE/stt.tar.bz2" -C "$VOICE"
      rm "$VOICE/stt.tar.bz2"
    fi
    # Kokoro and its default voice land in voice/tts the same way the app loads them.
    node -e "
      const { VoiceEngine } = require('./main/voice');
      const engine = new VoiceEngine(process.argv[1]);
      engine.loadTts().then(() => engine.synthesize('Hello.')).then((audio) => {
        if (!audio) { console.error('Kokoro did not load'); process.exit(1); }
        console.log('Kokoro ok:', audio.samples.length, 'samples');
      });
    " "$VOICE"
    du -sh "$VOICE"/*
    ;;
  *)
    echo "usage: $0 model|voice" >&2
    exit 2
    ;;
esac
