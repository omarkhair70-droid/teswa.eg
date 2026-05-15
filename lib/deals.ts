import { fetchExchangeItemSummariesByIds } from '@/lib/exchange-item-summaries';
import { supabase } from '@/lib/supabase/client';

export type DealStatus = 'coordinating' | 'completed_pending_confirmation' | 'completed' | 'cancelled' | 'disputed' | string;
export type DealViewerRole = 'requester' | 'offerer';

export type DealRoomMessage = {
  id: string;
  dealId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export type DealParticipantSummary = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
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
    messages: DealRoomMessage[];
  }}
  | { ok: false; reason: 'not_found' | 'unauthorized' };

async function notify(payload: Record<string, unknown>) {
  const { error } = await supabase.rpc('create_notification', payload);
  if (error && __DEV__) console.log('[deals] create_notification failed', error);
}

async function getDealParticipantProfiles(participantIds: string[]) {
  const { data, error } = await supabase.from('profiles').select('id,display_name,avatar_url').in('id', participantIds);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id as string, { id: p.id as string, displayName: (p.display_name as string | null) ?? null, avatarUrl: (p.avatar_url as string | null) ?? null }]));
}

function toMessageRow(row: any): DealRoomMessage {
  return {
    id: row.id as string,
    dealId: row.deal_id as string,
    senderId: row.sender_id as string,
    body: row.body as string,
    createdAt: row.created_at as string,
  };
}

export async function fetchDealRoomById(dealId: string, currentUserId: string): Promise<DealRoomResult> {
  const { data: deal, error: dealError } = await supabase
    .from('swap_deals')
    .select('id,status,accepted_at,created_at,requested_item_id,offered_item_id,requester_id,offerer_id')
    .eq('id', dealId)
    .maybeSingle();

  if (dealError) throw dealError;
  if (!deal) return { ok: false, reason: 'not_found' };

  const requesterId = deal.requester_id as string;
  const offererId = deal.offerer_id as string;
  if (currentUserId !== requesterId && currentUserId !== offererId) return { ok: false, reason: 'unauthorized' };

  const viewerRole: DealViewerRole = currentUserId === requesterId ? 'requester' : 'offerer';
  const otherParticipantId = viewerRole === 'requester' ? offererId : requesterId;

  const [requestedItem, offeredItem, confirmationsRes, messagesRes, profilesById] = await Promise.all([
    fetchExchangeItemSummariesByIds([deal.requested_item_id as string]).then((r) => r[0] ?? null),
    fetchExchangeItemSummariesByIds([deal.offered_item_id as string]).then((r) => r[0] ?? null),
    supabase.from('deal_confirmations').select('user_id').eq('deal_id', dealId),
    supabase.from('deal_messages').select('id,deal_id,sender_id,body,created_at').eq('deal_id', dealId).order('created_at', { ascending: true }).limit(100),
    getDealParticipantProfiles([requesterId, offererId]),
  ]);

  if (confirmationsRes.error) throw confirmationsRes.error;
  if (messagesRes.error) throw messagesRes.error;

  const confirmerIds = new Set((confirmationsRes.data ?? []).map((r) => r.user_id as string));
  const iConfirmed = confirmerIds.has(currentUserId);
  const otherConfirmed = confirmerIds.has(otherParticipantId);
  const canCoordinate = ['coordinating', 'completed_pending_confirmation'].includes(deal.status as string);

  const requester = profilesById.get(requesterId) ?? { id: requesterId, displayName: null, avatarUrl: null };
  const offerer = profilesById.get(offererId) ?? { id: offererId, displayName: null, avatarUrl: null };

  return {
    ok: true,
    deal: {
      id: deal.id as string,
      status: deal.status as DealStatus,
      acceptedAt: (deal.accepted_at as string | null) ?? null,
      createdAt: (deal.created_at as string | null) ?? null,
      viewerRole,
      requester,
      offerer,
      otherParticipant: profilesById.get(otherParticipantId) ?? { id: otherParticipantId, displayName: null, avatarUrl: null },
      requestedItem,
      offeredItem,
      iConfirmed,
      otherConfirmed,
      canSendMessage: canCoordinate,
      canConfirmCompletion: canCoordinate && !iConfirmed,
      messages: (messagesRes.data ?? []).map(toMessageRow),
    },
  };
}

export async function markDealThreadReadFromMobile(dealId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_deal_thread_read', { p_deal_id: dealId });
  if (error && __DEV__) console.log('[deals] mark_deal_thread_read failed', error);
}

export async function sendDealMessageFromMobile(input: { dealId: string; currentUserId: string; body: string }) {
  const body = input.body.trim();
  if (!body) return { ok: false as const, reason: 'invalid_body' as const, message: 'اكتب رسالة الأول.' };
  if (body.length > 800) return { ok: false as const, reason: 'invalid_body' as const, message: 'الرسالة طويلة زيادة عن الحد (800 حرف).' };

  const { data: deal, error: dealError } = await supabase
    .from('swap_deals')
    .select('id,status,requester_id,offerer_id')
    .eq('id', input.dealId)
    .maybeSingle();

  if (dealError) throw dealError;
  if (!deal) return { ok: false as const, reason: 'not_found' as const, message: 'الصفقة غير موجودة.' };

  const requesterId = deal.requester_id as string;
  const offererId = deal.offerer_id as string;
  if (input.currentUserId !== requesterId && input.currentUserId !== offererId) {
    return { ok: false as const, reason: 'unauthorized' as const, message: 'غير مسموح لك بالمراسلة في الصفقة دي.' };
  }

  if (!['coordinating', 'completed_pending_confirmation'].includes(deal.status as string)) {
    return { ok: false as const, reason: 'invalid_status' as const, message: 'المراسلة متاحة فقط أثناء التنسيق أو انتظار التأكيد.' };
  }

  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error: rateError } = await supabase
    .from('deal_messages')
    .select('id', { head: true, count: 'exact' })
    .eq('deal_id', input.dealId)
    .eq('sender_id', input.currentUserId)
    .gte('created_at', since);
  if (rateError) throw rateError;
  if ((count ?? 0) >= 5) {
    return { ok: false as const, reason: 'rate_limited' as const, message: 'استنى دقيقة قبل إرسال رسائل جديدة كتير.' };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('deal_messages')
    .insert({ deal_id: input.dealId, sender_id: input.currentUserId, body })
    .select('id,deal_id,sender_id,body,created_at')
    .single();
  if (insertError) throw insertError;

  const otherParticipantId = input.currentUserId === requesterId ? offererId : requesterId;
  void notify({
    target_user_id: otherParticipantId,
    notification_type: 'system',
    notification_title: 'رسالة جديدة في الصفقة',
    notification_body: 'الطرف التاني بعت رسالة في صفحة التنسيق.',
    target_deal_id: input.dealId,
    target_offer_id: null,
    target_item_id: null,
  });

  return { ok: true as const, message: toMessageRow(inserted) };
}

export async function confirmDealCompletedFromMobile(input: { dealId: string; currentUserId: string; note?: string }) {
  const { data: deal, error: dealError } = await supabase
    .from('swap_deals')
    .select('id,status,requester_id,offerer_id')
    .eq('id', input.dealId)
    .maybeSingle();
  if (dealError) throw dealError;
  if (!deal) return { ok: false as const, reason: 'not_found' as const, message: 'الصفقة غير موجودة.' };

  const requesterId = deal.requester_id as string;
  const offererId = deal.offerer_id as string;
  if (input.currentUserId !== requesterId && input.currentUserId !== offererId) {
    return { ok: false as const, reason: 'unauthorized' as const, message: 'غير مسموح لك بتأكيد الصفقة دي.' };
  }

  if (!['coordinating', 'completed_pending_confirmation'].includes(deal.status as string)) {
    return { ok: false as const, reason: 'invalid_status' as const, message: 'تأكيد الإتمام غير متاح للحالة الحالية.' };
  }

  const { error: insertError } = await supabase.from('deal_confirmations').insert({ deal_id: input.dealId, user_id: input.currentUserId, note: input.note?.trim() || null });
  if (insertError && insertError.code !== '23505') throw insertError;

  const { data: completed, error: completeError } = await supabase.rpc('complete_deal_if_ready', { p_deal_id: input.dealId });
  if (completeError) throw completeError;

  const otherParticipantId = input.currentUserId === requesterId ? offererId : requesterId;
  if (completed) {
    void Promise.all([
      notify({ target_user_id: requesterId, notification_type: 'deal_completed', notification_title: 'المقايضة تمت', notification_body: 'الطرفين أكدوا الإتمام. تقدروا تسيبوا تقييم لبعض.', target_deal_id: input.dealId, target_offer_id: null, target_item_id: null }),
      notify({ target_user_id: offererId, notification_type: 'deal_completed', notification_title: 'المقايضة تمت', notification_body: 'الطرفين أكدوا الإتمام. تقدروا تسيبوا تقييم لبعض.', target_deal_id: input.dealId, target_offer_id: null, target_item_id: null }),
    ]);
  } else {
    void notify({
      target_user_id: otherParticipantId,
      notification_type: 'system',
      notification_title: 'الصفقة مستنية تأكيدك',
      notification_body: 'الطرف التاني أكد إن المقايضة تمت. راجع الصفقة وأكد لما تكون جاهز.',
      target_deal_id: input.dealId,
      target_offer_id: null,
      target_item_id: null,
    });
  }

  return { ok: true as const, completed: Boolean(completed) };
}
