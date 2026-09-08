const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const source=fs.readFileSync('lib/backend/adapters/oracle/marketplace-write-adapter.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
vm.runInNewContext(js,{module:mod,exports:mod.exports,require});
const ID='33333333-3333-4333-8333-333333333333';
const USER='11111111-1111-4111-8111-111111111111';
(async()=>{
  let call; let response={ok:true,status:200,data:{ok:true,code:'updated',removedImageUrls:['https://example.test/old.jpg']}};
  const adapter=mod.exports.createOracleMarketplaceWriteAdapter({request:async input=>{call=input;return response;}});
  const input={itemId:ID,ownerId:USER,orderedRows:[{kind:'new',imageUrl:'https://example.test/new.jpg'}]};
  const result=await adapter.applyListingImagePlan(input);
  assert.equal(result.ok,true);
  assert.equal(result.data.removedImageUrls[0],'https://example.test/old.jpg');
  assert.equal(call.method,'POST');
  assert.equal(call.path,`/v1/marketplace/items/${ID}/edit/images/plan`);
  assert.equal(call.body,input);
  for(const code of ['not_found_or_unauthorized','not_editable','invalid_input']){
    response={ok:true,status:200,data:{ok:false,code}};
    assert.equal((await adapter.applyListingImagePlan(input)).reason,code);
  }
  for(const status of [400,404]){
    response={ok:false,status,reason:'unknown',retryable:false};
    assert.equal((await adapter.applyListingImagePlan(input)).reason,'invalid_input');
  }
  response={ok:false,status:409,reason:'conflict',retryable:false};
  assert.equal((await adapter.applyListingImagePlan(input)).reason,'unknown');
  for(const data of [null,{}, {ok:true,code:'updated'}, {ok:true,code:'updated',removedImageUrls:[42]}, {ok:false,code:'unexpected'}]){
    response={ok:true,status:200,data};
    assert.equal((await adapter.applyListingImagePlan(input)).reason,'unknown');
  }
  process.stdout.write('oracle_marketplace_image_plan_adapter=PASS\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
