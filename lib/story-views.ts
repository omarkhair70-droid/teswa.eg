import { supabase } from '@/lib/supabase/client';

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

function normalizeOptional(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export async function markStoryViewedFromMobile(input: {
  storyId: string;
  viewerId: string;
}): Promise<void> {
  const storyId = input.storyId.trim();
  const viewerId = input.viewerId.trim();

  if (!storyId || !viewerId) return;

  const { error } = await supabase
    .from('story_views')
    .insert({ story_id: storyId, viewer_id: viewerId });

  if (!error) return;
  if (error.code === '23505') return;

  if (__DEV__) {
    console.warn('[story-views] markStoryViewedFromMobile failed', error);
  }
}

export async function fetchStoryViewCountsForOwner(input: {
  ownerId: string;
  storyIds: string[];
}): Promise<Record<string, number>> {
  const ownerId = input.ownerId.trim();
  const storyIds = Array.from(new Set(input.storyIds.map((id) => id.trim()).filter(Boolean)));

  if (!ownerId || !storyIds.length) return {};

  const { data, error } = await supabase
    .from('story_views')
    .select('story_id')
    .in('story_id', storyIds);

  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const storyId of storyIds) counts[storyId] = 0;

  for (const row of data ?? []) {
    const storyId = typeof row.story_id === 'string' ? row.story_id : '';
    if (!storyId) continue;
    counts[storyId] = (counts[storyId] ?? 0) + 1;
  }

  return counts;
}

export async function fetchStoryViewersForOwner(input: {
  ownerId: string;
  storyId: string;
}): Promise<StoryViewersContext | null> {
  const ownerId = input.ownerId.trim();
  const storyId = input.storyId.trim();
  if (!ownerId || !storyId) return null;

  const { data: story, error: storyError } = await supabase
    .from('stories')
    .select('id, user_id, created_at, caption')
    .eq('id', storyId)
    .eq('user_id', ownerId)
    .maybeSingle();

  if (storyError) throw storyError;
  if (!story) return null;

  const { data: views, error: viewsError } = await supabase
    .from('story_views')
    .select('viewer_id, viewed_at')
    .eq('story_id', storyId)
    .order('viewed_at', { ascending: false });

  if (viewsError) throw viewsError;

  if (!views?.length) {
    return {
      storyId: story.id,
      storyCreatedAt: story.created_at,
      storyCaption: normalizeOptional(story.caption),
      viewers: [],
    };
  }

  const viewerIds = Array.from(new Set(views.map((view) => view.viewer_id).filter(Boolean)));

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, display_name, username, avatar_url')
    .in('id', viewerIds);

  if (profilesError) throw profilesError;

  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  const viewers: StoryViewerEntry[] = views.map((view) => {
    const profile = profilesById.get(view.viewer_id);
    return {
      viewerId: view.viewer_id,
      displayName: normalizeOptional(profile?.display_name),
      username: normalizeOptional(profile?.username),
      avatarUrl: normalizeOptional(profile?.avatar_url),
      viewedAt: view.viewed_at,
    };
  });

  return {
    storyId: story.id,
    storyCreatedAt: story.created_at,
    storyCaption: normalizeOptional(story.caption),
    viewers,
  };
}
