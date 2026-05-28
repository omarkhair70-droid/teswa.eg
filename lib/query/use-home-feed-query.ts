import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMarketplaceItemsPage, MarketplaceItem } from '@/lib/marketplace-items';
import {
  readAnyMarketplaceFirstPageCache,
  readFreshMarketplaceFirstPageCache,
  writeMarketplaceFirstPageCache,
} from '@/lib/offline-marketplace-cache';
import { queryKeys } from '@/lib/query/query-keys';

export type HomeFeedQueryResult = {
  items: MarketplaceItem[];
  notice: string | null;
  source: 'network' | 'fresh_cache' | 'stale_cache';
};

export function useHomeFeedQuery(viewerId?: string | null) {
  const queryClient = useQueryClient();
  const hydratedRef = useRef(false);
  const viewerCacheKey = viewerId?.trim() || "anon";
  const queryKey = [...queryKeys.feed.homeFirstPage, viewerCacheKey] as const;

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    void (async () => {
      const freshCached = await readFreshMarketplaceFirstPageCache().catch(() => null);
      if (!freshCached) return;

      queryClient.setQueryData<HomeFeedQueryResult>(queryKey, (previous) => {
        if (previous && previous.items.length > 0) return { ...previous, source: previous.source ?? 'network' };
        return {
          items: freshCached.page.items,
          notice: 'نستعرض آخر عناصر محفوظة بينما نتحقق من الجديد.',
          source: 'fresh_cache',
        };
      });
    })();
  }, [queryClient, queryKey]);

  return useQuery<HomeFeedQueryResult>({
    queryKey,
    retry: false,
    queryFn: async () => {
      const freshCached = await readFreshMarketplaceFirstPageCache().catch(() => null);

      try {
        const page = await fetchMarketplaceItemsPage({ offset: 0, viewerId });
        if (!viewerId) void writeMarketplaceFirstPageCache(page);
        return { items: page.items, notice: null, source: 'network' };
      } catch {
        if (freshCached) {
          return {
            items: freshCached.page.items,
            notice: 'تعذر التحديث الآن، نعرض آخر نسخة محفوظة.',
            source: 'fresh_cache',
          };
        }

        const stale = await readAnyMarketplaceFirstPageCache().catch(() => null);
        if (stale) {
          return {
            items: stale.page.items,
            notice: 'أنت ترى نسخة محفوظة من أحدث العناصر. سنحدّثها عندما يتحسن الاتصال.',
            source: 'stale_cache',
          };
        }

        throw new Error('تعذر تحميل العناصر حالياً. حاول مرة أخرى.');
      }
    },
  });
}
