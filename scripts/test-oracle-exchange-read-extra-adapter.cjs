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
const { createOracleDealReadAdapter } = mod.exports;
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DEAL = '44444444-4444-4444-8444-444444444444';
const SINCE = '2026-09-07T00:00:00Z';
const ok = data => ({ ok: true, status: 200, data });
const failed = { ok: false, status: 503, reason: 'server', retryable: true };
const row = id => ({ dealId: id, status: 'coordinating', createdAt: SINCE,
  requestedItemId: DEAL, offeredItemId: DEAL,
  otherParticipant: { id: OTHER, displayName: 'Other', avatarUrl: null },
  latestMessage: null, unreadCount: 0, lastActivityAt: SINCE });

(async () => {
  let assertions = 0;
  const check = (condition, message) => { assert.ok(condition, message); assertions++; };
  const calls = [];
  const transport = { request: async input => {
    calls.push(input);
    if (input.path === '/v1/deals/unread-count') return ok({ count: 7 });
    if (input.path === '/v1/deals/inbox') {
      check(input.query.userId === USER, 'inbox identity is passed for server verification');
      if (input.query.offset === 0) return ok({ items: Array.from({ length: 50 }, (_, i) => row(String(i))), hasMore: true });
      return ok({ items: [row('last')], hasMore: false });
    }
    if (input.path === `/v1/deals/${DEAL}/confirmations`) return ok({ userIds: [USER, OTHER] });
    if (input.path === `/v1/deals/${DEAL}/reviews`) {
      check(input.query.reviewerId === OTHER, 'reviewer id');
      return ok({ hasReview: false });
    }
    if (input.path === `/v1/deals/${DEAL}/messages/count`) {
      check(input.query.senderId === OTHER && input.query.since === SINCE, 'message count filters');
      return ok({ count: 3 });
    }
    return failed;
  }};
  const deals = createOracleDealReadAdapter(transport);
  check((await deals.getUnreadCount()) === 7, 'unread count');
  const inbox = await deals.listConversationInbox(USER);
  check(inbox.length === 51 && inbox[0].dealId === '0' && inbox[50].dealId === 'last', 'inbox drains pages');
  check(calls.filter(call => call.path === '/v1/deals/inbox').length === 2, 'inbox second page');
  check(JSON.stringify(await deals.listConfirmationUserIds(DEAL)) === JSON.stringify([USER, OTHER]), 'confirmation ids');
  const review = await deals.hasReview(DEAL, OTHER);
  check(review.ok === true && review.data === false, 'false review result is preserved');
  check((await deals.countMessagesSince(DEAL, OTHER, SINCE)) === 3, 'message count');

  const invalid = data => createOracleDealReadAdapter({ request: async () => ok(data) });
  for (const data of [{ count: -1 }, { count: 1.5 }, { count: '2' }, { count: null }, { count: true }]) {
    await assert.rejects(() => invalid(data).getUnreadCount(), /Oracle exchange request failed/);
    assertions++;
  }
  await assert.rejects(() => invalid({ userIds: [null] }).listConfirmationUserIds(DEAL), /Oracle exchange request failed/);
  assertions++;
  await assert.rejects(() => invalid({ items: [{ dealId: DEAL }], hasMore: false }).listConversationInbox(USER), /Oracle exchange request failed/);
  assertions++;
  await assert.rejects(() => invalid({ items: [], hasMore: true }).listConversationInbox(USER), /Oracle exchange request failed/);
  assertions++;
  const badReview = await invalid({ hasReview: 1 }).hasReview(DEAL, OTHER);
  check(badReview.ok === false && badReview.reason === 'unknown', 'invalid review response fails');
  const unavailableReview = await createOracleDealReadAdapter({ request: async () => failed }).hasReview(DEAL, OTHER);
  check(unavailableReview.ok === false, 'server failure is not interpreted as no review');
  await assert.rejects(() => createOracleDealReadAdapter({ request: async () => failed }).getUnreadCount(), /Oracle exchange request failed/);
  assertions++;
  process.stdout.write(`oracle_exchange_read_extra_adapter=PASS assertions=${assertions}\n`);
})().catch(error => { console.error(error); process.exitCode = 1; });
