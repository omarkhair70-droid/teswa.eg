import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMarketplaceItemDetailById, MarketplaceItemDetail } from '@/lib/marketplace-items';
import {
  deleteItemDetailCache,
  readAnyItemDetailCache,
  readFreshItemDetailCache,
  writeItemDetailCache,
} from '@/lib/offline-item-detail-cache';
import { queryKeys } from '@/lib/query/query-keys';

export type ItemDetailQueryResult = {
  item: MarketplaceItemDetail | null;
  notice: string | null;
  source: 'network' | 'fresh_cache' | 'stale_cache';
};

export function useItemDetailQuery(itemId: string | undefined, viewerId?: string | null) {
  const queryClient = useQueryClient();
  const hydrationKeyRef = useRef<string | null>(null);
  const viewerCacheKey = viewerId?.trim() || 'anon';
  const queryKey = [...queryKeys.itemDetail.byId(itemId ?? ''), viewerCacheKey] as const;

  useEffect(() => {
    if (!itemId) {
      hydrationKeyRef.current = null;
      return;
    }

    const hydrationKey = itemId.trim();
    if (!hydrationKey) return;
    if (hydrationKeyRef.current === hydrationKey) return;
    hydrationKeyRef.current = hydrationKey;

    void (async () => {
      const freshCached = await readFreshItemDetailCache(itemId).catch(() => null);
      if (!freshCached) return;

      queryClient.setQueryData<ItemDetailQueryResult>(queryKey, (previous) => {
        if (previous?.item) return { ...previous, source: previous.source ?? 'network' };
        return {
          item: freshCached.item,
          notice: 'نستعرض تفاصيل محفوظة بينما نتحقق من الأحدث.',
          source: 'fresh_cache',
        };
      });
    })();
  }, [itemId, queryClient, queryKey]);

  return useQuery<ItemDetailQueryResult>({
    queryKey,
    enabled: Boolean(itemId),
    retry: false,
    queryFn: async () => {
      if (!itemId) {
        return { item: null, notice: null, source: 'network' };
      }

      const freshCached = await readFreshItemDetailCache(itemId).catch(() => null);

      try {
        const result = await fetchMarketplaceItemDetailById(itemId, viewerId);

        if (result) {
          if (!viewerId) void writeItemDetailCache(itemId, result);
          return { item: result, notice: null, source: 'network' };
        }

        void deleteItemDetailCache(itemId);
        return { item: null, notice: null, source: 'network' };
      } catch {
        if (freshCached) {
          return {
            item: freshCached.item,
            notice: 'تعذر تحديث التفاصيل الآن، نعرض آخر نسخة محفوظة.',
            source: 'fresh_cache',
          };
        }

        const stale = await readAnyItemDetailCache(itemId).catch(() => null);
        if (stale) {
          return {
            item: stale.item,
            notice: 'أنت ترى نسخة محفوظة من تفاصيل العنصر. سنحدّثها عندما يتحسن الاتصال.',
            source: 'stale_cache',
          };
        }

        throw new Error('تعذر تحميل تفاصيل العنصر. حاول مرة أخرى.');
      }
    },
  });
}
