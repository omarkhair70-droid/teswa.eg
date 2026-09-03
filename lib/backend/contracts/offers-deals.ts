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


export type OfferLifecycleRecord = {
  id: string;
  status: OfferStatus;
  message: string | null;
  requestedItemId: string;
  offeredItemId: string;
  senderId: string;
  receiverId: string;
  createdAt: IsoDateTime | null;
};

export type OfferItemValidationRecord = {
  id: string;
  title: string | null;
  ownerId: string;
  status: string;
};

export interface OfferLifecycleContract {
  getItemForValidation(itemId: string): Promise<OfferItemValidationRecord | null>;
  listIncoming(userId: string): Promise<OfferLifecycleRecord[]>;
  listSent(userId: string): Promise<OfferLifecycleRecord[]>;
  getOffer(offerId: string): Promise<OfferLifecycleRecord | null>;
  getLatestDealId(offerId: string): Promise<string | null>;
  getLatestDealIds(offerIds: string[]): Promise<Map<string, string>>;
  listOwnedActiveItemIds(userId: string): Promise<string[]>;

  markThinking(offerId: string, note?: string | null): Promise<TeswaResult<void, 'unknown'>>;
  softReject(offerId: string, note?: string | null): Promise<TeswaResult<void, 'unknown'>>;
  accept(offerId: string): Promise<TeswaResult<{ dealId: string }, 'unknown'>>;

  create(input: {
    requestedItemId: string;
    offeredItemId: string;
    senderId: string;
    receiverId: string;
    message?: string | null;
  }): Promise<TeswaResult<{ offerId: string }, 'unknown'>>;

  recordCreatedEvent(input: {
    offerId: string;
    actorId: string;
  }): Promise<TeswaResult<void, 'unknown'>>;
}


export type DealLifecycleRecord = {
  id: string;
  status: DealStatus;
  acceptedAt: IsoDateTime | null;
  createdAt: IsoDateTime | null;
  requestedItemId: string;
  offeredItemId: string;
  requesterId: string;
  offererId: string;
};

export type DealLifecycleMessageRecord = {
  id: string;
  dealId: string;
  senderId: string;
  body: string;
  messageType: 'text' | 'voice';
  audioStoragePath: string | null;
  audioDurationMs: number | null;
  audioMimeType: string | null;
  audioSizeBytes: number | null;
  createdAt: IsoDateTime;
};

export interface DealLifecycleContract {
  getDeal(dealId: string): Promise<DealLifecycleRecord | null>;
  getUnreadCount(): Promise<number>;
  listConfirmationUserIds(dealId: string): Promise<string[]>;
  listMessages(dealId: string, limit?: number): Promise<DealLifecycleMessageRecord[]>;
  hasReview(dealId: string, reviewerId: string): Promise<TeswaResult<boolean, 'unknown'>>;
  markRead(dealId: string): Promise<TeswaResult<void, 'unknown'>>;
  countMessagesSince(dealId: string, senderId: string, since: IsoDateTime): Promise<number>;

  insertTextMessage(input: {
    dealId: string;
    senderId: string;
    body: string;
  }): Promise<TeswaResult<DealLifecycleMessageRecord, 'unknown'>>;

  insertVoiceMessage(input: {
    dealId: string;
    senderId: string;
    body: string;
    audioStoragePath: string;
    audioDurationMs: number;
    audioMimeType: string;
    audioSizeBytes: number | null;
  }): Promise<TeswaResult<DealLifecycleMessageRecord, 'unknown'>>;

  confirm(input: {
    dealId: string;
    userId: string;
    note?: string | null;
  }): Promise<TeswaResult<void, 'unknown'>>;

  completeIfReady(dealId: string): Promise<TeswaResult<boolean, 'unknown'>>;
}
