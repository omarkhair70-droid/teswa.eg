import { teswaBackendRuntime } from '@/lib/backend/runtime';

export type StoryLikeStateByStoryId = Record<string, boolean>;

export type SetStoryLikedResult =
  | { ok: true; liked: boolean }
  | {
      ok: false;
      reason: 'invalid_user' | 'invalid_story' | 'like_failed' | 'unlike_failed';
      message: string;
    };

function normalizeStoryIds(storyIds: string[]): string[] {
  return Array.from(
    new Set(storyIds.map((storyId) => storyId.trim()).filter(Boolean)),
  );
}

export async function fetchStoryLikeStateForViewer(input: {
  viewerId: string;
  storyIds: string[];
}): Promise<StoryLikeStateByStoryId> {
  const viewerId = input.viewerId.trim();
  const storyIds = normalizeStoryIds(input.storyIds);
  if (!viewerId || !storyIds.length) return {};
  return teswaBackendRuntime.stories.getLikeState(viewerId, storyIds);
}

export async function setStoryLikedFromMobile(input: {
  storyId: string;
  likerId: string;
  liked: boolean;
}): Promise<SetStoryLikedResult> {
  const storyId = input.storyId.trim();
  const likerId = input.likerId.trim();

  if (!likerId) {
    return {
      ok: false,
      reason: 'invalid_user',
      message: 'يجب تسجيل الدخول أولاً للتفاعل مع القصة.',
    };
  }
  if (!storyId) {
    return {
      ok: false,
      reason: 'invalid_story',
      message: 'تعذر تحديد القصة المطلوبة.',
    };
  }

  const result = await teswaBackendRuntime.stories.setLiked({
    storyId,
    likerId,
    liked: input.liked,
  });

  if (result.ok) return { ok: true, liked: result.data.liked };

  if (__DEV__) {
    console.warn('[story-likes] update failed', result.message);
  }
  return input.liked
    ? { ok: false, reason: 'like_failed', message: 'تعذر إضافة الإعجاب حالياً.' }
    : { ok: false, reason: 'unlike_failed', message: 'تعذر إزالة الإعجاب حالياً.' };
}

export async function fetchStoryLikeCountsForOwner(input: {
  ownerId: string;
  storyIds: string[];
}): Promise<Record<string, number>> {
  const ownerId = input.ownerId.trim();
  const storyIds = normalizeStoryIds(input.storyIds);
  if (!ownerId || !storyIds.length) return {};
  return teswaBackendRuntime.stories.getLikeCounts(storyIds);
}
