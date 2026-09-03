import { teswaBackendRuntime } from '@/lib/backend/runtime';

export type MovingItemInterest = {
  id: string;
  title: string;
  imageUrl: string | null;
  category: string | null;
  condition: string | null;
  location: string | null;
  ownerDisplayName: string | null;
  openInterestCount: number;
  latestInterestAt: string | null;
  hasVideoTeaser: boolean;
};

export async function fetchMovingItems(input?: {
  limit?: number;
}): Promise<MovingItemInterest[]> {
  const normalizedLimit = Math.min(Math.max(input?.limit ?? 12, 1), 24);
  return teswaBackendRuntime.marketplace.listMovingItems(normalizedLimit);
}
