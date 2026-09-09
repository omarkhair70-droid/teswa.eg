import type {
  ContextualRealtimeMessage, DealRealtimeMessage, MessagingRealtimeContract,
} from '@/lib/backend/contracts/messaging';
import type { BackendConnectionState, TeswaUnsubscribe } from '@/lib/backend/contracts/core';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

type Event = {
  event_id: number;
  source_table: string;
  event_type: 'INSERT'|'UPDATE'|'DELETE';
  aggregate_kind: 'deal'|'direct'|'contextual';
  aggregate_id: string;
  row_id: string|null;
};
type Page = {events:Event[];nextAfter:number;hasEvents:boolean};

function isEvent(value: unknown): value is Event {
  if (!value || typeof value !== 'object') return false;
  const row=value as Record<string,unknown>;
  return Number.isInteger(row.event_id) && typeof row.source_table==='string'
    && ['INSERT','UPDATE','DELETE'].includes(String(row.event_type))
    && ['deal','direct','contextual'].includes(String(row.aggregate_kind))
    && typeof row.aggregate_id==='string' && (row.row_id===null||typeof row.row_id==='string');
}
function isPage(value: unknown): value is Page {
  if (!value || typeof value!=='object') return false;
  const page=value as Record<string,unknown>;
  return Array.isArray(page.events)&&page.events.every(isEvent)
    && Number.isInteger(page.nextAfter)&&typeof page.hasEvents==='boolean';
}
function isDealMessage(value: unknown): value is DealRealtimeMessage {
  if (!value||typeof value!=='object')return false;
  const row=value as Record<string,unknown>;
  return typeof row.id==='string'&&typeof row.dealId==='string'&&typeof row.senderId==='string'
    &&typeof row.body==='string'&&['text','voice'].includes(String(row.messageType))&&typeof row.createdAt==='string';
}
function isContextualMessage(value: unknown): value is ContextualRealtimeMessage {
  if (!value||typeof value!=='object')return false;
  const row=value as Record<string,unknown>;
  return typeof row.id==='string'&&typeof row.conversationId==='string'&&typeof row.senderId==='string'
    &&typeof row.body==='string'&&['text','voice'].includes(String(row.messageKind))&&typeof row.createdAt==='string';
}

function startPolling(
  transport:OracleHttpTransport,
  onEvent:(event:Event)=>Promise<void>|void,
  onStatus?: (status:BackendConnectionState)=>void,
):TeswaUnsubscribe {
  let active=true;
  let cursor=0;
  let retry:ReturnType<typeof setTimeout>|null=null;
  const schedule=(delay:number)=>{
    if(!active)return;
    retry=setTimeout(()=>{void poll(false);},delay);
  };
  const poll=async(bootstrap:boolean)=>{
    if(!active)return;
    const result=await transport.request<unknown>({path:'/v1/realtime/events',query:{
      after:cursor,limit:100,wait_ms:bootstrap?0:4000,bootstrap:bootstrap?'true':'false',
    }});
    if(!active)return;
    if(!result.ok||!isPage(result.data)){
      onStatus?.('offline');
      schedule(1000);
      return;
    }
    cursor=result.data.nextAfter;
    if(bootstrap)onStatus?.('live');
    for(const event of result.data.events) {
      if(!active)return;
      await onEvent(event);
    }
    schedule(0);
  };
  onStatus?.('connecting');
  void poll(true);
  return ()=>{active=false;if(retry)clearTimeout(retry);};
}

async function loadDealMessage(transport:OracleHttpTransport,event:Event) {
  if(!event.row_id)return null;
  const result=await transport.request<unknown>({path:`/v1/deals/${event.aggregate_id}/messages`,query:{limit:100,offset:0,order:'asc'}});
  if(!result.ok||!result.data||typeof result.data!=='object')return null;
  const values=(result.data as {items?:unknown}).items;
  return Array.isArray(values)?values.find(value=>isDealMessage(value)&&value.id===event.row_id) as DealRealtimeMessage|undefined:null;
}
async function loadContextualMessage(transport:OracleHttpTransport,event:Event) {
  if(!event.row_id)return null;
  const result=await transport.request<unknown>({path:`/v1/contextual/conversations/${event.aggregate_id}/messages/${event.row_id}`});
  return result.ok&&isContextualMessage(result.data)?result.data:null;
}

export function createOracleMessagingRealtimeAdapter(
  transport:OracleHttpTransport,
):MessagingRealtimeContract {
  return {
    subscribeInbox(_userId,onChanged) {
      return startPolling(transport,()=>onChanged());
    },
    subscribeDeal(dealId,handlers) {
      return startPolling(transport,async event=>{
        if(event.aggregate_kind!=='deal'||event.aggregate_id!==dealId)return;
        if(event.source_table==='deal_messages'&&event.event_type==='INSERT') {
          const message=await loadDealMessage(transport,event);
          if(message)handlers.onMessage(message);
        } else if(event.source_table==='swap_deals') handlers.onDealChanged();
        else if(event.source_table==='deal_confirmations') handlers.onConfirmationChanged();
      },handlers.onStatus);
    },
    subscribeContextual(conversationId,handlers) {
      return startPolling(transport,async event=>{
        if(event.aggregate_kind!=='contextual'||event.aggregate_id!==conversationId
          ||event.source_table!=='contextual_messages'||event.event_type!=='INSERT')return;
        const message=await loadContextualMessage(transport,event);
        if(message)handlers.onMessage(message);
      },handlers.onStatus);
    },
    subscribeDirect(conversationId,handlers) {
      return startPolling(transport,event=>{
        if(event.aggregate_kind!=='direct'||event.aggregate_id!==conversationId)return;
        if(event.source_table==='direct_conversations')handlers.onConversationChanged?.();
        else if(event.source_table==='direct_messages')handlers.onMessagesChanged?.();
        else if(event.source_table==='direct_message_attachments')handlers.onAttachmentsChanged?.();
        else if(event.source_table==='direct_message_reactions')handlers.onReactionsChanged?.();
        else if(event.source_table==='direct_typing_state')handlers.onTypingChanged?.();
      },handlers.onStatus);
    },
  };
}
