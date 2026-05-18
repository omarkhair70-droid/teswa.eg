import { createStoryMediaSignedUrlCached } from '@/lib/stories';
import { supabase } from '@/lib/supabase/client';

export type MotionVideoDrop = {
  storyId: string;
  authorId: string;
  authorDisplayName: string | null;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  caption: string | null;
  durationMs: number | null;
  createdAt: string;
  signedVideoUrl: string | null;
};

const clampLimit = (input?: number) => {
  if (!Number.isFinite(input)) return 8;
  return Math.min(12, Math.max(1, Math.floor(input as number)));
};

export async function fetchMotionVideoDrops(input?: {
  limit?: number;
}): Promise<MotionVideoDrop[]> {
  const limit = clampLimit(input?.limit);
  const nowIso = new Date().toISOString();

  const { data: stories, error: storiesError } = await supabase
    .from('stories')
    .select('id,user_id,media_storage_path,caption,duration_ms,created_at,expires_at,media_type')
    .eq('media_type', 'video')
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (storiesError) throw storiesError;
  if (!stories?.length) return [];

  const userIds = Array.from(new Set((stories as Array<{ user_id: string }>).map((story) => story.user_id).filter((value): value is string => typeof value === 'string' && value.length > 0)));

  const profilesById = new Map<string, { display_name: string | null; username: string | null; avatar_url: string | null }>();

  if (userIds.length) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id,display_name,username,avatar_url')
      .in('id', userIds);

    if (profilesError) throw profilesError;

    (profiles ?? []).forEach((profile: { id: string; display_name: string | null; username: string | null; avatar_url: string | null }) => {
      profilesById.set(profile.id, {
        display_name: profile.display_name,
        username: profile.username,
        avatar_url: profile.avatar_url,
      });
    });
  }

  const drops = await Promise.all((stories as Array<{ id: string; user_id: string; media_storage_path: string | null; caption: string | null; duration_ms: number | null; created_at: string }>).map(async (story) => {
    const profile = profilesById.get(story.user_id);
    let signedVideoUrl: string | null = null;

    if (story.media_storage_path) {
      try {
        signedVideoUrl = await createStoryMediaSignedUrlCached(story.media_storage_path);
      } catch {
        signedVideoUrl = null;
      }
    }

    return {
      storyId: story.id,
      authorId: story.user_id,
      authorDisplayName: profile?.display_name ?? null,
      authorUsername: profile?.username ?? null,
      authorAvatarUrl: profile?.avatar_url ?? null,
      caption: story.caption ?? null,
      durationMs: story.duration_ms ?? null,
      createdAt: story.created_at,
      signedVideoUrl,
    } satisfies MotionVideoDrop;
  }));

  return drops;
}
