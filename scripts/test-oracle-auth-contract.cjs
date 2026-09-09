// Run with: node scripts/test-oracle-auth-contract.cjs
// All requests and storage are synthetic. No OCI, Supabase or production access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../lib/backend/adapters/oracle/auth-adapter.ts'), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
  reportDiagnostics: true,
});
assert.equal(javascript.diagnostics?.length ?? 0, 0, 'Adapter must transpile');

function fixture(handler, initial = null, baseUrl = 'https://auth.example.test') {
  let stored = initial;
  const calls = [];
  const exports = {};
  const storage = {
    readOracleAuthSession: async () => stored,
    writeOracleAuthSession: async (value) => { stored = value; },
    clearOracleAuthSession: async () => { stored = null; },
  };
  const context = {
    exports, module: { exports },
    require: (id) => {
      if (id === '@/lib/backend/adapters/oracle/auth-storage') return storage;
      throw new Error(`Unexpected runtime import: ${id}`);
    },
    process: { env: {} }, AbortController, URL, Date, Promise, setTimeout, clearTimeout,
    fetch: async (url, init) => {
      const call = { url, method: init.method, body: init.body ? JSON.parse(init.body) : null, headers: init.headers };
      calls.push(call);
      const response = await handler(call);
      if (response instanceof Error) throw response;
      return { status: response.status, json: async () => response.body };
    },
  };
  vm.runInNewContext(javascript.outputText, context, { filename: 'auth-adapter.js' });
  return {
    auth: context.module.exports.createOracleAuthAdapter({ baseUrl }),
    calls, get stored() { return stored; },
  };
}

const user = { id: '00000000-0000-4000-8000-000000000001', email: 'test@example.test', phone: null, display_name: 'Test', avatar_url: null };
const future = () => Math.floor(Date.now() / 1000) + 900;
const payload = (access = 'access-one', refresh = 'refresh-one', expires = future()) => ({ access_token: access, refresh_token: refresh, expires_at: expires, user });
const session = (expires = future()) => ({ accessToken: 'access-one', refreshToken: 'refresh-one', expiresAt: expires, user: { id: user.id, email: user.email, phone: null, displayName: 'Test', avatarUrl: null } });
const reply = (status, body = {}) => ({ status, body });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('requires a configured HTTPS endpoint', async () => {
  const f = fixture(() => { throw new Error('unexpected request'); }, null, 'http://127.0.0.1:3110');
  const result = await f.auth.signInWithPassword({ email: user.email, password: 'test-password' });
  assert.equal(result.ok, false); assert.equal(result.reason, 'network'); assert.equal(f.calls.length, 0);
});

test('password login maps the response and stores an isolated session', async () => {
  const f = fixture(() => reply(200, payload()));
  const result = await f.auth.signInWithPassword({ email: user.email, password: 'test-password' });
  assert.equal(result.ok, true); assert.equal(result.data.user.id, user.id);
  assert.equal(f.stored.refreshToken, 'refresh-one');
  assert.equal(f.calls[0].url, 'https://auth.example.test/v1/auth/password');
  assert.equal(f.calls[0].body.password, 'test-password');
});

test('accepts the deployed auth runtime camel-case user during rolling updates', async () => {
  const legacyUser = { id: user.id, email: user.email, phone: null, displayName: 'Legacy', avatarUrl: 'https://example.test/a.png' };
  const f = fixture(() => reply(200, { ...payload(), user: legacyUser }));
  const result = await f.auth.signInWithPassword({ email: user.email, password: 'test-password' });
  assert.equal(result.ok, true); assert.equal(result.data.user.displayName, 'Legacy');
  assert.equal(result.data.user.avatarUrl, legacyUser.avatarUrl);
});

test('restores a valid session through the server', async () => {
  const f = fixture(() => reply(200, { user }), session());
  assert.equal((await f.auth.getSession()).user.id, user.id);
  assert.equal(f.calls[0].url, 'https://auth.example.test/v1/auth/session');
  assert.equal(f.calls[0].headers.Authorization, 'Bearer access-one');
});

test('concurrent refresh calls rotate the token only once', async () => {
  const gate = deferred();
  const f = fixture(async () => { await gate.promise; return reply(200, payload('access-two', 'refresh-two')); }, session(1));
  const first = f.auth.getSession(); const second = f.auth.getSession();
  await Promise.resolve(); await Promise.resolve(); gate.resolve();
  const results = await Promise.all([first, second]);
  assert.equal(results[0].accessToken, 'access-two'); assert.equal(results[1].accessToken, 'access-two');
  assert.equal(f.calls.filter((call) => call.url.endsWith('/refresh')).length, 1);
  assert.equal(f.stored.refreshToken, 'refresh-two');
});

test('rejects revoked refresh tokens and clears the session', async () => {
  const f = fixture(() => reply(401, { error: 'invalid_refresh_token' }), session(1));
  assert.equal(await f.auth.getSession(), null); assert.equal(f.stored, null);
});

test('does not return an expired token after a network failure', async () => {
  const f = fixture(() => new Error('offline'), session(1));
  assert.equal(await f.auth.getSession(), null); assert.equal(f.stored.refreshToken, 'refresh-one');
});

test('does not mistake unavailable confirmation delivery for success', async () => {
  const f = fixture(() => reply(503, { error: 'confirmation_delivery_not_configured' }));
  const signup = await f.auth.signUp({ email: user.email, password: 'test-password' });
  const resend = await f.auth.resendSignupConfirmation(user.email);
  assert.equal(signup.ok, false); assert.equal(resend.ok, false);
  assert.equal(signup.reason, 'network'); assert.equal(f.stored, null);
});

test('sends the native Google ID token to Oracle', async () => {
  const f = fixture(() => reply(200, payload()));
  const result = await f.auth.signInWithExternalIdToken({ provider: 'google', idToken: 'synthetic-google-token' });
  assert.equal(result.ok, true); assert.equal(f.calls[0].body.id_token, 'synthetic-google-token');
  assert.equal(f.calls[0].url, 'https://auth.example.test/v1/auth/google');
});

test('maps invalid credentials and unmapped Google identities', async () => {
  const f = fixture((call) => call.url.endsWith('/google') ? reply(403, { error: 'identity_not_mapped' }) : reply(401, { error: 'invalid_credentials' }));
  assert.equal((await f.auth.signInWithPassword({ email: user.email, password: 'bad' })).reason, 'invalid_credentials');
  assert.equal((await f.auth.signInWithExternalIdToken({ provider: 'google', idToken: 'invalid' })).reason, 'provider_failed');
});

test('keeps the local session when logout cannot reach Oracle', async () => {
  const f = fixture(() => new Error('offline'), session());
  const result = await f.auth.signOut();
  assert.equal(result.ok, false); assert.equal(result.reason, 'network'); assert.equal(f.stored.accessToken, 'access-one');
});

test('clears the session after successful logout', async () => {
  const f = fixture(() => reply(200, { signed_out: true }), session());
  assert.equal((await f.auth.signOut()).ok, true); assert.equal(f.stored, null);
});

test('a delayed validation cannot restore a session after logout', async () => {
  const gate = deferred();
  const f = fixture(async (call) => {
    if (call.url.endsWith('/session')) { await gate.promise; return reply(200, { user }); }
    return reply(200, { signed_out: true });
  }, session());
  const restore = f.auth.getSession(); await Promise.resolve(); await Promise.resolve();
  assert.equal((await f.auth.signOut()).ok, true); gate.resolve();
  assert.equal(await restore, null); assert.equal(f.stored, null);
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); process.stdout.write(`PASS ${name}\n`); }
    catch (error) { console.error(`FAIL ${name}`); throw error; }
  }
  console.log(`oracle_auth_contract_tests=PASS count=${tests.length}`);
})().catch(() => { process.exitCode = 1; });
