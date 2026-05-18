import { MarketplaceItemsPage } from '@/lib/marketplace-items';
import {
  pruneExpiredOfflineJsonCache,
  readOfflineJsonCache,
  writeOfflineJsonCache,
} from '@/lib/offline-cache';

const MARKETPLACE_FIRST_PAGE_CACHE_KEY = 'marketplace:first-page:v1';
const MARKETPLACE_FIRST_PAGE_CACHE_TTL_MS = 5 * 60 * 1000;

export type CachedMarketplaceFirstPage = {
  page: MarketplaceItemsPage;
  updatedAtMs: number;
  isExpired: boolean;
};

export async function readFreshMarketplaceFirstPageCache(): Promise<CachedMarketplaceFirstPage | null> {
  const cached = await readOfflineJsonCache<MarketplaceItemsPage>({
    key: MARKETPLACE_FIRST_PAGE_CACHE_KEY,
    allowExpired: false,
  });

  if (!cached) {
    return null;
  }

  return {
    page: cached.value,
    updatedAtMs: cached.updatedAtMs,
    isExpired: cached.isExpired,
  };
}

export async function readAnyMarketplaceFirstPageCache(): Promise<CachedMarketplaceFirstPage | null> {
  const cached = await readOfflineJsonCache<MarketplaceItemsPage>({
    key: MARKETPLACE_FIRST_PAGE_CACHE_KEY,
    allowExpired: true,
  });

  if (!cached) {
    return null;
  }

  return {
    page: cached.value,
    updatedAtMs: cached.updatedAtMs,
    isExpired: cached.isExpired,
  };
}

export async function writeMarketplaceFirstPageCache(page: MarketplaceItemsPage): Promise<void> {
  await writeOfflineJsonCache<MarketplaceItemsPage>({
    key: MARKETPLACE_FIRST_PAGE_CACHE_KEY,
    value: page,
    ttlMs: MARKETPLACE_FIRST_PAGE_CACHE_TTL_MS,
  });

  void pruneExpiredOfflineJsonCache();
}
