import type {
  BlockedProfileRecord, DetailedProfileBadge, DetailedTrustMetrics, DirectMessagePrivacy,
  ProfileConnectionRecord, ProfileSocialContract, SocialActionOutcome, SocialFollowState,
  TeswaProfile, UserBlockStateSnapshot,
} from '@/lib/backend/contracts/profile';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

function failed(message: string): never { throw new Error(message); }

export function createOracleProfileSocialAdapter(transport: OracleHttpTransport): ProfileSocialContract {
  const get = async (path: string): Promise<TeswaProfile | null> => {
    const result = await transport.request<TeswaProfile>({ path });
    if (!result.ok) {
      if (result.reason === 'not_found') return null;
      return failed('Oracle profile read failed.');
    }
    return result.data;
  };
  return {
    getMine: (_userId) => get('/v1/profiles/me'),
    getPublic: (profileId) => get(`/v1/profiles/${profileId.trim()}`),
    async setupMine(input) {
      const result = await transport.request<{ok: boolean}>({ method:'POST', path:'/v1/profiles/setup', body:input });
      if (result.ok && result.data.ok) return {ok:true,data:undefined};
      return {ok:false,reason:!result.ok && result.reason==='conflict' ? 'username_taken' : 'unknown',message:'Oracle profile setup failed.'};
    },
    async getDirectMessagePrivacy(_userId) {
      const profile = await transport.request<{value: DirectMessagePrivacy}>({path:'/v1/profiles/privacy'});
      if (!profile.ok) return failed('Oracle profile privacy read failed.');
      return profile.data.value;
    },
    async updateDirectMessagePrivacy(userId, value) {
      const result=await transport.request<{ok:boolean}>({method:'POST',path:'/v1/profiles/privacy',body:{userId,value}});
      return result.ok && result.data.ok ? {ok:true,data:undefined} : {ok:false,reason:'unknown',message:'Oracle profile privacy update failed.'};
    },
    async setProfileImageUrl(userId, kind, imageUrl) {
      const result=await transport.request<{ok:boolean}>({method:'POST',path:'/v1/profiles/image',body:{userId,kind,imageUrl}});
      if (result.ok && result.data.ok) return {ok:true,data:undefined};
      return {ok:false,reason:!result.ok && result.reason==='not_found' ? 'not_found' : 'unknown',message:'Oracle profile image update failed.'};
    },
    async updateMine(input) {
      const result=await transport.request<TeswaProfile>({method:'POST',path:'/v1/profiles/update',body:{
        userId:input.userId,displayName:input.displayName,username:input.username,
        profileTagline:input.profileTagline ?? null,bio:input.bio ?? null,city:input.city ?? null,area:input.area ?? null,
      }});
      if (result.ok) return {ok:true,data:result.data};
      const reason = result.reason==='conflict' ? 'username_taken' : result.reason==='not_found' ? 'not_found' : 'unknown';
      return {ok:false,reason,message:'Oracle profile update failed.'};
    },
    async getFollowState(_viewerId, profileId) {
      const result=await transport.request<SocialFollowState>({path:`/v1/profiles/${profileId}/follow-state`});
      if (!result.ok) return failed('Oracle follow state read failed.');
      return result.data;
    },
    async follow(viewerId, profileId) {
      return socialAction(transport, viewerId, profileId, 'follow');
    },
    async unfollow(viewerId, profileId) {
      return socialAction(transport, viewerId, profileId, 'unfollow');
    },
    async listConnections(profileId, mode, limit=50) {
      const result=await transport.request<{items:ProfileConnectionRecord[]}>({path:`/v1/profiles/${profileId}/connections`,query:{mode,limit}});
      if (!result.ok || !Array.isArray(result.data.items)) return failed('Oracle profile connections read failed.');
      return result.data.items;
    },
    async getBlockState(_viewerId, profileId) {
      const result=await transport.request<UserBlockStateSnapshot>({path:`/v1/profiles/${profileId}/block-state`});
      if (!result.ok) return failed('Oracle block state read failed.');
      return result.data;
    },
    async listBlocked(_viewerId) {
      const result=await transport.request<{items:BlockedProfileRecord[]}>({path:'/v1/profiles/blocked'});
      if (!result.ok || !Array.isArray(result.data.items)) return failed('Oracle blocked profiles read failed.');
      return result.data.items;
    },
    async block(viewerId, profileId) {
      return socialAction(transport, viewerId, profileId, 'block');
    },
    async unblock(viewerId, profileId) {
      return socialAction(transport, viewerId, profileId, 'unblock');
    },
    async getTrustMetrics(profileId) {
      const result=await transport.request<{metrics:DetailedTrustMetrics|null}>({path:`/v1/profiles/${profileId}/trust`});
      if (!result.ok) return failed('Oracle trust metrics read failed.');
      return result.data.metrics;
    },
    async getMyTrustMetrics() {
      const result=await transport.request<{metrics:DetailedTrustMetrics|null}>({path:'/v1/profiles/me/trust'});
      if (!result.ok) return failed('Oracle trust metrics read failed.');
      return result.data.metrics;
    },
    async getBadges(profileId) {
      const result=await transport.request<{items:DetailedProfileBadge[]}>({path:`/v1/profiles/${profileId}/badges`});
      if (!result.ok || !Array.isArray(result.data.items)) return failed('Oracle profile badges read failed.');
      return result.data.items;
    },
    async getMyBadges() {
      const result=await transport.request<{items:DetailedProfileBadge[]}>({path:'/v1/profiles/me/badges'});
      if (!result.ok || !Array.isArray(result.data.items)) return failed('Oracle profile badges read failed.');
      return result.data.items;
    },
    async refreshMyBadges() {
      const result=await transport.request<{awardedBadges:string[]}>({method:'POST',path:'/v1/profiles/badges/refresh',body:{}});
      if (!result.ok || !Array.isArray(result.data.awardedBadges)) return failed('Oracle profile badge refresh failed.');
      return result.data.awardedBadges;
    },
    async listPeople(input) {
      const result=await transport.request<{entries:import('@/lib/backend/contracts/profile').PeopleDirectoryRecord[];hasMore:boolean}>({
        path:'/v1/people',query:{query:input.query,page:input.page,pageSize:input.pageSize},
      });
      if (!result.ok || !Array.isArray(result.data.entries) || typeof result.data.hasMore!=='boolean') {
        return failed('Oracle people directory read failed.');
      }
      return result.data;
    },
  };
}

async function socialAction(
  transport: OracleHttpTransport, viewerId: string, profileId: string,
  action: 'follow'|'unfollow'|'block'|'unblock',
) {
  const result=await transport.request<SocialActionOutcome & {ok:boolean}>({
    method:'POST',path:`/v1/profiles/${profileId}/${action}`,body:{userId:viewerId},
  });
  if (!result.ok || result.data.ok !== true) return {ok:false as const,reason:'unknown' as const,message:'Oracle social action failed.'};
  return {ok:true as const,data:{message:result.data.message,code:result.data.code}};
}

// Kept for callers that only need the core subset while the complete runtime
// is still gated by runtime-composition.
export const createOracleProfileCoreAdapter = createOracleProfileSocialAdapter;
