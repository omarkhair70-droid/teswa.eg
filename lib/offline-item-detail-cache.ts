import { MarketplaceItemDetail } from '@/lib/marketplace-items';
import {
  deleteOfflineJsonCache,
  pruneExpiredOfflineJsonCache,
  readOfflineJsonCache,
  writeOfflineJsonCache,
} from '@/lib/offline-cache';

const itemDetailCacheKey = (itemId: string) => `item:detail:v1:${itemId.trim()}`;
const ITEM_DETAIL_CACHE_TTL_MS = 10 * 60 * 1000;

export type CachedItemDetail = {
  item: MarketplaceItemDetail;
  updatedAtMs: number;
  isExpired: boolean;
};

export async function readFreshItemDetailCache(itemId: string): Promise<CachedItemDetail | null> {
  if (!itemId.trim()) {
    return null;
  }

  const cached = await readOfflineJsonCache<MarketplaceItemDetail>({
    key: itemDetailCacheKey(itemId),
    allowExpired: false,
  });

  if (!cached) {
    return null;
  }

  return {
    item: cached.value,
    updatedAtMs: cached.updatedAtMs,
    isExpired: cached.isExpired,
  };
}

export async function readAnyItemDetailCache(itemId: string): Promise<CachedItemDetail | null> {
  if (!itemId.trim()) {
    return null;
  }

  const cached = await readOfflineJsonCache<MarketplaceItemDetail>({
    key: itemDetailCacheKey(itemId),
    allowExpired: true,
  });

  if (!cached) {
    return null;
  }

  return {
    item: cached.value,
    updatedAtMs: cached.updatedAtMs,
    isExpired: cached.isExpired,
  };
}

export async function writeItemDetailCache(itemId: string, item: MarketplaceItemDetail): Promise<void> {
  if (!itemId.trim()) {
    return;
  }

  await writeOfflineJsonCache<MarketplaceItemDetail>({
    key: itemDetailCacheKey(itemId),
    value: item,
    ttlMs: ITEM_DETAIL_CACHE_TTL_MS,
  });

  void pruneExpiredOfflineJsonCache();
}

export async function deleteItemDetailCache(itemId: string): Promise<void> {
  if (!itemId.trim()) {
    return;
  }

  await deleteOfflineJsonCache(itemDetailCacheKey(itemId));
}
