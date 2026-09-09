import { teswaBackendRuntime } from '@/lib/backend/runtime';

type ReviewContextErrorReason =
  | 'not_found'
  | 'unauthorized'
  | 'deal_not_completed'
  | 'unknown';

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
  | {
      ok: false;
      reason:
        | 'invalid_rating'
        | 'duplicate'
        | 'not_found'
        | 'unauthorized'
        | 'deal_not_completed'
        | 'unknown';
      message: string;
    };

export async function fetchDealReviewContext(
  dealId: string,
  currentUserId: string,
): Promise<
  | { ok: true; context: DealReviewContext }
  | { ok: false; reason: ReviewContextErrorReason; message: string }
> {
  try {
    const result = await teswaBackendRuntime.reviews.getDealReviewContext({
      dealId,
      currentUserId,
    });

    if (!result.ok) {
      switch (result.reason) {
        case 'not_found':
          return {
            ok: false,
            reason: 'not_found',
            message: 'الصفقة غير موجودة.',
          };
        case 'unauthorized':
          return {
            ok: false,
            reason: 'unauthorized',
            message: 'غير مسموح لك بتقييم هذه الصفقة.',
          };
        case 'deal_not_completed':
          return {
            ok: false,
            reason: 'deal_not_completed',
            message: 'التقييم متاح فقط بعد اكتمال المقايضة.',
          };
        default:
          return {
            ok: false,
            reason: 'unknown',
            message: 'تعذر تجهيز شاشة التقييم حالياً.',
          };
      }
    }

    return { ok: true, context: result.data };
  } catch (error) {
    if (__DEV__) {
      console.log('[reviews] fetchDealReviewContext failed', {
        dealId,
        currentUserId,
        code: (error as { code?: string })?.code,
        message: (error as { message?: string })?.message,
      });
    }
    return {
      ok: false,
      reason: 'unknown',
      message: 'تعذر تجهيز شاشة التقييم حالياً.',
    };
  }
}

export async function submitDealReview(
  input: SubmitDealReviewInput,
): Promise<SubmitDealReviewResult> {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return {
      ok: false,
      reason: 'invalid_rating',
      message: 'التقييم لازم يكون رقم من 1 إلى 5.',
    };
  }

  const contextResult = await fetchDealReviewContext(
    input.dealId,
    input.currentUserId,
  );
  if (!contextResult.ok) {
    return {
      ok: false,
      reason: contextResult.reason,
      message: contextResult.message,
    };
  }

  const result = await teswaBackendRuntime.reviews.createDealReview({
    dealId: input.dealId,
    reviewerId: input.currentUserId,
    revieweeId: contextResult.context.reviewee.id,
    rating,
    comment: input.comment?.trim() ? input.comment.trim() : null,
    clearDescription: input.clearDescription,
    goodCommunication: input.goodCommunication,
    onTime: input.onTime,
    respectfulSwapper: input.respectfulSwapper,
  });

  if (result.ok) {
    return { ok: true, message: 'تم إرسال تقييمك.' };
  }

  if (result.reason === 'duplicate') {
    return {
      ok: false,
      reason: 'duplicate',
      message: 'تم تسجيل تقييمك لهذه الصفقة بالفعل.',
    };
  }
  if (result.reason === 'unauthorized') {
    return {
      ok: false,
      reason: 'unauthorized',
      message: 'غير مسموح لك بإرسال تقييم لهذه الصفقة.',
    };
  }

  if (__DEV__) {
    console.log('[reviews] submitDealReview failed', {
      dealId: input.dealId,
      currentUserId: input.currentUserId,
      reason: result.reason,
      message: result.message,
    });
  }
  return {
    ok: false,
    reason: 'unknown',
    message: 'تعذر إرسال التقييم حالياً.',
  };
}
