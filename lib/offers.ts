import type { OfferLifecycleRecord } from '@/lib/backend/contracts/offers-deals';
import { teswaBackendRuntime } from '@/lib/backend/runtime';
import { fetchUserBlockState } from '@/lib/user-blocks';
import { ExchangeItemSummary, fetchExchangeItemSummariesByIds } from '@/lib/exchange-item-summaries';
import { canTransitionOfferStatus } from '@/lib/exchange-state-machine';

export type OfferInvalidReason =
  | 'requested_not_found'
  | 'requested_inactive'
  | 'own_requested_item'
  | 'offered_not_found'
  | 'offered_inactive'
  | 'offered_not_owned'
  | 'same_item'
  | 'blocked_interaction';

export type OfferItemSummary = ExchangeItemSummary;
export type OfferViewerRole = 'sender' | 'receiver';
export type OfferStatus =
  | 'pending'
  | 'thinking'
  | 'accepted'
  | 'soft_rejected'
  | 'redirected'
  | 'withdrawn'
  | 'expired'
  | 'cancelled_after_accept'
  | string;

export const OFFER_STATUS_LABELS: Record<string, string> = {
  pending: 'بانتظار الرد',
  thinking: 'قيد التفكير',
  accepted: 'تم القبول',
  soft_rejected: 'لم يتم القبول',
  redirected: 'فُتح باب بديل',
  withdrawn: 'تم سحب العرض',
  expired: 'انتهت صلاحيته',
  cancelled_after_accept: 'أُلغي بعد القبول',
};

type ItemValidationRow = {
  id: string;
  title: string | null;
  owner_id: string;
  status: string;
};

export type OfferRowSummary = {
  id: string;
  status: OfferStatus;
  senderId: string;
  receiverId: string;
  createdAt: string | null;
  requestedItem: OfferItemSummary | null;
  offeredItem: OfferItemSummary | null;
  roleContext: 'incoming' | 'sent';
  dealId: string | null;
};

export type OffersInboxResult = {
  incomingActionableOffers: OfferRowSummary[];
  sentOffers: OfferRowSummary[];
};

export type OfferDetailResult =
  | { ok: true; offer: OfferDetail }
  | { ok: false; reason: 'not_found' | 'unauthorized' };

export type OfferDetail = OfferRowSummary & {
  message: string | null;
  requestedItemId: string;
  offeredItemId: string;
  viewerRole: OfferViewerRole;
  dealId: string | null;
};

export type OfferActionResult =
  | { ok: true; dealId?: string }
  | {
      ok: false;
      reason: 'not_found' | 'unauthorized' | 'invalid_status' | 'unknown';
      message: string;
    };

const labelForItemFallback = 'عنصر بدون عنوان';

const getStatusLabel = (status: string) => OFFER_STATUS_LABELS[status] ?? status;
export { getStatusLabel as getOfferStatusLabel };

async function fetchItemValidation(itemId: string): Promise<ItemValidationRow | null> {
  const item = await teswaBackendRuntime.offers.getItemForValidation(itemId);
  if (!item) return null;
  return {
    id: item.id,
    title: item.title,
    owner_id: item.ownerId,
    status: item.status,
  };
}

function mapOfferRows(
  rows: OfferLifecycleRecord[],
  roleContext: 'incoming' | 'sent',
  itemsById: Map<string, OfferItemSummary>,
  dealIdByOfferId: Map<string, string>,
): OfferRowSummary[] {
  return rows.map((row) => ({
    id: row.id,
    status: row.status as OfferStatus,
    senderId: row.senderId,
    receiverId: row.receiverId,
    createdAt: row.createdAt,
    requestedItem: itemsById.get(row.requestedItemId) ?? null,
    offeredItem: itemsById.get(row.offeredItemId) ?? null,
    roleContext,
    dealId: dealIdByOfferId.get(row.id) ?? null,
  }));
}

// Notification dispatch remains a separate B6 boundary concern.
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
    console.warn('[offers] notification dispatch failed', {
      message: result.message,
    });
  }
}
async function getOfferForAction(offerId: string): Promise<OfferLifecycleRecord | null> {
  return teswaBackendRuntime.offers.getOffer(offerId);
}

export async function fetchOffersInbox(currentUserId: string): Promise<OffersInboxResult> {
  const [incomingRows, sentRows] = await Promise.all([
    teswaBackendRuntime.offers.listIncoming(currentUserId),
    teswaBackendRuntime.offers.listSent(currentUserId),
  ]);

  const allRows = [...incomingRows, ...sentRows];
  const itemIds = [
    ...new Set(allRows.flatMap((row) => [row.requestedItemId, row.offeredItemId])),
  ];
  const offerIds = [...new Set(allRows.map((row) => row.id))];

  const [summaries, dealIdByOfferId] = await Promise.all([
    fetchExchangeItemSummariesByIds(itemIds),
    teswaBackendRuntime.offers.getLatestDealIds(offerIds),
  ]);

  const byId = new Map(summaries.map((summary) => [summary.id, summary]));

  return {
    incomingActionableOffers: mapOfferRows(
      incomingRows,
      'incoming',
      byId,
      dealIdByOfferId,
    ),
    sentOffers: mapOfferRows(sentRows, 'sent', byId, dealIdByOfferId),
  };
}

export async function fetchOfferById(
  offerId: string,
  currentUserId: string,
): Promise<OfferDetailResult> {
  const offer = await teswaBackendRuntime.offers.getOffer(offerId);
  if (!offer) return { ok: false, reason: 'not_found' };

  if (currentUserId !== offer.senderId && currentUserId !== offer.receiverId) {
    return { ok: false, reason: 'unauthorized' };
  }

  const [requestedItem, offeredItem, dealId] = await Promise.all([
    fetchExchangeItemSummariesByIds([offer.requestedItemId]).then((rows) => rows[0] ?? null),
    fetchExchangeItemSummariesByIds([offer.offeredItemId]).then((rows) => rows[0] ?? null),
    teswaBackendRuntime.offers.getLatestDealId(offerId),
  ]);

  return {
    ok: true,
    offer: {
      id: offer.id,
      status: offer.status as OfferStatus,
      message: offer.message,
      requestedItemId: offer.requestedItemId,
      offeredItemId: offer.offeredItemId,
      senderId: offer.senderId,
      receiverId: offer.receiverId,
      createdAt: offer.createdAt,
      requestedItem,
      offeredItem,
      roleContext: currentUserId === offer.receiverId ? 'incoming' : 'sent',
      viewerRole: currentUserId === offer.receiverId ? 'receiver' : 'sender',
      dealId,
    },
  };
}

export async function markOfferThinkingFromMobile(input: {
  offerId: string;
  currentUserId: string;
  note?: string;
}): Promise<OfferActionResult> {
  const offer = await getOfferForAction(input.offerId);
  if (!offer) return { ok: false, reason: 'not_found', message: 'العرض غير موجود.' };
  if (offer.receiverId !== input.currentUserId) {
    return { ok: false, reason: 'unauthorized', message: 'غير مسموح لك بالرد على هذا العرض.' };
  }
  if (!canTransitionOfferStatus(offer.status, 'thinking')) {
    return { ok: false, reason: 'invalid_status', message: 'لا يمكن تنفيذ الإجراء على الحالة الحالية.' };
  }

  const result = await teswaBackendRuntime.offers.markThinking(input.offerId, input.note);
  if (!result.ok) {
    return { ok: false, reason: 'unknown', message: 'تعذر تحديث حالة العرض.' };
  }

  void notify({
    target_user_id: offer.senderId,
    notification_type: 'offer_thinking',
    notification_title: 'صاحب الحاجة محتاج يفكر',
    notification_body: 'العرض لسه مفتوح، بس محتاج وقت.',
    target_offer_id: input.offerId,
    target_deal_id: null,
    target_item_id: null,
  });
  return { ok: true };
}

export async function softRejectOfferFromMobile(input: {
  offerId: string;
  currentUserId: string;
  note?: string;
}): Promise<OfferActionResult> {
  const offer = await getOfferForAction(input.offerId);
  if (!offer) return { ok: false, reason: 'not_found', message: 'العرض غير موجود.' };
  if (offer.receiverId !== input.currentUserId) {
    return { ok: false, reason: 'unauthorized', message: 'غير مسموح لك بالرد على هذا العرض.' };
  }
  if (!canTransitionOfferStatus(offer.status, 'soft_rejected')) {
    return { ok: false, reason: 'invalid_status', message: 'لا يمكن تنفيذ الإجراء على الحالة الحالية.' };
  }

  const result = await teswaBackendRuntime.offers.softReject(input.offerId, input.note);
  if (!result.ok) {
    return { ok: false, reason: 'unknown', message: 'تعذر رفض العرض حالياً.' };
  }

  void notify({
    target_user_id: offer.senderId,
    notification_type: 'offer_soft_rejected',
    notification_title: 'العرض ما ظبطش المرة دي',
    notification_body: 'صاحب الحاجة رفض العرض بلطف.',
    target_offer_id: input.offerId,
    target_deal_id: null,
    target_item_id: null,
  });
  return { ok: true };
}

export async function acceptOfferFromMobile(input: {
  offerId: string;
  currentUserId: string;
}): Promise<OfferActionResult> {
  const offer = await getOfferForAction(input.offerId);
  if (!offer) return { ok: false, reason: 'not_found', message: 'العرض غير موجود.' };
  if (offer.receiverId !== input.currentUserId) {
    return { ok: false, reason: 'unauthorized', message: 'غير مسموح لك بقبول هذا العرض.' };
  }
  if (!canTransitionOfferStatus(offer.status, 'accepted')) {
    return { ok: false, reason: 'invalid_status', message: 'لا يمكن تنفيذ الإجراء على الحالة الحالية.' };
  }

  const result = await teswaBackendRuntime.offers.accept(input.offerId);
  if (!result.ok) {
    return { ok: false, reason: 'unknown', message: 'تعذر قبول العرض حالياً.' };
  }
  const dealId = result.data.dealId;

  void Promise.all([
    notify({
      target_user_id: offer.senderId,
      notification_type: 'offer_accepted',
      notification_title: 'العرض اتقبل',
      notification_body: 'صاحب الحاجة قبل العرض.',
      target_offer_id: input.offerId,
      target_deal_id: dealId,
      target_item_id: null,
    }),
    notify({
      target_user_id: offer.senderId,
      notification_type: 'deal_created',
      notification_title: 'اتفتحت دردشة الصفقة',
      notification_body: 'العرض اتقبل، وكده تقدروا تكملوا التنسيق من دردشة الصفقة.',
      target_offer_id: input.offerId,
      target_deal_id: dealId,
      target_item_id: null,
    }),
    notify({
      target_user_id: offer.receiverId,
      notification_type: 'deal_created',
      notification_title: 'اتفتحت دردشة الصفقة',
      notification_body: 'العرض اتقبل، وكده تقدروا تكملوا التنسيق من دردشة الصفقة.',
      target_offer_id: input.offerId,
      target_deal_id: dealId,
      target_item_id: null,
    }),
  ]);

  return { ok: true, dealId };
}

export type OfferCreationContextResult =
  | { ok: true; requestedItem: OfferItemSummary; myActiveItems: OfferItemSummary[] }
  | { ok: false; reason: OfferInvalidReason | 'unknown'; message: string };

export type CreateSwapOfferResult =
  | { ok: true; offerId: string }
  | { ok: false; reason: OfferInvalidReason | 'unknown'; message: string };

function getInvalidMessage(reason: OfferInvalidReason): string {
  const messages: Record<OfferInvalidReason, string> = {
    requested_not_found: 'العنصر المطلوب غير موجود.',
    requested_inactive: 'العنصر المطلوب غير متاح حالياً للتبديل.',
    own_requested_item: 'لا يمكنك إرسال عرض على عنصرك الخاص.',
    offered_not_found: 'العنصر الذي اخترته للعرض غير موجود.',
    offered_inactive: 'العنصر الذي اخترته غير نشط حالياً.',
    offered_not_owned: 'يمكنك فقط العرض بعنصر تملكه أنت.',
    same_item: 'لا يمكن استخدام نفس العنصر كعنصر مطلوب ومعروض.',
    blocked_interaction: 'لا يمكن إنشاء عرض لأن بينكما حظر.',
  };
  return messages[reason];
}

function isTransientBackendError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = ((error as { message?: string } | null)?.message ?? '').toLowerCase();
  return (
    code === '57014'
    || code === '08006'
    || code === '08001'
    || message.includes('network')
    || message.includes('timeout')
    || message.includes('fetch')
  );
}

export async function fetchOfferCreationContext(
  requestedItemId: string,
  currentUserId: string,
): Promise<OfferCreationContextResult> {
  const requested = await fetchItemValidation(requestedItemId);
  if (!requested) {
    return { ok: false, reason: 'requested_not_found', message: getInvalidMessage('requested_not_found') };
  }
  if (requested.status !== 'active') {
    return { ok: false, reason: 'requested_inactive', message: getInvalidMessage('requested_inactive') };
  }
  if (requested.owner_id === currentUserId) {
    return { ok: false, reason: 'own_requested_item', message: getInvalidMessage('own_requested_item') };
  }

  const blockState = await fetchUserBlockState(currentUserId, requested.owner_id);
  if (!blockState.ok) return { ok: false, reason: 'unknown', message: blockState.message };
  if (blockState.state.isBlockedEitherDirection) {
    return { ok: false, reason: 'blocked_interaction', message: getInvalidMessage('blocked_interaction') };
  }

  const myItemIds = await teswaBackendRuntime.offers.listOwnedActiveItemIds(currentUserId);
  const [requestedDisplay] = await fetchExchangeItemSummariesByIds([requestedItemId]);
  const myActiveItems = await fetchExchangeItemSummariesByIds(myItemIds);

  return {
    ok: true,
    requestedItem: requestedDisplay ?? {
      id: requested.id,
      title: requested.title?.trim() || labelForItemFallback,
      imageUrl: null,
      category: null,
      condition: null,
      location: null,
      ownerDisplayName: null,
      status: requested.status,
    },
    myActiveItems,
  };
}

export async function createSwapOffer(input: {
  requestedItemId: string;
  offeredItemId: string;
  message?: string;
  currentUserId: string;
}): Promise<CreateSwapOfferResult> {
  const { requestedItemId, offeredItemId, message, currentUserId } = input;

  try {
    if (requestedItemId === offeredItemId) {
      return { ok: false, reason: 'same_item', message: getInvalidMessage('same_item') };
    }

    const requested = await fetchItemValidation(requestedItemId);
    if (!requested) {
      return { ok: false, reason: 'requested_not_found', message: getInvalidMessage('requested_not_found') };
    }
    if (requested.status !== 'active') {
      return { ok: false, reason: 'requested_inactive', message: getInvalidMessage('requested_inactive') };
    }
    if (requested.owner_id === currentUserId) {
      return { ok: false, reason: 'own_requested_item', message: getInvalidMessage('own_requested_item') };
    }

    const blockState = await fetchUserBlockState(currentUserId, requested.owner_id);
    if (!blockState.ok) return { ok: false, reason: 'unknown', message: blockState.message };
    if (blockState.state.isBlockedEitherDirection) {
      return { ok: false, reason: 'blocked_interaction', message: getInvalidMessage('blocked_interaction') };
    }

    const offered = await fetchItemValidation(offeredItemId);
    if (!offered) {
      return { ok: false, reason: 'offered_not_found', message: getInvalidMessage('offered_not_found') };
    }
    if (offered.status !== 'active') {
      return { ok: false, reason: 'offered_inactive', message: getInvalidMessage('offered_inactive') };
    }
    if (offered.owner_id !== currentUserId) {
      return { ok: false, reason: 'offered_not_owned', message: getInvalidMessage('offered_not_owned') };
    }

    const createResult = await teswaBackendRuntime.offers.create({
      requestedItemId,
      offeredItemId,
      senderId: currentUserId,
      receiverId: requested.owner_id,
      message: message?.trim() || null,
    });

    if (!createResult.ok) {
      if (__DEV__) {
        console.log('[offers] createSwapOffer insert failed', {
          requestedItemId,
          offeredItemId,
          message: createResult.message,
        });
      }
      return {
        ok: false,
        reason: 'unknown',
        message: isTransientBackendError(createResult.cause)
          ? 'تعذر إرسال العرض بسبب اتصال مؤقت. حاول مرة أخرى.'
          : 'تعذر إرسال العرض حالياً. حاول مرة أخرى.',
      };
    }

    const offerId = createResult.data.offerId;
    const eventResult = await teswaBackendRuntime.offers.recordCreatedEvent({
      offerId,
      actorId: currentUserId,
    });
    if (!eventResult.ok && __DEV__) {
      console.log('[offers] offer event insert failed', eventResult.message);
    }

    void notify({
      target_user_id: requested.owner_id,
      notification_type: 'offer_received',
      notification_title: 'وصلك عرض جديد',
      notification_body: requested.title?.trim()
        ? `لديك عرض جديد على "${requested.title.trim()}".`
        : 'لديك عرض تبديل جديد.',
      target_item_id: requestedItemId,
      target_offer_id: offerId,
      target_deal_id: null,
    });

    return { ok: true, offerId };
  } catch (error) {
    if (__DEV__) {
      console.log('[offers] createSwapOffer failed', {
        requestedItemId,
        offeredItemId,
        code: (error as { code?: string })?.code,
        message: (error as { message?: string })?.message,
      });
    }
    return {
      ok: false,
      reason: 'unknown',
      message: isTransientBackendError(error)
        ? 'تعذر إرسال العرض بسبب اتصال مؤقت. حاول مرة أخرى.'
        : 'تعذر إرسال العرض حالياً. حاول مرة أخرى.',
    };
  }
}
