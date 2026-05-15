import { supabase } from '@/lib/supabase/client';
import { ExchangeItemSummary, fetchExchangeItemSummariesByIds } from '@/lib/exchange-item-summaries';

export type OfferInvalidReason = 'requested_not_found' | 'requested_inactive' | 'own_requested_item' | 'offered_not_found' | 'offered_inactive' | 'offered_not_owned' | 'same_item';
export type OfferItemSummary = ExchangeItemSummary;
export type OfferViewerRole = 'sender' | 'receiver';
export type OfferStatus = 'pending' | 'thinking' | 'accepted' | 'soft_rejected' | 'redirected' | 'withdrawn' | 'expired' | 'cancelled_after_accept' | string;

export const OFFER_STATUS_LABELS: Record<string, string> = {
  pending: 'بانتظار الرد', thinking: 'قيد التفكير', accepted: 'تم القبول', soft_rejected: 'لم يتم القبول', redirected: 'فُتح باب بديل', withdrawn: 'تم سحب العرض', expired: 'انتهت صلاحيته', cancelled_after_accept: 'أُلغي بعد القبول',
};

type ItemValidationRow = { id: string; title: string | null; owner_id: string; status: string };

export type OfferRowSummary = { id: string; status: OfferStatus; senderId: string; receiverId: string; createdAt: string | null; requestedItem: OfferItemSummary | null; offeredItem: OfferItemSummary | null; roleContext: 'incoming' | 'sent' };
export type OffersInboxResult = { incomingActionableOffers: OfferRowSummary[]; sentOffers: OfferRowSummary[] };
export type OfferDetailResult = { ok: true; offer: OfferDetail } | { ok: false; reason: 'not_found' | 'unauthorized' };
export type OfferDetail = OfferRowSummary & { message: string | null; requestedItemId: string; offeredItemId: string; viewerRole: OfferViewerRole; dealId: string | null };

export type OfferActionResult = { ok: true; dealId?: string } | { ok: false; reason: 'not_found' | 'unauthorized' | 'invalid_status' | 'unknown'; message: string };

const respondableStatuses = new Set(['pending', 'thinking']);
const labelForItemFallback = 'عنصر بدون عنوان';

const getStatusLabel = (status: string) => OFFER_STATUS_LABELS[status] ?? status;
export { getStatusLabel as getOfferStatusLabel };

async function fetchItemValidation(itemId: string): Promise<ItemValidationRow | null> { const { data, error } = await supabase.from('items').select('id,title,owner_id,status').eq('id', itemId).maybeSingle(); if (error) throw error; return (data as ItemValidationRow | null) ?? null; }

function mapOfferRows(rows: any[], roleContext: 'incoming' | 'sent', itemsById: Map<string, OfferItemSummary>): OfferRowSummary[] {
  return rows.map((row) => ({ id: row.id as string, status: row.status as OfferStatus, senderId: row.sender_id as string, receiverId: row.receiver_id as string, createdAt: (row.created_at as string | null) ?? null, requestedItem: itemsById.get(row.requested_item_id as string) ?? null, offeredItem: itemsById.get(row.offered_item_id as string) ?? null, roleContext }));
}

async function notify(payload: Record<string, unknown>) {
  const { error } = await supabase.rpc('create_notification', payload);
  if (error && __DEV__) console.log('[offers] create_notification failed', error);
}

async function getOfferForAction(offerId: string): Promise<any | null> {
  const { data, error } = await supabase.from('offers').select('id,status,sender_id,receiver_id').eq('id', offerId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchOffersInbox(currentUserId: string): Promise<OffersInboxResult> {
  const [incomingRes, sentRes] = await Promise.all([
    supabase.from('offers').select('id,status,sender_id,receiver_id,requested_item_id,offered_item_id,created_at').eq('receiver_id', currentUserId).in('status', ['pending', 'thinking']).order('created_at', { ascending: false }),
    supabase.from('offers').select('id,status,sender_id,receiver_id,requested_item_id,offered_item_id,created_at').eq('sender_id', currentUserId).order('created_at', { ascending: false }),
  ]);
  if (incomingRes.error) throw incomingRes.error;
  if (sentRes.error) throw sentRes.error;

  const allRows = [...(incomingRes.data ?? []), ...(sentRes.data ?? [])];
  const itemIds = [...new Set(allRows.flatMap((row) => [row.requested_item_id as string, row.offered_item_id as string]))];
  const summaries = await fetchExchangeItemSummariesByIds(itemIds);
  const byId = new Map(summaries.map((s) => [s.id, s]));

  return { incomingActionableOffers: mapOfferRows(incomingRes.data ?? [], 'incoming', byId), sentOffers: mapOfferRows(sentRes.data ?? [], 'sent', byId) };
}

export async function fetchOfferById(offerId: string, currentUserId: string): Promise<OfferDetailResult> {
  const { data, error } = await supabase.from('offers').select('id,status,message,requested_item_id,offered_item_id,sender_id,receiver_id,created_at').eq('id', offerId).maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, reason: 'not_found' };

  const senderId = data.sender_id as string;
  const receiverId = data.receiver_id as string;
  if (currentUserId !== senderId && currentUserId !== receiverId) return { ok: false, reason: 'unauthorized' };

  const [requestedItem, offeredItem, deal] = await Promise.all([
    fetchExchangeItemSummariesByIds([data.requested_item_id as string]).then((r) => r[0] ?? null),
    fetchExchangeItemSummariesByIds([data.offered_item_id as string]).then((r) => r[0] ?? null),
    supabase.from('swap_deals').select('id').eq('offer_id', offerId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const detail: OfferDetail = { id: data.id as string, status: data.status as OfferStatus, message: (data.message as string | null) ?? null, requestedItemId: data.requested_item_id as string, offeredItemId: data.offered_item_id as string, senderId, receiverId, createdAt: (data.created_at as string | null) ?? null, requestedItem, offeredItem, roleContext: currentUserId === receiverId ? 'incoming' : 'sent', viewerRole: currentUserId === receiverId ? 'receiver' : 'sender', dealId: (deal.data?.id as string | undefined) ?? null };

  return { ok: true, offer: detail };
}

export async function markOfferThinkingFromMobile(input: { offerId: string; currentUserId: string; note?: string }): Promise<OfferActionResult> {
  const offer = await getOfferForAction(input.offerId); if (!offer) return { ok: false, reason: 'not_found', message: 'العرض غير موجود.' };
  if (offer.receiver_id !== input.currentUserId) return { ok: false, reason: 'unauthorized', message: 'غير مسموح لك بالرد على هذا العرض.' };
  if (!respondableStatuses.has(offer.status as string)) return { ok: false, reason: 'invalid_status', message: `لا يمكن تنفيذ الإجراء. حالة العرض: ${getStatusLabel(offer.status as string)}.` };
  const { error } = await supabase.rpc('mark_offer_thinking', { p_offer_id: input.offerId, p_note: input.note?.trim() || null }); if (error) return { ok: false, reason: 'unknown', message: 'تعذر تحديث حالة العرض.' };
  void notify({ target_user_id: offer.sender_id, notification_type: 'offer_thinking', notification_title: 'صاحب الحاجة محتاج يفكر', notification_body: 'العرض لسه مفتوح، بس محتاج وقت.', target_offer_id: input.offerId, target_deal_id: null, target_item_id: null });
  return { ok: true };
}

export async function softRejectOfferFromMobile(input: { offerId: string; currentUserId: string; note?: string }): Promise<OfferActionResult> {
  const offer = await getOfferForAction(input.offerId); if (!offer) return { ok: false, reason: 'not_found', message: 'العرض غير موجود.' };
  if (offer.receiver_id !== input.currentUserId) return { ok: false, reason: 'unauthorized', message: 'غير مسموح لك بالرد على هذا العرض.' };
  if (!respondableStatuses.has(offer.status as string)) return { ok: false, reason: 'invalid_status', message: `لا يمكن تنفيذ الإجراء. حالة العرض: ${getStatusLabel(offer.status as string)}.` };
  const { error } = await supabase.rpc('soft_reject_offer', { p_offer_id: input.offerId, p_note: input.note?.trim() || null }); if (error) return { ok: false, reason: 'unknown', message: 'تعذر رفض العرض حالياً.' };
  void notify({ target_user_id: offer.sender_id, notification_type: 'offer_soft_rejected', notification_title: 'العرض ما ظبطش المرة دي', notification_body: 'صاحب الحاجة رفض العرض بلطف.', target_offer_id: input.offerId, target_deal_id: null, target_item_id: null });
  return { ok: true };
}

export async function acceptOfferFromMobile(input: { offerId: string; currentUserId: string }): Promise<OfferActionResult> {
  const offer = await getOfferForAction(input.offerId); if (!offer) return { ok: false, reason: 'not_found', message: 'العرض غير موجود.' };
  if (offer.receiver_id !== input.currentUserId) return { ok: false, reason: 'unauthorized', message: 'غير مسموح لك بقبول هذا العرض.' };
  if (!respondableStatuses.has(offer.status as string)) return { ok: false, reason: 'invalid_status', message: `لا يمكن قبول العرض. حالته الآن: ${getStatusLabel(offer.status as string)}.` };
  const { data: dealId, error } = await supabase.rpc('accept_offer', { p_offer_id: input.offerId });
  if (error || !dealId) return { ok: false, reason: 'unknown', message: 'تعذر قبول العرض حالياً.' };
  void Promise.all([
    notify({ target_user_id: offer.sender_id, notification_type: 'offer_accepted', notification_title: 'العرض اتقبل', notification_body: 'صاحب الحاجة قبل العرض.', target_offer_id: input.offerId, target_deal_id: dealId, target_item_id: null }),
    notify({ target_user_id: offer.sender_id, notification_type: 'deal_created', notification_title: 'اتفتحت صفحة التنسيق', notification_body: 'العرض اتقبل، وكده تقدروا تتابعوا الصفقة من صفحة التنسيق.', target_offer_id: input.offerId, target_deal_id: dealId, target_item_id: null }),
    notify({ target_user_id: offer.receiver_id, notification_type: 'deal_created', notification_title: 'اتفتحت صفحة التنسيق', notification_body: 'العرض اتقبل، وكده تقدروا تتابعوا الصفقة من صفحة التنسيق.', target_offer_id: input.offerId, target_deal_id: dealId, target_item_id: null }),
  ]);
  return { ok: true, dealId: dealId as string };
}

// kept from M5
export type OfferCreationContextResult = | { ok: true; requestedItem: OfferItemSummary; myActiveItems: OfferItemSummary[] } | { ok: false; reason: OfferInvalidReason; message: string };
export type CreateSwapOfferResult = | { ok: true; offerId: string } | { ok: false; reason: OfferInvalidReason | 'unknown'; message: string };
function getInvalidMessage(reason: OfferInvalidReason): string { const messages: Record<OfferInvalidReason, string> = { requested_not_found: 'العنصر المطلوب غير موجود.', requested_inactive: 'العنصر المطلوب غير متاح حالياً للتبديل.', own_requested_item: 'لا يمكنك إرسال عرض على عنصرك الخاص.', offered_not_found: 'العنصر الذي اخترته للعرض غير موجود.', offered_inactive: 'العنصر الذي اخترته غير نشط حالياً.', offered_not_owned: 'يمكنك فقط العرض بعنصر تملكه أنت.', same_item: 'لا يمكن استخدام نفس العنصر كعنصر مطلوب ومعروض.' }; return messages[reason]; }
export async function fetchOfferCreationContext(requestedItemId: string, currentUserId: string): Promise<OfferCreationContextResult> { const requested = await fetchItemValidation(requestedItemId); if (!requested) return { ok: false, reason: 'requested_not_found', message: getInvalidMessage('requested_not_found') }; if (requested.status !== 'active') return { ok: false, reason: 'requested_inactive', message: getInvalidMessage('requested_inactive') }; if (requested.owner_id === currentUserId) return { ok: false, reason: 'own_requested_item', message: getInvalidMessage('own_requested_item') }; const { data: myItems, error: myItemsError } = await supabase.from('items').select('id').eq('owner_id', currentUserId).eq('status', 'active').order('created_at', { ascending: false }); if (myItemsError) throw myItemsError; const myItemIds = (myItems ?? []).map((item) => item.id as string); const [requestedDisplay] = await fetchExchangeItemSummariesByIds([requestedItemId]); const myActiveItems = await fetchExchangeItemSummariesByIds(myItemIds); return { ok: true, requestedItem: requestedDisplay ?? { id: requested.id, title: requested.title?.trim() || labelForItemFallback, imageUrl: null, category: null, condition: null, location: null, ownerDisplayName: null, status: requested.status }, myActiveItems }; }
export async function createSwapOffer(input: { requestedItemId: string; offeredItemId: string; message?: string; currentUserId: string; }): Promise<CreateSwapOfferResult> { const { requestedItemId, offeredItemId, message, currentUserId } = input; if (requestedItemId === offeredItemId) return { ok: false, reason: 'same_item', message: getInvalidMessage('same_item') }; const requested = await fetchItemValidation(requestedItemId); if (!requested) return { ok: false, reason: 'requested_not_found', message: getInvalidMessage('requested_not_found') }; if (requested.status !== 'active') return { ok: false, reason: 'requested_inactive', message: getInvalidMessage('requested_inactive') }; if (requested.owner_id === currentUserId) return { ok: false, reason: 'own_requested_item', message: getInvalidMessage('own_requested_item') }; const offered = await fetchItemValidation(offeredItemId); if (!offered) return { ok: false, reason: 'offered_not_found', message: getInvalidMessage('offered_not_found') }; if (offered.status !== 'active') return { ok: false, reason: 'offered_inactive', message: getInvalidMessage('offered_inactive') }; if (offered.owner_id !== currentUserId) return { ok: false, reason: 'offered_not_owned', message: getInvalidMessage('offered_not_owned') }; const { data: offer, error: offerError } = await supabase.from('offers').insert({ requested_item_id: requestedItemId, offered_item_id: offeredItemId, sender_id: currentUserId, receiver_id: requested.owner_id, status: 'pending', message: message?.trim() || null }).select('id').single(); if (offerError || !offer) return { ok: false, reason: 'unknown', message: 'تعذر إنشاء العرض حالياً. حاول مرة أخرى.' }; void notify({ target_user_id: requested.owner_id, notification_type: 'offer_received', notification_title: 'وصلك عرض جديد', notification_body: requested.title?.trim() ? `لديك عرض جديد على "${requested.title.trim()}".` : 'لديك عرض تبديل جديد.', target_item_id: requestedItemId, target_offer_id: offer.id, target_deal_id: null }); return { ok: true, offerId: offer.id }; }
