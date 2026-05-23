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
};

export function useHomeFeedQuery() {
  const queryClient = useQueryClient();
  const hydratedRef = useRef(false);
  const queryKey = queryKeys.feed.homeFirstPage;

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    void (async () => {
      const freshCached = await readFreshMarketplaceFirstPageCache().catch(() => null);
      if (!freshCached) return;

      queryClient.setQueryData<HomeFeedQueryResult>(queryKey, (previous) => {
        if ((previous?.items.length ?? 0) > 0) return previous;
        return {
          items: freshCached.page.items,
          notice: 'نستعرض آخر عناصر محفوظة بينما نتحقق من الجديد.',
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
        const page = await fetchMarketplaceItemsPage({ offset: 0 });
        void writeMarketplaceFirstPageCache(page);
        return { items: page.items, notice: null };
      } catch {
        if (freshCached) {
          return {
            items: freshCached.page.items,
            notice: 'تعذر التحديث الآن، نعرض آخر نسخة محفوظة.',
          };
        }

        const stale = await readAnyMarketplaceFirstPageCache().catch(() => null);
        if (stale) {
          return {
            items: stale.page.items,
            notice: 'أنت ترى نسخة محفوظة من أحدث العناصر. سنحدّثها عندما يتحسن الاتصال.',
          };
        }

        throw new Error('تعذر تحميل العناصر حالياً. حاول مرة أخرى.');
      }
    },
  });
}
