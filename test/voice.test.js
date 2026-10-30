const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { route, createSentenceSplitter, speakable, wakePhrase } = require('../brain/intents');
const { normalizeSpoken } = require('../brain/commands');
const { VoiceEngine } = require('../main/voice');

// Home Assistant once shipped a regression that sent every command to the LLM; this list must never reach it.
const NEVER_THE_MODEL = [
  'Remind me to call mom at five', 'remind me to stretch in twenty minutes', 'Add dentist appointment Friday at three pm',
  'Schedule a meeting with Sam next Tuesday at ten am', 'Open Spotify', 'Open github.com', 'Find my resume',
  'Note: buy cat food', 'Remember that I am vegetarian', 'Forget that I am vegetarian',
  'Summarize this page', 'Hey Loon, summarize this page', "What's on this page?", 'What should I do here?',
  'What does this mean?', 'Explain this', 'Simplify this', 'Translate this', 'Define serendipity',
  'Which one is the cheapest?', "What's the best value?", 'What should I order?', 'Quiz me', 'What have I found?',
  'Turn on focus mode', 'Focus mode off', 'Go to sleep', 'Turn on privacy mode', 'Stop', 'Never mind',
];

test('common voice phrases route to templates or commands, never the model', () => {
  const leaked = NEVER_THE_MODEL.filter((p) => route(p).type === 'question');
  assert.deepStrictEqual(leaked, []);
});

test('spoken edits and explanations of a selection are templates', () => {
  const expected = {
    'Explain this to me': 'explain', 'explain it': 'explain', 'Make this shorter': 'shorter', 'shorten it': 'shorter',
    'Simplify it': 'simplify', 'make it easier': 'simplify', 'Rewrite this': 'rewrite',
    'Make this more professional': 'professional', 'make it friendlier': 'warmer', 'Summarize this': 'summarize',
    'make this a bit shorter': 'shorter', 'tighten this up': 'shorter', 'Rephrase this': 'rewrite',
    'make it sound professional': 'professional', 'rewrite this more professionally': 'professional',
    'Fix the grammar': 'fix_grammar', 'proofread this': 'fix_grammar', 'fix typos': 'fix_grammar',
    'fix my grammar': 'fix_grammar', 'check my spelling': 'fix_grammar', 'proofread': 'fix_grammar',
    'summarize this for me': 'summarize', 'sum this up': 'summarize', 'rewrite this warmer': 'warmer', 'make it short': 'shorter',
    'give me examples': 'examples',
    'Translate it': 'translate', 'Loon, translate this for me': 'translate', 'translate that into English': 'translate',
  };
  for (const [said, task] of Object.entries(expected)) {
    assert.deepStrictEqual(route(said), { type: 'task', task, needs: 'selection' }, said);
  }
  assert.strictEqual(route('Summarize this page').task, 'page_summary');
});

test('open questions still go to the model; yes/no only count while confirming', () => {
  assert.strictEqual(route('Why is the sky blue?').type, 'question');
  assert.strictEqual(route('What is a black hole?').text, 'What is a black hole?');
  assert.strictEqual(route('yes').type, 'question');
  assert.strictEqual(route('Yes.', { awaitingConfirmation: true }).type, 'yes');
  assert.strictEqual(route('Nope', { awaitingConfirmation: true }).type, 'no');
  assert.strictEqual(route('Stop!', { speaking: true }).type, 'stop');
  assert.deepStrictEqual(route('Define serendipity.'), { type: 'task', task: 'define', slot: 'text', text: 'serendipity' });
});

test('"Hey Loon" wake phrase: acts on commands after it, ignores everything else', () => {
  assert.deepStrictEqual(wakePhrase('Hey Loon, what time is it?'), { rest: 'what time is it?' });
  assert.deepStrictEqual(wakePhrase('Loon.'), { rest: '' });
  assert.strictEqual(wakePhrase('I was talking to my friend about balloons'), null);
  assert.strictEqual(wakePhrase('the lunar eclipse is tonight'), null);
});

test('spoken numbers become digits for dates only', () => {
  assert.strictEqual(normalizeSpoken('remind me at five thirty'), 'remind me at 5:30');
  assert.strictEqual(normalizeSpoken('in twenty five minutes.'), 'in 25 minutes');
  assert.strictEqual(route('Remind me to call mom at five').command.when.getHours(), 17);
});

test('streamed text splits into sentences; only prose gets spoken', () => {
  const got = [];
  const splitter = createSentenceSplitter((s) => got.push(s));
  for (const chunk of ['Hello th', 'ere. How ', 'are you? I am ', 'fine.']) splitter.push(chunk);
  splitter.flush();
  assert.deepStrictEqual(got, ['Hello there.', 'How are you?', 'I am fine.']);
  const { text, truncated } = speakable('The **24-pack** wins. It is 30% cheaper. Third.\n\n| a | b |\n|---|---|');
  assert.strictEqual(text, 'The 24-pack wins. It is 30% cheaper.');
  assert.strictEqual(truncated, true);
});

const engine = new VoiceEngine(path.join(os.homedir(), 'Library/Application Support/loon/voice'));
test('speech → end of turn → text, all on this Mac', { skip: !engine.modelsReady() && 'voice models not downloaded' }, () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'loon-voice-')), 'cmd.wav');
  execFileSync('say', ['-o', file, '--data-format=LEF32@16000', 'Remind me to call mom at five.']);
  const { samples } = require('sherpa-onnx-node').readWave(file);
  // a second of silence either side, streamed in 100 ms chunks as the mic would
  const padded = new Float32Array(samples.length + 32000);
  padded.set(samples, 16000);
  const utterances = [];
  const detector = engine.createTurnDetector((u) => utterances.push(u));
  for (let i = 0; i < padded.length; i += 1600) detector.push(padded.subarray(i, i + 1600));
  detector.flush();
  assert.strictEqual(utterances.length, 1);
  const text = engine.transcribe(utterances[0]);
  assert.match(text, /remind me to call mom at five/i);
  assert.strictEqual(route(text).type, 'command');
});

test('spoken confirmations, focus and define phrasings route to the right intent', () => {
  assert.strictEqual(route('Yes, do it.', { awaitingConfirmation: true }).type, 'yes');
  assert.strictEqual(route('No thanks', { awaitingConfirmation: true }).type, 'no');
  assert.strictEqual(route('not now', { awaitingConfirmation: true }).type, 'no');
  assert.deepStrictEqual(route('turn off focus'), { type: 'toggle', key: 'focus', value: false });
  assert.deepStrictEqual(route('go to sleep, Loon'), { type: 'toggle', key: 'focus', value: true });
  assert.deepStrictEqual(route('define: ephemeral'), { type: 'task', task: 'define', slot: 'text', text: 'ephemeral' });
  assert.strictEqual(route('define the word ephemeral').text, 'ephemeral');
});
