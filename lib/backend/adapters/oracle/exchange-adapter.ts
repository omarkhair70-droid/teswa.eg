import type { DealLifecycleContract, DealLifecycleMessageRecord, OfferLifecycleContract } from '@/lib/backend/contracts/offers-deals';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

export type OracleOfferWriteAdapter = Pick<OfferLifecycleContract,'create'|'recordCreatedEvent'|'accept'|'markThinking'|'softReject'>;
export type OracleDealWriteAdapter = Pick<DealLifecycleContract,'insertTextMessage'|'insertVoiceMessage'|'markRead'|'confirm'|'completeIfReady'>;

function failed(message: string) {
  return {ok:false as const,reason:'unknown' as const,message};
}

export function createOracleOfferWriteAdapter(transport:OracleHttpTransport):OracleOfferWriteAdapter {
  const recorded=new Map<string,string>();
  return {
    async create(input) {
      const result=await transport.request<{offerId:string,eventRecorded:boolean}>({method:'POST',path:'/v1/offers',body:{...input,message:input.message?.trim()||null}});
      if (!result.ok||!result.data.offerId||result.data.eventRecorded!==true) return failed('Oracle offer creation failed.');
      recorded.set(result.data.offerId,input.senderId); return {ok:true,data:{offerId:result.data.offerId}};
    },
    async recordCreatedEvent(input) {
      if(recorded.get(input.offerId)!==input.actorId) return failed('Oracle offer event was not recorded.');
      recorded.delete(input.offerId); return {ok:true,data:undefined};
    },
    async markThinking(offerId,note) {
      const result=await transport.request<{ok:boolean}>({method:'POST',path:`/v1/offers/${offerId}/thinking`,body:{note:note?.trim()||null}});
      return result.ok&&result.data.ok===true ? {ok:true,data:undefined} : failed('Oracle offer transition failed.');
    },
    async softReject(offerId,note) {
      const result=await transport.request<{ok:boolean}>({method:'POST',path:`/v1/offers/${offerId}/soft-reject`,body:{note:note?.trim()||null}});
      return result.ok&&result.data.ok===true ? {ok:true,data:undefined} : failed('Oracle offer rejection failed.');
    },
    async accept(offerId) {
      const result=await transport.request<{dealId:string}>({method:'POST',path:`/v1/offers/${offerId}/accept`,body:{}});
      if(!result.ok||!result.data.dealId) return failed('Oracle offer acceptance failed.');
      return {ok:true,data:{dealId:result.data.dealId}};
    },
  };
}

export function createOracleDealWriteAdapter(transport:OracleHttpTransport):OracleDealWriteAdapter {
  return {
    async insertTextMessage(input) {
      const result=await transport.request<DealLifecycleMessageRecord>({method:'POST',path:`/v1/deals/${input.dealId}/messages`,body:{senderId:input.senderId,body:input.body}});
      if(!result.ok||!result.data||result.data.dealId!==input.dealId||result.data.senderId!==input.senderId)
        return failed('Oracle deal message failed.');
      return {ok:true,data:result.data};
    },
    async insertVoiceMessage(input) {
      const result=await transport.request<DealLifecycleMessageRecord>({
        method:'POST', path:`/v1/deals/${input.dealId}/messages`,
        body:{...input,messageType:'voice'},
      });
      if(!result.ok||!result.data||result.data.dealId!==input.dealId
        ||result.data.senderId!==input.senderId||result.data.messageType!=='voice'
        ||result.data.audioStoragePath!==input.audioStoragePath)
        return failed('Oracle deal voice message failed.');
      return {ok:true,data:result.data};
    },
    async markRead(dealId) {
      const result=await transport.request<{ok:boolean}>({method:'POST',path:`/v1/deals/${dealId}/read`,body:{}});
      return result.ok&&result.data.ok===true ? {ok:true,data:undefined} : failed('Oracle deal read failed.');
    },
    async confirm(input) {
      const result=await transport.request<{ok:boolean}>({method:'POST',path:`/v1/deals/${input.dealId}/confirmations`,body:{userId:input.userId,note:input.note?.trim()||null}});
      return result.ok&&result.data.ok===true ? {ok:true,data:undefined} : failed('Oracle deal confirmation failed.');
    },
    async completeIfReady(dealId) {
      const result=await transport.request<{completed:boolean}>({method:'POST',path:`/v1/deals/${dealId}/complete`,body:{}});
      return result.ok&&typeof result.data.completed==='boolean' ? {ok:true,data:result.data.completed} : failed('Oracle deal completion failed.');
    },
  };
}
