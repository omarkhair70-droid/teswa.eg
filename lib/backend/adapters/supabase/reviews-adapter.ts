import type {
  DealReviewContextRecord,
  ReviewsContract,
} from '@/lib/backend/contracts/reviews';
import { supabase } from '@/lib/supabase/client';

export function createSupabaseReviewsAdapter(): ReviewsContract {
  return {
    async getDealReviewContext(input) {
      const { data: deal, error: dealError } = await supabase
        .from('swap_deals')
        .select('id,status,requester_id,offerer_id')
        .eq('id', input.dealId)
        .maybeSingle();

      if (dealError) {
        return {
          ok: false,
          reason: 'unknown',
          message: dealError.message,
          cause: dealError,
        };
      }
      if (!deal) {
        return {
          ok: false,
          reason: 'not_found',
          message: 'Deal was not found.',
        };
      }

      const requesterId = deal.requester_id as string;
      const offererId = deal.offerer_id as string;
      const isParticipant =
        requesterId === input.currentUserId
        || offererId === input.currentUserId;

      if (!isParticipant) {
        return {
          ok: false,
          reason: 'unauthorized',
          message: 'User is not a deal participant.',
        };
      }

      if (deal.status !== 'completed') {
        return {
          ok: false,
          reason: 'deal_not_completed',
          message: 'Deal is not completed.',
        };
      }

      const revieweeId =
        requesterId === input.currentUserId ? offererId : requesterId;

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id,display_name,username,avatar_url,successful_swaps_count,response_rate')
        .eq('id', revieweeId)
        .maybeSingle();

      if (profileError) {
        return {
          ok: false,
          reason: 'unknown',
          message: profileError.message,
          cause: profileError,
        };
      }
      if (!profile) {
        return {
          ok: false,
          reason: 'unknown',
          message: 'Reviewee profile was not found.',
        };
      }

      const { data: review, error: reviewError } = await supabase
        .from('reviews')
        .select('id,rating,comment,clear_description,good_communication,on_time,respectful_swapper,created_at')
        .eq('deal_id', input.dealId)
        .eq('reviewer_id', input.currentUserId)
        .eq('reviewee_id', revieweeId)
        .maybeSingle();

      if (reviewError) {
        return {
          ok: false,
          reason: 'unknown',
          message: reviewError.message,
          cause: reviewError,
        };
      }

      const context: DealReviewContextRecord = {
        dealId: input.dealId,
        reviewerId: input.currentUserId,
        reviewee: {
          id: profile.id as string,
          displayName: (profile.display_name as string | null) ?? null,
          username: (profile.username as string | null) ?? null,
          avatarUrl: (profile.avatar_url as string | null) ?? null,
          successfulSwapsCount:
            (profile.successful_swaps_count as number | null) ?? null,
          responseRate: (profile.response_rate as number | null) ?? null,
        },
        existingReview: review
          ? {
              id: review.id as string,
              rating: review.rating as number,
              comment: (review.comment as string | null) ?? null,
              clearDescription: Boolean(review.clear_description),
              goodCommunication: Boolean(review.good_communication),
              onTime: Boolean(review.on_time),
              respectfulSwapper: Boolean(review.respectful_swapper),
              createdAt: review.created_at as string,
            }
          : null,
      };

      return { ok: true, data: context };
    },

    async createDealReview(input) {
      const { error } = await supabase
        .from('reviews')
        .insert({
          deal_id: input.dealId,
          reviewer_id: input.reviewerId,
          reviewee_id: input.revieweeId,
          rating: input.rating,
          comment: input.comment,
          clear_description: input.clearDescription,
          good_communication: input.goodCommunication,
          on_time: input.onTime,
          respectful_swapper: input.respectfulSwapper,
        });

      if (error) {
        return {
          ok: false,
          reason:
            error.code === '23505'
              ? 'duplicate'
              : error.code === '42501'
                ? 'unauthorized'
                : 'unknown',
          message: error.message,
          cause: error,
        };
      }

      return { ok: true, data: undefined };
    },
  };
}
