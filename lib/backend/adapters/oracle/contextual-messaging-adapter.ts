import type {
  ContextualConversationSummaryTransportRecord, ContextualMessageTransportRecord,
  ContextualMessagingTransportContract, ContextualThreadTransportRecord,
} from '@/lib/backend/contracts/messaging';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

function record(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function message(value:unknown):value is ContextualMessageTransportRecord{return record(value)&&typeof value.id==='string'
  &&typeof value.conversationId==='string'&&typeof value.senderId==='string'
  &&(value.body===null||typeof value.body==='string')&&['text','voice'].includes(String(value.messageKind))
  &&typeof value.createdAt==='string';}
function summary(value:unknown):value is ContextualConversationSummaryTransportRecord{return record(value)
  &&typeof value.conversationId==='string'&&value.contextType==='story_reply'
  &&typeof value.contextEntityId==='string'&&record(value.otherParticipant)
  &&typeof value.otherParticipant.id==='string'&&typeof value.unreadCount==='number'
  &&typeof value.lastActivityAt==='string';}
function thread(value:unknown):value is ContextualThreadTransportRecord{return record(value)&&typeof value.id==='string'
  &&value.contextType==='story_reply'&&typeof value.contextEntityId==='string'
  &&typeof value.starterId==='string'&&typeof value.recipientId==='string'&&record(value.otherParticipant)
  &&Array.isArray(value.messages)&&value.messages.every(message);}
const failure=(message:string)=>({ok:false as const,reason:'unknown' as const,message});

export function createOracleContextualMessagingAdapter(transport:OracleHttpTransport):ContextualMessagingTransportContract{return{
  async notifyMessage(input){const result=await transport.request<{ok:unknown}>({method:'POST',path:'/v1/contextual/notifications',body:input});
    return result.ok&&result.data.ok===true?{ok:true,data:undefined}:failure('Oracle contextual notification failed.');},
  async markRead(conversationId){const result=await transport.request<{ok:unknown}>({method:'POST',path:'/v1/contextual/read',body:{conversationId}});
    return result.ok&&result.data.ok===true?{ok:true,data:undefined}:failure('Oracle contextual read marker failed.');},
  async getUnreadCount(){const result=await transport.request<{count:unknown}>({path:'/v1/contextual/unread'});
    if(!result.ok||typeof result.data.count!=='number')throw new Error('Oracle contextual unread count failed.');return Math.max(0,result.data.count);},
  async getStoryOwnerId(storyId){const result=await transport.request<{userId:unknown}>({path:`/v1/contextual/stories/${storyId}/owner`});
    if(!result.ok)throw new Error('Oracle story owner read failed.');return typeof result.data.userId==='string'?result.data.userId:null;},
  async createStoryReplyThread(input){const result=await transport.request<unknown>({method:'POST',path:`/v1/contextual/stories/${input.storyId}/reply`,body:{body:input.body}});
    if(!result.ok)return {ok:false,reason:result.reason==='not_found'?'not_found':'unknown',message:'Oracle story reply failed.'};
    if(!record(result.data)||typeof result.data.conversationId!=='string'||typeof result.data.messageId!=='string')return failure('Invalid Oracle story reply response.');
    return {ok:true,data:{conversationId:result.data.conversationId,messageId:result.data.messageId}};},
  async listSummaries(userId){const result=await transport.request<unknown>({path:'/v1/contextual/conversations',query:{userId}});
    if(!result.ok||!record(result.data)||!Array.isArray(result.data.items)||!result.data.items.every(summary))throw new Error('Oracle contextual inbox read failed.');
    return result.data.items as ContextualConversationSummaryTransportRecord[];},
  async getThread(input){const result=await transport.request<unknown>({path:`/v1/contextual/conversations/${input.conversationId}`});
    if(!result.ok)return {ok:false,reason:result.reason==='forbidden'?'unauthorized':'unknown',message:'Oracle contextual thread read failed.'};
    if(!record(result.data)||(result.data.item!==null&&!thread(result.data.item)))return failure('Invalid Oracle contextual thread response.');
    return {ok:true,data:result.data.item as ContextualThreadTransportRecord|null};},
  async getOtherParticipantId(input){const result=await transport.request<{userId:unknown}>({path:`/v1/contextual/conversations/${input.conversationId}/other`});
    return result.ok&&typeof result.data.userId==='string'?result.data.userId:null;},
  async sendText(input){const result=await transport.request<unknown>({method:'POST',path:`/v1/contextual/conversations/${input.conversationId}/messages`,body:{senderId:input.senderId,body:input.body}});
    return result.ok&&message(result.data)?{ok:true,data:result.data}:failure('Oracle contextual message failed.');},
  async ensureStoryReplyConversation(storyId){const result=await transport.request<unknown>({method:'POST',path:`/v1/contextual/stories/${storyId}/ensure`,body:{}});
    if(!result.ok)return {ok:false,reason:result.reason==='not_found'?'not_found':'unknown',message:'Oracle contextual conversation failed.'};
    return record(result.data)&&typeof result.data.conversationId==='string'?{ok:true,data:{conversationId:result.data.conversationId}}:failure('Invalid Oracle contextual conversation response.');},
  async sendVoiceMetadata(input){const result=await transport.request<unknown>({method:'POST',path:`/v1/contextual/conversations/${input.conversationId}/voice`,body:{
      senderId:input.senderId,mediaStoragePath:input.mediaStoragePath,mediaDurationMs:input.mediaDurationMs}});
    return result.ok&&message(result.data)?{ok:true,data:result.data}:failure('Oracle contextual voice message failed.');},
};}
