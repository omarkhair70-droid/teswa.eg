const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const src=fs.readFileSync('lib/backend/adapters/oracle/marketplace-write-adapter.ts','utf8').replace(/^import type .*;$/gm,'');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};vm.runInNewContext(js,{module:mod,exports:mod.exports,require});
(async()=>{
  let calls=[];
  let response={ok:true,status:200,data:{code:'archived'}};
  const adapter=mod.exports.createOracleMarketplaceWriteAdapter({request:async(input)=>{calls.push(input);return response;}});
  const base='/v1/marketplace/items/item';
  for(const [method,action,code] of [['archiveOwned','archive','archived'],['reactivateOwned','reactivate','reactivated'],['deleteOwnedArchived','delete-archived','deleted']]){
    response={ok:true,status:200,data:{code}};
    assert.equal(await adapter[method]('item'),code);
    assert.equal(calls.at(-1).method,'POST');
    assert.equal(calls.at(-1).path,base+'/'+action);
    assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).body)),{});
  }
  response={ok:true,status:200,data:{code:'has_open_offers'}};
  assert.equal(await adapter.archiveOwned('item'),'has_open_offers');
  response={ok:true,status:200,data:{code:'unexpected'}};
  await assert.rejects(adapter.archiveOwned('item'));
  response={ok:false,status:503,reason:'network'};
  await assert.rejects(adapter.archiveOwned('item'));
  response={ok:true,status:200,data:{items:['https://example.test/a.jpg']}};
  assert.deepEqual(Array.from(await adapter.getImageUrls('item')),['https://example.test/a.jpg']);
  assert.equal(calls.at(-1).method,'GET');
  assert.equal(calls.at(-1).path,base+'/images/urls');
  response={ok:true,status:200,data:{items:[123]}};
  await assert.rejects(adapter.getImageUrls('item'));
  process.stdout.write('oracle_marketplace_lifecycle_adapter=PASS\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
