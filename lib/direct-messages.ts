import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase/client';

const DIRECT_VOICE_MESSAGES_BUCKET = 'direct-voice-messages';
const DIRECT_VOICE_MESSAGE_MAX_SIZE_BYTES = 15 * 1024 * 1024;

export type DirectConversationStatus = 'requested' | 'accepted' | 'ignored' | 'blocked';
export type DirectConversationSummary = {
  conversationId: string; status: DirectConversationStatus; requestedBy: string; otherUserId: string;
  otherDisplayName: string | null; otherUsername: string | null; otherAvatarUrl: string | null;
  lastMessageBody: string | null; lastMessageSenderId: string | null; lastMessageAt: string | null;
  unreadCount: number; requiresAction: boolean;
};
export type DirectMessage = { id: string; senderId: string; body: string; messageType: 'text' | 'voice'; audioStoragePath: string | null; audioDurationMs: number | null; audioMimeType: string | null; audioSizeBytes: number | null; createdAt: string; readAt: string | null };
export type FetchDirectMessagesResult =
  | { ok: true; messages: DirectMessage[] }
  | { ok: false; message: string; messages: DirectMessage[] };
export type StartDirectConversationResult = { ok: boolean; conversationId: string | null; status: DirectConversationStatus | null; requiresRequest: boolean; message: string };
export type SendDirectMessageResult = { ok: boolean; message: string; messageId: string | null; conversationId: string | null; createdAt: string | null };
export type DirectRequestActionResult = { ok: boolean; message: string };

function getAudioExtension(name: string | null | undefined, mimeType: string): string {
  const fromName = name?.split('.').pop()?.toLowerCase()?.trim();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  const fromMime = mimeType.split('/').pop()?.toLowerCase()?.trim();
  if (fromMime && /^[a-z0-9]+$/.test(fromMime)) return fromMime;
  return 'm4a';
}
function sanitizeAudioFileName(name: string | null | undefined, fallback: string): string {
  const raw = (name || fallback).toLowerCase();
  return raw.replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-');
}
async function fileUriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  return response.arrayBuffer();
}


function normalizeConversationSummaryRow(r: any): DirectConversationSummary {
  return {
    conversationId: r.conversation_id,
    status: r.status,
    requestedBy: r.requested_by,
    otherUserId: r.other_user_id,
    otherDisplayName: r.other_display_name ?? null,
    otherUsername: r.other_username ?? null,
    otherAvatarUrl: r.other_avatar_url ?? null,
    lastMessageBody: r.last_message_body ?? null,
    lastMessageSenderId: r.last_message_sender_id ?? null,
    lastMessageAt: r.last_message_at ?? null,
    unreadCount: Number(r.unread_count ?? 0),
    requiresAction: !!r.requires_action,
  };
}

function getConversationSortTimestamp(item: DirectConversationSummary): number {
  const ms = item.lastMessageAt ? Date.parse(item.lastMessageAt) : Number.NaN;
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

export async function startOrGetDirectConversation(targetUserId: string): Promise<StartDirectConversationResult> { const { data, error } = await supabase.rpc('start_or_get_direct_conversation', { p_target_user_id: targetUserId }); if (error) return { ok: false, conversationId: null, status: null, requiresRequest: false, message: 'تعذر فتح المراسلة حالياً.' }; const row = Array.isArray(data) ? data[0] : null; return { ok: !!row?.ok, conversationId: row?.conversation_id ?? null, status: row?.status ?? null, requiresRequest: !!row?.requires_request, message: row?.message ?? 'تعذر فتح المراسلة حالياً.' }; }
export async function fetchMyDirectConversations(): Promise<DirectConversationSummary[]> { const { data, error } = await supabase.rpc('get_my_direct_conversations'); if (error) return []; return (data ?? []).map(normalizeConversationSummaryRow).sort((a, b) => getConversationSortTimestamp(b) - getConversationSortTimestamp(a)); }
export async function fetchDirectConversation(conversationId: string): Promise<DirectConversationSummary | null> {
  const { data, error } = await supabase.rpc('get_direct_conversation', { p_conversation_id: conversationId });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return normalizeConversationSummaryRow(row);
}
export async function fetchDirectConversationMessages(conversationId: string): Promise<FetchDirectMessagesResult> {
  const { data, error } = await supabase.rpc('get_direct_conversation_messages', { p_conversation_id: conversationId });
  if (error) {
    if (__DEV__) console.warn('[direct] get_direct_conversation_messages failed', { code: error.code, message: error.message });
    return { ok: false, message: 'تعذر تحميل الرسائل حالياً.', messages: [] };
  }
  return { ok: true, messages: (data ?? []).map((r: any) => ({ id: r.id, senderId: r.sender_id, body: r.body, messageType: r.message_type === 'voice' ? 'voice' : 'text', audioStoragePath: r.audio_storage_path ?? null, audioDurationMs: r.audio_duration_ms ?? null, audioMimeType: r.audio_mime_type ?? null, audioSizeBytes: r.audio_size_bytes ?? null, createdAt: r.created_at, readAt: r.read_at ?? null })) };
}
export async function sendDirectMessage(conversationId: string, body: string): Promise<SendDirectMessageResult> { const trimmed = body.trim(); if (!trimmed) return { ok: false, message: 'اكتب رسالة الأول.', messageId: null, conversationId: conversationId ?? null, createdAt: null }; const { data, error } = await supabase.rpc('send_direct_message', { p_conversation_id: conversationId, p_body: trimmed }); if (error) { if (__DEV__) console.warn('[direct] send_direct_message rpc failed', { code: error.code, message: error.message }); const friendly = error.code === '42501' ? 'غير مسموح بإرسال الرسائل في هذه المحادثة حالياً.' : 'تعذر إرسال الرسالة حالياً. حاول تاني بعد لحظات.'; return { ok: false, message: friendly, messageId: null, conversationId: null, createdAt: null }; } const row = Array.isArray(data) ? data[0] : null; return { ok: !!row?.ok, message: row?.message ?? 'تعذر إرسال الرسالة حالياً.', messageId: row?.message_id ?? null, conversationId: row?.conversation_id ?? null, createdAt: row?.created_at ?? null }; }

export async function createDirectVoiceMessageSignedUrl(storagePath: string, expiresInSeconds = 60 * 60): Promise<string | null> {
  const { data, error } = await supabase.storage.from(DIRECT_VOICE_MESSAGES_BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function sendDirectVoiceMessage(input: { conversationId: string; currentUserId: string; localUri: string; durationMs: number; mimeType?: string | null; fileName?: string | null; sizeBytes?: number | null; }) {
  if (!input.localUri.trim()) return { ok: false as const, message: 'تعذر قراءة التسجيل الصوتي.' };
  if (input.durationMs < 500 || input.durationMs > 120000) return { ok: false as const, message: 'مدة الرسالة الصوتية غير صالحة.' };
  if ((input.sizeBytes ?? 0) > DIRECT_VOICE_MESSAGE_MAX_SIZE_BYTES) return { ok: false as const, message: 'حجم الرسالة الصوتية كبير جدًا.' };
  const contentType = input.mimeType || 'audio/m4a';
  const ext = getAudioExtension(input.fileName, contentType);
  const safeName = sanitizeAudioFileName(input.fileName, `voice.${ext}`);
  const uploadPath = `direct/${input.conversationId}/${input.currentUserId}/${Date.now()}-${Crypto.randomUUID()}-${safeName}`;
  const body = await fileUriToArrayBuffer(input.localUri);
  const { error: uploadError } = await supabase.storage.from(DIRECT_VOICE_MESSAGES_BUCKET).upload(uploadPath, body, { contentType, upsert: false });
  if (uploadError) return { ok: false as const, message: 'تعذر رفع الرسالة الصوتية. حاول مرة أخرى.' };
  const { data, error } = await supabase.rpc('send_direct_voice_message', { p_conversation_id: input.conversationId, p_audio_storage_path: uploadPath, p_audio_mime_type: contentType, p_audio_duration_ms: input.durationMs, p_audio_size_bytes: input.sizeBytes ?? null });
  if (error) {
    await supabase.storage.from(DIRECT_VOICE_MESSAGES_BUCKET).remove([uploadPath]);
    return { ok: false as const, message: 'تعذر إرسال الرسالة الصوتية حالياً.' };
  }
  const row = Array.isArray(data) ? data[0] : null;
  return { ok: !!row?.ok, message: row?.message ?? 'تعذر إرسال الرسالة الصوتية حالياً.', messageId: row?.message_id ?? null, createdAt: row?.created_at ?? null, storagePath: uploadPath };
}

async function runRequestAction(rpc: 'accept_direct_message_request' | 'ignore_direct_message_request', conversationId: string): Promise<DirectRequestActionResult> {
  const { data, error } = await supabase.rpc(rpc, { p_conversation_id: conversationId });
  if (error) return { ok: false, message: 'تعذر تنفيذ الطلب حالياً.' };
  const row = Array.isArray(data) ? data[0] : null;
  return { ok: !!row?.ok, message: row?.message ?? 'تم تحديث حالة الطلب.' };
}

export async function acceptDirectMessageRequest(conversationId: string): Promise<DirectRequestActionResult> { return runRequestAction('accept_direct_message_request', conversationId); }
export async function ignoreDirectMessageRequest(conversationId: string): Promise<DirectRequestActionResult> { return runRequestAction('ignore_direct_message_request', conversationId); }


export async function markDirectConversationRead(conversationId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!conversationId) return { ok: false, message: 'تعذر تحديث حالة القراءة حالياً.' };
  const { error } = await supabase.rpc('get_direct_conversation_messages', { p_conversation_id: conversationId });
  if (error) return { ok: false, message: 'تعذر تحديث حالة القراءة حالياً.' };
  return { ok: true };
}
