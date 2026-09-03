import type { IsoDateTime, TeswaPage, TeswaResult } from '@/lib/backend/contracts/core';

export type MarketplaceItemCondition = 'almost_new' | 'good_used' | 'minor_issues' | 'needs_repair' | string;

export type MarketplaceItemSummary = {
  id: string;
  ownerId: string;
  title: string;
  imageUrl: string | null;
  categoryName: string | null;
  condition: MarketplaceItemCondition | null;
  city: string | null;
  status: string;
  createdAt: IsoDateTime | null;
};

export type MarketplaceItemDetail = MarketplaceItemSummary & {
  description: string | null;
  wantedText: string | null;
  imageUrls: string[];
  videoUrl: string | null;
  ownerDisplayName: string | null;
  ownerAvatarUrl: string | null;
};

export type MarketplaceFilters = {
  categoryId?: string | null;
  city?: string | null;
  query?: string | null;
};

export type ListingMediaDraft = {
  kind: 'image' | 'video';
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};

export interface MarketplaceContract {
  list(input?: {
    cursor?: string | null;
    limit?: number;
    viewerId?: string | null;
    filters?: MarketplaceFilters;
  }): Promise<TeswaPage<MarketplaceItemSummary>>;

  listNearby(input: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
    cursor?: string | null;
    limit?: number;
    viewerId?: string | null;
  }): Promise<TeswaPage<MarketplaceItemSummary>>;

  getById(itemId: string, viewerId?: string | null): Promise<MarketplaceItemDetail | null>;

  publish(input: {
    ownerId: string;
    title: string;
    description?: string | null;
    categoryId: string;
    condition: MarketplaceItemCondition;
    city?: string | null;
    wantedText?: string | null;
    media: ListingMediaDraft[];
  }): Promise<TeswaResult<{ itemId: string }, 'validation' | 'upload_failed' | 'write_failed' | 'unknown'>>;

  archive(ownerId: string, itemId: string): Promise<TeswaResult<void, 'active_offer' | 'not_owned' | 'unknown'>>;
  reactivate(ownerId: string, itemId: string): Promise<TeswaResult<void, 'not_owned' | 'unknown'>>;
  deleteArchived(ownerId: string, itemId: string): Promise<TeswaResult<void, 'not_archived' | 'not_owned' | 'unknown'>>;
}
