import type { AccountDeletionTransportResponse, AccountLifecycleContract } from '@/lib/backend/contracts/account';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);

export function createOracleAccountLifecycleAdapter(transport:OracleHttpTransport):AccountLifecycleContract{return{
 async requestDeletion(){const result=await transport.request<unknown>({method:'POST',path:'/v1/account/deletion-request',body:{}});
  if(!result.ok)return{ok:false,reason:'request_failed',message:'Oracle account deletion request failed.'};
  if(!record(result.data)||typeof result.data.ok!=='boolean'||(result.data.message!==null&&typeof result.data.message!=='string')||(result.data.errorCode!==null&&typeof result.data.errorCode!=='string'))return{ok:false,reason:'unknown',message:'Invalid Oracle account deletion response.'};
  return{ok:true,data:result.data as AccountDeletionTransportResponse};},
};}
