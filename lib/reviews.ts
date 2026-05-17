import { supabase } from '@/lib/supabase/client';

type ReviewContextErrorReason = 'not_found' | 'unauthorized' | 'deal_not_completed' | 'unknown';

type ParticipantSummary = {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  successfulSwapsCount: number | null;
  responseRate: number | null;
};

export type ExistingDealReview = {
  id: string;
  rating: number;
  comment: string | null;
  clearDescription: boolean;
  goodCommunication: boolean;
  onTime: boolean;
  respectfulSwapper: boolean;
  createdAt: string;
};

export type DealReviewContext = {
  dealId: string;
  reviewerId: string;
  reviewee: ParticipantSummary;
  existingReview: ExistingDealReview | null;
};

export type SubmitDealReviewInput = {
  dealId: string;
  currentUserId: string;
  rating: number;
  comment?: string;
  clearDescription: boolean;
  goodCommunication: boolean;
  onTime: boolean;
  respectfulSwapper: boolean;
};

export type SubmitDealReviewResult =
  | { ok: true; message: string }
  | { ok: false; reason: 'invalid_rating' | 'duplicate' | 'not_found' | 'unauthorized' | 'deal_not_completed' | 'unknown'; message: string };

export async function fetchDealReviewContext(
  dealId: string,
  currentUserId: string
): Promise<{ ok: true; context: DealReviewContext } | { ok: false; reason: ReviewContextErrorReason; message: string }> {
  try {
    const { data: deal, error: dealError } = await supabase
      .from('swap_deals')
      .select('id,status,requester_id,offerer_id')
      .eq('id', dealId)
      .maybeSingle();

    if (dealError) throw dealError;
    if (!deal) return { ok: false, reason: 'not_found', message: 'الصفقة غير موجودة.' };

    const isParticipant = deal.requester_id === currentUserId || deal.offerer_id === currentUserId;
    if (!isParticipant) return { ok: false, reason: 'unauthorized', message: 'غير مسموح لك بتقييم هذه الصفقة.' };
    if (deal.status !== 'completed') return { ok: false, reason: 'deal_not_completed', message: 'التقييم متاح فقط بعد اكتمال المقايضة.' };

    const revieweeId = deal.requester_id === currentUserId ? deal.offerer_id : deal.requester_id;
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id,display_name,username,avatar_url,successful_swaps_count,response_rate')
      .eq('id', revieweeId)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) return { ok: false, reason: 'unknown', message: 'تعذر تحميل بيانات الطرف الآخر.' };

    const { data: existingReview, error: reviewError } = await supabase
      .from('reviews')
      .select('id,rating,comment,clear_description,good_communication,on_time,respectful_swapper,created_at')
      .eq('deal_id', dealId)
      .eq('reviewer_id', currentUserId)
      .eq('reviewee_id', revieweeId)
      .maybeSingle();

    if (reviewError) throw reviewError;

    return {
      ok: true,
      context: {
        dealId,
        reviewerId: currentUserId,
        reviewee: {
          id: profile.id as string,
          displayName: (profile.display_name as string | null) ?? null,
          username: (profile.username as string | null) ?? null,
          avatarUrl: (profile.avatar_url as string | null) ?? null,
          successfulSwapsCount: (profile.successful_swaps_count as number | null) ?? null,
          responseRate: (profile.response_rate as number | null) ?? null,
        },
        existingReview: existingReview
          ? {
              id: existingReview.id as string,
              rating: existingReview.rating as number,
              comment: (existingReview.comment as string | null) ?? null,
              clearDescription: Boolean(existingReview.clear_description),
              goodCommunication: Boolean(existingReview.good_communication),
              onTime: Boolean(existingReview.on_time),
              respectfulSwapper: Boolean(existingReview.respectful_swapper),
              createdAt: existingReview.created_at as string,
            }
          : null,
      },
    };
  } catch (error) {
    if (__DEV__) console.log('[reviews] fetchDealReviewContext failed', { dealId, currentUserId, code: (error as { code?: string })?.code, message: (error as { message?: string })?.message });
    return { ok: false, reason: 'unknown', message: 'تعذر تجهيز شاشة التقييم حالياً.' };
  }
}

export async function submitDealReview(input: SubmitDealReviewInput): Promise<SubmitDealReviewResult> {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, reason: 'invalid_rating', message: 'التقييم لازم يكون رقم من 1 إلى 5.' };
  }

  const contextResult = await fetchDealReviewContext(input.dealId, input.currentUserId);
  if (!contextResult.ok) {
    return { ok: false, reason: contextResult.reason, message: contextResult.message };
  }

  const { reviewee } = contextResult.context;

  try {
    const { error } = await supabase.from('reviews').insert({
      deal_id: input.dealId,
      reviewer_id: input.currentUserId,
      reviewee_id: reviewee.id,
      rating,
      comment: input.comment?.trim() ? input.comment.trim() : null,
      clear_description: input.clearDescription,
      good_communication: input.goodCommunication,
      on_time: input.onTime,
      respectful_swapper: input.respectfulSwapper,
    });

    if (error) {
      if (error.code === '23505') {
        return { ok: false, reason: 'duplicate', message: 'تم تسجيل تقييمك لهذه الصفقة بالفعل.' };
      }
      if (error.code === '42501') {
        return { ok: false, reason: 'unauthorized', message: 'غير مسموح لك بإرسال تقييم لهذه الصفقة.' };
      }
      if (__DEV__) console.log('[reviews] submitDealReview insert failed', { dealId: input.dealId, currentUserId: input.currentUserId, code: error.code, message: error.message });
      return { ok: false, reason: 'unknown', message: 'تعذر إرسال التقييم حالياً.' };
    }

    return { ok: true, message: 'تم إرسال تقييمك.' };
  } catch (error) {
    if (__DEV__) console.log('[reviews] submitDealReview failed', { dealId: input.dealId, currentUserId: input.currentUserId, code: (error as { code?: string })?.code, message: (error as { message?: string })?.message });
    return { ok: false, reason: 'unknown', message: 'تعذر إرسال التقييم حالياً.' };
  }
}
