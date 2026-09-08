const fs=require('fs'),ts=require('typescript'),vm=require('vm');
let src=fs.readFileSync('lib/backend/adapters/oracle/messaging-realtime-adapter.ts','utf8').replace(/^import type[\s\S]*?from '[^']+';\r?\n/gm,'');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};vm.runInNewContext(js,{module:mod,exports:mod.exports,require,Array,Number,String,setTimeout,clearTimeout});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let step=0;const calls=[];const t={request:async input=>{calls.push(input);
 if(input.path==='/v1/realtime/events'){
  if(step++===0)return{ok:true,status:200,data:{events:[],nextAfter:7,hasEvents:false}};
  if(step===2)return{ok:true,status:200,data:{events:[{event_id:8,source_table:'direct_messages',event_type:'INSERT',aggregate_kind:'direct',aggregate_id:'conversation',row_id:'message'}],nextAfter:8,hasEvents:true}};
  return{ok:false,status:503,reason:'server',retryable:true};
 }
 throw Error('unexpected request');
 }};
 const statuses=[];let changed=0;const a=mod.exports.createOracleMessagingRealtimeAdapter(t);
 const stop=a.subscribeDirect('conversation',{onMessagesChanged:()=>changed++,onStatus:s=>statuses.push(s)});
 await delay(30);stop();
 if(changed!==1||statuses[0]!=='connecting'||!statuses.includes('live'))throw Error('poll lifecycle');
 if(calls[0].query.bootstrap!=='true'||calls[1].query.after!==7)throw Error('cursor bootstrap');
 process.stdout.write('oracle_messaging_realtime_adapter=PASS\n');
})().catch(e=>{console.error(e);process.exit(1)});
