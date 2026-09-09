import * as Crypto from 'expo-crypto';
import type { DealLifecycleMessageRecord } from '@/lib/backend/contracts/offers-deals';
import { fetchExchangeItemSummariesByIds } from '@/lib/exchange-item-summaries';
import { teswaBackendRuntime } from '@/lib/backend/runtime';
import { fetchUserBlockState } from '@/lib/user-blocks';
import { canTransitionDealStatus } from '@/lib/exchange-state-machine';

export type DealStatus = 'coordinating' | 'completed_pending_confirmation' | 'completed' | 'cancelled' | 'disputed' | string;
export type DealViewerRole = 'requester' | 'offerer';

export type DealRoomMessage = {
  id: string;
  dealId: string;
  senderId: string;
  body: string;
  messageType: 'text' | 'voice';
  audioStoragePath: string | null;
  audioDurationMs: number | null;
  audioMimeType: string | null;
  audioSizeBytes: number | null;
  createdAt: string;
};

export type DealParticipantSummary = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  username: string | null;
  successfulSwapsCount: number | null;
  responseRate: number | null;
};

export const DEAL_STATUS_LABELS: Record<string, string> = {
  coordinating: 'قيد التنسيق',
  completed_pending_confirmation: 'بانتظار تأكيد الطرفين',
  completed: 'تمت المقايضة',
  cancelled: 'ملغاة',
  disputed: 'محل نزاع',
};

export function getDealStatusLabel(status: string) {
  return DEAL_STATUS_LABELS[status] ?? status;
}

export function getDealStatusNextStep(status: string) {
  if (status === 'coordinating') return 'اتفقوا على التفاصيل في الرسائل.';
  if (status === 'completed_pending_confirmation') return 'طرف أكد الإتمام. مستنيين الطرف التاني.';
  if (status === 'completed') return 'المقايضة تمت.';
  if (status === 'cancelled') return 'الصفقة اتلغت.';
  if (status === 'disputed') return 'الصفقة محل نزاع حالياً.';
  return 'تابع تفاصيل الصفقة في الغرفة.';
}

export type DealRoomResult =
  | { ok: true; deal: {
    id: string;
    status: DealStatus;
    acceptedAt: string | null;
    createdAt: string | null;
    viewerRole: DealViewerRole;
    requester: DealParticipantSummary;
    offerer: DealParticipantSummary;
    otherParticipant: DealParticipantSummary;
    requestedItem: Awaited<ReturnType<typeof fetchExchangeItemSummariesByIds>>[number] | null;
    offeredItem: Awaited<ReturnType<typeof fetchExchangeItemSummariesByIds>>[number] | null;
    iConfirmed: boolean;
    otherConfirmed: boolean;
    canSendMessage: boolean;
    canConfirmCompletion: boolean;
    alreadyRated: boolean;
    messages: DealRoomMessage[];
  }}
  | { ok: false; reason: 'not_found' | 'unauthorized' };

async function notify(payload: Record<string, unknown>) {
  const result = await teswaBackendRuntime.notifications.dispatch({
    targetUserId: String(payload.target_user_id ?? ''),
    type: String(payload.notification_type ?? 'system'),
    title: String(payload.notification_title ?? ''),
    body: typeof payload.notification_body === 'string' ? payload.notification_body : null,
    itemId: typeof payload.target_item_id === 'string' ? payload.target_item_id : null,
    offerId: typeof payload.target_offer_id === 'string' ? payload.target_offer_id : null,
    dealId: typeof payload.target_deal_id === 'string' ? payload.target_deal_id : null,
    messageId: typeof payload.target_message_id === 'string' ? payload.target_message_id : null,
  });

  if (!result.ok) {
    console.warn('[deals] notification dispatch failed', {
      message: result.message,
    });
  }
}
async function getDealParticipantProfiles(participantIds: string[]) {
  const profiles = await Promise.all(
    participantIds.map((participantId) => teswaBackendRuntime.profiles.getPublic(participantId)),
  );

  return new Map(
    profiles
      .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile))
      .map((profile) => [
        profile.id,
        {
          id: profile.id,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          username: profile.username,
          successfulSwapsCount: profile.successfulSwapsCount,
          responseRate: profile.responseRate,
        } satisfies DealParticipantSummary,
      ]),
  );
}

function toMessageRow(row: DealLifecycleMessageRecord): DealRoomMessage {
  return {
    id: row.id,
    dealId: row.dealId,
    senderId: row.senderId,
    body: row.body,
    messageType: row.messageType,
    audioStoragePath: row.audioStoragePath,
    audioDurationMs: row.audioDurationMs,
    audioMimeType: row.audioMimeType,
    audioSizeBytes: row.audioSizeBytes,
    createdAt: row.createdAt,
  };
}

export async function fetchDealRoomById(dealId: string, currentUserId: string): Promise<DealRoomResult> {
  const deal = await teswaBackendRuntime.deals.getDeal(dealId);
  if (!deal) return { ok: false, reason: 'not_found' };

  const requesterId = deal.requesterId;
  const offererId = deal.offererId;
  if (currentUserId !== requesterId && currentUserId !== offererId) {
    return { ok: false, reason: 'unauthorized' };
  }

  const viewerRole: DealViewerRole = currentUserId === requesterId ? 'requester' : 'offerer';
  const otherParticipantId = viewerRole === 'requester' ? offererId : requesterId;

  const [
    requestedItem,
    offeredItem,
    confirmerIds,
    messages,
    profilesById,
    myReviewResult,
  ] = await Promise.all([
    fetchExchangeItemSummariesByIds([deal.requestedItemId]).then((rows) => rows[0] ?? null),
    fetchExchangeItemSummariesByIds([deal.offeredItemId]).then((rows) => rows[0] ?? null),
    teswaBackendRuntime.deals.listConfirmationUserIds(dealId),
    teswaBackendRuntime.deals.listMessages(dealId, 100),
    getDealParticipantProfiles([requesterId, offererId]),
    teswaBackendRuntime.deals.hasReview(dealId, currentUserId),
  ]);

  if (!myReviewResult.ok && __DEV__) {
    console.log('[deals] alreadyRated lookup failed, fallback to false', {
      dealId,
      currentUserId,
      message: myReviewResult.message,
    });
  }

  const confirmerIdSet = new Set(confirmerIds);
  const iConfirmed = confirmerIdSet.has(currentUserId);
  const otherConfirmed = confirmerIdSet.has(otherParticipantId);
  const canCoordinate = ['coordinating', 'completed_pending_confirmation'].includes(deal.status);

  const requester = profilesById.get(requesterId) ?? {
    id: requesterId,
    displayName: null,
    avatarUrl: null,
    username: null,
    successfulSwapsCount: null,
    responseRate: null,
  };
  const offerer = profilesById.get(offererId) ?? {
    id: offererId,
    displayName: null,
    avatarUrl: null,
    username: null,
    successfulSwapsCount: null,
    responseRate: null,
  };

  return {
    ok: true,
    deal: {
      id: deal.id,
      status: deal.status as DealStatus,
      acceptedAt: deal.acceptedAt,
      createdAt: deal.createdAt,
      viewerRole,
      requester,
      offerer,
      otherParticipant: profilesById.get(otherParticipantId) ?? {
        id: otherParticipantId,
        displayName: null,
        avatarUrl: null,
        username: null,
        successfulSwapsCount: null,
        responseRate: null,
      },
      requestedItem,
      offeredItem,
      iConfirmed,
      otherConfirmed,
      canSendMessage: canCoordinate,
      canConfirmCompletion: canCoordinate && !iConfirmed,
      alreadyRated: myReviewResult.ok ? myReviewResult.data : false,
      messages: messages.map(toMessageRow),
    },
  };
}

export async function markDealThreadReadFromMobile(dealId: string): Promise<void> {
  const result = await teswaBackendRuntime.deals.markRead(dealId);
  if (!result.ok && __DEV__) {
    console.log('[deals] mark_deal_thread_read failed', result.message);
  }
}

export async function sendDealMessageFromMobile(input: {
  dealId: string;
  currentUserId: string;
  body: string;
}) {
  const body = input.body.trim();
  if (!body) {
    return { ok: false as const, reason: 'invalid_body' as const, message: 'اكتب رسالة الأول.' };
  }
  if (body.length > 800) {
    return { ok: false as const, reason: 'invalid_body' as const, message: 'الرسالة طويلة زيادة عن الحد (800 حرف).' };
  }

  const deal = await teswaBackendRuntime.deals.getDeal(input.dealId);
  if (!deal) return { ok: false as const, reason: 'not_found' as const, message: 'الصفقة غير موجودة.' };

  const requesterId = deal.requesterId;
  const offererId = deal.offererId;
  if (input.currentUserId !== requesterId && input.currentUserId !== offererId) {
    return { ok: false as const, reason: 'unauthorized' as const, message: 'غير مسموح لك بالمراسلة في الصفقة دي.' };
  }

  if (
    !canTransitionDealStatus(deal.status, 'completed_pending_confirmation')
    && deal.status !== 'completed_pending_confirmation'
  ) {
    return { ok: false as const, reason: 'invalid_status' as const, message: 'لا يمكن تنفيذ الإجراء على الحالة الحالية.' };
  }

  const otherParticipantId = input.currentUserId === requesterId ? offererId : requesterId;
  const blockedState = await fetchUserBlockState(input.currentUserId, otherParticipantId);
  if (!blockedState.ok) return { ok: false as const, reason: 'unknown' as const, message: blockedState.message };
  if (blockedState.state.isBlockedEitherDirection) {
    return { ok: false as const, reason: 'unauthorized' as const, message: 'لا يمكن إرسال رسائل لأن بينكما حظر.' };
  }

  const since = new Date(Date.now() - 60_000).toISOString();
  const recentCount = await teswaBackendRuntime.deals.countMessagesSince(
    input.dealId,
    input.currentUserId,
    since,
  );
  if (recentCount >= 5) {
    return { ok: false as const, reason: 'rate_limited' as const, message: 'استنى دقيقة قبل إرسال رسائل جديدة كتير.' };
  }

  const insertResult = await teswaBackendRuntime.deals.insertTextMessage({
    dealId: input.dealId,
    senderId: input.currentUserId,
    body,
  });
  if (!insertResult.ok) {
    throw insertResult.cause ?? new Error(insertResult.message);
  }

  void notify({
    target_user_id: otherParticipantId,
    notification_type: 'deal_message_received',
    notification_title: 'رسالة جديدة في دردشة الصفقة',
    notification_body: 'الطرف التاني بعت رسالة في دردشة الصفقة.',
    target_deal_id: input.dealId,
    target_offer_id: null,
    target_item_id: null,
    target_message_id: insertResult.data.id,
  });

  return { ok: true as const, message: toMessageRow(insertResult.data) };
}

export async function confirmDealCompletedFromMobile(input: {
  dealId: string;
  currentUserId: string;
  note?: string;
}) {
  const deal = await teswaBackendRuntime.deals.getDeal(input.dealId);
  if (!deal) return { ok: false as const, reason: 'not_found' as const, message: 'الصفقة غير موجودة.' };

  const requesterId = deal.requesterId;
  const offererId = deal.offererId;
  if (input.currentUserId !== requesterId && input.currentUserId !== offererId) {
    return { ok: false as const, reason: 'unauthorized' as const, message: 'غير مسموح لك بتأكيد الصفقة دي.' };
  }

  if (
    !canTransitionDealStatus(deal.status, 'completed_pending_confirmation')
    && deal.status !== 'completed_pending_confirmation'
  ) {
    return { ok: false as const, reason: 'invalid_status' as const, message: 'لا يمكن تنفيذ الإجراء على الحالة الحالية.' };
  }

  const confirmResult = await teswaBackendRuntime.deals.confirm({
    dealId: input.dealId,
    userId: input.currentUserId,
    note: input.note,
  });
  if (!confirmResult.ok) {
    throw confirmResult.cause ?? new Error(confirmResult.message);
  }

  const completeResult = await teswaBackendRuntime.deals.completeIfReady(input.dealId);
  if (!completeResult.ok) {
    throw completeResult.cause ?? new Error(completeResult.message);
  }
  const completed = completeResult.data;

  const otherParticipantId = input.currentUserId === requesterId ? offererId : requesterId;
  if (completed) {
    void Promise.all([
      notify({
        target_user_id: requesterId,
        notification_type: 'deal_completed',
        notification_title: 'المقايضة تمت',
        notification_body: 'الطرفين أكدوا الإتمام. تقدروا تسيبوا تقييم لبعض.',
        target_deal_id: input.dealId,
        target_offer_id: null,
        target_item_id: null,
      }),
      notify({
        target_user_id: offererId,
        notification_type: 'deal_completed',
        notification_title: 'المقايضة تمت',
        notification_body: 'الطرفين أكدوا الإتمام. تقدروا تسيبوا تقييم لبعض.',
        target_deal_id: input.dealId,
        target_offer_id: null,
        target_item_id: null,
      }),
    ]);
  } else {
    void notify({
      target_user_id: otherParticipantId,
      notification_type: 'deal_completion_confirmation_needed',
      notification_title: 'الصفقة مستنية تأكيدك',
      notification_body: 'الطرف التاني أكد إن المقايضة تمت. راجع الصفقة وأكد لما تكون جاهز.',
      target_deal_id: input.dealId,
      target_offer_id: null,
      target_item_id: null,
    });
  }

  return { ok: true as const, completed };
}


const DEAL_VOICE_MESSAGE_MAX_SIZE_BYTES = 15 * 1024 * 1024;

function sanitizeAudioFileName(name: string | null | undefined, fallback: string): string {
  const raw = (name || fallback).toLowerCase();
  return raw.replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-');
}

function getAudioExtension(name: string | null | undefined, mimeType: string): string {
  const fromName = name?.split('.').pop()?.toLowerCase()?.trim();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;

  const fromMime = mimeType.split('/').pop()?.toLowerCase()?.trim();
  if (fromMime && /^[a-z0-9]+$/.test(fromMime)) return fromMime;

  return 'm4a';
}

export async function createDealVoiceMessageSignedUrl(storagePath: string, expiresInSeconds = 60 * 60): Promise<string | null> {
  const result = await teswaBackendRuntime.media.getSignedUrl(
    { purpose: 'deal_voice', objectKey: storagePath, contentType: null, sizeBytes: null },
    expiresInSeconds,
  );
  if (!result.ok) {
    if (__DEV__) console.log('[deals] create signed url failed', { storagePath, message: result.message });
    return null;
  }
  return result.data;
}

export async function sendDealVoiceMessageFromMobile(input: {
  dealId: string;
  currentUserId: string;
  localUri: string;
  durationMs: number;
  mimeType?: string | null;
  fileName?: string | null;
  sizeBytes?: number | null;
}) {
  const localUri = input.localUri.trim();
  if (!localUri) {
    return { ok: false as const, reason: 'invalid_audio' as const, message: 'تعذر قراءة التسجيل الصوتي.' };
  }
  if (input.durationMs < 500) {
    return { ok: false as const, reason: 'invalid_duration' as const, message: 'التسجيل قصير جدًا. سجّل رسالة أوضح.' };
  }
  if (input.durationMs > 120000) {
    return { ok: false as const, reason: 'invalid_duration' as const, message: 'مدة الرسالة الصوتية لا يمكن أن تتجاوز دقيقتين.' };
  }
  if ((input.sizeBytes ?? 0) > DEAL_VOICE_MESSAGE_MAX_SIZE_BYTES) {
    return { ok: false as const, reason: 'file_too_large' as const, message: 'حجم الرسالة الصوتية كبير جدًا.' };
  }

  const deal = await teswaBackendRuntime.deals.getDeal(input.dealId);
  if (!deal) return { ok: false as const, reason: 'not_found' as const, message: 'الصفقة غير موجودة.' };

  const requesterId = deal.requesterId;
  const offererId = deal.offererId;
  if (input.currentUserId !== requesterId && input.currentUserId !== offererId) {
    return { ok: false as const, reason: 'unauthorized' as const, message: 'غير مسموح لك بالمراسلة في الصفقة دي.' };
  }

  if (
    !canTransitionDealStatus(deal.status, 'completed_pending_confirmation')
    && deal.status !== 'completed_pending_confirmation'
  ) {
    return { ok: false as const, reason: 'invalid_status' as const, message: 'لا يمكن تنفيذ الإجراء على الحالة الحالية.' };
  }

  const otherParticipantId = input.currentUserId === requesterId ? offererId : requesterId;
  const blockedState = await fetchUserBlockState(input.currentUserId, otherParticipantId);
  if (!blockedState.ok) return { ok: false as const, reason: 'unknown' as const, message: blockedState.message };
  if (blockedState.state.isBlockedEitherDirection) {
    return { ok: false as const, reason: 'unauthorized' as const, message: 'لا يمكن إرسال رسائل صوتية لأن بينكما حظر.' };
  }

  const since = new Date(Date.now() - 60_000).toISOString();
  const recentCount = await teswaBackendRuntime.deals.countMessagesSince(
    input.dealId,
    input.currentUserId,
    since,
  );
  if (recentCount >= 5) {
    return { ok: false as const, reason: 'rate_limited' as const, message: 'استنى دقيقة قبل إرسال رسائل جديدة كتير.' };
  }

  const contentType = input.mimeType || 'audio/m4a';
  const ext = getAudioExtension(input.fileName, contentType);
  const safeName = sanitizeAudioFileName(input.fileName, `voice.${ext}`);
  const uploadPath =
    `deals/${input.dealId}/${input.currentUserId}/${Date.now()}-${Crypto.randomUUID()}-${safeName}`;

  const uploadResult = await teswaBackendRuntime.media.upload({
    purpose: 'deal_voice',
    ownerId: input.currentUserId,
    source: {
      uri: localUri,
      fileName: safeName,
      mimeType: contentType,
      sizeBytes: input.sizeBytes ?? null,
      maxSizeBytes: DEAL_VOICE_MESSAGE_MAX_SIZE_BYTES,
    },
    objectKeyHint: uploadPath,
  });

  if (!uploadResult.ok) {
    if (__DEV__) {
      console.log('[deals] voice upload failed', {
        uploadPath,
        message: uploadResult.message,
      });
    }
    return {
      ok: false as const,
      reason: uploadResult.reason === 'file_too_large'
        ? 'file_too_large' as const
        : 'upload_failed' as const,
      message: uploadResult.reason === 'file_too_large'
        ? 'حجم الرسالة الصوتية كبير جدًا.'
        : 'تعذر رفع الرسالة الصوتية. حاول مرة أخرى.',
    };
  }

  const insertResult = await teswaBackendRuntime.deals.insertVoiceMessage({
    dealId: input.dealId,
    senderId: input.currentUserId,
    body: 'رسالة صوتية',
    audioStoragePath: uploadPath,
    audioDurationMs: input.durationMs,
    audioMimeType: contentType,
    audioSizeBytes: input.sizeBytes ?? null,
  });

  if (!insertResult.ok) {
    await teswaBackendRuntime.media.remove([
      {
        purpose: 'deal_voice',
        objectKey: uploadPath,
        contentType,
        sizeBytes: input.sizeBytes ?? null,
      },
    ]);
    if (__DEV__) {
      console.log('[deals] voice insert failed', {
        uploadPath,
        message: insertResult.message,
      });
    }
    return {
      ok: false as const,
      reason: 'insert_failed' as const,
      message: 'تعذر إرسال الرسالة الصوتية. حاول مرة أخرى.',
    };
  }

  void notify({
    target_user_id: otherParticipantId,
    notification_type: 'deal_voice_message_received',
    notification_title: 'رسالة صوتية جديدة في دردشة الصفقة',
    notification_body: 'الطرف التاني بعت رسالة صوتية في دردشة الصفقة.',
    target_deal_id: input.dealId,
    target_offer_id: null,
    target_item_id: null,
    target_message_id: insertResult.data.id,
  });

  return { ok: true as const, message: toMessageRow(insertResult.data) };
}
