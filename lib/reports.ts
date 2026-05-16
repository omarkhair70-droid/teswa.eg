import { supabase } from '@/lib/supabase/client';

export type ReportReason = 'misleading_item' | 'inappropriate_content' | 'spam_offer' | 'unsafe_behavior' | 'no_show' | 'other';

type ReportContextReason = 'not_found' | 'unauthorized' | 'unknown';

type ParticipantSummary = {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export type DealReportContext = {
  dealId: string;
  reporterId: string;
  reportedUser: ParticipantSummary;
};

export type SubmitDealReportInput = {
  dealId: string;
  currentUserId: string;
  reason: ReportReason;
  details?: string;
};

export type SubmitDealReportResult =
  | { ok: true; message: string }
  | { ok: false; reason: 'invalid_reason' | 'not_found' | 'unauthorized' | 'unknown'; message: string };

const ALLOWED_REASONS: ReportReason[] = ['misleading_item', 'inappropriate_content', 'spam_offer', 'unsafe_behavior', 'no_show', 'other'];

export async function fetchDealReportContext(
  dealId: string,
  currentUserId: string
): Promise<{ ok: true; context: DealReportContext } | { ok: false; reason: ReportContextReason; message: string }> {
  try {
    const { data: deal, error: dealError } = await supabase
      .from('swap_deals')
      .select('id,requester_id,offerer_id')
      .eq('id', dealId)
      .maybeSingle();

    if (dealError) throw dealError;
    if (!deal) return { ok: false, reason: 'not_found', message: 'الصفقة غير موجودة.' };

    const isParticipant = deal.requester_id === currentUserId || deal.offerer_id === currentUserId;
    if (!isParticipant) return { ok: false, reason: 'unauthorized', message: 'غير مسموح لك بإرسال بلاغ من هذه الصفقة.' };

    const reportedUserId = deal.requester_id === currentUserId ? deal.offerer_id : deal.requester_id;
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id,display_name,username,avatar_url')
      .eq('id', reportedUserId)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) return { ok: false, reason: 'unknown', message: 'تعذر تحميل بيانات الطرف الآخر.' };

    return {
      ok: true,
      context: {
        dealId,
        reporterId: currentUserId,
        reportedUser: {
          id: profile.id as string,
          displayName: (profile.display_name as string | null) ?? null,
          username: (profile.username as string | null) ?? null,
          avatarUrl: (profile.avatar_url as string | null) ?? null,
        },
      },
    };
  } catch (error) {
    if (__DEV__) console.log('[reports] fetchDealReportContext failed', { dealId, currentUserId, code: (error as { code?: string })?.code, message: (error as { message?: string })?.message });
    return { ok: false, reason: 'unknown', message: 'تعذر تجهيز شاشة البلاغ حالياً.' };
  }
}

export async function submitDealReport(input: SubmitDealReportInput): Promise<SubmitDealReportResult> {
  if (!ALLOWED_REASONS.includes(input.reason)) {
    return { ok: false, reason: 'invalid_reason', message: 'سبب البلاغ غير صالح.' };
  }

  const contextResult = await fetchDealReportContext(input.dealId, input.currentUserId);
  if (!contextResult.ok) {
    return { ok: false, reason: contextResult.reason, message: contextResult.message };
  }

  const { reportedUser } = contextResult.context;

  try {
    const { error } = await supabase.from('reports').insert({
      reporter_id: input.currentUserId,
      reported_user_id: reportedUser.id,
      deal_id: input.dealId,
      reason: input.reason,
      details: input.details?.trim() ? input.details.trim() : null,
      item_id: null,
      offer_id: null,
      deal_message_id: null,
    });

    if (error) {
      if (error.code === '42501') {
        return { ok: false, reason: 'unauthorized', message: 'غير مسموح لك بإرسال بلاغ لهذه الصفقة.' };
      }
      if (__DEV__) console.log('[reports] submitDealReport insert failed', { dealId: input.dealId, currentUserId: input.currentUserId, code: error.code, message: error.message });
      return { ok: false, reason: 'unknown', message: 'تعذر إرسال البلاغ حالياً.' };
    }

    return { ok: true, message: 'تم استلام البلاغ.' };
  } catch (error) {
    if (__DEV__) console.log('[reports] submitDealReport failed', { dealId: input.dealId, currentUserId: input.currentUserId, code: (error as { code?: string })?.code, message: (error as { message?: string })?.message });
    return { ok: false, reason: 'unknown', message: 'تعذر إرسال البلاغ حالياً.' };
  }
}
