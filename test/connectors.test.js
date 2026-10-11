const test = require('node:test');
const assert = require('node:assert');
const app = require('./fixtures/openapi-app');
const c = require('../brain/connectors');

test('OpenAPI → tools: discovery on localhost, keyword routing, fills, reads vs writes', async () => {
  const { server, port } = await app.start();
  try {
    const found = await c.discover([port, 1]);
    assert.deepStrictEqual(found.map((f) => [f.name, f.operations]), [['Career Board', 6]]);
    const connector = { name: 'Career Board', aliases: ['career'], baseUrl: `http://127.0.0.1:${port}` };
    const ops = c.parseSpec((await c.fetchSpec(connector.baseUrl)).spec);
    const save = ops.find((o) => o.id === 'save_job_jobs_post');
    assert.deepStrictEqual(save.params.map((p) => [p.name, p.in, p.required]), [['url', 'body', true], ['title', 'body', true], ['company', 'body', false], ['notes', 'body', false]]);

    const named = c.findConnector('career: search python jobs', [connector]);
    assert.strictEqual(named.request, 'search python jobs');
    const search = c.route(named.request, ops);
    assert.strictEqual(search.op.id, 'search_jobs_jobs_search_get');
    assert.deepStrictEqual(search.values, { q: 'python' });
    const data = await c.call(connector, search.op, search.values);
    assert.match(c.renderResult(data), /\| id \| title \| company \| url \| tags \|\n\|---\|---\|---\|---\|---\|\n\| 1 \| Backend Engineer \| Acme/);

    assert.strictEqual(c.route('list saved jobs', ops).op.id, 'list_jobs_jobs_get');
    const pageSave = c.route('save this job', ops, { url: 'https://x.test/1', title: 'Data Scientist' });
    assert.deepStrictEqual([pageSave.op.read, pageSave.values, pageSave.missing.length], [false, { url: 'https://x.test/1', title: 'Data Scientist' }, 0]);
    assert.strictEqual(c.route('job', ops).kind, 'choose'); // ambiguous → buttons, not a guess
    assert.deepStrictEqual(c.pageSenders(ops).map((o) => o.id), ['save_job_jobs_post']);
    assert.strictEqual(c.findConnector('what is the capital of France', [connector]), null);
    await assert.rejects(c.call({ baseUrl: 'https://example.com' }, search.op, {}), /Only apps on this computer/);
  } finally {
    server.close();
  }
});
