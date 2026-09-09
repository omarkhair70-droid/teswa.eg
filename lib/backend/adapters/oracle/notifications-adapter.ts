import type { NotificationPreferences, NotificationsContract, TeswaNotification } from '@/lib/backend/contracts/notifications';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

const fail = (message:string):never => { throw new Error(message); };

export function createOracleNotificationsAdapter(transport:OracleHttpTransport):NotificationsContract {
  const ok = async(path:string,body:unknown) => {
    const result=await transport.request<{ok:boolean}>({method:'POST',path,body});
    return result.ok && result.data.ok ? {ok:true as const,data:undefined} : {ok:false as const,reason:'unknown' as const,message:'Oracle notification write failed.'};
  };
  return {
    async list(_userId,limit=50){const r=await transport.request<{items:TeswaNotification[]}>({path:'/v1/notifications',query:{limit}});return r.ok&&Array.isArray(r.data.items)?r.data.items:fail('Oracle notifications read failed.');},
    async getUnreadCount(){const r=await transport.request<{count:number}>({path:'/v1/notifications/unread'});return r.ok&&Number.isInteger(r.data.count)?r.data.count:fail('Oracle unread count failed.');},
    async markRead(userId,notificationId){const r=await transport.request<{ok:boolean}>({method:'POST',path:'/v1/notifications/read',body:{userId,notificationId}});if(r.ok&&r.data.ok)return {ok:true,data:undefined};return {ok:false,reason:!r.ok&&r.reason==='not_found'?'not_found':'unknown',message:'Oracle notification read update failed.'};},
    markAllRead:(userId)=>ok('/v1/notifications/read-all',{userId}),
    async getPreferences(){const r=await transport.request<NotificationPreferences>({path:'/v1/notifications/preferences'});return r.ok?r.data:fail('Oracle notification preferences failed.');},
    async updatePreferences(_userId,patch){const r=await transport.request<NotificationPreferences>({method:'POST',path:'/v1/notifications/preferences',body:patch});return r.ok?{ok:true,data:r.data}:{ok:false,reason:r.reason==='unknown'?'validation':'unknown',message:'Oracle notification preferences update failed.'};},
    syncTimezone:(timezone)=>ok('/v1/notifications/timezone',{timezone}),
    registerPushDevice:(input)=>ok('/v1/notifications/push/register',input),
    disablePushDevice:(input)=>ok('/v1/notifications/push/disable',input),
    async dispatch(input){const result=await transport.request<{accepted:boolean}>({method:'POST',path:'/v1/notifications/dispatch',body:{targetUserId:input.targetUserId,type:input.type,title:input.title,body:input.body??null,itemId:input.itemId??null,offerId:input.offerId??null,dealId:input.dealId??null,messageId:input.messageId??null}});return result.ok&&result.data.accepted===true?{ok:true,data:undefined}:{ok:false,reason:'unknown',message:'Oracle notification dispatch was not accepted.'};},
  };
}
