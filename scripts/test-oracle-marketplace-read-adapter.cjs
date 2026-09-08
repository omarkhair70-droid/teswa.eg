const fs = require('fs');
const ts = require('typescript');
const vm = require('vm');

const file = 'lib/backend/adapters/oracle/marketplace-read-adapter.ts';
let source = fs.readFileSync(file, 'utf8').replace(/^import type .*;$/gm, '');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(js, { module: mod, exports: mod.exports, require, Error });

(async () => {
  const calls = [];
  const adapter = mod.exports.createOracleMarketplaceReadAdapter({ request: async (input) => {
    calls.push(input);
    if (input.path.endsWith('/missing')) return { ok: false, status: 404, reason: 'not_found', retryable: false };
    if (input.path.endsWith('/detail')) return { ok: true, status: 200, data: { id: input.path.split('/').slice(-2)[0], images: [], wantedTags: [] } };
    if (input.path.includes('/owners/')) return { ok: true, status: 200, data: { items: [{ id: 'owned' }] } };
    if (input.path.endsWith('/likes')) return { ok: true, status: 200, data: { items: [{itemId:'liked',likeCount:2,likedByMe:true}] } };
    if (input.path.endsWith('/categories')) return { ok: true, status: 200, data: { items: [{id:'cat',nameAr:'كتب'}] } };
    if (input.path.endsWith('/mine')) return { ok: true, status: 200, data: { items: [{id:'mine'}] } };
    if (input.path.endsWith('/exchange-items')) return { ok: true, status: 200, data: { items: [{id:'exchange'}] } };
    if (input.path.includes('/items/')) return { ok: true, status: 200, data: { id: input.path.split('/').pop(), title: 'book' } };
    return { ok: true, status: 200, data: { items: [], hasMore: false } };
  }});
  const page = await adapter.listFeed({ limit: 10, filters: { city: 'Cairo' } });
  if (page.hasMore !== false || calls[0].query.city !== 'Cairo') throw new Error('feed mapping failed');
  if ((await adapter.getFeedItem('missing')) !== null) throw new Error('missing item mapping failed');
  const item = await adapter.getFeedItem('11111111-1111-4111-8111-111111111111');
  if (!item || item.title !== 'book') throw new Error('detail mapping failed');
  const detail = await adapter.getDetail('11111111-1111-4111-8111-111111111111');
  if (!detail || detail.id !== '11111111-1111-4111-8111-111111111111') throw new Error('full detail mapping failed');
  const owned = await adapter.listActiveByOwner('11111111-1111-4111-8111-111111111111', 3);
  if (owned.length !== 1 || calls.at(-1).query.limit !== 3) throw new Error('owner listing mapping failed');
  if((await adapter.getLikeSummaries(['liked'])).get('liked').likeCount!==2) throw new Error('likes failed');
  if((await adapter.listActiveCategories()).length!==1) throw new Error('categories failed');
  if((await adapter.listMine('ignored')).length!==1) throw new Error('mine failed');
  if((await adapter.getExchangeItemSummaries(['exchange'])).length!==1) throw new Error('exchange failed');
  process.stdout.write('oracle_marketplace_read_adapter=PASS\n');
})().catch((error) => { console.error(error); process.exit(1); });
