import { supabase } from '@/lib/supabase/client';

export type DirectConversationStatus = 'requested' | 'accepted' | 'ignored' | 'blocked';
export type DirectConversationSummary = {
  conversationId: string; status: DirectConversationStatus; requestedBy: string; otherUserId: string;
  otherDisplayName: string | null; otherUsername: string | null; otherAvatarUrl: string | null;
  lastMessageBody: string | null; lastMessageSenderId: string | null; lastMessageAt: string | null; unreadCount: number; requiresAction: boolean;
};
export type DirectMessage = { id: string; senderId: string; body: string; createdAt: string; readAt: string | null };
export type StartDirectConversationResult = { ok: boolean; conversationId: string | null; status: DirectConversationStatus | null; requiresRequest: boolean; message: string };
export type SendDirectMessageResult = { ok: boolean; message: string; messageId: string | null; conversationId: string | null; createdAt: string | null };

export async function startOrGetDirectConversation(targetUserId: string): Promise<StartDirectConversationResult> {
  const { data, error } = await supabase.rpc('start_or_get_direct_conversation', { p_target_user_id: targetUserId });
  if (error) return { ok: false, conversationId: null, status: null, requiresRequest: false, message: 'تعذر فتح المراسلة حالياً.' };
  const row = Array.isArray(data) ? data[0] : null;
  return { ok: !!row?.ok, conversationId: row?.conversation_id ?? null, status: row?.status ?? null, requiresRequest: !!row?.requires_request, message: row?.message ?? 'تعذر فتح المراسلة حالياً.' };
}
export async function fetchMyDirectConversations(): Promise<DirectConversationSummary[]> {
  const { data, error } = await supabase.rpc('get_my_direct_conversations');
  if (error) return [];
  return (data ?? []).map((r: any) => ({ conversationId: r.conversation_id, status: r.status, requestedBy: r.requested_by, otherUserId: r.other_user_id, otherDisplayName: r.other_display_name ?? null, otherUsername: r.other_username ?? null, otherAvatarUrl: r.other_avatar_url ?? null, lastMessageBody: r.last_message_body ?? null, lastMessageSenderId: r.last_message_sender_id ?? null, lastMessageAt: r.last_message_at ?? null, unreadCount: Number(r.unread_count ?? 0), requiresAction: !!r.requires_action }));
}
export async function fetchDirectConversationMessages(conversationId: string): Promise<DirectMessage[]> {
  const { data, error } = await supabase.rpc('get_direct_conversation_messages', { p_conversation_id: conversationId });
  if (error) return [];
  return (data ?? []).map((r: any) => ({ id: r.id, senderId: r.sender_id, body: r.body, createdAt: r.created_at, readAt: r.read_at ?? null }));
}
export async function sendDirectMessage(conversationId: string, body: string): Promise<SendDirectMessageResult> {
  const { data, error } = await supabase.rpc('send_direct_message', { p_conversation_id: conversationId, p_body: body });
  if (error) return { ok: false, message: 'تعذر إرسال الرسالة حالياً.', messageId: null, conversationId: null, createdAt: null };
  const row = Array.isArray(data) ? data[0] : null;
  return { ok: !!row?.ok, message: row?.message ?? 'تعذر إرسال الرسالة حالياً.', messageId: row?.message_id ?? null, conversationId: row?.conversation_id ?? null, createdAt: row?.created_at ?? null };
}
export async function acceptDirectMessageRequest(conversationId: string) { return supabase.rpc('accept_direct_message_request', { p_conversation_id: conversationId }); }
export async function ignoreDirectMessageRequest(conversationId: string) { return supabase.rpc('ignore_direct_message_request', { p_conversation_id: conversationId }); }
