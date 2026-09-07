// Synthetic provider-composition tests; no network or production services.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../lib/backend/runtime-composition.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const exports = {};
vm.runInNewContext(compiled.outputText, { exports, module: { exports } });
const select = exports.selectTeswaBackendRuntime;
const names = [
  'auth', 'account', 'analytics', 'policies', 'media', 'marketplace',
  'offers', 'deals', 'realtime', 'directMessaging', 'contextualMessaging',
  'notifications', 'profiles', 'reviews', 'moderation', 'stories',
  'discovery', 'dolab',
];
const complete = (provider) => Object.fromEntries(names.map((name) => [name, { provider }]));
let supabaseCalls = 0;
let oracleCalls = 0;
const factories = {
  supabase: () => { supabaseCalls += 1; return complete('supabase'); },
  oracle: () => { oracleCalls += 1; return complete('oracle'); },
};
assert.equal(select(undefined, factories).auth.provider, 'supabase');
assert.equal(select('supabase', factories).media.provider, 'supabase');
assert.equal(oracleCalls, 0, 'Default must never instantiate Oracle');
assert.equal(select('oracle', factories).auth.provider, 'oracle');
assert.equal(supabaseCalls, 2, 'Oracle must never instantiate Supabase');
assert.throws(() => select('oracle', { supabase: factories.supabase }), /not fully configured/);
assert.throws(() => select('oracle', { ...factories, oracle: () => ({ auth: {} }) }), /missing account/);
assert.throws(() => select('oracle', { ...factories, oracle: () => ({ ...complete('oracle'), media: null }) }), /missing media/);
assert.throws(() => select('supabse', factories), /Unsupported Teswa backend provider/);
assert.equal(supabaseCalls, 2, 'Invalid or incomplete provider must not fall back');
console.log('backend_provider_composition=PASS');
