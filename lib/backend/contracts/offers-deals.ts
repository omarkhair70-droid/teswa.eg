import type { IsoDateTime, TeswaResult } from '@/lib/backend/contracts/core';

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

export type OfferSummary = {
  id: string;
  senderId: string;
  receiverId: string;
  requestedItemId: string;
  offeredItemId: string;
  status: OfferStatus;
  message: string | null;
  dealId: string | null;
  createdAt: IsoDateTime | null;
};

export type DealStatus =
  | 'coordinating'
  | 'completed_pending_confirmation'
  | 'completed'
  | 'cancelled'
  | 'disputed'
  | string;

export type DealMessage = {
  id: string;
  dealId: string;
  senderId: string;
  body: string;
  messageType: 'text' | 'voice';
  audioUrl: string | null;
  createdAt: IsoDateTime;
};

export type DealRoom = {
  id: string;
  status: DealStatus;
  requesterId: string;
  offererId: string;
  messages: DealMessage[];
};

export interface OffersDealsContract {
  listInbox(userId: string): Promise<{ incoming: OfferSummary[]; sent: OfferSummary[] }>;
  getOffer(offerId: string, userId: string): Promise<OfferSummary | null>;

  createOffer(input: {
    senderId: string;
    requestedItemId: string;
    offeredItemId: string;
    message?: string | null;
  }): Promise<TeswaResult<{ offerId: string }, 'invalid_item' | 'blocked' | 'unknown'>>;

  markThinking(offerId: string, userId: string, note?: string): Promise<TeswaResult<void, 'invalid_status' | 'unauthorized' | 'unknown'>>;
  softReject(offerId: string, userId: string, note?: string): Promise<TeswaResult<void, 'invalid_status' | 'unauthorized' | 'unknown'>>;
  accept(offerId: string, userId: string): Promise<TeswaResult<{ dealId: string | null }, 'invalid_status' | 'unauthorized' | 'unknown'>>;

  getDealRoom(dealId: string, userId: string): Promise<DealRoom | null>;
  markDealRead(dealId: string, userId: string): Promise<void>;
  sendDealText(dealId: string, userId: string, body: string): Promise<TeswaResult<DealMessage, 'unauthorized' | 'unknown'>>;
  confirmDealCompleted(dealId: string, userId: string, note?: string): Promise<TeswaResult<{ completed: boolean }, 'unauthorized' | 'invalid_status' | 'unknown'>>;
}
