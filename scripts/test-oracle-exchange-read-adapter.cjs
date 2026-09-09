const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('lib/backend/adapters/oracle/exchange-read-adapter.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;
const mod = { exports: {} };
vm.runInNewContext(js, { module: mod, exports: mod.exports, require, Map, Set, Promise });
const { createOracleOfferReadAdapter, createOracleDealReadAdapter } = mod.exports;
const OFFER = '33333333-3333-4333-8333-333333333333';
const DEAL = '44444444-4444-4444-8444-444444444444';
const USER = '11111111-1111-4111-8111-111111111111';
const row = (id, status = 'pending') => ({ id, status, senderId: USER, receiverId: USER,
  requestedItemId: OFFER, offeredItemId: DEAL, message: null, dealId: DEAL, createdAt: null });
const ok = data => ({ ok: true, status: 200, data });
const missing = { ok: false, status: 404, reason: 'not_found', retryable: false };
const failed = { ok: false, status: 503, reason: 'server', retryable: true };
const json = value => JSON.parse(JSON.stringify(value));

(async () => {
  let assertions = 0;
  const check = (condition, message) => { assert.ok(condition, message); assertions++; };
  const calls = [];
  const transport = { request: async input => {
    calls.push(input);
    if (input.path === '/v1/offers') {
      const offset = input.query.offset;
      if (offset === 0) return ok({ items: Array.from({ length: 50 }, (_, i) => row(String(i), i === 0 ? 'accepted' : 'pending')), hasMore: true });
      return ok({ items: [row('last', 'thinking')], hasMore: false });
    }
    if (input.path === `/v1/offers/${OFFER}`) return ok(row(OFFER));
    if (input.path === `/v1/deals/${DEAL}`) return ok({ id: DEAL, status: 'coordinating' });
    if (input.path === `/v1/deals/${DEAL}/messages`) {
      const { offset, limit, order } = input.query;
      check(order === 'asc', 'message order must match the existing lifecycle contract');
      return ok({ items: Array.from({ length: limit }, (_, i) => ({ id: String(offset + i), dealId: DEAL, senderId: USER, body: 'text', messageType: 'text', createdAt: '2026-09-07T00:00:00Z' })), hasMore: offset === 0 });
    }
    return missing;
  }};
  const offers = createOracleOfferReadAdapter(transport);
  const deals = createOracleDealReadAdapter(transport);
  const incoming = await offers.listIncoming(USER);
  check(incoming.length === 50 && incoming[0].id === '1' && incoming[49].id === 'last', 'incoming filters must not drop later pages');
  check(calls.filter(c => c.path === '/v1/offers').length === 2, 'must drain the next page');
  check((await offers.listSent(USER)).length === 51, 'sent includes all statuses');
  check((await offers.getOffer(OFFER)).id === OFFER, 'offer detail');
  check((await offers.getLatestDealId(OFFER)) === DEAL, 'latest deal id');
  check(json([...(await offers.getLatestDealIds([OFFER, OFFER, 'missing'])).entries()]).length === 1, 'batch deduplicates and ignores missing deals');
  check((await offers.getLatestDealIds([])).size === 0, 'empty batch');
  check((await deals.getDeal(DEAL)).id === DEAL, 'deal detail');
  const messages = await deals.listMessages(DEAL, 150);
  check(messages.length === 150 && messages[0].id === '0' && messages[149].id === '149', 'messages keep chronological pagination');
  check((await deals.listMessages(DEAL, 0)).length === 0, 'zero limit');
  await assert.rejects(() => deals.listMessages(DEAL, 10001), /Oracle exchange request failed/);
  assertions++;
  const bad = createOracleOfferReadAdapter({ request: async () => ok({ items: [], hasMore: true }) });
  await assert.rejects(() => bad.listSent(USER), /Oracle exchange request failed/);
  assertions++;
  const missingOffer = createOracleOfferReadAdapter({ request: async () => missing });
  check((await missingOffer.getOffer(OFFER)) === null, '404 is a missing record');
  const serverFailure = createOracleOfferReadAdapter({ request: async () => failed });
  await assert.rejects(() => serverFailure.getOffer(OFFER), /Oracle exchange request failed/);
  assertions++;
  const invalid = createOracleOfferReadAdapter({ request: async () => ok({ id: 'wrong' }) });
  await assert.rejects(() => invalid.getOffer(OFFER), /Oracle exchange request failed/);
  assertions++;
  process.stdout.write(`oracle_exchange_read_adapter=PASS assertions=${assertions}\n`);
})().catch(error => { console.error(error); process.exitCode = 1; });
