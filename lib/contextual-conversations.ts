import * as Crypto from 'expo-crypto';

import { teswaBackendRuntime } from '@/lib/backend/runtime';
import { fetchUserBlockState } from '@/lib/user-blocks';

export type ContextualConversationType = 'story_reply';

export type ContextualConversationMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string | null;
  messageKind: 'text' | 'voice';
  mediaStoragePath: string | null;
  mediaDurationMs: number | null;
  createdAt: string;
};

export type StoryReplySendResult =
  | {
      ok: true;
      conversationId: string;
      messageId: string;
    }
  | {
      ok: false;
      reason: 'invalid_user' | 'invalid_story' | 'invalid_body' | 'send_failed';
      message: string;
    };

export type ContextualParticipantSummary = {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export type ContextualConversationSummary = {
  conversationId: string;
  contextType: 'story_reply';
  contextEntityId: string;
  otherParticipant: ContextualParticipantSummary;
  latestMessage: {
    id: string;
    body: string;
    senderId: string;
    createdAt: string;
    kind: 'text' | 'voice';
    durationMs: number | null;
  } | null;
  unreadCount: number;
  lastActivityAt: string;
};

export type ContextualThreadResult =
  | {
      ok: true;
      thread: {
        id: string;
        contextType: 'story_reply';
        contextEntityId: string;
        starterId: string;
        recipientId: string;
        otherParticipant: ContextualParticipantSummary;
        messages: ContextualConversationMessage[];
      };
    }
  | { ok: false; reason: 'not_found' | 'unauthorized' };

export type SendContextualMessageResult =
  | { ok: true; message: ContextualConversationMessage }
  | {
      ok: false;
      reason: 'invalid_body' | 'invalid_audio' | 'invalid_duration' | 'send_failed';
      message: string;
    };

const CONTEXTUAL_VOICE_MAX_DURATION_MS = 45_000;
const CONTEXTUAL_VOICE_MAX_SIZE_BYTES = 10 * 1024 * 1024;

async function notifyContextualMessageFromMobile(input: {
  conversationId: string;
  messageId: string;
  kind: 'story_reply_initial' | 'thread_message';
}): Promise<void> {
  const conversationId = input.conversationId.trim();
  const messageId = input.messageId.trim();
  if (!conversationId || !messageId) return;

  const result = await teswaBackendRuntime.contextualMessaging.notifyMessage({
    conversationId,
    messageId,
    kind: input.kind,
  });

  if (!result.ok) {
    console.warn('[contextual-conversations] create contextual notification failed', {
      message: result.message,
      conversationId,
      messageId,
    });
  }
}

export async function markContextualThreadReadFromMobile(
  conversationId: string,
): Promise<void> {
  const normalizedConversationId = conversationId.trim();
  if (!normalizedConversationId) return;

  const result = await teswaBackendRuntime.contextualMessaging.markRead(
    normalizedConversationId,
  );

  if (!result.ok && __DEV__) {
    console.warn('[contextual-conversations] mark read failed', result.message);
  }
}

export async function fetchUnreadContextualMessagesCount(): Promise<number> {
  try {
    return await teswaBackendRuntime.contextualMessaging.getUnreadCount();
  } catch (error) {
    if (__DEV__) {
      console.warn('[contextual-conversations] unread count failed', error);
    }
    return 0;
  }
}

export async function sendStoryReplyFromMobile(input: {
  storyId: string;
  currentUserId: string;
  body: string;
}): Promise<StoryReplySendResult> {
  const currentUserId = input.currentUserId.trim();
  const storyId = input.storyId.trim();
  const body = input.body.trim();

  if (!currentUserId) {
    return {
      ok: false,
      reason: 'invalid_user',
      message: 'يجب تسجيل الدخول أولاً للرد على القصة.',
    };
  }
  if (!storyId) {
    return {
      ok: false,
      reason: 'invalid_story',
      message: 'تعذر تحديد القصة المطلوبة.',
    };
  }
  if (!body) {
    return { ok: false, reason: 'invalid_body', message: 'اكتب ردك أولاً.' };
  }
  if (body.length > 800) {
    return {
      ok: false,
      reason: 'invalid_body',
      message: 'الرد طويل زيادة عن الحد (800 حرف).',
    };
  }

  let storyOwnerId: string | null = null;
  try {
    storyOwnerId = await teswaBackendRuntime.contextualMessaging.getStoryOwnerId(
      storyId,
    );
  } catch {
    storyOwnerId = null;
  }
  if (!storyOwnerId) {
    return {
      ok: false,
      reason: 'invalid_story',
      message: 'تعذر تحديد صاحب القصة.',
    };
  }

  const blockState = await fetchUserBlockState(currentUserId, storyOwnerId);
  if (!blockState.ok) {
    return { ok: false, reason: 'send_failed', message: blockState.message };
  }
  if (blockState.state.isBlockedEitherDirection) {
    return {
      ok: false,
      reason: 'send_failed',
      message: 'لا يمكن إرسال رد لأن بينكما حظر.',
    };
  }

  const result = await teswaBackendRuntime.contextualMessaging.createStoryReplyThread({
    storyId,
    body,
  });

  if (!result.ok) {
    if (__DEV__) {
      console.warn('[contextual-conversations] create story reply failed', {
        reason: result.reason,
        message: result.message,
      });
    }
    return {
      ok: false,
      reason: 'send_failed',
      message: 'تعذر إرسال الرد حالياً. قد تكون القصة انتهت.',
    };
  }

  void notifyContextualMessageFromMobile({
    conversationId: result.data.conversationId,
    messageId: result.data.messageId,
    kind: 'story_reply_initial',
  });

  return {
    ok: true,
    conversationId: result.data.conversationId,
    messageId: result.data.messageId,
  };
}

export async function fetchContextualConversationSummariesForUser(
  userId: string,
): Promise<ContextualConversationSummary[]> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return [];

  return teswaBackendRuntime.contextualMessaging.listSummaries(normalizedUserId);
}

export async function fetchContextualThreadById(input: {
  conversationId: string;
  currentUserId: string;
}): Promise<ContextualThreadResult> {
  const conversationId = input.conversationId.trim();
  const currentUserId = input.currentUserId.trim();
  if (!conversationId || !currentUserId) {
    return { ok: false, reason: 'not_found' };
  }

  const result = await teswaBackendRuntime.contextualMessaging.getThread({
    conversationId,
    currentUserId,
  });

  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason === 'unauthorized' ? 'unauthorized' : 'not_found',
    };
  }
  if (!result.data) return { ok: false, reason: 'not_found' };

  return {
    ok: true,
    thread: {
      id: result.data.id,
      contextType: 'story_reply',
      contextEntityId: result.data.contextEntityId,
      starterId: result.data.starterId,
      recipientId: result.data.recipientId,
      otherParticipant: result.data.otherParticipant,
      messages: result.data.messages,
    },
  };
}

async function getOtherParticipantInConversation(
  conversationId: string,
  currentUserId: string,
): Promise<string | null> {
  return teswaBackendRuntime.contextualMessaging.getOtherParticipantId({
    conversationId,
    currentUserId,
  });
}

export async function sendContextualMessageFromMobile(input: {
  conversationId: string;
  currentUserId: string;
  body: string;
}): Promise<SendContextualMessageResult> {
  const conversationId = input.conversationId.trim();
  const currentUserId = input.currentUserId.trim();
  const body = input.body.trim();

  if (!body) {
    return { ok: false, reason: 'invalid_body', message: 'اكتب رسالة الأول.' };
  }
  if (body.length > 800) {
    return {
      ok: false,
      reason: 'invalid_body',
      message: 'الرسالة طويلة زيادة عن الحد (800 حرف).',
    };
  }

  const otherParticipantId = await getOtherParticipantInConversation(
    conversationId,
    currentUserId,
  );
  if (!otherParticipantId) {
    return {
      ok: false,
      reason: 'send_failed',
      message: 'تعذر تحديد طرف المحادثة.',
    };
  }

  const blockState = await fetchUserBlockState(currentUserId, otherParticipantId);
  if (!blockState.ok) {
    return { ok: false, reason: 'send_failed', message: blockState.message };
  }
  if (blockState.state.isBlockedEitherDirection) {
    return {
      ok: false,
      reason: 'send_failed',
      message: 'لا يمكن إرسال رسائل لأن بينكما حظر.',
    };
  }

  const result = await teswaBackendRuntime.contextualMessaging.sendText({
    conversationId,
    senderId: currentUserId,
    body,
  });

  if (!result.ok) {
    if (__DEV__) {
      console.warn('[contextual-conversations] send message failed', result.message);
    }
    return {
      ok: false,
      reason: 'send_failed',
      message: 'تعذر إرسال الرسالة حالياً.',
    };
  }

  void notifyContextualMessageFromMobile({
    conversationId,
    messageId: result.data.id,
    kind: 'thread_message',
  });

  return {
    ok: true,
    message: result.data,
  };
}

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

export async function createContextualVoiceMessageSignedUrl(
  storagePath: string,
  expiresInSeconds = 60 * 60,
): Promise<string | null> {
  const result = await teswaBackendRuntime.media.getSignedUrl(
    {
      purpose: 'contextual_voice',
      objectKey: storagePath,
      contentType: null,
      sizeBytes: null,
    },
    expiresInSeconds,
  );
  return result.ok ? result.data : null;
}

async function uploadContextualVoice(input: {
  conversationId: string;
  currentUserId: string;
  localUri: string;
  durationMs: number;
  mimeType?: string | null;
  fileName?: string | null;
  sizeBytes?: number | null;
}) {
  const contentType = input.mimeType || 'audio/m4a';
  const ext = getAudioExtension(input.fileName, contentType);
  const safeName = sanitizeAudioFileName(input.fileName, `voice.${ext}`);
  const uploadPath =
    `contextual/${input.conversationId}/${input.currentUserId}/${Date.now()}-${Crypto.randomUUID()}-${safeName}`;

  const uploadResult = await teswaBackendRuntime.media.upload({
    purpose: 'contextual_voice',
    ownerId: input.currentUserId,
    source: {
      uri: input.localUri,
      fileName: safeName,
      mimeType: contentType,
      sizeBytes: input.sizeBytes ?? null,
      maxSizeBytes: CONTEXTUAL_VOICE_MAX_SIZE_BYTES,
    },
    objectKeyHint: uploadPath,
  });

  return { uploadResult, uploadPath, contentType };
}

async function cleanupContextualVoice(
  objectKey: string,
  contentType: string,
  sizeBytes: number | null,
) {
  await teswaBackendRuntime.media.remove([
    {
      purpose: 'contextual_voice',
      objectKey,
      contentType,
      sizeBytes,
    },
  ]);
}

export async function sendContextualVoiceMessageFromMobile(input: {
  conversationId: string;
  currentUserId: string;
  localUri: string;
  durationMs: number;
  mimeType?: string | null;
  fileName?: string | null;
  sizeBytes?: number | null;
}): Promise<SendContextualMessageResult> {
  const conversationId = input.conversationId.trim();
  const currentUserId = input.currentUserId.trim();
  const localUri = input.localUri.trim();

  if (!localUri) {
    return {
      ok: false,
      reason: 'invalid_audio',
      message: 'تعذر قراءة التسجيل الصوتي.',
    };
  }
  if (
    input.durationMs <= 0
    || input.durationMs > CONTEXTUAL_VOICE_MAX_DURATION_MS
  ) {
    return {
      ok: false,
      reason: 'invalid_duration',
      message: 'مدة الرسالة الصوتية يجب أن تكون حتى 45 ثانية.',
    };
  }
  if ((input.sizeBytes ?? 0) > CONTEXTUAL_VOICE_MAX_SIZE_BYTES) {
    return {
      ok: false,
      reason: 'invalid_audio',
      message: 'حجم الرسالة الصوتية كبير جدًا.',
    };
  }

  const otherParticipantId = await getOtherParticipantInConversation(
    conversationId,
    currentUserId,
  );
  if (!otherParticipantId) {
    return {
      ok: false,
      reason: 'send_failed',
      message: 'تعذر تحديد طرف المحادثة.',
    };
  }

  const blockState = await fetchUserBlockState(currentUserId, otherParticipantId);
  if (!blockState.ok) {
    return { ok: false, reason: 'send_failed', message: blockState.message };
  }
  if (blockState.state.isBlockedEitherDirection) {
    return {
      ok: false,
      reason: 'send_failed',
      message: 'لا يمكن إرسال رسائل صوتية لأن بينكما حظر.',
    };
  }

  const { uploadResult, uploadPath, contentType } = await uploadContextualVoice({
    ...input,
    conversationId,
    currentUserId,
    localUri,
  });

  if (!uploadResult.ok) {
    return {
      ok: false,
      reason: 'send_failed',
      message:
        uploadResult.reason === 'file_too_large'
          ? 'حجم الرسالة الصوتية كبير جدًا.'
          : 'تعذر رفع الرد الصوتي. حاول مرة أخرى.',
    };
  }

  const result = await teswaBackendRuntime.contextualMessaging.sendVoiceMetadata({
    conversationId,
    senderId: currentUserId,
    mediaStoragePath: uploadPath,
    mediaDurationMs: Math.min(
      input.durationMs,
      CONTEXTUAL_VOICE_MAX_DURATION_MS,
    ),
  });

  if (!result.ok) {
    await cleanupContextualVoice(
      uploadPath,
      contentType,
      input.sizeBytes ?? null,
    );
    return {
      ok: false,
      reason: 'send_failed',
      message: 'تعذر إرسال الرد الصوتي.',
    };
  }

  void notifyContextualMessageFromMobile({
    conversationId,
    messageId: result.data.id,
    kind: 'thread_message',
  });

  return { ok: true, message: result.data };
}

export async function sendStoryVoiceReplyFromMobile(input: {
  storyId: string;
  currentUserId: string;
  localUri: string;
  durationMs: number;
  mimeType?: string | null;
  fileName?: string | null;
  sizeBytes?: number | null;
}): Promise<
  | {
      ok: true;
      conversationId: string;
      message: ContextualConversationMessage;
    }
  | {
      ok: false;
      reason:
        | 'invalid_user'
        | 'invalid_story'
        | 'invalid_audio'
        | 'invalid_duration'
        | 'send_failed';
      message: string;
    }
> {
  const currentUserId = input.currentUserId.trim();
  const storyId = input.storyId.trim();
  const localUri = input.localUri.trim();

  if (!currentUserId) {
    return {
      ok: false,
      reason: 'invalid_user',
      message: 'يجب تسجيل الدخول أولاً للرد على القصة.',
    };
  }
  if (!storyId) {
    return {
      ok: false,
      reason: 'invalid_story',
      message: 'تعذر تحديد القصة المطلوبة.',
    };
  }
  if (!localUri) {
    return {
      ok: false,
      reason: 'invalid_audio',
      message: 'تعذر قراءة التسجيل الصوتي.',
    };
  }
  if (
    input.durationMs <= 0
    || input.durationMs > CONTEXTUAL_VOICE_MAX_DURATION_MS
  ) {
    return {
      ok: false,
      reason: 'invalid_duration',
      message: 'مدة الرسالة الصوتية يجب أن تكون حتى 45 ثانية.',
    };
  }
  if ((input.sizeBytes ?? 0) > CONTEXTUAL_VOICE_MAX_SIZE_BYTES) {
    return {
      ok: false,
      reason: 'invalid_audio',
      message: 'حجم الرسالة الصوتية كبير جدًا.',
    };
  }

  let storyOwnerId: string | null = null;
  try {
    storyOwnerId = await teswaBackendRuntime.contextualMessaging.getStoryOwnerId(
      storyId,
    );
  } catch {
    storyOwnerId = null;
  }
  if (!storyOwnerId) {
    return {
      ok: false,
      reason: 'invalid_story',
      message: 'تعذر تحديد صاحب القصة.',
    };
  }

  const blockState = await fetchUserBlockState(currentUserId, storyOwnerId);
  if (!blockState.ok) {
    return { ok: false, reason: 'send_failed', message: blockState.message };
  }
  if (blockState.state.isBlockedEitherDirection) {
    return {
      ok: false,
      reason: 'send_failed',
      message: 'لا يمكن إرسال رد لأن بينكما حظر.',
    };
  }

  const conversationResult =
    await teswaBackendRuntime.contextualMessaging.ensureStoryReplyConversation(
      storyId,
    );
  if (!conversationResult.ok) {
    return {
      ok: false,
      reason: 'send_failed',
      message: 'تعذر إرسال الرد حالياً. قد تكون القصة انتهت.',
    };
  }

  const conversationId = conversationResult.data.conversationId;
  const { uploadResult, uploadPath, contentType } = await uploadContextualVoice({
    ...input,
    conversationId,
    currentUserId,
    localUri,
  });

  if (!uploadResult.ok) {
    return {
      ok: false,
      reason: 'send_failed',
      message:
        uploadResult.reason === 'file_too_large'
          ? 'حجم الرسالة الصوتية كبير جدًا.'
          : 'تعذر رفع الرد الصوتي. حاول مرة أخرى.',
    };
  }

  const result = await teswaBackendRuntime.contextualMessaging.sendVoiceMetadata({
    conversationId,
    senderId: currentUserId,
    mediaStoragePath: uploadPath,
    mediaDurationMs: Math.min(
      input.durationMs,
      CONTEXTUAL_VOICE_MAX_DURATION_MS,
    ),
  });

  if (!result.ok) {
    await cleanupContextualVoice(
      uploadPath,
      contentType,
      input.sizeBytes ?? null,
    );
    return {
      ok: false,
      reason: 'send_failed',
      message: 'تعذر إرسال الرد الصوتي.',
    };
  }

  void notifyContextualMessageFromMobile({
    conversationId,
    messageId: result.data.id,
    kind: 'story_reply_initial',
  });

  return {
    ok: true,
    conversationId,
    message: result.data,
  };
}
