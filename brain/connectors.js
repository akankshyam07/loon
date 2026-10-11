// Local apps via OpenAPI (M6). FastAPI and many other frameworks publish /openapi.json; each operation becomes a
// tool. Routing is plain keyword scoring, and close calls become buttons for the user to pick, so no model is needed.
// Reads (GET) run directly; anything else goes through a confirm card. Only localhost apps can be connected.

const DEV_PORTS = [3000, 3001, 4000, 5000, 5001, 5173, 8000, 8001, 8080, 8888];
const SPEC_PATHS = ['/openapi.json', '/api/openapi.json', '/docs/openapi.json', '/v3/api-docs'];
const STOP = new Set(['a', 'an', 'the', 'to', 'for', 'of', 'in', 'on', 'my', 'me', 'please', 'can', 'you', 'show', 'get', 'and', 'with', 'from', 'all', 'some', 'ask', 'tell']);

const isLocal = (url) => {
  try {
    return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
};

const words = (text) => (text || '')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .toLowerCase()
  .split(/[^a-z0-9]+/)
  .filter((w) => w && !STOP.has(w))
  .map((w) => w.replace(/(ies)$/, 'y').replace(/(?<=[a-z]{3})s$/, ''));

async function fetchSpec(baseUrl, timeoutMs = 600) {
  for (const p of SPEC_PATHS) {
    try {
      const res = await fetch(baseUrl + p, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) continue;
      const spec = await res.json();
      if (spec.openapi || spec.swagger) return { spec, specPath: p };
    } catch {
      // not this one
    }
  }
  return null;
}

// Probes common dev ports on this machine only.
async function discover(ports = DEV_PORTS) {
  const found = await Promise.all(ports.map(async (port) => {
    const baseUrl = `http://127.0.0.1:${port}`;
    const hit = await fetchSpec(baseUrl);
    if (!hit) return null;
    const ops = parseSpec(hit.spec);
    return { baseUrl, specPath: hit.specPath, name: hit.spec.info?.title || `App on port ${port}`, operations: ops.length };
  }));
  return found.filter(Boolean);
}

function resolveRef(spec, schema) {
  let s = schema;
  for (let i = 0; s?.$ref && i < 5; i++) s = s.$ref.replace(/^#\//, '').split('/').reduce((o, k) => o?.[k], spec);
  return s || {};
}

function parseSpec(spec) {
  const ops = [];
  for (const [p, item] of Object.entries(spec.paths || {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const op = item[method];
      if (!op) continue;
      const params = [...(item.parameters || []), ...(op.parameters || [])]
        .map((x) => resolveRef(spec, x))
        .filter((x) => ['path', 'query'].includes(x.in))
        .map((x) => ({ name: x.name, in: x.in, required: Boolean(x.required || x.in === 'path'), type: resolveRef(spec, x.schema).type || 'string', description: x.description || '' }));
      const bodySchema = resolveRef(spec, op.requestBody?.content?.['application/json']?.schema);
      const required = new Set(bodySchema.required || []);
      const body = Object.entries(bodySchema.properties || {}).map(([name, sch]) => {
        const r = resolveRef(spec, sch);
        return { name, in: 'body', required: required.has(name), type: r.type || 'string', description: r.description || r.title || '' };
      });
      const id = op.operationId || `${method}_${p}`;
      const label = op.summary || id.replace(/_+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
      ops.push({
        id,
        method: method.toUpperCase(),
        path: p,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        read: method === 'get',
        params: [...params, ...body],
        keywords: words(`${op.summary || ''} ${op.operationId || ''} ${p.replace(/\{[^}]+\}/g, '')} ${(op.tags || []).join(' ')}`).filter((w) => !/^(get|post|put|patch|delete)$/.test(w) || w === method),
        // generic verbs only hint at the method, so "search" in a summary beats "search" implied by GET
        hints: words(method === 'get' ? 'list show find search view' : method === 'delete' ? 'delete remove' : 'add create save send new update put'),
      });
    }
  }
  return ops;
}

// Which connector a request names: "career: …", "ask career board to …", "… in career board".
function findConnector(text, connectors) {
  const lower = text.toLowerCase();
  let best = null;
  for (const c of connectors) {
    const names = [c.name, ...(c.aliases || [])].map((n) => n.toLowerCase());
    for (const n of names) {
      const first = n.split(/\s+/)[0];
      const at = lower.indexOf(n) >= 0 ? lower.indexOf(n) : lower.match(new RegExp(`(^|\\b)${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`))?.index;
      if (at == null || at < 0) continue;
      const len = lower.indexOf(n) >= 0 ? n.length : first.length;
      if (!best || len > best.len) best = { connector: c, at, len };
    }
  }
  if (!best) return null;
  const rest = (text.slice(0, best.at) + text.slice(best.at + best.len)).replace(/^[\s:,-]+|[\s?.!]+$/g, '').replace(/\b(ask|in|on|from|to|using)\s*$/i, '').replace(/^(to|for|in)\s+/i, '').trim();
  return { connector: best.connector, request: rest };
}

// Keyword scores with an IDF weight so words shared by every endpoint ("jobs") count less than distinctive ones.
function rank(request, ops) {
  const q = words(request);
  if (!q.length) return ops.filter((o) => o.read && !o.params.some((p) => p.required)).map((op) => ({ op, score: 0.5 }));
  const df = new Map();
  for (const op of ops) for (const w of new Set(op.keywords)) df.set(w, (df.get(w) || 0) + 1);
  return ops.map((op) => {
    const kws = new Set(op.keywords);
    const hints = new Set(op.hints);
    const score = q.reduce((sum, w) => sum + (kws.has(w) ? Math.log(1 + ops.length / (df.get(w) || 1)) : hints.has(w) ? 0.3 : 0), 0);
    return { op, score };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
}

// Fills obvious parameters from the request text and the page; anything else is left for the confirm card.
function fill(op, request, context = {}) {
  const leftover = words(request).filter((w) => !op.keywords.includes(w) && !op.hints.includes(w)).join(' ');
  const values = {};
  for (const p of op.params) {
    const n = p.name.toLowerCase();
    if (/^(url|link|href|source_?url|page_?url)$/.test(n) && context.url) values[p.name] = context.url;
    else if (/^(title|name|subject)$/.test(n) && context.title) values[p.name] = context.title;
    else if (/^(text|content|notes?|description|body|summary|selection)$/.test(n) && context.text) values[p.name] = context.text.slice(0, 4000);
    else if (/^(q|query|search|keywords?|term|filter)$/.test(n) && leftover) values[p.name] = leftover;
  }
  const missing = op.params.filter((p) => p.required && (values[p.name] == null || values[p.name] === ''));
  return { values, missing };
}

// → { kind: 'call', op, values, missing } | { kind: 'choose', options: [op…] } | { kind: 'none' }
function route(request, ops, context) {
  const ranked = rank(request, ops);
  if (!ranked.length) return { kind: 'none' };
  const [top, second] = ranked;
  const clear = !second || top.score >= second.score * 1.4;
  if (!clear) return { kind: 'choose', options: ranked.slice(0, 4).map((r) => r.op) };
  return { kind: 'call', op: top.op, ...fill(top.op, request, context) };
}

// Operations that can take a page: a write with a url-like body field.
function pageSenders(ops) {
  return ops.filter((op) => !op.read && op.params.some((p) => p.in === 'body' && /^(url|link|href|source_?url|page_?url)$/i.test(p.name)));
}

function buildRequest(baseUrl, op, values) {
  let p = op.path;
  const query = new URLSearchParams();
  const body = {};
  for (const param of op.params) {
    const v = values[param.name];
    if (v == null || v === '') continue;
    const typed = param.type === 'integer' || param.type === 'number' ? Number(v) : param.type === 'boolean' ? v === true || v === 'true' : v;
    if (param.in === 'path') p = p.replace(`{${param.name}}`, encodeURIComponent(v));
    else if (param.in === 'query') query.set(param.name, v);
    else body[param.name] = typed;
  }
  const qs = query.toString();
  return { url: `${baseUrl}${p}${qs ? `?${qs}` : ''}`, method: op.method, body: op.method === 'GET' || op.method === 'DELETE' ? undefined : body };
}

async function call(connector, op, values) {
  if (!isLocal(connector.baseUrl)) throw new Error('Only apps on this computer can be connected.');
  const req = buildRequest(connector.baseUrl, op, values);
  const res = await fetch(req.url, {
    method: req.method,
    headers: req.body ? { 'content-type': 'application/json' } : {},
    body: req.body ? JSON.stringify(req.body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(`${res.status} ${typeof data === 'string' ? data.slice(0, 200) : data?.detail ? JSON.stringify(data.detail).slice(0, 200) : res.statusText}`);
  return data;
}

// JSON → readable markdown: lists of records become a small table, objects a key list.
function renderResult(data, { maxRows = 10, maxCols = 5 } = {}) {
  const cell = (v) => (v == null ? '' : typeof v === 'object' ? (Array.isArray(v) ? v.slice(0, 3).join(', ') : '…') : String(v)).replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 60);
  const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : Array.isArray(data?.results) ? data.results : Array.isArray(data?.data) ? data.data : null;
  if (list) {
    if (!list.length) return 'Nothing there yet.';
    if (typeof list[0] !== 'object') return list.slice(0, maxRows).map((v) => `- ${cell(v)}`).join('\n');
    const cols = Object.keys(list[0]).filter((k) => typeof list[0][k] !== 'object' || Array.isArray(list[0][k])).slice(0, maxCols);
    const rows = list.slice(0, maxRows).map((r) => `| ${cols.map((c) => cell(r[c])).join(' | ')} |`);
    const more = list.length > maxRows ? `\n\n…and ${list.length - maxRows} more.` : '';
    return `| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n${rows.join('\n')}${more}`;
  }
  if (data && typeof data === 'object') return Object.entries(data).slice(0, 12).map(([k, v]) => `- **${k}**: ${cell(v)}`).join('\n');
  return String(data ?? 'Done.');
}

module.exports = { discover, fetchSpec, parseSpec, findConnector, rank, fill, route, pageSenders, buildRequest, call, renderResult, isLocal, words, DEV_PORTS };
