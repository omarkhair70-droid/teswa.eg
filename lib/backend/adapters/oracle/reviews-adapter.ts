import type { DealReviewContextRecord, ReviewsContract } from '@/lib/backend/contracts/reviews';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';
export function createOracleReviewsAdapter(transport:OracleHttpTransport):ReviewsContract{return{
 async getDealReviewContext(input){const r=await transport.request<DealReviewContextRecord>({path:`/v1/reviews/deals/${input.dealId}`});if(r.ok)return{ok:true,data:r.data};const reason=r.reason==='not_found'?'not_found':r.status===409?'deal_not_completed':r.reason==='forbidden'?'unauthorized':'unknown';return{ok:false,reason,message:'Oracle deal review context failed.'};},
 async createDealReview(input){const r=await transport.request<{ok:boolean}>({method:'POST',path:'/v1/reviews',body:input});if(r.ok)return r.data.ok?{ok:true,data:undefined}:{ok:false,reason:'unknown',message:'Oracle deal review failed.'};return{ok:false,reason:r.status===409?'duplicate':r.reason==='forbidden'?'unauthorized':'unknown',message:'Oracle deal review failed.'};}
};}
