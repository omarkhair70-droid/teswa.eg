// Synthetic Google-flow tests. No Google account, network, or production service.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../lib/google-auth.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);

async function runCase({ provider = 'oracle', platform = 'android', nativeEnabled = true, nativeResult, nativeThrows = false, session = null }) {
  let nativeCalls = 0;
  let browserCalls = 0;
  let browserStarts = 0;
  const module = { exports: {} };
  const auth = {
    getSession: async () => session,
    startExternalSignIn: async () => {
      browserStarts += 1;
      return { ok: true, data: { authorizationUrl: 'https://accounts.google.com/test' } };
    },
    completeExternalSignIn: async () => ({ ok: true, data: {} }),
  };
  const mocks = {
    'expo-auth-session': { makeRedirectUri: () => 'teswa://auth/callback' },
    'expo-auth-session/build/QueryParams': { getQueryParams: () => ({ params: {}, errorCode: null }) },
    'expo-web-browser': {
      maybeCompleteAuthSession: () => undefined,
      openAuthSessionAsync: async () => {
        browserCalls += 1;
        return { type: 'cancel' };
      },
    },
    'react-native': { Platform: { OS: platform } },
    '@/lib/google-native-auth-v2': {
      logGoogleSignInDiagnostic: () => undefined,
      signInWithGoogleNative: async () => {
        nativeCalls += 1;
        if (nativeThrows) throw new Error('synthetic native failure');
        return nativeResult;
      },
    },
    '@/lib/backend/runtime': { teswaBackendRuntime: { auth } },
  };
  vm.runInNewContext(compiled.outputText, {
    module, exports: module.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected import: ${name}`);
      return mocks[name];
    },
    process: { env: {
      EXPO_PUBLIC_TESWA_BACKEND_PROVIDER: provider,
      EXPO_PUBLIC_GOOGLE_NATIVE_ENABLED: String(nativeEnabled),
    } },
    console: { log: () => undefined },
    Date, Map, Promise, Boolean, String,
  });
  const result = await module.exports.signInWithGoogle();
  return { result, nativeCalls, browserCalls, browserStarts };
}

(async () => {
  const success = { status: 'success', reason: 'native_success', error: null, fallbackToBrowser: false };
  const failed = { status: 'error', reason: 'supabase_session_failed', error: 'تعذر إكمال الجلسة.', fallbackToBrowser: true };
  const cancelled = { status: 'cancelled', reason: 'cancelled', error: null, fallbackToBrowser: false };

  let r = await runCase({ nativeResult: success });
  assert.equal(r.result.error, null);
  assert.equal(r.nativeCalls, 1);
  assert.equal(r.browserCalls, 0);
  console.log('PASS Oracle native Google success');

  r = await runCase({ nativeResult: failed });
  assert.ok(r.result.error);
  assert.equal(r.browserCalls, 0);
  assert.equal(r.browserStarts, 0);
  console.log('PASS Oracle failure does not start browser OAuth');

  r = await runCase({ nativeResult: cancelled });
  assert.ok(r.result.error);
  assert.equal(r.browserCalls, 0);
  console.log('PASS Oracle cancellation stays cancelled');

  r = await runCase({ nativeThrows: true });
  assert.ok(r.result.error);
  assert.equal(r.browserCalls, 0);
  console.log('PASS Oracle native exception fails closed');

  r = await runCase({ nativeEnabled: false });
  assert.ok(r.result.error);
  assert.equal(r.nativeCalls, 0);
  assert.equal(r.browserCalls, 0);
  console.log('PASS Oracle disabled native flow does not fall back');

  r = await runCase({ platform: 'web' });
  assert.ok(r.result.error);
  assert.equal(r.browserCalls, 0);
  console.log('PASS Oracle web does not attempt unsupported OAuth');

  r = await runCase({ provider: 'supabase', nativeEnabled: false });
  assert.equal(r.browserCalls, 1);
  assert.equal(r.browserStarts, 1);
  console.log('PASS existing Supabase browser flow remains available');

  r = await runCase({ provider: 'supabase', nativeResult: failed });
  assert.equal(r.browserCalls, 1);
  console.log('PASS existing Supabase native fallback remains available');

  console.log('oracle_google_provider_tests=PASS count=8');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
