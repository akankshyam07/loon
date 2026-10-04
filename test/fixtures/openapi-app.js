// A tiny stand-in for a local FastAPI app (OpenAPI 3.1, with $ref schemas like FastAPI emits), used by tests so
// the connector is exercised without touching any real project.
const http = require('http');

const SPEC = {
  openapi: '3.1.0',
  info: { title: 'Career Intel', version: '0.1.0' },
  paths: {
    '/jobs': {
      get: { operationId: 'list_jobs_jobs_get', summary: 'List saved jobs', tags: ['jobs'] },
      post: {
        operationId: 'save_job_jobs_post', summary: 'Save a job', tags: ['jobs'],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/JobIn' } } } },
      },
    },
    '/jobs/search': {
      get: { operationId: 'search_jobs_jobs_search_get', summary: 'Search jobs', tags: ['jobs'], parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }] },
    },
    '/jobs/{job_id}': {
      get: { operationId: 'get_job_jobs__job_id__get', summary: 'Get job', tags: ['jobs'], parameters: [{ name: 'job_id', in: 'path', required: true, schema: { type: 'integer' } }] },
      delete: { operationId: 'delete_job_jobs__job_id__delete', summary: 'Delete job', tags: ['jobs'], parameters: [{ name: 'job_id', in: 'path', required: true, schema: { type: 'integer' } }] },
    },
    '/health': { get: { operationId: 'health_health_get', summary: 'Health' } },
  },
  components: {
    schemas: {
      JobIn: { type: 'object', required: ['url', 'title'], properties: { url: { type: 'string' }, title: { type: 'string' }, company: { type: 'string' }, notes: { type: 'string' } } },
    },
  },
};

function start(port = 0) {
  const jobs = [
    { id: 1, title: 'Backend Engineer', company: 'Acme', url: 'https://acme.test/jobs/1', tags: ['python', 'remote'] },
    { id: 2, title: 'Frontend Engineer', company: 'Globex', url: 'https://globex.test/jobs/2', tags: ['react'] },
  ];
  const send = (res, status, data) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (url.pathname === '/openapi.json') return send(res, 200, SPEC);
      if (url.pathname === '/health') return send(res, 200, { status: 'ok' });
      if (url.pathname === '/jobs' && req.method === 'GET') return send(res, 200, jobs);
      if (url.pathname === '/jobs' && req.method === 'POST') {
        const job = { id: jobs.length + 1, ...JSON.parse(body || '{}') };
        if (!job.url || !job.title) return send(res, 422, { detail: 'url and title are required' });
        jobs.push(job);
        return send(res, 201, job);
      }
      if (url.pathname === '/jobs/search') {
        const q = (url.searchParams.get('q') || '').toLowerCase();
        return send(res, 200, jobs.filter((j) => `${j.title} ${j.company} ${(j.tags || []).join(' ')}`.toLowerCase().includes(q)));
      }
      const m = url.pathname.match(/^\/jobs\/(\d+)$/);
      if (m) return send(res, 200, jobs.find((j) => j.id === Number(m[1])) || {});
      send(res, 404, { detail: 'Not found' });
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port, jobs })));
}

module.exports = { start, SPEC };
