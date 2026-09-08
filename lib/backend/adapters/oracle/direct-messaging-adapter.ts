import type {
  DirectMessagingTransportContract, DirectConversationTransportRecord,
  DirectMessageTransportRecord, NativeDirectMessageTransportRecord,
} from '@/lib/backend/contracts/messaging';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function items<T>(value: unknown, valid: (item: unknown) => item is T): T[] | null {
  if (!object(value) || !Array.isArray(value.items) || !value.items.every(valid)) return null;
  return value.items;
}
function conversation(value: unknown): value is DirectConversationTransportRecord {
  return object(value) && typeof value.conversationId === 'string'
    && ['requested','accepted','ignored','blocked'].includes(String(value.status))
    && typeof value.requestedBy === 'string' && typeof value.otherUserId === 'string'
    && typeof value.unreadCount === 'number' && typeof value.requiresAction === 'boolean';
}
function message(value: unknown): value is DirectMessageTransportRecord {
  return object(value) && typeof value.id === 'string' && typeof value.senderId === 'string'
    && typeof value.body === 'string' && ['text','voice'].includes(String(value.messageType))
    && typeof value.createdAt === 'string';
}
function nativeMessage(value: unknown): value is NativeDirectMessageTransportRecord {
  if (!message(value)) return false;
  const candidate = value as unknown as Record<string, unknown>;
  return Array.isArray(candidate.attachments) && Array.isArray(candidate.reactions)
    && object(candidate.metadata);
}
function unknownFailure(message: string) {
  return { ok: false as const, reason: 'unknown' as const, message };
}

export function createOracleDirectMessagingAdapter(
  transport: OracleHttpTransport,
): DirectMessagingTransportContract {
  return {
    async startOrGet(targetUserId) {
      const result = await transport.request<Record<string, unknown>>({method:'POST',path:'/v1/direct/conversations/start',body:{targetUserId}});
      if (!result.ok || typeof result.data.ok !== 'boolean') return unknownFailure('Oracle direct conversation start failed.');
      return {ok:true,data:{ok:result.data.ok,conversationId:typeof result.data.conversationId==='string'?result.data.conversationId:null,
        status:['requested','accepted','ignored','blocked'].includes(String(result.data.status))?result.data.status as any:null,
        requiresRequest:Boolean(result.data.requiresRequest),message:typeof result.data.message==='string'?result.data.message:null}};
    },
    async startWithMessage(targetUserId, body) {
      const result = await transport.request<Record<string, unknown>>({method:'POST',path:'/v1/direct/conversations/start-with-message',body:{targetUserId,body}});
      if (!result.ok || typeof result.data.ok !== 'boolean') return unknownFailure('Oracle direct conversation request failed.');
      return {ok:true,data:{ok:result.data.ok,conversationId:typeof result.data.conversationId==='string'?result.data.conversationId:null,
        messageId:typeof result.data.messageId==='string'?result.data.messageId:null,
        status:['requested','accepted','ignored','blocked'].includes(String(result.data.status))?result.data.status as any:null,
        createdAt:typeof result.data.createdAt==='string'?result.data.createdAt:null,
        message:typeof result.data.message==='string'?result.data.message:null}};
    },
    async listConversations() {
      const result = await transport.request<unknown>({path:'/v1/direct/conversations'});
      const data = result.ok ? items(result.data, conversation) : null;
      return data ? {ok:true,data} : unknownFailure('Oracle direct inbox read failed.');
    },
    async getConversation(conversationId) {
      const result = await transport.request<unknown>({path:`/v1/direct/conversations/${conversationId}`});
      if (!result.ok || !object(result.data) || (result.data.item !== null && !conversation(result.data.item))) {
        return unknownFailure('Oracle direct conversation read failed.');
      }
      return {ok:true,data:result.data.item as DirectConversationTransportRecord | null};
    },
    async listMessages(conversationId) {
      const result = await transport.request<unknown>({path:`/v1/direct/conversations/${conversationId}/messages`});
      const data = result.ok ? items(result.data, message) : null;
      return data ? {ok:true,data} : unknownFailure('Oracle direct messages read failed.');
    },
    async sendText(conversationId, body) {
      const result = await transport.request<Record<string, unknown>>({method:'POST',path:`/v1/direct/conversations/${conversationId}/messages`,body:{body}});
      if (!result.ok) return {ok:false,reason:result.reason==='forbidden'?'forbidden':'unknown',message:'Oracle direct message failed.'};
      if (typeof result.data.ok !== 'boolean') return unknownFailure('Invalid Oracle direct message response.');
      return {ok:true,data:{ok:result.data.ok,message:typeof result.data.message==='string'?result.data.message:null,
        messageId:typeof result.data.messageId==='string'?result.data.messageId:null,
        conversationId:typeof result.data.conversationId==='string'?result.data.conversationId:null,
        createdAt:typeof result.data.createdAt==='string'?result.data.createdAt:null}};
    },
    async sendVoice(input) {
      const {conversationId,...body}=input;
      const result=await transport.request<Record<string,unknown>>({method:'POST',path:`/v1/direct/conversations/${conversationId}/voice`,body});
      if(!result.ok||typeof result.data.ok!=='boolean')return unknownFailure('Oracle direct voice message failed.');
      return {ok:true,data:{ok:result.data.ok,message:typeof result.data.message==='string'?result.data.message:null,
        messageId:typeof result.data.messageId==='string'?result.data.messageId:null,
        createdAt:typeof result.data.createdAt==='string'?result.data.createdAt:null}};
    },
    async actOnRequest(action, conversationId) {
      const result=await transport.request<Record<string,unknown>>({method:'POST',path:`/v1/direct/conversations/${conversationId}/${action}`,body:{}});
      if(!result.ok||typeof result.data.ok!=='boolean')return unknownFailure('Oracle direct request action failed.');
      return {ok:true,data:{ok:result.data.ok,message:typeof result.data.message==='string'?result.data.message:null}};
    },
    async markRead(conversationId) {
      const result=await transport.request<Record<string,unknown>>({method:'POST',path:`/v1/direct/conversations/${conversationId}/read`,body:{}});
      return result.ok&&result.data.ok===true?{ok:true,data:undefined}:unknownFailure('Oracle direct read marker failed.');
    },
    async listNativeMessages(input) {
      const result=await transport.request<unknown>({path:`/v1/direct/conversations/${input.conversationId}/native`,query:{limit:input.limit,before:input.before}});
      const data=result.ok?items(result.data,nativeMessage):null;
      return data?{ok:true,data}:unknownFailure('Oracle native direct messages read failed.');
    },
    async sendNativeMessage(input) {
      const result=await transport.request<Record<string,unknown>>({method:'POST',path:`/v1/direct/conversations/${input.conversationId}/native`,body:{
        body:input.body??null,replyToMessageId:input.replyToMessageId??null,attachments:input.attachments??[],metadata:input.metadata??{},
      }});
      if(!result.ok||typeof result.data.ok!=='boolean')return unknownFailure('Oracle native direct message failed.');
      return {ok:true,data:{ok:result.data.ok,message:typeof result.data.message==='string'?result.data.message:null,
        messageId:typeof result.data.messageId==='string'?result.data.messageId:null,
        createdAt:typeof result.data.createdAt==='string'?result.data.createdAt:null}};
    },
    async markNativeRead(conversationId) {
      const result=await transport.request<Record<string,unknown>>({method:'POST',path:`/v1/direct/conversations/${conversationId}/read`,body:{}});
      if(!result.ok||typeof result.data.ok!=='boolean')return unknownFailure('Oracle native direct read marker failed.');
      return {ok:true,data:{ok:result.data.ok,readAt:typeof result.data.readAt==='string'?result.data.readAt:null}};
    },
    async toggleNativeReaction(messageId,reaction) {
      const result=await transport.request<Record<string,unknown>>({method:'POST',path:`/v1/direct/messages/${messageId}/reaction`,body:{reaction}});
      if(!result.ok||typeof result.data.ok!=='boolean'||typeof result.data.count!=='number')return unknownFailure('Oracle direct reaction failed.');
      return {ok:true,data:{ok:result.data.ok,enabled:Boolean(result.data.enabled),count:result.data.count}};
    },
    async setNativeTyping(conversationId,isTyping) {
      const result=await transport.request<Record<string,unknown>>({method:'POST',path:`/v1/direct/conversations/${conversationId}/typing`,body:{isTyping}});
      return result.ok&&typeof result.data.ok==='boolean'?{ok:true,data:result.data.ok}:unknownFailure('Oracle direct typing update failed.');
    },
    async listNativeTypingUsers(conversationId) {
      const result=await transport.request<unknown>({path:`/v1/direct/conversations/${conversationId}/typing`});
      if(!result.ok||!object(result.data)||!Array.isArray(result.data.userIds)||!result.data.userIds.every(id=>typeof id==='string')) {
        return unknownFailure('Oracle direct typing read failed.');
      }
      return {ok:true,data:result.data.userIds as string[]};
    },
    async deleteNativeMessage(messageId) {
      const result=await transport.request<unknown>({method:'POST',path:`/v1/direct/messages/${messageId}/delete`,body:{}});
      if(!result.ok||!object(result.data)||result.data.ok!==true||!Array.isArray(result.data.storagePaths)
        ||!result.data.storagePaths.every(path=>typeof path==='string')) return unknownFailure('Oracle direct message delete failed.');
      return {ok:true,data:{storagePaths:result.data.storagePaths as string[]}};
    },
  };
}
