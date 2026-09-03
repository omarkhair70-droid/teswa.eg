import { teswaBackendRuntime } from '@/lib/backend/runtime';

export type ExchangeItemSummary = {
  id: string;
  title: string;
  imageUrl: string | null;
  category: string | null;
  condition: string | null;
  location: string | null;
  ownerDisplayName: string | null;
  status: string;
};

export async function fetchExchangeItemSummariesByIds(
  itemIds: string[],
): Promise<ExchangeItemSummary[]> {
  const uniqueIds = [...new Set(itemIds.filter(Boolean))];
  if (!uniqueIds.length) return [];
  return teswaBackendRuntime.marketplace.getExchangeItemSummaries(uniqueIds);
}
