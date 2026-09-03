import type { IsoDateTime, TeswaResult } from '@/lib/backend/contracts/core';

export type ReviewParticipantRecord = {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  successfulSwapsCount: number | null;
  responseRate: number | null;
};

export type ExistingDealReviewRecord = {
  id: string;
  rating: number;
  comment: string | null;
  clearDescription: boolean;
  goodCommunication: boolean;
  onTime: boolean;
  respectfulSwapper: boolean;
  createdAt: IsoDateTime;
};

export type DealReviewContextRecord = {
  dealId: string;
  reviewerId: string;
  reviewee: ReviewParticipantRecord;
  existingReview: ExistingDealReviewRecord | null;
};

export interface ReviewsContract {
  getDealReviewContext(input: {
    dealId: string;
    currentUserId: string;
  }): Promise<
    TeswaResult<
      DealReviewContextRecord,
      'not_found' | 'unauthorized' | 'deal_not_completed' | 'unknown'
    >
  >;

  createDealReview(input: {
    dealId: string;
    reviewerId: string;
    revieweeId: string;
    rating: number;
    comment: string | null;
    clearDescription: boolean;
    goodCommunication: boolean;
    onTime: boolean;
    respectfulSwapper: boolean;
  }): Promise<TeswaResult<void, 'duplicate' | 'unauthorized' | 'unknown'>>;
}
