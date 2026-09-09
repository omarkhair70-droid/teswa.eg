import { teswaBackendRuntime } from '@/lib/backend/runtime';

export type MyListingStatus = 'active' | 'reserved' | 'swapped' | 'archived';

export type MyListingSummary = {
  id: string;
  title: string;
  imageUrl: string | null;
  category: string | null;
  condition: string | null;
  city: string | null;
  area: string | null;
  status: MyListingStatus;
  createdAt: string | null;
  openIncomingOffersCount: number;
};

export async function fetchMyListings(userId: string): Promise<MyListingSummary[]> {
  return teswaBackendRuntime.marketplace.listMine(userId);
}
