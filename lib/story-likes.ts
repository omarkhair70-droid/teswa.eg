import { supabase } from '@/lib/supabase/client';

export type StoryLikeStateByStoryId = Record<string, boolean>;

export type SetStoryLikedResult =
  | {
      ok: true;
      liked: boolean;
    }
  | {
      ok: false;
      reason: 'invalid_user' | 'invalid_story' | 'like_failed' | 'unlike_failed';
      message: string;
    };

function normalizeStoryIds(storyIds: string[]): string[] {
  return Array.from(new Set(storyIds.map((storyId) => storyId.trim()).filter(Boolean)));
}

export async function fetchStoryLikeStateForViewer(input: {
  viewerId: string;
  storyIds: string[];
}): Promise<StoryLikeStateByStoryId> {
  const viewerId = input.viewerId.trim();
  const storyIds = normalizeStoryIds(input.storyIds);

  if (!viewerId || !storyIds.length) return {};

  const { data, error } = await supabase
    .from('story_likes')
    .select('story_id')
    .eq('liker_id', viewerId)
    .in('story_id', storyIds);

  if (error) throw error;

  return (data ?? []).reduce<StoryLikeStateByStoryId>((result, row: { story_id: string | null }) => {
    const storyId = row.story_id?.trim();
    if (storyId) result[storyId] = true;
    return result;
  }, {});
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

  if (input.liked) {
    const { error } = await supabase.from('story_likes').insert({ story_id: storyId, liker_id: likerId });
    if (!error) return { ok: true, liked: true };
    if (error.code === '23505') return { ok: true, liked: true };

    if (__DEV__) console.warn('[story-likes] like failed', error);
    return { ok: false, reason: 'like_failed', message: 'تعذر إضافة الإعجاب حالياً.' };
  }

  const { error } = await supabase
    .from('story_likes')
    .delete()
    .eq('story_id', storyId)
    .eq('liker_id', likerId);

  if (!error) return { ok: true, liked: false };

  if (__DEV__) console.warn('[story-likes] unlike failed', error);
  return { ok: false, reason: 'unlike_failed', message: 'تعذر إزالة الإعجاب حالياً.' };
}

export async function fetchStoryLikeCountsForOwner(input: {
  ownerId: string;
  storyIds: string[];
}): Promise<Record<string, number>> {
  const ownerId = input.ownerId.trim();
  const storyIds = normalizeStoryIds(input.storyIds);

  if (!ownerId || !storyIds.length) return {};

  const { data, error } = await supabase
    .from('story_likes')
    .select('story_id')
    .in('story_id', storyIds);

  if (error) throw error;

  return (data ?? []).reduce<Record<string, number>>((result, row: { story_id: string | null }) => {
    const storyId = row.story_id?.trim();
    if (!storyId) return result;
    result[storyId] = (result[storyId] ?? 0) + 1;
    return result;
  }, {});
}
