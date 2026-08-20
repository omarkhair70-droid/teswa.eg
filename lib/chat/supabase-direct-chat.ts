import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';

import { supabase } from '@/lib/supabase/client';

const DIRECT_CHAT_MEDIA_BUCKET = 'direct-chat-media';
const LEGACY_DIRECT_VOICE_BUCKET = 'direct-voice-messages';
const DIRECT_CHAT_MEDIA_MAX_BYTES = 50 * 1024 * 1024;

export type NativeDirectAttachmentKind = 'image' | 'video' | 'file' | 'audio';
export type NativeDirectStorageBucket = typeof DIRECT_CHAT_MEDIA_BUCKET | typeof LEGACY_DIRECT_VOICE_BUCKET;

export type NativeDirectAttachment = {
  id?: string;
  kind: NativeDirectAttachmentKind;
  storagePath: string;
  storageBucket?: NativeDirectStorageBucket;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
};

export type NativeDirectReaction = {
  reaction: 'love' | 'thumbs_up';
  userId: string;
  createdAt?: string | null;
};

export type NativeDirectMessage = {
  id: string;
  senderId: string;
  body: string;
  messageType: 'text' | 'voice';
  createdAt: string;
  readAt: string | null;
  replyToMessageId: string | null;
  replySenderId: string | null;
  replyBody: string | null;
  metadata: Record<string, unknown>;
  deletedAt: string | null;
  attachments: NativeDirectAttachment[];
  reactions: NativeDirectReaction[];
};

export type NativeDirectUploadInput = {
  conversationId: string;
  currentUserId: string;
  localUri: string;
  kind: NativeDirectAttachmentKind;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
};

export type NativeDirectSubscriptionHandlers = {
  onConversationChanged?: () => void;
  onMessagesChanged?: () => void;
  onAttachmentsChanged?: () => void;
  onReactionsChanged?: () => void;
  onTypingChanged?: () => void;
  onStatus?: (status: string) => void;
};

function sanitizeFileName(value: string | null | undefined, fallback: string) {
  const raw = (value?.trim() || fallback).toLowerCase();
  const safe = raw.replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return safe || fallback;
}

function extensionFor(input: NativeDirectUploadInput) {
  const fromName = input.fileName?.split('.').pop()?.trim().toLowerCase();
  if (fromName && /^[a-z0-9]{1,10}$/.test(fromName)) return fromName;

  const fromMime = input.mimeType?.split('/').pop()?.trim().toLowerCase();
  if (fromMime && /^[a-z0-9.+-]{1,16}$/.test(fromMime)) {
    if (fromMime === 'quicktime') return 'mov';
    if (fromMime === 'mpeg') return input.kind === 'audio' ? 'mp3' : 'mpeg';
    return fromMime.replace(/[^a-z0-9]/g, '') || 'bin';
  }

  if (input.kind === 'image') return 'jpg';
  if (input.kind === 'video') return 'mp4';
  if (input.kind === 'audio') return 'm4a';
  return 'bin';
}

async function localUriToArrayBuffer(uri: string) {
  try {
    return await new File(uri).arrayBuffer();
  } catch (fileError) {
    try {
      const response = await fetch(uri);
      if (!response.ok && response.status !== 0) throw new Error('file_read_failed');
      return await response.arrayBuffer();
    } catch {
      throw fileError instanceof Error ? fileError : new Error('file_read_failed');
    }
  }
}

function normalizeStorageBucket(value: unknown): NativeDirectStorageBucket {
  return value === LEGACY_DIRECT_VOICE_BUCKET ? LEGACY_DIRECT_VOICE_BUCKET : DIRECT_CHAT_MEDIA_BUCKET;
}

function parseAttachment(value: any): NativeDirectAttachment | null {
  if (!value || typeof value !== 'object') return null;
  const kind = value.kind;
  const storagePath = value.storagePath ?? value.storage_path;
  if (!['image', 'video', 'file', 'audio'].includes(kind) || typeof storagePath !== 'string' || !storagePath) return null;
  return {
    id: typeof value.id === 'string' ? value.id : undefined,
    kind,
    storagePath,
    storageBucket: normalizeStorageBucket(value.storageBucket ?? value.storage_bucket),
    fileName: value.fileName ?? value.file_name ?? null,
    mimeType: value.mimeType ?? value.mime_type ?? null,
    sizeBytes: value.sizeBytes ?? value.size_bytes ?? null,
    durationMs: value.durationMs ?? value.duration_ms ?? null,
    width: value.width ?? null,
    height: value.height ?? null,
  };
}

function parseReaction(value: any): NativeDirectReaction | null {
  if (!value || typeof value !== 'object') return null;
  const reaction = value.reaction;
  const userId = value.userId ?? value.user_id;
  if (!['love', 'thumbs_up'].includes(reaction) || typeof userId !== 'string' || !userId) return null;
  return { reaction, userId, createdAt: value.createdAt ?? value.created_at ?? null };
}

function normalizeMessage(row: any): NativeDirectMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    body: row.body ?? '',
    messageType: row.message_type === 'voice' ? 'voice' : 'text',
    createdAt: row.created_at,
    readAt: row.read_at ?? null,
    replyToMessageId: row.reply_to_message_id ?? null,
    replySenderId: row.reply_sender_id ?? null,
    replyBody: row.reply_body ?? null,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    deletedAt: row.deleted_at ?? null,
    attachments: Array.isArray(row.attachments) ? row.attachments.map(parseAttachment).filter(Boolean) as NativeDirectAttachment[] : [],
    reactions: Array.isArray(row.reactions) ? row.reactions.map(parseReaction).filter(Boolean) as NativeDirectReaction[] : [],
  };
}

export async function uploadNativeDirectAttachment(input: NativeDirectUploadInput) {
  if (!input.conversationId || !input.currentUserId || !input.localUri) {
    return { ok: false as const, message: 'تعذر تجهيز المرفق.' };
  }
  if ((input.sizeBytes ?? 0) > DIRECT_CHAT_MEDIA_MAX_BYTES) {
    return { ok: false as const, message: 'حجم المرفق أكبر من الحد المسموح.' };
  }

  try {
    const ext = extensionFor(input);
    const fileName = sanitizeFileName(input.fileName, `${input.kind}.${ext}`);
    const storagePath = `direct/${input.conversationId}/${input.currentUserId}/${Date.now()}-${Crypto.randomUUID()}-${fileName}`;
    const body = await localUriToArrayBuffer(input.localUri);
    if (body.byteLength > DIRECT_CHAT_MEDIA_MAX_BYTES) {
      return { ok: false as const, message: 'حجم المرفق أكبر من الحد المسموح.' };
    }

    const { error } = await supabase.storage.from(DIRECT_CHAT_MEDIA_BUCKET).upload(storagePath, body, {
      contentType: input.mimeType || undefined,
      upsert: false,
    });
    if (error) {
      if (__DEV__) console.warn('[direct-native] media upload failed', { message: error.message });
      return { ok: false as const, message: 'تعذر رفع المرفق حالياً.' };
    }

    return {
      ok: true as const,
      attachment: {
        kind: input.kind,
        storagePath,
        storageBucket: DIRECT_CHAT_MEDIA_BUCKET,
        fileName,
        mimeType: input.mimeType ?? null,
        sizeBytes: input.sizeBytes ?? body.byteLength,
        durationMs: input.durationMs ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
      } satisfies NativeDirectAttachment,
    };
  } catch (error) {
    if (__DEV__) console.warn('[direct-native] media upload exception', error);
    return { ok: false as const, message: 'تعذر قراءة أو رفع المرفق.' };
  }
}

export async function removeNativeDirectUploads(storagePaths: string[]) {
  const uniquePaths = Array.from(new Set(storagePaths.filter(Boolean)));
  if (!uniquePaths.length) return { ok: true as const };
  const { error } = await supabase.storage.from(DIRECT_CHAT_MEDIA_BUCKET).remove(uniquePaths);
  return error ? { ok: false as const, message: error.message } : { ok: true as const };
}

export async function createNativeDirectAttachmentSignedUrl(
  storagePath: string,
  expiresInSeconds = 60 * 60,
  storageBucket: NativeDirectStorageBucket = DIRECT_CHAT_MEDIA_BUCKET,
) {
  if (!storagePath) return null;
  const bucket = normalizeStorageBucket(storageBucket);
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function fetchNativeDirectMessages(conversationId: string, input?: { limit?: number; before?: string | null }) {
  const { data, error } = await supabase.rpc('get_direct_native_messages', {
    p_conversation_id: conversationId,
    p_limit: Math.max(1, Math.min(input?.limit ?? 100, 200)),
    p_before: input?.before ?? null,
  });
  if (error) {
    if (__DEV__) console.warn('[direct-native] fetch failed', { code: error.code, message: error.message });
    return { ok: false as const, message: 'تعذر تحميل الرسائل حالياً.', messages: [] as NativeDirectMessage[] };
  }
  const messages = (data ?? []).map(normalizeMessage).reverse();
  return { ok: true as const, messages };
}

export async function sendNativeDirectMessage(input: {
  conversationId: string;
  body?: string | null;
  replyToMessageId?: string | null;
  attachments?: NativeDirectAttachment[];
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await supabase.rpc('send_direct_native_message', {
    p_conversation_id: input.conversationId,
    p_body: input.body?.trim() || null,
    p_reply_to_message_id: input.replyToMessageId ?? null,
    p_attachments: input.attachments ?? [],
    p_metadata: input.metadata ?? {},
  });
  if (error) {
    if (__DEV__) console.warn('[direct-native] send failed', { code: error.code, message: error.message });
    return { ok: false as const, message: 'تعذر إرسال الرسالة حالياً.', messageId: null as string | null, createdAt: null as string | null };
  }
  const row = Array.isArray(data) ? data[0] : null;
  return {
    ok: !!row?.ok,
    message: row?.message ?? 'تعذر إرسال الرسالة حالياً.',
    messageId: row?.message_id ?? null,
    createdAt: row?.created_at ?? null,
  };
}

export async function markNativeDirectConversationRead(conversationId: string) {
  const { data, error } = await supabase.rpc('mark_direct_conversation_read_v2', { p_conversation_id: conversationId });
  if (error) return { ok: false as const, readAt: null as string | null };
  const row = Array.isArray(data) ? data[0] : null;
  return { ok: !!row?.ok, readAt: row?.read_at ?? null };
}

export async function toggleNativeDirectReaction(messageId: string, reaction: 'love' | 'thumbs_up') {
  const { data, error } = await supabase.rpc('toggle_direct_message_reaction_v2', {
    p_message_id: messageId,
    p_reaction: reaction,
  });
  if (error) return { ok: false as const, enabled: false, count: 0 };
  const row = Array.isArray(data) ? data[0] : null;
  return { ok: !!row?.ok, enabled: !!row?.enabled, count: Number(row?.reaction_count ?? 0) };
}

export async function setNativeDirectTypingState(conversationId: string, isTyping: boolean) {
  const { data, error } = await supabase.rpc('set_direct_typing_state_v2', {
    p_conversation_id: conversationId,
    p_is_typing: isTyping,
  });
  return { ok: !error && data === true };
}

export async function fetchNativeDirectTypingUsers(conversationId: string) {
  const { data, error } = await supabase
    .from('direct_typing_state')
    .select('user_id,expires_at')
    .eq('conversation_id', conversationId)
    .eq('is_typing', true)
    .gt('expires_at', new Date().toISOString());
  if (error) return [] as string[];
  return (data ?? []).map((row: any) => row.user_id).filter((value: unknown): value is string => typeof value === 'string');
}

export async function deleteNativeDirectMessage(messageId: string) {
  const { data, error } = await supabase.rpc('delete_direct_message_v2', { p_message_id: messageId });
  if (error) return { ok: false as const, message: 'تعذر حذف الرسالة حالياً.' };
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.ok) return { ok: false as const, message: 'تعذر حذف الرسالة حالياً.' };

  const paths = Array.isArray(row.storage_paths)
    ? row.storage_paths.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
    : [];
  if (paths.length) await removeNativeDirectUploads(paths);
  return { ok: true as const };
}

export function subscribeToNativeDirectConversation(conversationId: string, handlers: NativeDirectSubscriptionHandlers) {
  const channel = supabase
    .channel(`direct-native:${conversationId}:${Crypto.randomUUID()}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_conversations', filter: `id=eq.${conversationId}` }, () => handlers.onConversationChanged?.())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${conversationId}` }, () => handlers.onMessagesChanged?.())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_message_attachments', filter: `conversation_id=eq.${conversationId}` }, () => handlers.onAttachmentsChanged?.())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_message_reactions', filter: `conversation_id=eq.${conversationId}` }, () => handlers.onReactionsChanged?.())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_typing_state', filter: `conversation_id=eq.${conversationId}` }, () => handlers.onTypingChanged?.())
    .subscribe((status) => handlers.onStatus?.(status));

  return () => {
    void supabase.removeChannel(channel);
  };
}
