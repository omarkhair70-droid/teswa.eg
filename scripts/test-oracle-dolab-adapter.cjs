const fs=require('fs'),ts=require('typescript'),vm=require('vm');
let src=fs.readFileSync('lib/backend/adapters/oracle/dolab-adapter.ts','utf8').replace(/^import type[\s\S]*?from '[^']+';\r?\n/gm,'');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,mod={exports:{}};
vm.runInNewContext(js,{module:mod,exports:mod.exports,require,Array,Object,Error,String});
(async()=>{const calls=[];const row={id:'item',user_id:'user',status:'draft',source:'manual',created_at:'now'};
 const t={request:async i=>{calls.push(i);if(i.path==='/v1/dolab/items'&&i.method==='POST')return{ok:true,status:201,data:{item:row}};if(i.path==='/v1/dolab/items')return{ok:true,status:200,data:{items:[row]}};if(i.path.endsWith('/attach'))return{ok:true,status:200,data:{state:'linked'}};return{ok:true,status:200,data:{ok:true}};}};
 const a=mod.exports.createOracleDolabAdapter(t);if(!(await a.createItem('user',{})).ok)throw Error('create');if((await a.listItems('user')).data.length!==1)throw Error('list');if((await a.attachMediaToItem('user','media','item')).data.state!=='linked')throw Error('attach');if(calls.some(c=>c.body&&c.body.serviceRole))throw Error('bypass');process.stdout.write('oracle_dolab_adapter=PASS\n');
})().catch(e=>{console.error(e);process.exit(1)});
