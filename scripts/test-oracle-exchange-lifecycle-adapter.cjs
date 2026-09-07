const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('lib/backend/adapters/oracle/exchange-adapter.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(js, { module: mod, exports: mod.exports, require, Map, Promise });
const { createOracleOfferWriteAdapter, createOracleDealWriteAdapter } = mod.exports;
const OFFER = '33333333-3333-4333-8333-333333333333';
const DEAL = '44444444-4444-4444-8444-444444444444';
const USER = '11111111-1111-4111-8111-111111111111';
const ok = data => ({ ok: true, status: 200, data });
const error = { ok: false, status: 409, reason: 'conflict', retryable: false };

(async () => {
  const calls = [];
  const voicePath = `deals/${DEAL}/${USER}/voice.m4a`;
  const voiceInput = { dealId: DEAL, senderId: USER, body: 'voice', audioStoragePath: voicePath, audioDurationMs: 1000, audioMimeType: 'audio/m4a', audioSizeBytes: 42 };
  const responses = [ok({ ok: true }), ok({ ok: true }), ok({ dealId: DEAL, senderId: USER, messageType: 'voice', audioStoragePath: voicePath }), ok({ ok: true }), ok({ ok: true }), ok({ completed: false }), ok({ completed: true })];
  const transport = { request: async input => { calls.push(input); return responses.shift(); } };
  const offers = createOracleOfferWriteAdapter(transport);
  const deals = createOracleDealWriteAdapter(transport);
  assert.equal((await offers.markThinking(OFFER, '  thinking  ')).ok, true);
  assert.equal((await offers.softReject(OFFER, '  no thanks  ')).ok, true);
  assert.equal((await deals.insertVoiceMessage(voiceInput)).ok, true);
  assert.equal((await deals.markRead(DEAL)).ok, true);
  assert.equal((await deals.confirm({ dealId: DEAL, userId: USER, note: '  done  ' })).ok, true);
  assert.equal((await deals.completeIfReady(DEAL)).data, false);
  assert.equal((await deals.completeIfReady(DEAL)).data, true);
  assert.equal(calls.length, 7);
  assert.equal(calls[0].path, `/v1/offers/${OFFER}/thinking`);
  assert.equal(calls[0].body.note, 'thinking');
  assert.equal(calls[1].path, `/v1/offers/${OFFER}/soft-reject`);
  assert.equal(calls[2].body.messageType, 'voice');
  assert.equal(calls[2].body.audioStoragePath, voicePath);
  assert.equal(calls[3].path, `/v1/deals/${DEAL}/read`);
  assert.equal(calls[4].path, `/v1/deals/${DEAL}/confirmations`);
  assert.equal(calls[4].body.userId, USER);
  assert.equal(calls[4].body.note, 'done');
  assert.equal(calls[5].path, `/v1/deals/${DEAL}/complete`);
  assert.ok(calls.every(call => call.method === 'POST'));
  const rejected = { request: async () => error };
  const badOffers = createOracleOfferWriteAdapter(rejected);
  const badDeals = createOracleDealWriteAdapter(rejected);
  for (const result of [
    await badOffers.markThinking(OFFER), await badOffers.softReject(OFFER),
    await badDeals.insertVoiceMessage(voiceInput),
    await badDeals.markRead(DEAL), await badDeals.confirm({ dealId: DEAL, userId: USER }),
    await badDeals.completeIfReady(DEAL),
  ]) assert.equal(result.ok, false);
  const malformed = { request: async () => ok({ completed: 1, ok: false }) };
  assert.equal((await createOracleOfferWriteAdapter(malformed).markThinking(OFFER)).ok, false);
  assert.equal((await createOracleDealWriteAdapter(malformed).completeIfReady(DEAL)).ok, false);
  process.stdout.write('oracle_exchange_lifecycle_adapter=PASS\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
