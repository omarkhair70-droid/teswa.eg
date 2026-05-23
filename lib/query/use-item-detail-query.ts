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
};

export function useItemDetailQuery(itemId: string | undefined) {
  const queryClient = useQueryClient();
  const hydrationKeyRef = useRef<string | null>(null);
  const queryKey = queryKeys.itemDetail.byId(itemId ?? '');

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
        if (previous?.item) return previous;
        return {
          item: freshCached.item,
          notice: 'نستعرض تفاصيل محفوظة بينما نتحقق من الأحدث.',
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
        return { item: null, notice: null };
      }

      const freshCached = await readFreshItemDetailCache(itemId).catch(() => null);

      try {
        const result = await fetchMarketplaceItemDetailById(itemId);

        if (result) {
          void writeItemDetailCache(itemId, result);
          return { item: result, notice: null };
        }

        void deleteItemDetailCache(itemId);
        return { item: null, notice: null };
      } catch {
        if (freshCached) {
          return {
            item: freshCached.item,
            notice: 'تعذر تحديث التفاصيل الآن، نعرض آخر نسخة محفوظة.',
          };
        }

        const stale = await readAnyItemDetailCache(itemId).catch(() => null);
        if (stale) {
          return {
            item: stale.item,
            notice: 'أنت ترى نسخة محفوظة من تفاصيل العنصر. سنحدّثها عندما يتحسن الاتصال.',
          };
        }

        throw new Error('تعذر تحميل تفاصيل العنصر. حاول مرة أخرى.');
      }
    },
  });
}
