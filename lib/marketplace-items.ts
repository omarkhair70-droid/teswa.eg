import { teswaBackendRuntime } from '@/lib/backend/runtime';
import type { MarketplaceFeedRecord } from '@/lib/backend/contracts/marketplace';
import { fetchItemVideoPresenceMap } from '@/lib/item-video-presence';
import { fetchItemVideoTeaserByItemId, type ItemVideoTeaser } from '@/lib/item-videos';
import { fetchItemLikesSummaryForViewer } from '@/lib/item-likes';

const MARKETPLACE_PAGE_SIZE = 20;

export type MarketplaceItem = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  condition: string | null;
  location: string | null;
  ownerDisplayName: string | null;
  hasVideoTeaser: boolean;
  distanceKm?: number | null;
  likeCount: number;
  likedByMe: boolean;
};

export type MarketplaceItemsPage = {
  items: MarketplaceItem[];
  hasMore: boolean;
};

export type MarketplaceItemFilters = {
  query?: string;
  category?: string | null;
  condition?: string | null;
  city?: string | null;
};

export type MarketplaceItemDetailImage = {
  imageUrl: string;
  isPrimary: boolean;
  sortOrder: number | null;
};

export type MarketplaceItemOwnerPresence = {
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

export type MarketplaceItemDetail = MarketplaceItem & {
  area: string | null;
  conditionNotes: string | null;
  itemStory: string | null;
  swapReason: string | null;
  goodFor: string | null;
  desireMode: 'specific' | 'flexible' | 'surprise' | null;
  desireText: string | null;
  wantedTags: string[];
  images: MarketplaceItemDetailImage[];
  videoTeaser: ItemVideoTeaser | null;
  ownerPresence?: MarketplaceItemOwnerPresence | null;
};

function mapRecordToMarketplaceItem(
  row: MarketplaceFeedRecord,
  hasVideoTeaser = false,
  likeCount = 0,
  likedByMe = false,
): MarketplaceItem {
  return {
    id: row.id,
    title: row.title?.trim() || 'عنصر بدون عنوان',
    description: row.description,
    imageUrl: row.coverImageUrl,
    category: row.category,
    condition: row.condition,
    location: row.city,
    ownerDisplayName: row.ownerDisplayName,
    hasVideoTeaser,
    distanceKm: row.distanceKm ?? null,
    likeCount,
    likedByMe,
  };
}

export async function fetchMarketplaceItemsPage(options?: {
  offset?: number;
  limit?: number;
  filters?: MarketplaceItemFilters;
  viewerId?: string | null;
}): Promise<MarketplaceItemsPage> {
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? MARKETPLACE_PAGE_SIZE;

  const page = await teswaBackendRuntime.marketplace.listFeed({
    offset,
    limit,
    filters: options?.filters,
  });

  const [videoPresenceByItemId, likesByItemId] = await Promise.all([
    fetchItemVideoPresenceMap(page.items.map((row) => row.id)),
    fetchItemLikesSummaryForViewer({
      itemIds: page.items.map((row) => row.id),
      viewerId: options?.viewerId ?? null,
    }),
  ]);

  return {
    items: page.items.map((row) => {
      const likes = likesByItemId.get(row.id);
      return mapRecordToMarketplaceItem(
        row,
        videoPresenceByItemId.get(row.id) === true,
        likes?.likeCount ?? 0,
        likes?.likedByMe ?? false,
      );
    }),
    hasMore: page.hasMore,
  };
}

export async function fetchMarketplaceItems(): Promise<MarketplaceItem[]> {
  const page = await fetchMarketplaceItemsPage({
    offset: 0,
    limit: MARKETPLACE_PAGE_SIZE,
    viewerId: null,
  });
  return page.items;
}

export async function fetchNearbyMarketplaceItemsPage(options: {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  offset?: number;
  limit?: number;
  viewerId?: string | null;
}): Promise<MarketplaceItemsPage> {
  const page = await teswaBackendRuntime.marketplace.listNearbyFeed({
    latitude: options.latitude,
    longitude: options.longitude,
    radiusKm: options.radiusKm,
    offset: options.offset ?? 0,
    limit: options.limit ?? MARKETPLACE_PAGE_SIZE,
  });

  const [videoPresenceByItemId, likesByItemId] = await Promise.all([
    fetchItemVideoPresenceMap(page.items.map((row) => row.id)),
    fetchItemLikesSummaryForViewer({
      itemIds: page.items.map((row) => row.id),
      viewerId: options.viewerId ?? null,
    }),
  ]);

  return {
    items: page.items.map((row) => {
      const likes = likesByItemId.get(row.id);
      return mapRecordToMarketplaceItem(
        row,
        videoPresenceByItemId.get(row.id) === true,
        likes?.likeCount ?? 0,
        likes?.likedByMe ?? false,
      );
    }),
    hasMore: page.hasMore,
  };
}

export async function fetchMarketplaceItemById(id: string, viewerId?: string | null): Promise<MarketplaceItem | null> {
  const row = await teswaBackendRuntime.marketplace.getFeedItem(id);
  if (!row) return null;

  const [videoPresenceByItemId, likesByItemId] = await Promise.all([
    fetchItemVideoPresenceMap([row.id]),
    fetchItemLikesSummaryForViewer({ itemIds: [row.id], viewerId: viewerId ?? null }),
  ]);

  const likes = likesByItemId.get(row.id);
  return mapRecordToMarketplaceItem(
    row,
    videoPresenceByItemId.get(row.id) === true,
    likes?.likeCount ?? 0,
    likes?.likedByMe ?? false,
  );
}

function normalizeNullableText(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function fetchMarketplaceItemDetailById(
  id: string,
  viewerId?: string | null,
): Promise<MarketplaceItemDetail | null> {
  const detail = await teswaBackendRuntime.marketplace.getDetail(id);
  if (!detail) return null;

  const [videoTeaser, likesByItemId] = await Promise.all([
    fetchItemVideoTeaserByItemId(id),
    fetchItemLikesSummaryForViewer({ itemIds: [id], viewerId: viewerId ?? null }),
  ]);

  const images = detail.images
    .filter((row): row is typeof row & { imageUrl: string } => Boolean(row.imageUrl))
    .sort((a, b) => {
      if (Boolean(a.isPrimary) !== Boolean(b.isPrimary)) {
        return a.isPrimary ? -1 : 1;
      }
      const aOrder = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.imageUrl.localeCompare(b.imageUrl);
    })
    .map((row) => ({
      imageUrl: row.imageUrl,
      isPrimary: Boolean(row.isPrimary),
      sortOrder: row.sortOrder,
    }));

  const wantedTags = detail.wantedTags
    .map((tag) => normalizeNullableText(tag))
    .filter((tag): tag is string => Boolean(tag));

  const likes = likesByItemId.get(id);
  const owner = detail.ownerPresence;

  return {
    id: detail.id,
    title: detail.title?.trim() || 'عنصر بدون عنوان',
    description: normalizeNullableText(detail.description),
    imageUrl: images[0]?.imageUrl ?? null,
    category: normalizeNullableText(detail.category),
    condition: normalizeNullableText(detail.condition),
    location: normalizeNullableText(detail.city),
    ownerDisplayName: normalizeNullableText(owner?.displayName ?? null),
    likeCount: likes?.likeCount ?? 0,
    likedByMe: likes?.likedByMe ?? false,
    hasVideoTeaser: Boolean(videoTeaser),
    area: normalizeNullableText(detail.area),
    conditionNotes: normalizeNullableText(detail.conditionNotes),
    itemStory: normalizeNullableText(detail.itemStory),
    swapReason: normalizeNullableText(detail.swapReason),
    goodFor: normalizeNullableText(detail.goodFor),
    desireMode: detail.desireMode,
    desireText: normalizeNullableText(detail.desireText),
    wantedTags,
    images,
    videoTeaser,
    ownerPresence: owner
      ? {
          id: owner.id,
          displayName: normalizeNullableText(owner.displayName),
          username: normalizeNullableText(owner.username),
          avatarUrl: normalizeNullableText(owner.avatarUrl),
          profileTagline: normalizeNullableText(owner.profileTagline),
          city: normalizeNullableText(owner.city),
          area: normalizeNullableText(owner.area),
          successfulSwapsCount: owner.successfulSwapsCount,
          responseRate: owner.responseRate,
        }
      : null,
  };
}
