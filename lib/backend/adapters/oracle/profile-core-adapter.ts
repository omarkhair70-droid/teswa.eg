import type { DirectMessagePrivacy, ProfileCoreContract, TeswaProfile } from '@/lib/backend/contracts/profile';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

function failed(message: string): never { throw new Error(message); }

export function createOracleProfileCoreAdapter(transport: OracleHttpTransport): ProfileCoreContract {
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
  };
}
