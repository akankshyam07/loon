// Optional "Your own API key" (DESIGN.md §3.17.2): pay-per-use answers from Anthropic, OpenAI, Gemini or any
// OpenAI-compatible endpoint, for people who prefer that to the plan CLIs (brain/cli-provider.js). Off by default,
// only used when the user picks it in Settings, and never a silent fallback for the plan route.
// Keys live only in the main process, encrypted with Electron safeStorage (macOS Keychain) in their own file.
// They never reach a renderer, a log line, an error message or a cache key.
// `image` (PNG bytes, base64 here) is only ever a teach screenshot the user opted into sending (brain/vision.js).
const fs = require('fs');
const { redact } = require('./redact');

const PROVIDERS = {
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: { normal: 'claude-haiku-5-5', hard: 'claude-sonnet-5-5' },
    request: ({ baseUrl, key, model, system, prompt, maxTokens, image }) => ({
      url: `${baseUrl}/v1/messages`,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: {
        model, max_tokens: maxTokens, system, stream: true,
        messages: [{ role: 'user', content: image ? [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: image } }, { type: 'text', text: prompt }] : prompt }],
      },
    }),
    // content_block_delta carries the text; an `error` event can arrive mid-stream (e.g. overloaded).
    parse: (event) => {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') return event.delta.text;
      if (event.type === 'error') throw new Error(event.error?.message || 'stream error');
      return '';
    },
    check: ({ baseUrl, key }) => ({ url: `${baseUrl}/v1/models?limit=1`, headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } }),
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: { normal: 'gpt-6-luna', hard: 'gpt-6-astra' },
    // Responses API: current OpenAI models are documented there first.
    request: ({ baseUrl, key, model, system, prompt, maxTokens, image }) => ({
      url: `${baseUrl}/responses`,
      headers: { authorization: `Bearer ${key}` },
      body: {
        model, instructions: system, max_output_tokens: maxTokens, stream: true, store: false,
        input: image ? [{ role: 'user', content: [{ type: 'input_text', text: prompt }, { type: 'input_image', image_url: `data:image/png;base64,${image}` }] }] : prompt,
      },
    }),
    parse: (event) => {
      if (event.type === 'response.output_text.delta') return event.delta || '';
      if (event.type === 'error') throw new Error(event.message || 'stream error');
      if (event.type === 'response.failed') throw new Error(event.response?.error?.message || 'request failed');
      return '';
    },
    check: ({ baseUrl, key }) => ({ url: `${baseUrl}/models`, headers: { authorization: `Bearer ${key}` } }),
  },
  gemini: {
    name: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: { normal: 'gemini-3.5-flash-lite', hard: 'gemini-3.8-flash' }, // both on the Gemini API free tier
    request: ({ baseUrl, key, model, system, prompt, maxTokens, image }) => ({
      url: `${baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      headers: { 'x-goog-api-key': key },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [...(image ? [{ inline_data: { mime_type: 'image/png', data: image } }] : []), { text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      },
    }),
    parse: (event) => {
      if (event.error) throw new Error(event.error.message || 'stream error');
      return (event.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
    },
    check: ({ baseUrl, key }) => ({ url: `${baseUrl}/models?pageSize=1`, headers: { 'x-goog-api-key': key } }),
  },
  // OpenRouter, Groq, Together, LM Studio, llama-server…: Chat Completions is the shape they all share.
  custom: {
    name: 'Custom endpoint',
    baseUrl: '',
    models: { normal: '', hard: '' },
    request: ({ baseUrl, key, model, system, prompt, maxTokens, image }) => ({
      url: `${baseUrl}/chat/completions`,
      headers: key ? { authorization: `Bearer ${key}` } : {},
      body: {
        model, max_tokens: maxTokens, stream: true,
        messages: [{ role: 'system', content: system }, { role: 'user', content: image ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:image/png;base64,${image}` } }] : prompt }],
      },
    }),
    parse: (event) => {
      if (event.error) throw new Error(event.error.message || String(event.error));
      return event.choices?.[0]?.delta?.content || '';
    },
    check: ({ baseUrl, key }) => ({ url: `${baseUrl}/models`, headers: key ? { authorization: `Bearer ${key}` } : {} }),
  },
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// https everywhere; plain http only for a server on this Mac (LM Studio, llama-server).
function checkBaseUrl(raw) {
  let url;
  try {
    let text = String(raw || '').trim();
    // "localhost:11434/v1" has no scheme: assume http for this Mac and https for anything else.
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
      const host = new URL(`http://${text}`).hostname;
      text = `${LOCAL_HOSTS.has(host) ? 'http' : 'https'}://${text}`;
    }
    url = new URL(text);
  } catch {
    throw new Error('That base URL doesn\'t look right. Example: https://openrouter.ai/api/v1');
  }
  if (url.username || url.password) throw new Error('Put the key in the key field, not in the URL.');
  if (url.protocol === 'https:') return url.href.replace(/\/+$/, '');
  if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)) return url.href.replace(/\/+$/, '');
  throw new Error('Use an https:// URL. Plain http:// is only allowed for a server on this Mac (localhost).');
}

// The key and anything key-shaped never make it into a message the user (or a log) sees.
function scrub(text, key) {
  let out = String(text || '');
  if (key) out = out.split(key).join('[key]');
  return redact(out).text.trim().slice(0, 300);
}

function httpError(name, status, body, key) {
  if (status === 401 || status === 403) return new Error(`${name} rejected the API key. Check it in Settings → Smarter answers.`);
  if (status === 429) return new Error(`${name} says you hit a rate limit or ran out of quota. Wait a bit, or check your plan and billing with ${name}.`);
  if (status >= 500) return new Error(`${name} is having trouble right now (${status}). Try again in a bit.`);
  let message = body;
  try {
    const parsed = JSON.parse(body);
    const first = Array.isArray(parsed) ? parsed[0] : parsed; // Gemini sometimes wraps errors in an array
    message = first?.error?.message || first?.message || body;
  } catch {
    // plain text body
  }
  return new Error(`${name} said (${status}): ${scrub(message, key) || 'request failed'}`);
}

// Timeout and the bubble's cancel share one signal; the error says which one fired.
async function send(name, { url, headers, body }, { signal, timeoutMs, key }) {
  if (signal?.aborted) throw new Error('Cancelled');
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { ...(body && { 'content-type': 'application/json' }), ...headers },
      body: body && JSON.stringify(body),
      signal: combined,
    });
    if (!res.ok) throw httpError(name, res.status, await res.text().catch(() => ''), key);
    return { res, timeout };
  } catch (err) {
    throw abortError(name, err, signal, timeout, key);
  }
}

function abortError(name, err, signal, timeout, key) {
  if (signal?.aborted) return new Error('Cancelled');
  if (timeout.aborted) return new Error(`${name} took too long to answer.`);
  if (err.name === 'TypeError' && !err.status) return new Error(`Couldn't reach ${name}: ${scrub(err.cause?.code || err.message, key)}`);
  return err;
}

// Server-sent events: blank-line separated, `data:` lines hold JSON (OpenAI-style streams end with [DONE]).
async function* sseEvents(body) {
  const decoder = new TextDecoder();
  let buffered = '';
  for await (const chunk of body) {
    buffered += decoder.decode(chunk, { stream: true });
    const blocks = buffered.split(/\r?\n\r?\n/);
    buffered = blocks.pop();
    for (const block of blocks) {
      const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
      if (data && data !== '[DONE]') {
        try { yield JSON.parse(data); } catch { /* keep-alive or comment */ }
      }
    }
  }
}

// Streams the answer through onText; resolves with the full text.
async function ask({ provider, key, baseUrl, model, system = '', prompt, image = null, onText = () => {}, signal, timeoutMs = 120000, maxTokens = 2048 } = {}) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error(`Unknown provider: ${provider}`);
  if (!key && provider !== 'custom') throw new Error(`Add your ${p.name} API key in Settings → Smarter answers first.`);
  if (!model) throw new Error('Add a model name in Settings → Smarter answers first.');
  const base = checkBaseUrl(baseUrl || p.baseUrl || '');
  // Same rule as the plan route: the whole prompt (typed text, memory, context) is redacted before it leaves the Mac.
  const request = p.request({ baseUrl: base, key, model, system, prompt: redact(prompt).text, maxTokens, image: image ? Buffer.from(image).toString('base64') : null });
  const { res, timeout } = await send(p.name, request, { signal, timeoutMs, key });
  let text = '';
  try {
    for await (const event of sseEvents(res.body)) {
      const piece = p.parse(event);
      if (piece) { text += piece; onText(piece); }
    }
  } catch (err) {
    if (signal?.aborted || timeout.aborted) throw abortError(p.name, err, signal, timeout, key);
    throw new Error(`${p.name} said: ${scrub(err.message, key)}`);
  }
  if (!text) throw new Error(`${p.name} sent an empty answer.`);
  return text;
}

// "Test key": lists models, which checks the key without generating (or billing) anything.
async function testKey({ provider, key, baseUrl, timeoutMs = 15000 } = {}) {
  const p = PROVIDERS[provider];
  try {
    if (!p) throw new Error(`Unknown provider: ${provider}`);
    if (!key && provider !== 'custom') throw new Error('No key saved yet.');
    await send(p.name, p.check({ baseUrl: checkBaseUrl(baseUrl || p.baseUrl || ''), key }), { timeoutMs, key });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: scrub(err.message, key) };
  }
}

// Encrypted keys, one per provider, in their own file (never settings.json). `safeStorage` is Electron's.
class KeyStore {
  constructor(file, safeStorage) {
    this.file = file;
    this.safeStorage = safeStorage;
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return {};
    }
  }

  write(all) {
    fs.writeFileSync(this.file, JSON.stringify(all), { mode: 0o600 });
  }

  save(provider, key) {
    const clean = String(key || '').trim();
    if (!PROVIDERS[provider]) throw new Error('Unknown provider.');
    if (!clean || clean.length > 400 || /\s/.test(clean)) throw new Error('That doesn\'t look like an API key.');
    this.put(provider, clean);
  }

  // Any named secret (MCP servers keep their tokens in their own store file this way).
  put(name, value) {
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error('macOS Keychain encryption isn\'t available, so Loon won\'t store the key.');
    this.write({ ...this.read(), [name]: this.safeStorage.encryptString(String(value)).toString('base64') });
  }

  get(provider) {
    const blob = this.read()[provider];
    if (!blob) return null;
    try {
      return this.safeStorage.decryptString(Buffer.from(blob, 'base64'));
    } catch {
      return null; // encrypted on another Mac or another user: treat as not saved
    }
  }

  remove(provider) {
    const all = this.read();
    delete all[provider];
    this.write(all);
  }

  // What Settings may show: whether a key is saved and its last 4 characters. Never the key.
  hints() {
    const out = {};
    for (const provider of Object.keys(this.read())) {
      const key = this.get(provider);
      if (key) out[provider] = { saved: true, last4: key.slice(-4) };
    }
    return out;
  }
}

// The API settings with defaults filled in, as the resolver and Settings see them (no key in here).
function config(settings = {}) {
  const api = settings.api || {};
  const provider = PROVIDERS[api.provider] ? api.provider : 'anthropic';
  const defaults = PROVIDERS[provider].models;
  return { provider, baseUrl: api.baseUrl || '', normal: api.normal || defaults.normal, hard: api.hard || defaults.hard };
}

// The resolver's handle on the API backend. `hard` picks the hard model ("Go deeper", hard questions).
function route(settings, keys) {
  const cfg = config(settings);
  const name = PROVIDERS[cfg.provider].name;
  const model = (hard) => (hard ? cfg.hard : cfg.normal);
  return {
    provider: cfg.provider,
    model,
    label: (hard) => `${name} ${model(hard)} (your API key)`,
    ask: ({ hard, ...opts }) => ask({ ...opts, provider: cfg.provider, key: keys.get(cfg.provider), baseUrl: cfg.baseUrl, model: model(hard) }),
  };
}

// The part of the Settings snapshot about this feature: provider list, current config, saved-key hints.
function snapshot(settings, keys) {
  return {
    apiConfig: config(settings),
    apiProviders: Object.fromEntries(Object.entries(PROVIDERS).map(([id, p]) => [id, { name: p.name, models: p.models }])),
    apiKeys: keys.hints(),
  };
}

const MODEL_NAME = /^[\w.:/@-]{0,100}$/;

// Validates `settings-set { key: 'api' }` from the Settings window; returns the value to store or throws.
function cleanConfig(value = {}) {
  const provider = PROVIDERS[value.provider] ? value.provider : 'anthropic';
  const out = { provider, baseUrl: '', normal: '', hard: '' };
  for (const field of ['normal', 'hard']) {
    const name = String(value[field] || '').trim();
    if (!MODEL_NAME.test(name)) throw new Error('Model names are letters, numbers and . : / @ - _ only.');
    out[field] = name === PROVIDERS[provider].models[field] ? '' : name;
  }
  if (provider === 'custom' && value.baseUrl) out.baseUrl = checkBaseUrl(value.baseUrl);
  return out;
}

module.exports = { PROVIDERS, ask, testKey, checkBaseUrl, KeyStore, config, route, snapshot, cleanConfig };
