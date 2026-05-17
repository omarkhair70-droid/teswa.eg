import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase/client';

export type StoryMediaType = 'image' | 'video';

export type StoryRecord = {
  id: string;
  userId: string;
  mediaType: StoryMediaType;
  mediaStoragePath: string;
  mediaThumbnailStoragePath: string | null;
  caption: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  expiresAt: string;
};

export type StoryAuthorSummary = {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export type ActiveStorySummary = {
  author: StoryAuthorSummary;
  stories: StoryRecord[];
  latestCreatedAt: string;
};

function toStoryRecord(row: Record<string, unknown>): StoryRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    mediaType: row.media_type as StoryMediaType,
    mediaStoragePath: row.media_storage_path as string,
    mediaThumbnailStoragePath: (row.media_thumbnail_storage_path as string | null) ?? null,
    caption: (row.caption as string | null) ?? null,
    durationMs: (row.duration_ms as number | null) ?? null,
    width: (row.width as number | null) ?? null,
    height: (row.height as number | null) ?? null,
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
  };
}

async function fetchStoryAuthorsByUserIds(userIds: string[]): Promise<Map<string, StoryAuthorSummary>> {
  if (!userIds.length) return new Map();

  const { data, error } = await supabase
    .from('profiles')
    .select('id,display_name,username,avatar_url')
    .in('id', userIds);

  if (error) throw error;

  return new Map((data ?? []).map((profile: Record<string, unknown>) => [
    profile.id as string,
    {
      id: profile.id as string,
      displayName: (profile.display_name as string | null) ?? null,
      username: (profile.username as string | null) ?? null,
      avatarUrl: (profile.avatar_url as string | null) ?? null,
    },
  ]));
}

export async function fetchActiveStoriesByUserId(userId: string): Promise<StoryRecord[]> {
  // Ordered oldest -> newest to simplify sequential viewer playback.
  const { data, error } = await supabase
    .from('stories')
    .select('id,user_id,media_type,media_storage_path,media_thumbnail_storage_path,caption,duration_ms,width,height,created_at,expires_at')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toStoryRecord);
}

export async function fetchActiveStoriesForHome(): Promise<ActiveStorySummary[]> {
  const { data, error } = await supabase
    .from('stories')
    .select('id,user_id,media_type,media_storage_path,media_thumbnail_storage_path,caption,duration_ms,width,height,created_at,expires_at')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) throw error;

  const rows = data ?? [];
  if (!rows.length) return [];

  const stories = rows.map(toStoryRecord);
  const userIds: string[] = Array.from(new Set(stories.map((story) => story.userId)));
  const authorsById = await fetchStoryAuthorsByUserIds(userIds);

  const grouped = new Map<string, StoryRecord[]>();
  for (const story of stories) {
    const existing = grouped.get(story.userId) ?? [];
    existing.push(story);
    grouped.set(story.userId, existing);
  }

  return userIds
    .map((userId) => {
      const author = authorsById.get(userId) ?? {
        id: userId,
        displayName: null,
        username: null,
        avatarUrl: null,
      };
      const userStories = (grouped.get(userId) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const latestCreatedAt = userStories[userStories.length - 1]?.createdAt ?? '';

      return {
        author,
        stories: userStories,
        latestCreatedAt,
      };
    })
    .sort((a, b) => b.latestCreatedAt.localeCompare(a.latestCreatedAt));
}

export function createStoryUploadPath(userId: string, mediaType: StoryMediaType, extension: string): string {
  const normalizedExt = extension.replace(/^\./, '').toLowerCase() || (mediaType === 'video' ? 'mp4' : 'jpg');
  const timestamp = Date.now();
  return `${userId}/${timestamp}-${Crypto.randomUUID()}.${normalizedExt}`;
}
