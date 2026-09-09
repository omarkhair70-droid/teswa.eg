import * as Crypto from 'expo-crypto';

import type {
  DirectConversationTransportRecord,
  DirectMessageTransportRecord,
} from '@/lib/backend/contracts/messaging';
import { teswaBackendRuntime } from '@/lib/backend/runtime';

const DIRECT_VOICE_MESSAGE_MAX_SIZE_BYTES = 15 * 1024 * 1024;

export type DirectConversationStatus = 'requested' | 'accepted' | 'ignored' | 'blocked';

export type DirectConversationSummary = {
  conversationId: string;
  status: DirectConversationStatus;
  requestedBy: string;
  otherUserId: string;
  otherDisplayName: string | null;
  otherUsername: string | null;
  otherAvatarUrl: string | null;
  lastMessageBody: string | null;
  lastMessageSenderId: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  requiresAction: boolean;
};

export type DirectMessage = {
  id: string;
  senderId: string;
  body: string;
  messageType: 'text' | 'voice';
  audioStoragePath: string | null;
  audioDurationMs: number | null;
  audioMimeType: string | null;
  audioSizeBytes: number | null;
  createdAt: string;
  readAt: string | null;
};

export type FetchDirectMessagesResult =
  | { ok: true; messages: DirectMessage[] }
  | { ok: false; message: string; messages: DirectMessage[] };

export type StartDirectConversationResult = {
  ok: boolean;
  conversationId: string | null;
  status: DirectConversationStatus | null;
  requiresRequest: boolean;
  message: string;
};

export type StartDirectConversationWithMessageResult = {
  ok: boolean;
  conversationId: string | null;
  messageId: string | null;
  status: DirectConversationStatus | null;
  createdAt: string | null;
  message: string;
};

export type SendDirectMessageResult = {
  ok: boolean;
  message: string;
  messageId: string | null;
  conversationId: string | null;
  createdAt: string | null;
};

export type DirectRequestActionResult = {
  ok: boolean;
  message: string;
};

function getAudioExtension(
  name: string | null | undefined,
  mimeType: string,
): string {
  const fromName = name?.split('.').pop()?.toLowerCase()?.trim();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;

  const fromMime = mimeType.split('/').pop()?.toLowerCase()?.trim();
  if (fromMime && /^[a-z0-9]+$/.test(fromMime)) return fromMime;

  return 'm4a';
}

function sanitizeAudioFileName(
  name: string | null | undefined,
  fallback: string,
): string {
  const raw = (name || fallback).toLowerCase();
  return raw.replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-');
}

function mapConversation(
  row: DirectConversationTransportRecord,
): DirectConversationSummary {
  return {
    conversationId: row.conversationId,
    status: row.status,
    requestedBy: row.requestedBy,
    otherUserId: row.otherUserId,
    otherDisplayName: row.otherDisplayName,
    otherUsername: row.otherUsername,
    otherAvatarUrl: row.otherAvatarUrl,
    lastMessageBody: row.lastMessageBody,
    lastMessageSenderId: row.lastMessageSenderId,
    lastMessageAt: row.lastMessageAt,
    unreadCount: row.unreadCount,
    requiresAction: row.requiresAction,
  };
}

function mapMessage(row: DirectMessageTransportRecord): DirectMessage {
  return {
    id: row.id,
    senderId: row.senderId,
    body: row.body,
    messageType: row.messageType,
    audioStoragePath: row.audioStoragePath,
    audioDurationMs: row.audioDurationMs,
    audioMimeType: row.audioMimeType,
    audioSizeBytes: row.audioSizeBytes,
    createdAt: row.createdAt,
    readAt: row.readAt,
  };
}

function getConversationSortTimestamp(item: DirectConversationSummary): number {
  const ms = item.lastMessageAt ? Date.parse(item.lastMessageAt) : Number.NaN;
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

export async function startOrGetDirectConversation(
  targetUserId: string,
): Promise<StartDirectConversationResult> {
  const result = await teswaBackendRuntime.directMessaging.startOrGet(targetUserId);
  if (!result.ok) {
    return {
      ok: false,
      conversationId: null,
      status: null,
      requiresRequest: false,
      message: 'تعذر فتح المراسلة حالياً.',
    };
  }

  return {
    ok: result.data.ok,
    conversationId: result.data.conversationId,
    status: result.data.status,
    requiresRequest: result.data.requiresRequest,
    message: result.data.message ?? 'تعذر فتح المراسلة حالياً.',
  };
}

export async function startDirectConversationWithMessage(
  targetUserId: string,
  body: string,
): Promise<StartDirectConversationWithMessageResult> {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 1200) {
    return {
      ok: false,
      conversationId: null,
      messageId: null,
      status: null,
      createdAt: null,
      message: 'الرسالة يجب أن تكون بين 1 و1200 حرف.',
    };
  }

  const result = await teswaBackendRuntime.directMessaging.startWithMessage(
    targetUserId,
    trimmed,
  );

  if (!result.ok) {
    if (__DEV__) {
      console.warn('[direct] start conversation with message failed', {
        message: result.message,
      });
    }
    return {
      ok: false,
      conversationId: null,
      messageId: null,
      status: null,
      createdAt: null,
      message: 'تعذر إرسال الرسالة حالياً.',
    };
  }

  return {
    ok: result.data.ok,
    conversationId: result.data.conversationId,
    messageId: result.data.messageId,
    status: result.data.status,
    createdAt: result.data.createdAt,
    message: result.data.message ?? 'تعذر إرسال الرسالة حالياً.',
  };
}

export async function fetchMyDirectConversations(): Promise<
  DirectConversationSummary[]
> {
  const result = await teswaBackendRuntime.directMessaging.listConversations();
  if (!result.ok) return [];

  return result.data
    .map(mapConversation)
    .sort(
      (a, b) =>
        getConversationSortTimestamp(b) - getConversationSortTimestamp(a),
    );
}

export async function fetchDirectConversation(
  conversationId: string,
): Promise<DirectConversationSummary | null> {
  const result = await teswaBackendRuntime.directMessaging.getConversation(
    conversationId,
  );
  if (!result.ok || !result.data) return null;
  return mapConversation(result.data);
}

export async function fetchDirectConversationMessages(
  conversationId: string,
): Promise<FetchDirectMessagesResult> {
  const result = await teswaBackendRuntime.directMessaging.listMessages(
    conversationId,
  );

  if (!result.ok) {
    if (__DEV__) {
      console.warn('[direct] direct messages load failed', {
        message: result.message,
      });
    }
    return {
      ok: false,
      message: 'تعذر تحميل الرسائل حالياً.',
      messages: [],
    };
  }

  return {
    ok: true,
    messages: result.data.map(mapMessage),
  };
}

export async function sendDirectMessage(
  conversationId: string,
  body: string,
): Promise<SendDirectMessageResult> {
  const trimmed = body.trim();
  if (!trimmed) {
    return {
      ok: false,
      message: 'اكتب رسالة الأول.',
      messageId: null,
      conversationId: conversationId ?? null,
      createdAt: null,
    };
  }

  const result = await teswaBackendRuntime.directMessaging.sendText(
    conversationId,
    trimmed,
  );

  if (!result.ok) {
    if (__DEV__) {
      console.warn('[direct] send direct message failed', {
        reason: result.reason,
        message: result.message,
      });
    }
    const friendly =
      result.reason === 'forbidden'
        ? 'غير مسموح بإرسال الرسائل في هذه المحادثة حالياً.'
        : 'تعذر إرسال الرسالة حالياً. حاول تاني بعد لحظات.';

    return {
      ok: false,
      message: friendly,
      messageId: null,
      conversationId: null,
      createdAt: null,
    };
  }

  return {
    ok: result.data.ok,
    message: result.data.message ?? 'تعذر إرسال الرسالة حالياً.',
    messageId: result.data.messageId,
    conversationId: result.data.conversationId,
    createdAt: result.data.createdAt,
  };
}

export async function createDirectVoiceMessageSignedUrl(
  storagePath: string,
  expiresInSeconds = 60 * 60,
): Promise<string | null> {
  const result = await teswaBackendRuntime.media.getSignedUrl(
    {
      purpose: 'direct_voice',
      objectKey: storagePath,
      contentType: null,
      sizeBytes: null,
    },
    expiresInSeconds,
  );
  return result.ok ? result.data : null;
}

export async function sendDirectVoiceMessage(input: {
  conversationId: string;
  currentUserId: string;
  localUri: string;
  durationMs: number;
  mimeType?: string | null;
  fileName?: string | null;
  sizeBytes?: number | null;
}) {
  if (!input.localUri.trim()) {
    return { ok: false as const, message: 'تعذر قراءة التسجيل الصوتي.' };
  }
  if (input.durationMs < 500 || input.durationMs > 120000) {
    return { ok: false as const, message: 'مدة الرسالة الصوتية غير صالحة.' };
  }
  if ((input.sizeBytes ?? 0) > DIRECT_VOICE_MESSAGE_MAX_SIZE_BYTES) {
    return {
      ok: false as const,
      message: 'حجم الرسالة الصوتية كبير جدًا.',
    };
  }

  const contentType = input.mimeType || 'audio/m4a';
  const ext = getAudioExtension(input.fileName, contentType);
  const safeName = sanitizeAudioFileName(input.fileName, `voice.${ext}`);
  const uploadPath =
    `direct/${input.conversationId}/${input.currentUserId}/${Date.now()}-${Crypto.randomUUID()}-${safeName}`;

  const uploadResult = await teswaBackendRuntime.media.upload({
    purpose: 'direct_voice',
    ownerId: input.currentUserId,
    source: {
      uri: input.localUri,
      fileName: safeName,
      mimeType: contentType,
      sizeBytes: input.sizeBytes ?? null,
      maxSizeBytes: DIRECT_VOICE_MESSAGE_MAX_SIZE_BYTES,
    },
    objectKeyHint: uploadPath,
  });

  if (!uploadResult.ok) {
    return {
      ok: false as const,
      message:
        uploadResult.reason === 'file_too_large'
          ? 'حجم الرسالة الصوتية كبير جدًا.'
          : 'تعذر رفع الرسالة الصوتية. حاول مرة أخرى.',
    };
  }

  const sendResult = await teswaBackendRuntime.directMessaging.sendVoice({
    conversationId: input.conversationId,
    audioStoragePath: uploadPath,
    audioMimeType: contentType,
    audioDurationMs: input.durationMs,
    audioSizeBytes: input.sizeBytes ?? null,
  });

  if (!sendResult.ok) {
    await teswaBackendRuntime.media.remove([
      {
        purpose: 'direct_voice',
        objectKey: uploadPath,
        contentType,
        sizeBytes: input.sizeBytes ?? null,
      },
    ]);
    return {
      ok: false as const,
      message: 'تعذر إرسال الرسالة الصوتية حالياً.',
    };
  }

  return {
    ok: sendResult.data.ok,
    message:
      sendResult.data.message ?? 'تعذر إرسال الرسالة الصوتية حالياً.',
    messageId: sendResult.data.messageId,
    createdAt: sendResult.data.createdAt,
    storagePath: uploadPath,
  };
}

async function runRequestAction(
  action: 'accept' | 'ignore',
  conversationId: string,
): Promise<DirectRequestActionResult> {
  const result = await teswaBackendRuntime.directMessaging.actOnRequest(
    action,
    conversationId,
  );

  if (!result.ok) {
    return { ok: false, message: 'تعذر تنفيذ الطلب حالياً.' };
  }

  return {
    ok: result.data.ok,
    message: result.data.message ?? 'تم تحديث حالة الطلب.',
  };
}

export async function acceptDirectMessageRequest(
  conversationId: string,
): Promise<DirectRequestActionResult> {
  return runRequestAction('accept', conversationId);
}

export async function ignoreDirectMessageRequest(
  conversationId: string,
): Promise<DirectRequestActionResult> {
  return runRequestAction('ignore', conversationId);
}

export async function markDirectConversationRead(
  conversationId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!conversationId) {
    return { ok: false, message: 'تعذر تحديث حالة القراءة حالياً.' };
  }

  const result = await teswaBackendRuntime.directMessaging.markRead(
    conversationId,
  );
  if (!result.ok) {
    return { ok: false, message: 'تعذر تحديث حالة القراءة حالياً.' };
  }
  return { ok: true };
}
