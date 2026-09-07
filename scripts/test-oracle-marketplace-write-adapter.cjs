const fs=require('fs'),ts=require('typescript'),vm=require('vm');
let src=fs.readFileSync('lib/backend/adapters/oracle/marketplace-write-adapter.ts','utf8').replace(/^import type .*;$/gm,'');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}}; vm.runInNewContext(js,{module:mod,exports:mod.exports,require});
(async()=>{let call; const adapter=mod.exports.createOracleMarketplaceWriteAdapter({request:async(input)=>{call=input;return {ok:true,status:201,data:{itemId:input.body.itemId}}}});
const input={itemId:'id',ownerId:'owner',images:[]}; const result=await adapter.createPublishedListingBase(input);
if(!result.ok||call.method!=='POST'||call.path!=='/v1/marketplace/items'||call.body!==input) throw new Error('publish adapter failed');
process.stdout.write('oracle_marketplace_write_adapter=PASS\n')})().catch(e=>{console.error(e);process.exit(1)});
