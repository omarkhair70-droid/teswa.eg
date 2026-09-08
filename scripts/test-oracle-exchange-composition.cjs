const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('lib/backend/adapters/oracle/exchange-lifecycle-adapter.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const offerRead = Object.fromEntries(['getItemForValidation','listIncoming','listSent','getOffer','getLatestDealId','getLatestDealIds','listOwnedActiveItemIds'].map(name => [name, () => name]));
const offerWrite = Object.fromEntries(['create','recordCreatedEvent','accept','markThinking','softReject'].map(name => [name, () => name]));
const dealRead = Object.fromEntries(['getDeal','getUnreadCount','listConversationInbox','listConfirmationUserIds','listMessages','hasReview','countMessagesSince'].map(name => [name, () => name]));
const dealWrite = Object.fromEntries(['insertTextMessage','insertVoiceMessage','markRead','confirm','completeIfReady'].map(name => [name, () => name]));
const localRequire = id => id.includes('exchange-read-adapter')
  ? { createOracleOfferReadAdapter: () => offerRead, createOracleDealReadAdapter: () => dealRead }
  : id.includes('exchange-adapter')
    ? { createOracleOfferWriteAdapter: () => offerWrite, createOracleDealWriteAdapter: () => dealWrite }
    : require(id);
const mod = { exports: {} };
vm.runInNewContext(js, { module: mod, exports: mod.exports, require: localRequire });
const offers = mod.exports.createOracleOfferLifecycleAdapter({});
const deals = mod.exports.createOracleDealLifecycleAdapter({});
for (const name of [...Object.keys(offerRead), ...Object.keys(offerWrite)]) assert.equal(offers[name](), name);
for (const name of [...Object.keys(dealRead), ...Object.keys(dealWrite)]) assert.equal(deals[name](), name);
process.stdout.write('oracle_exchange_composition=PASS\n');
