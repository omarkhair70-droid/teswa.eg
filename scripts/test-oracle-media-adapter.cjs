const fs=require('fs'), ts=require('typescript'), vm=require('vm');
let source=fs.readFileSync('lib/backend/adapters/oracle/media-adapter.ts','utf8').replace(/^import type .*;$/gm,'');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
vm.runInNewContext(js,{module:mod,exports:mod.exports,ArrayBuffer,Date,Map,fetch,
  require:(name)=>name==='expo-file-system'?{File:class{}}:require(name)});
(async()=>{
  const calls=[]; let puts=0;
  const transport={request:async(input)=>{calls.push(input);
    if(input.path==='/v1/media/uploads') return {ok:true,status:201,data:{...input.body,uploadUrl:'https://upload.example/par',expiresIn:900}};
    if(input.path.endsWith('/complete')) return {ok:true,status:200,data:{...input.body,publicUrl:'https://read.example/par#teswa-object=item_image:'+input.body.objectKey}};
    if(input.path.endsWith('/signed-url')) return {ok:true,status:200,data:{signedUrl:'https://read.example/short'}};
    if(input.method==='DELETE') return {ok:true,status:200,data:{deleted:input.body.objects.length}};
    throw new Error('unexpected'); }};
  const adapter=mod.exports.createOracleMediaStorageAdapter({transport,fetchImpl:async(url,init)=>{puts++; if(init.headers['If-None-Match']!=='*') throw new Error('overwrite guard missing'); return {ok:true};}});
  const key='items/11111111-1111-4111-8111-111111111111/item/file.jpg';
  const result=await adapter.upload({purpose:'item_image',ownerId:'11111111-1111-4111-8111-111111111111',source:{uri:'memory:',mimeType:'image/jpeg',buffer:new Uint8Array([1,2,3]).buffer},objectKeyHint:key});
  if(!result.ok||puts!==1||calls.length!==2) throw new Error('upload flow failed');
  const publicUrl=adapter.getPublicUrl(result.data);
  if(!publicUrl||adapter.getObjectKeyFromPublicUrl('item_image',publicUrl)!==key) throw new Error('public URL mapping failed');
  if(!(await adapter.getSignedUrl(result.data,300)).ok) throw new Error('signed URL failed');
  if(!(await adapter.remove([result.data])).ok) throw new Error('remove failed');
  process.stdout.write('oracle_media_adapter=PASS\n');
})().catch(e=>{console.error(e);process.exit(1)});
