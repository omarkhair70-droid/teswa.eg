import { teswaBackendRuntime } from '@/lib/backend/runtime';

export type StoryDiscoveryItem = {
  id: string;
  title: string;
  imageUrl: string | null;
  category: string | null;
  city: string | null;
  area: string | null;
  ownerId: string | null;
  ownerDisplayName: string | null;
  storyLabel: 'حكاية العنصر' | 'ليه صاحبه بيبدله' | 'مفيد لمين';
  storySnippet: string;
  createdAt: string | null;
  hasVideoTeaser: boolean;
};

export async function fetchStoryDiscoveryItems(input?: {
  limit?: number;
}): Promise<StoryDiscoveryItem[]> {
  const resolvedLimit = Math.min(
    24,
    Math.max(1, Math.floor(input?.limit ?? 12)),
  );
  return teswaBackendRuntime.marketplace.listItemStoryDiscovery(resolvedLimit);
}
