import { useQuery } from '@tanstack/react-query';
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
  return useQuery<ItemDetailQueryResult>({
    queryKey: queryKeys.itemDetail.byId(itemId ?? ''),
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
    placeholderData: (previousData) => previousData,
  });
}
