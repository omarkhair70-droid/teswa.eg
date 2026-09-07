import type { DealLifecycleContract, DealLifecycleMessageRecord, OfferLifecycleContract } from '@/lib/backend/contracts/offers-deals';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

export type OracleOfferWriteAdapter = Pick<OfferLifecycleContract,'create'|'recordCreatedEvent'|'accept'>;
export type OracleDealWriteAdapter = Pick<DealLifecycleContract,'insertTextMessage'>;

export function createOracleOfferWriteAdapter(transport:OracleHttpTransport):OracleOfferWriteAdapter {
  const recorded=new Map<string,string>();
  return {
    async create(input) {
      const result=await transport.request<{offerId:string,eventRecorded:boolean}>({method:'POST',path:'/v1/offers',body:{...input,message:input.message?.trim()||null}});
      if (!result.ok||!result.data.offerId||result.data.eventRecorded!==true) return {ok:false,reason:'unknown',message:'Oracle offer creation failed.'};
      recorded.set(result.data.offerId,input.senderId); return {ok:true,data:{offerId:result.data.offerId}};
    },
    async recordCreatedEvent(input) {
      if(recorded.get(input.offerId)!==input.actorId) return {ok:false,reason:'unknown',message:'Oracle offer event was not recorded.'};
      recorded.delete(input.offerId); return {ok:true,data:undefined};
    },
    async accept(offerId) {
      const result=await transport.request<{dealId:string}>({method:'POST',path:`/v1/offers/${offerId}/accept`,body:{}});
      if(!result.ok||!result.data.dealId) return {ok:false,reason:'unknown',message:'Oracle offer acceptance failed.'};
      return {ok:true,data:{dealId:result.data.dealId}};
    },
  };
}

export function createOracleDealWriteAdapter(transport:OracleHttpTransport):OracleDealWriteAdapter {
  return { async insertTextMessage(input) {
    const result=await transport.request<DealLifecycleMessageRecord>({method:'POST',path:`/v1/deals/${input.dealId}/messages`,body:{senderId:input.senderId,body:input.body}});
    if(!result.ok||!result.data||result.data.dealId!==input.dealId||result.data.senderId!==input.senderId)
      return {ok:false,reason:'unknown',message:'Oracle deal message failed.'};
    return {ok:true,data:result.data};
  }};
}
