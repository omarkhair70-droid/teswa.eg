import type { PolicyAcceptanceContract, PolicyAcceptanceRecord } from '@/lib/backend/contracts/policies';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const acceptance=(value:unknown):value is PolicyAcceptanceRecord=>record(value)&&typeof value.userId==='string'&&typeof value.policyKey==='string'&&typeof value.policyVersion==='string'&&typeof value.acceptedAt==='string';
const failure=(message:string)=>({ok:false as const,reason:'unknown' as const,message});

export function createOraclePolicyAcceptanceAdapter(transport:OracleHttpTransport):PolicyAcceptanceContract{return{
 async listAcceptances(input){if(!input.policyKeys.length)return{ok:true,data:[]};const result=await transport.request<unknown>({path:'/v1/policies/acceptances',query:{userId:input.userId,keys:input.policyKeys.join(',')}});
  return result.ok&&record(result.data)&&Array.isArray(result.data.items)&&result.data.items.every(acceptance)?{ok:true,data:result.data.items as PolicyAcceptanceRecord[]}:failure('Oracle policy acceptance read failed.');},
 async recordAcceptances(input){const result=await transport.request<unknown>({method:'POST',path:'/v1/policies/acceptances',body:input});
  if(result.ok)return{ok:true,data:undefined};return{ok:false,reason:result.reason==='forbidden'?'forbidden':'unknown',message:'Oracle policy acceptance write failed.'};},
};}
