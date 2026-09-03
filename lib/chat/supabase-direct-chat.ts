import * as Crypto from 'expo-crypto';
import type { BackendConnectionState } from '@/lib/backend/contracts/core';
import type { NativeDirectMessageTransportRecord } from '@/lib/backend/contracts/messaging';
import { teswaBackendRuntime } from '@/lib/backend/runtime';

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
  onStatus?: (status: BackendConnectionState) => void;
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


function normalizeStorageBucket(value: unknown): NativeDirectStorageBucket {
  return value === LEGACY_DIRECT_VOICE_BUCKET ? LEGACY_DIRECT_VOICE_BUCKET : DIRECT_CHAT_MEDIA_BUCKET;
}

function mapTransportMessage(
  row: NativeDirectMessageTransportRecord,
): NativeDirectMessage {
  return {
    id: row.id,
    senderId: row.senderId,
    body: row.body,
    messageType: row.messageType,
    createdAt: row.createdAt,
    readAt: row.readAt,
    replyToMessageId: row.replyToMessageId,
    replySenderId: row.replySenderId,
    replyBody: row.replyBody,
    metadata: row.metadata,
    deletedAt: row.deletedAt,
    attachments: row.attachments.map((attachment) => ({
      id: attachment.id,
      kind: attachment.kind,
      storagePath: attachment.storagePath,
      storageBucket: normalizeStorageBucket(attachment.storageBucket),
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      durationMs: attachment.durationMs,
      width: attachment.width,
      height: attachment.height,
    })),
    reactions: row.reactions.map((reaction) => ({
      reaction: reaction.reaction,
      userId: reaction.userId,
      createdAt: reaction.createdAt,
    })),
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
    const uploadResult = await teswaBackendRuntime.media.upload({
      purpose: 'direct_chat_media',
      ownerId: input.currentUserId,
      objectKeyHint: storagePath,
      source: {
        uri: input.localUri,
        fileName,
        mimeType: input.mimeType ?? null,
        sizeBytes: input.sizeBytes ?? null,
        maxSizeBytes: DIRECT_CHAT_MEDIA_MAX_BYTES,
      },
    });
    if (!uploadResult.ok) {
      if (__DEV__) console.warn('[direct-native] media upload failed', { reason: uploadResult.reason });
      const message = uploadResult.reason === 'file_too_large'
        ? 'حجم المرفق أكبر من الحد المسموح.'
        : 'تعذر رفع المرفق حالياً.';
      return { ok: false as const, message };
    }

    return {
      ok: true as const,
      attachment: {
        kind: input.kind,
        storagePath: uploadResult.data.objectKey,
        storageBucket: DIRECT_CHAT_MEDIA_BUCKET,
        fileName,
        mimeType: input.mimeType ?? null,
        sizeBytes: uploadResult.data.sizeBytes,
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
  const result = await teswaBackendRuntime.media.remove(
    uniquePaths.map((objectKey) => ({
      purpose: 'direct_chat_media' as const,
      objectKey,
      contentType: null,
      sizeBytes: null,
    })),
  );
  return result.ok ? { ok: true as const } : { ok: false as const, message: result.message };
}

export async function createNativeDirectAttachmentSignedUrl(
  storagePath: string,
  expiresInSeconds = 60 * 60,
  storageBucket: NativeDirectStorageBucket = DIRECT_CHAT_MEDIA_BUCKET,
) {
  if (!storagePath) return null;
  const bucket = normalizeStorageBucket(storageBucket);
  const result = await teswaBackendRuntime.media.getSignedUrl(
    {
      purpose: bucket === LEGACY_DIRECT_VOICE_BUCKET ? 'direct_voice' : 'direct_chat_media',
      objectKey: storagePath,
      contentType: null,
      sizeBytes: null,
    },
    expiresInSeconds,
  );
  return result.ok ? result.data : null;
}

export async function fetchNativeDirectMessages(
  conversationId: string,
  input?: { limit?: number; before?: string | null },
) {
  const result = await teswaBackendRuntime.directMessaging.listNativeMessages({
    conversationId,
    limit: Math.max(1, Math.min(input?.limit ?? 100, 200)),
    before: input?.before ?? null,
  });

  if (!result.ok) {
    if (__DEV__) {
      console.warn('[direct-native] fetch failed', { message: result.message });
    }
    return {
      ok: false as const,
      message: 'تعذر تحميل الرسائل حالياً.',
      messages: [] as NativeDirectMessage[],
    };
  }

  return {
    ok: true as const,
    messages: result.data.map(mapTransportMessage),
  };
}

export async function sendNativeDirectMessage(input: {
  conversationId: string;
  body?: string | null;
  replyToMessageId?: string | null;
  attachments?: NativeDirectAttachment[];
  metadata?: Record<string, unknown>;
}) {
  const result = await teswaBackendRuntime.directMessaging.sendNativeMessage({
    conversationId: input.conversationId,
    body: input.body,
    replyToMessageId: input.replyToMessageId,
    attachments: (input.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      kind: attachment.kind,
      storagePath: attachment.storagePath,
      storageBucket: attachment.storageBucket ?? null,
      fileName: attachment.fileName ?? null,
      mimeType: attachment.mimeType ?? null,
      sizeBytes: attachment.sizeBytes ?? null,
      durationMs: attachment.durationMs ?? null,
      width: attachment.width ?? null,
      height: attachment.height ?? null,
    })),
    metadata: input.metadata ?? {},
  });

  if (!result.ok) {
    if (__DEV__) {
      console.warn('[direct-native] send failed', { message: result.message });
    }
    return {
      ok: false as const,
      message: 'تعذر إرسال الرسالة حالياً.',
      messageId: null as string | null,
      createdAt: null as string | null,
    };
  }

  return {
    ok: result.data.ok,
    message: result.data.message ?? 'تعذر إرسال الرسالة حالياً.',
    messageId: result.data.messageId,
    createdAt: result.data.createdAt,
  };
}

export async function markNativeDirectConversationRead(conversationId: string) {
  const result = await teswaBackendRuntime.directMessaging.markNativeRead(conversationId);
  if (!result.ok) {
    return { ok: false as const, readAt: null as string | null };
  }
  return result.data;
}

export async function toggleNativeDirectReaction(
  messageId: string,
  reaction: 'love' | 'thumbs_up',
) {
  const result = await teswaBackendRuntime.directMessaging.toggleNativeReaction(
    messageId,
    reaction,
  );
  if (!result.ok) {
    return { ok: false as const, enabled: false, count: 0 };
  }
  return result.data;
}

export async function setNativeDirectTypingState(
  conversationId: string,
  isTyping: boolean,
) {
  const result = await teswaBackendRuntime.directMessaging.setNativeTyping(
    conversationId,
    isTyping,
  );
  return { ok: result.ok && result.data === true };
}

export async function fetchNativeDirectTypingUsers(conversationId: string) {
  const result = await teswaBackendRuntime.directMessaging.listNativeTypingUsers(
    conversationId,
  );
  return result.ok ? result.data : [];
}

export async function deleteNativeDirectMessage(messageId: string) {
  const result = await teswaBackendRuntime.directMessaging.deleteNativeMessage(messageId);
  if (!result.ok) {
    return { ok: false as const, message: 'تعذر حذف الرسالة حالياً.' };
  }

  if (result.data.storagePaths.length) {
    await removeNativeDirectUploads(result.data.storagePaths);
  }
  return { ok: true as const };
}

export function subscribeToNativeDirectConversation(
  conversationId: string,
  handlers: NativeDirectSubscriptionHandlers,
) {
  return teswaBackendRuntime.realtime.subscribeDirect(conversationId, handlers);
}
