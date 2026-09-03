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


export type MarketplaceReadFilters = {
  query?: string;
  category?: string | null;
  condition?: string | null;
  city?: string | null;
};

export type MarketplaceFeedRecord = {
  id: string;
  title: string | null;
  description: string | null;
  coverImageUrl: string | null;
  category: string | null;
  condition: string | null;
  city: string | null;
  ownerDisplayName: string | null;
  createdAt: IsoDateTime;
  distanceKm?: number | null;
};

export type MarketplaceReadPage = {
  items: MarketplaceFeedRecord[];
  hasMore: boolean;
};

export type MarketplaceDetailImageRecord = {
  imageUrl: string | null;
  isPrimary: boolean | null;
  sortOrder: number | null;
};

export type MarketplaceOwnerPresenceRecord = {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  profileTagline: string | null;
  city: string | null;
  area: string | null;
  successfulSwapsCount: number | null;
  responseRate: number | null;
};

export type MarketplaceDetailRecord = {
  id: string;
  title: string | null;
  description: string | null;
  condition: string | null;
  conditionNotes: string | null;
  city: string | null;
  area: string | null;
  ownerId: string | null;
  itemStory: string | null;
  swapReason: string | null;
  goodFor: string | null;
  desireMode: 'specific' | 'flexible' | 'surprise' | null;
  desireText: string | null;
  category: string | null;
  wantedTags: Array<string | null>;
  images: MarketplaceDetailImageRecord[];
  ownerPresence: MarketplaceOwnerPresenceRecord | null;
};

export interface MarketplaceReadContract {
  listFeed(input?: {
    offset?: number;
    limit?: number;
    filters?: MarketplaceReadFilters;
  }): Promise<MarketplaceReadPage>;

  listNearbyFeed(input: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
    offset?: number;
    limit?: number;
  }): Promise<MarketplaceReadPage>;

  getFeedItem(itemId: string): Promise<MarketplaceFeedRecord | null>;
  getDetail(itemId: string): Promise<MarketplaceDetailRecord | null>;
  listActiveByOwner(profileId: string, limit?: number): Promise<MarketplaceOwnerListingRecord[]>;
}


export type MarketplaceOwnerListingRecord = {
  id: string;
  title: string | null;
  imageUrl: string | null;
  category: string | null;
  city: string | null;
  area: string | null;
  createdAt: IsoDateTime | null;
};


export type ListingLifecycleCode =
  | 'archived'
  | 'reactivated'
  | 'deleted'
  | 'not_found_or_unauthorized'
  | 'not_active'
  | 'not_archived'
  | 'has_open_offers'
  | 'has_deal_history';

export type ItemLikeSummary = {
  likeCount: number;
  likedByMe: boolean;
};

export type MyListingRecord = {
  id: string;
  title: string;
  imageUrl: string | null;
  category: string | null;
  condition: string | null;
  city: string | null;
  area: string | null;
  status: 'active' | 'reserved' | 'swapped' | 'archived';
  createdAt: IsoDateTime | null;
  openIncomingOffersCount: number;
};

export interface MarketplaceCoreContract extends MarketplaceReadContract {
  getLikeSummaries(
    itemIds: string[],
    viewerId?: string | null,
  ): Promise<Map<string, ItemLikeSummary>>;

  setLiked(
    itemId: string,
    userId: string,
    liked: boolean,
  ): Promise<TeswaResult<{ liked: boolean }, 'unknown'>>;

  listMine(userId: string): Promise<MyListingRecord[]>;

  archiveOwned(itemId: string): Promise<ListingLifecycleCode>;
  reactivateOwned(itemId: string): Promise<ListingLifecycleCode>;
  getImageUrls(itemId: string): Promise<string[]>;
  deleteOwnedArchived(itemId: string): Promise<ListingLifecycleCode>;
}
