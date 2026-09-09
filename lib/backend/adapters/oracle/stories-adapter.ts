import type {
  ActiveStorySummaryTransportRecord, StoriesContract, StoryAuthorTransportRecord,
  StoryTransportRecord, StoryVideoDropTransportRecord, StoryViewersTransportContext,
} from '@/lib/backend/contracts/stories';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const story=(value:unknown):value is StoryTransportRecord=>record(value)&&typeof value.id==='string'&&typeof value.userId==='string'
  &&['image','video'].includes(String(value.mediaType))&&typeof value.mediaStoragePath==='string'
  &&typeof value.createdAt==='string'&&typeof value.expiresAt==='string';
const author=(value:unknown):value is StoryAuthorTransportRecord=>record(value)&&typeof value.id==='string';
const failure=(message:string)=>({ok:false as const,reason:'unknown' as const,message});
function values<T>(result:unknown,valid:(value:unknown)=>value is T):T[]|null{return record(result)&&Array.isArray(result.items)&&result.items.every(valid)?result.items:null;}
function scalarMap<T extends boolean|number>(value:unknown,valid:(entry:unknown)=>entry is T):Record<string,T>|null{
  if(!record(value)||!Object.values(value).every(valid))return null;return value as Record<string,T>;
}

export function createOracleStoriesAdapter(transport:OracleHttpTransport):StoriesContract{return{
  async create(input){const result=await transport.request<{storyId:unknown}>({method:'POST',path:'/v1/stories',body:input});
    return result.ok&&typeof result.data.storyId==='string'?{ok:true,data:{storyId:result.data.storyId}}:failure('Oracle story creation failed.');},
  async deleteOwned(input){const result=await transport.request<unknown>({method:'POST',path:`/v1/stories/${input.storyId}/delete`,body:{userId:input.userId}});
    if(!result.ok)return {ok:false,reason:result.reason==='not_found'?'not_found':'unknown',message:'Oracle story delete failed.'};
    if(!record(result.data)||!Array.isArray(result.data.storagePaths)||!result.data.storagePaths.every(x=>typeof x==='string'))return failure('Invalid Oracle story delete response.');
    return {ok:true,data:{storagePaths:result.data.storagePaths as string[]}};},
  async listActiveByUser(userId){const result=await transport.request<unknown>({path:`/v1/stories/users/${userId}/active`});const data=result.ok?values(result.data,story):null;
    if(!data)throw new Error('Oracle active stories read failed.');return data;},
  async listActiveForHome(){const result=await transport.request<unknown>({path:'/v1/stories/home'});
    const valid=(value:unknown):value is ActiveStorySummaryTransportRecord=>record(value)&&author(value.author)&&Array.isArray(value.stories)&&value.stories.every(story)&&typeof value.latestCreatedAt==='string';
    const data=result.ok?values(result.data,valid):null;if(!data)throw new Error('Oracle home stories read failed.');return data;},
  async getAuthor(userId){const result=await transport.request<unknown>({path:`/v1/stories/authors/${userId}`});
    if(!result.ok||!record(result.data)||(result.data.item!==null&&!author(result.data.item)))throw new Error('Oracle story author read failed.');return result.data.item as StoryAuthorTransportRecord|null;},
  async getLikeState(viewerId,storyIds){if(!storyIds.length)return{};const result=await transport.request<unknown>({path:'/v1/stories/likes',query:{viewerId,ids:storyIds.join(',')}});
    const data=result.ok&&record(result.data)?scalarMap(result.data.values,(x):x is boolean=>typeof x==='boolean'):null;if(!data)throw new Error('Oracle story like state failed.');return data;},
  async setLiked(input){const result=await transport.request<{liked:unknown}>({method:'POST',path:`/v1/stories/${input.storyId}/like`,body:{likerId:input.likerId,liked:input.liked}});
    return result.ok&&result.data.liked===input.liked?{ok:true,data:{liked:input.liked}}:failure('Oracle story like update failed.');},
  async getLikeCounts(storyIds){if(!storyIds.length)return{};const result=await transport.request<unknown>({path:'/v1/stories/likes/counts',query:{ids:storyIds.join(',')}});
    const data=result.ok&&record(result.data)?scalarMap(result.data.values,(x):x is number=>typeof x==='number'):null;if(!data)throw new Error('Oracle story like counts failed.');return data;},
  async markViewed(input){const result=await transport.request<{ok:unknown}>({method:'POST',path:`/v1/stories/${input.storyId}/view`,body:{viewerId:input.viewerId}});
    return result.ok&&result.data.ok===true?{ok:true,data:undefined}:failure('Oracle story view failed.');},
  async getViewCounts(storyIds){const zero=Object.fromEntries(storyIds.map(id=>[id,0]));if(!storyIds.length)return zero;
    const result=await transport.request<unknown>({path:'/v1/stories/views/counts',query:{ids:storyIds.join(',')}});
    const data=result.ok&&record(result.data)?scalarMap(result.data.values,(x):x is number=>typeof x==='number'):null;if(!data)throw new Error('Oracle story view counts failed.');return {...zero,...data};},
  async getViewersForOwner(input){const result=await transport.request<unknown>({path:`/v1/stories/${input.storyId}/viewers`,query:{ownerId:input.ownerId}});
    if(!result.ok||!record(result.data)||(result.data.item!==null&&!record(result.data.item)))throw new Error('Oracle story viewers read failed.');return result.data.item as StoryViewersTransportContext|null;},
  async listActiveVideoDrops(limit){const result=await transport.request<unknown>({path:'/v1/stories/video-drops',query:{limit}});
    const valid=(value:unknown):value is StoryVideoDropTransportRecord=>record(value)&&typeof value.storyId==='string'&&typeof value.authorId==='string'&&typeof value.createdAt==='string';
    const data=result.ok?values(result.data,valid):null;if(!data)throw new Error('Oracle story video drops failed.');return data;},
};}
