// "Your own API key" (DESIGN.md §3.17.2) against a local fake server on 127.0.0.1. Never calls a real provider.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const api = require('../brain/api-provider');
const { Resolver } = require('../brain/resolve');

const KEY = 'sk-test-SECRETSECRETSECRET1234';
const seen = [];
let mode = 'ok'; // ok | 401 | 429 | 500 | 400 | hang

const sse = (res, events, done) => {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const e of events) res.write(`${e.event ? `event: ${e.event}\n` : ''}data: ${typeof e.data === 'string' ? e.data : JSON.stringify(e.data)}\n\n`);
  if (done) res.write('data: [DONE]\n\n');
  res.end();
};

// Each provider's streaming format, split into a few pieces like the real ones.
const STREAMS = {
  anthropic: () => [
    { event: 'message_start', data: { type: 'message_start', message: {} } },
    ...['[mood:happy] ', 'Hello ', 'from Claude.'].map((text) => ({ event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } } })),
    { event: 'message_stop', data: { type: 'message_stop' } },
  ],
  openai: () => [
    ...['[mood:happy] ', 'Hello ', 'from OpenAI.'].map((delta) => ({ event: 'response.output_text.delta', data: { type: 'response.output_text.delta', delta } })),
    { event: 'response.completed', data: { type: 'response.completed', response: {} } },
  ],
  gemini: () => ['[mood:happy] ', 'Hello ', 'from Gemini.'].map((text) => ({ data: { candidates: [{ content: { role: 'model', parts: [{ text }] } }] } })),
  custom: () => ['[mood:happy] ', 'Hello ', 'from custom.'].map((content) => ({ data: { choices: [{ delta: { content } }] } })),
};

const providerOf = (url) => (url.startsWith('/v1/messages') ? 'anthropic' : url.startsWith('/responses') ? 'openai' : url.includes(':streamGenerateContent') ? 'gemini' : 'custom');

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    seen.push({ url: req.url, method: req.method, headers: req.headers, body: body ? JSON.parse(body) : null });
    if (mode === 'hang') return; // never answers
    if (mode === '401') { res.writeHead(401); return res.end(JSON.stringify({ error: { message: `Incorrect API key provided: ${KEY}` } })); }
    if (mode === '429') { res.writeHead(429); return res.end('{"error":{"message":"quota"}}'); }
    if (mode === '500') { res.writeHead(500); return res.end('oops'); }
    if (mode === '400') { res.writeHead(400); return res.end(JSON.stringify([{ error: { message: `bad model, your key ${KEY} is fine` } }])); }
    if (req.method === 'GET') { res.writeHead(200); return res.end('{"data":[]}'); }
    sse(res, STREAMS[providerOf(req.url)](), true);
  });
});

let base;
test.before(() => new Promise((resolve) => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); })));
test.after(() => server.close());
test.beforeEach(() => { mode = 'ok'; seen.length = 0; });

const ask = (provider, opts = {}) => {
  const pieces = [];
  return api.ask({ provider, key: KEY, baseUrl: base, model: 'm-1', system: 'SYS', prompt: 'hi', onText: (t) => pieces.push(t), ...opts })
    .then((text) => ({ text, pieces }));
};

test('each provider streams text in its own wire format with its own auth header', async () => {
  for (const [provider, expected] of [['anthropic', 'Claude'], ['openai', 'OpenAI'], ['gemini', 'Gemini'], ['custom', 'custom']]) {
    seen.length = 0;
    const { text, pieces } = await ask(provider);
    assert.strictEqual(text, `[mood:happy] Hello from ${expected}.`);
    assert.strictEqual(pieces.length, 3, `${provider} streamed in pieces`);
    const { url, headers, body } = seen[0];
    if (provider === 'anthropic') {
      assert.strictEqual(url, '/v1/messages');
      assert.strictEqual(headers['x-api-key'], KEY);
      assert.strictEqual(headers['anthropic-version'], '2023-06-01');
      assert.deepStrictEqual([body.model, body.system, body.stream, body.messages[0].content], ['m-1', 'SYS', true, 'hi']);
    } else if (provider === 'openai') {
      assert.strictEqual(url, '/responses');
      assert.strictEqual(headers.authorization, `Bearer ${KEY}`);
      assert.deepStrictEqual([body.model, body.instructions, body.input, body.stream], ['m-1', 'SYS', 'hi', true]);
    } else if (provider === 'gemini') {
      assert.strictEqual(url, '/models/m-1:streamGenerateContent?alt=sse');
      assert.strictEqual(headers['x-goog-api-key'], KEY);
      assert.strictEqual(body.systemInstruction.parts[0].text, 'SYS');
    } else {
      assert.strictEqual(url, '/chat/completions');
      assert.deepStrictEqual(body.messages.map((m) => m.role), ['system', 'user']);
    }
    assert.ok(!url.includes(KEY), 'the key is never in the URL');
  }
});

test('HTTP errors map to clear messages that never contain the key', async () => {
  for (const [m, re] of [['401', /rejected the API key/], ['429', /rate limit or ran out of quota/], ['500', /having trouble right now \(500\)/], ['400', /said \(400\): bad model/]]) {
    mode = m;
    for (const provider of ['anthropic', 'openai', 'gemini', 'custom']) {
      const err = await ask(provider).then(() => null, (e) => e);
      assert.match(err.message, re, `${provider} ${m}`);
      assert.ok(!err.message.includes(KEY) && !err.message.includes('SECRET'), `${provider} ${m} leaks nothing`);
    }
  }
});

test('cancel and timeout stop the request', async () => {
  mode = 'hang';
  const controller = new AbortController();
  const pending = ask('anthropic', { signal: controller.signal });
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(pending, /Cancelled/);
  await assert.rejects(ask('openai', { timeoutMs: 80 }), /took too long/);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(ask('gemini', { signal: aborted.signal }), /Cancelled/);
});

test('redaction runs on the whole prompt before it is sent', async () => {
  await ask('anthropic', { prompt: 'my card 4111 1111 1111 1111 and key sk-ant-abcdefghijklmnopqrstuvwxyz0123' });
  const sent = seen[0].body.messages[0].content;
  assert.ok(!sent.includes('4111') && !sent.includes('sk-ant-'), sent);
  assert.match(sent, /\[redacted:card\]/);
});

test('base URLs: https anywhere, plain http only for this Mac', async () => {
  assert.strictEqual(api.checkBaseUrl('https://openrouter.ai/api/v1/'), 'https://openrouter.ai/api/v1');
  assert.strictEqual(api.checkBaseUrl('http://localhost:1234/v1'), 'http://localhost:1234/v1');
  assert.strictEqual(api.checkBaseUrl('http://127.0.0.1:8080/v1'), 'http://127.0.0.1:8080/v1');
  for (const bad of ['http://example.com/v1', 'http://192.168.1.5:1234/v1', 'ftp://x.y', 'not a url', 'https://user:pw@x.com']) {
    assert.throws(() => api.checkBaseUrl(bad), undefined, bad);
  }
  await assert.rejects(api.ask({ provider: 'custom', baseUrl: 'http://example.com/v1', model: 'x', prompt: 'hi' }), /https/);
  assert.throws(() => api.cleanConfig({ provider: 'custom', baseUrl: 'http://evil.example/v1' }), /https/);
  assert.throws(() => api.cleanConfig({ provider: 'openai', normal: 'gpt; rm -rf' }), /Model names/);
  assert.deepStrictEqual(api.cleanConfig({ provider: 'anthropic', normal: 'claude-haiku-5-5', hard: 'claude-opus-5-5', baseUrl: 'https://ignored' }),
    { provider: 'anthropic', baseUrl: '', normal: '', hard: 'claude-opus-5-5' }); // defaults stored as '' so they follow updates
});

test('missing key or model gives a setup hint, and testKey checks without generating', async () => {
  await assert.rejects(api.ask({ provider: 'anthropic', model: 'x', prompt: 'hi' }), /Add your Anthropic API key/);
  await assert.rejects(api.ask({ provider: 'custom', baseUrl: base, prompt: 'hi' }), /Add a model name/);
  assert.deepStrictEqual(await api.testKey({ provider: 'openai', key: KEY, baseUrl: base }), { ok: true });
  assert.strictEqual(seen.at(-1).method, 'GET');
  mode = '401';
  const bad = await api.testKey({ provider: 'anthropic', key: KEY, baseUrl: base });
  assert.strictEqual(bad.ok, false);
  assert.match(bad.error, /rejected/);
});

// Stand-in for Electron safeStorage: reversible, but the file must not contain the plain key.
const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(`enc:${Buffer.from(s).toString('hex')}`),
  decryptString: (b) => Buffer.from(b.toString().slice(4), 'hex').toString(),
};

test('key store: encrypted round trip in its own file, hints only in the Settings snapshot', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-keys-'));
  const file = path.join(dir, 'api-keys.json');
  const keys = new api.KeyStore(file, fakeSafeStorage);
  keys.save('anthropic', `  ${KEY}\n`);
  assert.strictEqual(keys.get('anthropic'), KEY);
  assert.ok(!fs.readFileSync(file, 'utf8').includes(KEY), 'stored encrypted');
  assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepStrictEqual(keys.hints(), { anthropic: { saved: true, last4: '1234' } });

  const settings = { cloudCli: 'api', privacy: false, api: { provider: 'anthropic' } };
  const snap = JSON.stringify({ ...settings, ...api.snapshot(settings, keys) });
  assert.ok(!snap.includes(KEY) && !snap.includes('SECRET'), 'renderer snapshot has no key');
  assert.match(snap, /"last4":"1234"/);

  assert.throws(() => keys.save('anthropic', 'has spaces in it'), /doesn't look like/);
  assert.throws(() => new api.KeyStore(file, { ...fakeSafeStorage, isEncryptionAvailable: () => false }).save('openai', KEY), /Keychain/);
  keys.remove('anthropic');
  assert.strictEqual(keys.get('anthropic'), null);
  assert.deepStrictEqual(keys.hints(), {});
});

test('route: defaults per provider, hard model for deeper, label says "your API key"', () => {
  const keys = { get: () => KEY };
  const r = api.route({ api: { provider: 'gemini' } }, keys);
  assert.deepStrictEqual([r.model(false), r.model(true)], ['gemini-3.5-flash-lite', 'gemini-3.8-flash']);
  assert.strictEqual(api.route({}, keys).label(false), 'Anthropic claude-haiku-5-5 (your API key)');
  assert.strictEqual(api.route({ api: { provider: 'openai', hard: 'gpt-x' } }, keys).label(true), 'OpenAI gpt-x (your API key)');
});

// Resolver with fake local models, a fake plan CLI and a fake API route: records which backend answered.
function setup(settings = {}, { fast = '[mood:happy] Paris.', smart = '[mood:focused] REST vs GraphQL, done well.', hasSmart = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loon-apiroute-'));
  const calls = [];
  const brain = {
    modelId: () => 'fake',
    hasSmart: () => hasSmart,
    chat: async (_p, { onText, smart: s }) => { calls.push(s ? 'smart' : 'fast'); onText(s ? smart : fast); },
  };
  const cli = { ask: async (_w, { onText }) => { calls.push('cli'); onText('[mood:happy] Plan answer.'); }, label: () => 'Claude (your plan)' };
  const apiFake = {
    route: () => ({
      provider: 'anthropic',
      model: (hard) => (hard ? 'big' : 'small'),
      label: (hard) => `Anthropic ${hard ? 'big' : 'small'} (your API key)`,
      ask: async ({ onText, hard, prompt }) => { calls.push(hard ? 'api:hard' : 'api:normal'); apiFake.prompts.push(prompt); onText('[mood:focused] API answer.'); },
    }),
    prompts: [],
  };
  const resolver = new Resolver({ brain, cli, api: apiFake, settings: { privacy: false, cloudCli: 'off', ...settings }, cacheFile: path.join(dir, 'c.json'), countsFile: path.join(dir, 'n.json') });
  return { resolver, calls, apiFake };
}

const HARD = 'Compare REST and GraphQL and explain the trade-offs for a mobile app, then design a plan to migrate.';
const go = (resolver, q, opts = {}) => resolver.ask(q, { onText: () => {}, ...opts });

test('resolver uses the API only when picked, never in Privacy mode or on private pages, and labels it honestly', async () => {
  const off = setup();
  assert.strictEqual((await go(off.resolver, HARD)).tier, 'local');
  assert.deepStrictEqual(off.calls, ['smart']);

  const plan = setup({ cloudCli: 'claude' });
  await go(plan.resolver, HARD);
  assert.deepStrictEqual(plan.calls, ['cli'], 'the plan setting never reaches the API');

  const on = setup({ cloudCli: 'api' });
  const r = await go(on.resolver, HARD);
  assert.deepStrictEqual([r.tier, r.detail, on.calls], ['cloud', 'Anthropic big (your API key) · routed: hard question', ['api:hard']]);
  assert.strictEqual(on.resolver.counts.tiers.api, 1);
  assert.strictEqual(on.resolver.counts.tiers.cloud, undefined, 'counted apart from the plan');

  const easy = setup({ cloudCli: 'api' });
  await go(easy.resolver, 'What is the capital of France?');
  assert.deepStrictEqual(easy.calls, ['fast']);

  const deeper = setup({ cloudCli: 'api' });
  await go(deeper.resolver, 'What is the capital of France?', { deeper: true });
  assert.deepStrictEqual(deeper.calls, ['api:hard']);

  const priv = setup({ cloudCli: 'api', privacy: true });
  await go(priv.resolver, HARD);
  await go(priv.resolver, 'What is a cat?', { deeper: true });
  assert.deepStrictEqual(priv.calls, ['smart', 'smart']);

  const sensitive = setup({ cloudCli: 'api' });
  await go(sensitive.resolver, HARD, { sensitive: true });
  assert.deepStrictEqual(sensitive.calls, ['smart']);

  const noBackend = new Resolver({ brain: { modelId: () => 'fake', hasSmart: () => false, chat: async (_p, { onText }) => onText('[mood:happy] ok') }, settings: { cloudCli: 'api' }, cacheFile: path.join(os.tmpdir(), `loon-nb-${process.pid}.json`), countsFile: path.join(os.tmpdir(), `loon-nbc-${process.pid}.json`) });
  assert.strictEqual((await go(noBackend, HARD)).tier, 'local', 'no API route wired: stays local');
});

test('a self-check upgrade uses the normal API model, and the prompt is redacted', async () => {
  const s = setup({ cloudCli: 'api' }, { fast: "[mood:confused] I'm not sure.", hasSmart: false });
  const r = await go(s.resolver, 'Why do cats knead blankets? My card is 4111 1111 1111 1111.');
  assert.deepStrictEqual(s.calls, ['fast', 'api:normal']);
  assert.match(r.detail, /^Anthropic small \(your API key\) · upgraded/);
  assert.ok(!s.apiFake.prompts[0].includes('4111'));
});
