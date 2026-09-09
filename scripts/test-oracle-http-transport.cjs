// Synthetic requests only. No OCI, Supabase, or production access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../lib/backend/adapters/oracle/http-transport.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);

function fixture(options = {}) {
  const calls = [];
  const moduleExports = {};
  const context = {
    exports: moduleExports, module: { exports: moduleExports },
    process: { env: {} }, URL, AbortController, Date, Math, Promise, Object, String,
    setTimeout, clearTimeout,
  };
  vm.runInNewContext(compiled.outputText, context, { filename: 'http-transport.js' });
  const session = { accessToken: 'synthetic-access', expiresAt: Math.floor(Date.now() / 1000) + 900, user: { id: 'synthetic-user' } };
  const transport = context.module.exports.createOracleHttpTransport({
    baseUrl: options.baseUrl === undefined ? 'https://api.example.test' : options.baseUrl,
    auth: { getSession: options.getSession || (async () => session) },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (options.fetchImpl) return options.fetchImpl(url, init);
      return { status: 200, text: async () => JSON.stringify({ items: [] }) };
    },
  });
  return { transport, calls, session };
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('requires HTTPS before asking for a session', async () => {
  let reads = 0;
  const f = fixture({ baseUrl: 'http://api.example.test', getSession: async () => { reads++; return null; } });
  const result = await f.transport.request({ path: '/v1/marketplace/feed' });
  assert.equal(result.reason, 'configuration'); assert.equal(reads, 0); assert.equal(f.calls.length, 0);
});

test('rejects external, traversal, and query-bearing paths', async () => {
  const f = fixture();
  for (const path of ['https://evil.example/v1/auth', '//evil.example/v1/auth', '/v1/../auth', '/v1/items?token=x']) {
    assert.equal((await f.transport.request({ path })).reason, 'configuration');
  }
  assert.equal(f.calls.length, 0);
});

test('does not send a request without an Oracle session', async () => {
  const f = fixture({ getSession: async () => null });
  assert.equal((await f.transport.request({ path: '/v1/marketplace/feed' })).reason, 'authentication');
  assert.equal(f.calls.length, 0);
});

test('does not send an expired session', async () => {
  const f = fixture({ getSession: async () => ({ accessToken: 'expired', expiresAt: 1 }) });
  assert.equal((await f.transport.request({ path: '/v1/marketplace/feed' })).reason, 'authentication');
  assert.equal(f.calls.length, 0);
});

test('uses the Oracle bearer and encodes query values', async () => {
  const f = fixture();
  const result = await f.transport.request({ path: '/v1/marketplace/feed', query: { query: 'بني سويف & test', limit: 20, absent: null } });
  assert.equal(result.ok, true);
  assert.equal(f.calls.length, 1);
  const url = new URL(f.calls[0].url);
  assert.equal(url.origin, 'https://api.example.test');
  assert.equal(url.searchParams.get('query'), 'بني سويف & test');
  assert.equal(url.searchParams.get('limit'), '20');
  assert.equal(url.searchParams.has('absent'), false);
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer synthetic-access');
  assert.equal(f.calls[0].init.credentials, 'omit');
  assert.equal(f.calls[0].init.redirect, 'error');
});

test('serializes writes without accepting caller identity headers', async () => {
  const f = fixture();
  const result = await f.transport.request({ method: 'POST', path: '/v1/marketplace/items', body: { title: 'Test' } });
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { title: 'Test' });
  assert.deepEqual(Object.keys(f.calls[0].init.headers).sort(), ['Accept', 'Authorization', 'Content-Type']);
});

test('rejects GET bodies before network access', async () => {
  const f = fixture();
  assert.equal((await f.transport.request({ path: '/v1/items', body: {} })).reason, 'configuration');
  assert.equal(f.calls.length, 0);
});

test('never falls back after 401 or 403', async () => {
  let status = 401;
  const f = fixture({ fetchImpl: async () => ({ status, text: async () => '{}' }) });
  assert.equal((await f.transport.request({ path: '/v1/items' })).reason, 'authentication');
  status = 403;
  assert.equal((await f.transport.request({ path: '/v1/items' })).reason, 'forbidden');
  assert.equal(f.calls.length, 2);
});

test('returns safe retryable errors for network and server failures', async () => {
  const offline = fixture({ fetchImpl: async () => { throw new Error('secret-token'); } });
  const result = await offline.transport.request({ path: '/v1/items' });
  assert.equal(result.reason, 'network'); assert.equal(result.retryable, true);
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  const server = fixture({ fetchImpl: async () => ({ status: 503 }) });
  assert.equal((await server.transport.request({ path: '/v1/items' })).reason, 'server');
});

test('rejects invalid JSON and accepts 204', async () => {
  const bad = fixture({ fetchImpl: async () => ({ status: 200, text: async () => 'not-json' }) });
  assert.equal((await bad.transport.request({ path: '/v1/items' })).reason, 'invalid_response');
  const empty = fixture({ fetchImpl: async () => ({ status: 204 }) });
  const result = await empty.transport.request({ method: 'DELETE', path: '/v1/items' });
  assert.equal(result.ok, true); assert.equal(result.data, undefined);
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`PASS ${name}`); }
    catch (error) { console.error(`FAIL ${name}`); throw error; }
  }
  console.log(`oracle_http_transport_tests=PASS count=${tests.length}`);
})().catch(() => { process.exitCode = 1; });
