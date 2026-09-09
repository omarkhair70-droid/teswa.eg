import { teswaBackendRuntime } from '@/lib/backend/runtime';

export type StoryViewerEntry = {
  viewerId: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  viewedAt: string;
};

export type StoryViewersContext = {
  storyId: string;
  storyCreatedAt: string;
  storyCaption: string | null;
  viewers: StoryViewerEntry[];
};

export async function markStoryViewedFromMobile(input: {
  storyId: string;
  viewerId: string;
}): Promise<void> {
  const storyId = input.storyId.trim();
  const viewerId = input.viewerId.trim();
  if (!storyId || !viewerId) return;

  const result = await teswaBackendRuntime.stories.markViewed({
    storyId,
    viewerId,
  });
  if (!result.ok && __DEV__) {
    console.warn('[story-views] markStoryViewedFromMobile failed', result.message);
  }
}

export async function fetchStoryViewCountsForOwner(input: {
  ownerId: string;
  storyIds: string[];
}): Promise<Record<string, number>> {
  const ownerId = input.ownerId.trim();
  const storyIds = Array.from(
    new Set(input.storyIds.map((id) => id.trim()).filter(Boolean)),
  );
  if (!ownerId || !storyIds.length) return {};
  return teswaBackendRuntime.stories.getViewCounts(storyIds);
}

export async function fetchStoryViewersForOwner(input: {
  ownerId: string;
  storyId: string;
}): Promise<StoryViewersContext | null> {
  const ownerId = input.ownerId.trim();
  const storyId = input.storyId.trim();
  if (!ownerId || !storyId) return null;
  return teswaBackendRuntime.stories.getViewersForOwner({ ownerId, storyId });
}
