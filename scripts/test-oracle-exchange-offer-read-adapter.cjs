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
const { createOracleOfferReadAdapter } = mod.exports;
const USER = '11111111-1111-4111-8111-111111111111';
const ITEM = '33333333-3333-4333-8333-333333333333';
const ok = data => ({ ok: true, status: 200, data });
const missing = { ok: false, status: 404, reason: 'not_found', retryable: false };
const failed = { ok: false, status: 503, reason: 'server', retryable: true };

(async () => {
  let assertions = 0;
  const check = (condition, message) => { assert.ok(condition, message); assertions++; };
  const calls = [];
  const transport = { request: async input => {
    calls.push(input);
    if (input.path === `/v1/offers/items/${ITEM}`) return ok({ id: ITEM, title: 'Book', ownerId: USER, status: 'active' });
    if (input.path === '/v1/offers/owned-active-items') {
      check(input.query.userId === USER, 'owner identity supplied for server verification');
      if (input.query.offset === 0) return ok({ items: Array.from({ length: 50 }, (_, i) => ({ id: String(i) })), hasMore: true });
      return ok({ items: [{ id: 'last' }], hasMore: false });
    }
    return missing;
  }};
  const offers = createOracleOfferReadAdapter(transport);
  const item = await offers.getItemForValidation(ITEM);
  check(item.id === ITEM && item.ownerId === USER && item.status === 'active', 'validation shape');
  check((await offers.getItemForValidation('missing')) === null, '404 maps to null');
  const ids = await offers.listOwnedActiveItemIds(USER);
  check(ids.length === 51 && ids[0] === '0' && ids[50] === 'last', 'owned ids drain pages');
  check(calls.filter(call => call.path === '/v1/offers/owned-active-items').length === 2, 'second page requested');
  const bad = data => createOracleOfferReadAdapter({ request: async () => ok(data) });
  await assert.rejects(() => bad({ id: 'wrong', ownerId: USER, status: 'active' }).getItemForValidation(ITEM), /Oracle exchange request failed/);
  assertions++;
  await assert.rejects(() => bad({ id: ITEM, ownerId: null, status: 'active' }).getItemForValidation(ITEM), /Oracle exchange request failed/);
  assertions++;
  await assert.rejects(() => bad({ items: [{ id: null }], hasMore: false }).listOwnedActiveItemIds(USER), /Oracle exchange request failed/);
  assertions++;
  await assert.rejects(() => bad({ items: [], hasMore: true }).listOwnedActiveItemIds(USER), /Oracle exchange request failed/);
  assertions++;
  await assert.rejects(() => createOracleOfferReadAdapter({ request: async () => failed }).listOwnedActiveItemIds(USER), /Oracle exchange request failed/);
  assertions++;
  process.stdout.write(`oracle_exchange_offer_read_adapter=PASS assertions=${assertions}\n`);
})().catch(error => { console.error(error); process.exitCode = 1; });
