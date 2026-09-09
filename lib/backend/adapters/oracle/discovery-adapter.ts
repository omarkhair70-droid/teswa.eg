import type { CityPulseDataRecord, DiscoveryContract } from '@/lib/backend/contracts/discovery';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';
function valid(value:unknown):value is CityPulseDataRecord{if(!value||typeof value!=='object')return false;const row=value as Record<string,unknown>;
 return ['movingItems','storyItems','people','activeStoryAuthors'].every(key=>Array.isArray(row[key]));}
export function createOracleDiscoveryAdapter(transport:OracleHttpTransport):DiscoveryContract{return{async getCityPulse(input){
 const result=await transport.request<unknown>({method:'POST',path:'/v1/discovery/city-pulse',body:input});
 if(!result.ok||!valid(result.data))throw new Error('Oracle City Pulse read failed.');return result.data;
}};}
