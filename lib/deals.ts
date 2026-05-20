import * as Crypto from 'expo-crypto';
import { fetchExchangeItemSummariesByIds } from '@/lib/exchange-item-summaries';
import { supabase } from '@/lib/supabase/client';
import { fetchUserBlockState } from '@/lib/user-blocks';

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
    messages: DealRoomMessage[];
  }}
  | { ok: false; reason: 'not_found' | 'unauthorized' };

async function notify(payload: Record<string, unknown>) {
  const { error } = await supabase.rpc('create_notification', payload);
  if (error && __DEV__) console.log('[deals] create_notification failed', error);
}

async function getDealParticipantProfiles(participantIds: string[]) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,display_name,avatar_url,username,successful_swaps_count,response_rate')
    .in('id', participantIds);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id as string, {
    id: p.id as string,
    displayName: (p.display_name as string | null) ?? null,
    avatarUrl: (p.avatar_url as string | null) ?? null,
    username: (p.username as string | null) ?? null,
    successfulSwapsCount: (p.successful_swaps_count as number | null) ?? null,
    responseRate: (p.response_rate as number | null) ?? null,
  }]));
}

function toMessageRow(row: any): DealRoomMessage {
  return {
    id: row.id as string,
    dealId: row.deal_id as string,
    senderId: row.sender_id as string,
    body: row.body as string,
    messageType: row.message_type === 'voice' ? 'voice' : 'text',
    audioStoragePath: (row.audio_storage_path as string | null) ?? null,
    audioDurationMs: (row.audio_duration_ms as number | null) ?? null,
    audioMimeType: (row.audio_mime_type as string | null) ?? null,
    audioSizeBytes: (row.audio_size_bytes as number | null) ?? null,
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
    supabase.from('deal_messages').select('id,deal_id,sender_id,body,message_type,audio_storage_path,audio_duration_ms,audio_mime_type,audio_size_bytes,created_at').eq('deal_id', dealId).order('created_at', { ascending: true }).limit(100),
    getDealParticipantProfiles([requesterId, offererId]),
  ]);

  if (confirmationsRes.error) throw confirmationsRes.error;
  if (messagesRes.error) throw messagesRes.error;

  const confirmerIds = new Set((confirmationsRes.data ?? []).map((r) => r.user_id as string));
  const iConfirmed = confirmerIds.has(currentUserId);
  const otherConfirmed = confirmerIds.has(otherParticipantId);
  const canCoordinate = ['coordinating', 'completed_pending_confirmation'].includes(deal.status as string);

  const requester = profilesById.get(requesterId) ?? { id: requesterId, displayName: null, avatarUrl: null, username: null, successfulSwapsCount: null, responseRate: null };
  const offerer = profilesById.get(offererId) ?? { id: offererId, displayName: null, avatarUrl: null, username: null, successfulSwapsCount: null, responseRate: null };

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
      otherParticipant: profilesById.get(otherParticipantId) ?? { id: otherParticipantId, displayName: null, avatarUrl: null, username: null, successfulSwapsCount: null, responseRate: null },
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

  const otherParticipantId = input.currentUserId === requesterId ? offererId : requesterId;
  const blockedState = await fetchUserBlockState(input.currentUserId, otherParticipantId);
  if (!blockedState.ok) return { ok: false as const, reason: 'unknown' as const, message: blockedState.message };
  if (blockedState.state.isBlockedEitherDirection) return { ok: false as const, reason: 'unauthorized' as const, message: 'لا يمكن إرسال رسائل لأن بينكما حظر.' };

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
    .select('id,deal_id,sender_id,body,message_type,audio_storage_path,audio_duration_ms,audio_mime_type,audio_size_bytes,created_at')
    .single();
  if (insertError) throw insertError;

  void notify({
    target_user_id: otherParticipantId,
    notification_type: 'deal_message_received',
    notification_title: 'رسالة جديدة في دردشة الصفقة',
    notification_body: 'الطرف التاني بعت رسالة في دردشة الصفقة.',
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
      notification_type: 'deal_completion_confirmation_needed',
      notification_title: 'الصفقة مستنية تأكيدك',
      notification_body: 'الطرف التاني أكد إن المقايضة تمت. راجع الصفقة وأكد لما تكون جاهز.',
      target_deal_id: input.dealId,
      target_offer_id: null,
      target_item_id: null,
    });
  }

  return { ok: true as const, completed: Boolean(completed) };
}


const DEAL_VOICE_MESSAGES_BUCKET = 'deal-voice-messages';
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

async function fileUriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  return response.arrayBuffer();
}

export async function createDealVoiceMessageSignedUrl(storagePath: string, expiresInSeconds = 60 * 60): Promise<string | null> {
  const { data, error } = await supabase.storage.from(DEAL_VOICE_MESSAGES_BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error) {
    if (__DEV__) console.log('[deals] create signed url failed', { storagePath, message: error.message });
    return null;
  }

  return data?.signedUrl ?? null;
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
  if (!localUri) return { ok: false as const, reason: 'invalid_audio' as const, message: 'تعذر قراءة التسجيل الصوتي.' };
  if (input.durationMs < 500) return { ok: false as const, reason: 'invalid_duration' as const, message: 'التسجيل قصير جدًا. سجّل رسالة أوضح.' };
  if (input.durationMs > 120000) return { ok: false as const, reason: 'invalid_duration' as const, message: 'مدة الرسالة الصوتية لا يمكن أن تتجاوز دقيقتين.' };
  if ((input.sizeBytes ?? 0) > DEAL_VOICE_MESSAGE_MAX_SIZE_BYTES) return { ok: false as const, reason: 'file_too_large' as const, message: 'حجم الرسالة الصوتية كبير جدًا.' };

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

  const otherParticipantId = input.currentUserId === requesterId ? offererId : requesterId;
  const blockedState = await fetchUserBlockState(input.currentUserId, otherParticipantId);
  if (!blockedState.ok) return { ok: false as const, reason: 'unknown' as const, message: blockedState.message };
  if (blockedState.state.isBlockedEitherDirection) {
    return { ok: false as const, reason: 'unauthorized' as const, message: 'لا يمكن إرسال رسائل صوتية لأن بينكما حظر.' };
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

  const contentType = input.mimeType || 'audio/m4a';
  const ext = getAudioExtension(input.fileName, contentType);
  const safeName = sanitizeAudioFileName(input.fileName, `voice.${ext}`);
  const uploadPath = `deals/${input.dealId}/${input.currentUserId}/${Date.now()}-${Crypto.randomUUID()}-${safeName}`;

  const body = await fileUriToArrayBuffer(localUri);
  const { error: uploadError } = await supabase.storage.from(DEAL_VOICE_MESSAGES_BUCKET).upload(uploadPath, body, { contentType, upsert: false });
  if (uploadError) {
    if (__DEV__) console.log('[deals] voice upload failed', { uploadPath, message: uploadError.message });
    return { ok: false as const, reason: 'upload_failed' as const, message: 'تعذر رفع الرسالة الصوتية. حاول مرة أخرى.' };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('deal_messages')
    .insert({
      deal_id: input.dealId,
      sender_id: input.currentUserId,
      body: 'رسالة صوتية',
      message_type: 'voice',
      audio_storage_path: uploadPath,
      audio_duration_ms: input.durationMs,
      audio_mime_type: contentType,
      audio_size_bytes: input.sizeBytes ?? null,
    })
    .select('id,deal_id,sender_id,body,message_type,audio_storage_path,audio_duration_ms,audio_mime_type,audio_size_bytes,created_at')
    .single();

  if (insertError) {
    await supabase.storage.from(DEAL_VOICE_MESSAGES_BUCKET).remove([uploadPath]);
    if (__DEV__) console.log('[deals] voice insert failed', { uploadPath, message: insertError.message });
    return { ok: false as const, reason: 'insert_failed' as const, message: 'تعذر إرسال الرسالة الصوتية. حاول مرة أخرى.' };
  }

  void notify({
    target_user_id: otherParticipantId,
    notification_type: 'deal_voice_message_received',
    notification_title: 'رسالة صوتية جديدة في دردشة الصفقة',
    notification_body: 'الطرف التاني بعت رسالة صوتية في دردشة الصفقة.',
    target_deal_id: input.dealId,
    target_offer_id: null,
    target_item_id: null,
  });

  return { ok: true as const, message: toMessageRow(inserted) };
}
