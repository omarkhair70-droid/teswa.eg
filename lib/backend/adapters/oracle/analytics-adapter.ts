import type { AnalyticsContract, AnalyticsTrackResult } from '@/lib/backend/contracts/analytics';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);

export function createOracleAnalyticsAdapter(transport:OracleHttpTransport):AnalyticsContract{return{
 async track(eventName,context){const result=await transport.request<unknown>({method:'POST',path:'/v1/analytics/events',body:{eventName,context}});
  if(!result.ok||!record(result.data)||typeof result.data.accepted!=='boolean'||(result.data.reason!==null&&typeof result.data.reason!=='string'))throw new Error('Oracle analytics write failed.');
  return {accepted:result.data.accepted,reason:result.data.reason as string|null} satisfies AnalyticsTrackResult;},
 async trackPerformance(metricName,durationMs,properties={}){await this.track('performance_metric',{sessionId:'',route:null,entityType:metricName,entityId:null,metadata:{duration_ms:durationMs,...properties},appVersion:null,platform:'unknown'});},
};}
