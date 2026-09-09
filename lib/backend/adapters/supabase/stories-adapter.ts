import type {
  ActiveStorySummaryTransportRecord,
  StoriesContract,
  StoryAuthorTransportRecord,
  StoryTransportRecord,
  StoryVideoDropTransportRecord,
  StoryViewersTransportContext,
} from '@/lib/backend/contracts/stories';
import { supabase } from '@/lib/supabase/client';

const STORY_SELECT =
  'id,user_id,media_type,media_storage_path,media_thumbnail_storage_path,caption,duration_ms,width,height,created_at,expires_at';

function mapStory(row: any): StoryTransportRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    mediaType: row.media_type === 'video' ? 'video' : 'image',
    mediaStoragePath: row.media_storage_path as string,
    mediaThumbnailStoragePath:
      (row.media_thumbnail_storage_path as string | null) ?? null,
    caption: (row.caption as string | null) ?? null,
    durationMs: (row.duration_ms as number | null) ?? null,
    width: (row.width as number | null) ?? null,
    height: (row.height as number | null) ?? null,
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
  };
}

function mapAuthor(row: any): StoryAuthorTransportRecord {
  return {
    id: row.id as string,
    displayName: (row.display_name as string | null) ?? null,
    username: (row.username as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
  };
}

export function createSupabaseStoriesAdapter(): StoriesContract {
  return {
    async create(input) {
      const { data, error } = await supabase
        .from('stories')
        .insert({
          user_id: input.userId,
          media_type: input.mediaType,
          media_storage_path: input.mediaStoragePath,
          media_thumbnail_storage_path:
            input.mediaThumbnailStoragePath ?? null,
          caption: input.caption ?? null,
          duration_ms: input.durationMs ?? null,
          width: input.width ?? null,
          height: input.height ?? null,
        })
        .select('id')
        .single();

      if (error || !data?.id) {
        return {
          ok: false,
          reason: 'unknown',
          message: error?.message ?? 'Story insert returned no id.',
          cause: error ?? undefined,
        };
      }

      return { ok: true, data: { storyId: data.id as string } };
    },

    async deleteOwned(input) {
      const { data: storyRow, error: fetchError } = await supabase
        .from('stories')
        .select('id,user_id,media_storage_path,media_thumbnail_storage_path')
        .eq('id', input.storyId)
        .eq('user_id', input.userId)
        .maybeSingle();

      if (fetchError) {
        return {
          ok: false,
          reason: 'unknown',
          message: fetchError.message,
          cause: fetchError,
        };
      }
      if (!storyRow) {
        return {
          ok: false,
          reason: 'not_found',
          message: 'Story was not found.',
        };
      }

      const { error: deleteError } = await supabase
        .from('stories')
        .delete()
        .eq('id', input.storyId)
        .eq('user_id', input.userId);

      if (deleteError) {
        return {
          ok: false,
          reason: 'unknown',
          message: deleteError.message,
          cause: deleteError,
        };
      }

      const storagePaths = [
        storyRow.media_storage_path,
        storyRow.media_thumbnail_storage_path,
      ]
        .filter(
          (path): path is string =>
            typeof path === 'string' && path.trim().length > 0,
        )
        .map((path) => path.trim());

      return { ok: true, data: { storagePaths } };
    },

    async listActiveByUser(userId) {
      const { data, error } = await supabase
        .from('stories')
        .select(STORY_SELECT)
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapStory);
    },

    async listActiveForHome() {
      const { data, error } = await supabase
        .from('stories')
        .select(STORY_SELECT)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      const stories = (data ?? []).map(mapStory);
      if (!stories.length) return [];

      const userIds = Array.from(
        new Set(stories.map((story) => story.userId)),
      );

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id,display_name,username,avatar_url')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      const authorsById = new Map(
        (profiles ?? []).map((profile) => [
          profile.id as string,
          mapAuthor(profile),
        ]),
      );

      const grouped = new Map<string, StoryTransportRecord[]>();
      for (const story of stories) {
        const current = grouped.get(story.userId) ?? [];
        current.push(story);
        grouped.set(story.userId, current);
      }

      return userIds
        .map((userId): ActiveStorySummaryTransportRecord => {
          const userStories = (grouped.get(userId) ?? []).sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt),
          );
          const latestCreatedAt =
            userStories[userStories.length - 1]?.createdAt ?? '';
          return {
            author:
              authorsById.get(userId)
              ?? {
                id: userId,
                displayName: null,
                username: null,
                avatarUrl: null,
              },
            stories: userStories,
            latestCreatedAt,
          };
        })
        .sort((a, b) => b.latestCreatedAt.localeCompare(a.latestCreatedAt));
    },

    async getAuthor(userId) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,display_name,username,avatar_url')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapAuthor(data) : null;
    },

    async getLikeState(viewerId, storyIds) {
      const normalizedIds = Array.from(
        new Set(storyIds.map((id) => id.trim()).filter(Boolean)),
      );
      if (!viewerId.trim() || !normalizedIds.length) return {};

      const { data, error } = await supabase
        .from('story_likes')
        .select('story_id')
        .eq('liker_id', viewerId)
        .in('story_id', normalizedIds);

      if (error) throw error;

      return (data ?? []).reduce<Record<string, boolean>>((result, row) => {
        const storyId = (row.story_id as string | null)?.trim();
        if (storyId) result[storyId] = true;
        return result;
      }, {});
    },

    async setLiked(input) {
      if (input.liked) {
        const { error } = await supabase
          .from('story_likes')
          .insert({
            story_id: input.storyId,
            liker_id: input.likerId,
          });

        if (!error || error.code === '23505') {
          return { ok: true, data: { liked: true } };
        }

        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }

      const { error } = await supabase
        .from('story_likes')
        .delete()
        .eq('story_id', input.storyId)
        .eq('liker_id', input.likerId);

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }

      return { ok: true, data: { liked: false } };
    },

    async getLikeCounts(storyIds) {
      const normalizedIds = Array.from(
        new Set(storyIds.map((id) => id.trim()).filter(Boolean)),
      );
      if (!normalizedIds.length) return {};

      const { data, error } = await supabase
        .from('story_likes')
        .select('story_id')
        .in('story_id', normalizedIds);

      if (error) throw error;

      return (data ?? []).reduce<Record<string, number>>((result, row) => {
        const storyId = (row.story_id as string | null)?.trim();
        if (!storyId) return result;
        result[storyId] = (result[storyId] ?? 0) + 1;
        return result;
      }, {});
    },

    async markViewed(input) {
      const { error } = await supabase
        .from('story_views')
        .insert({
          story_id: input.storyId,
          viewer_id: input.viewerId,
        });

      if (!error || error.code === '23505') {
        return { ok: true, data: undefined };
      }

      return {
        ok: false,
        reason: 'unknown',
        message: error.message,
        cause: error,
      };
    },

    async getViewCounts(storyIds) {
      const normalizedIds = Array.from(
        new Set(storyIds.map((id) => id.trim()).filter(Boolean)),
      );
      const counts: Record<string, number> = {};
      for (const storyId of normalizedIds) counts[storyId] = 0;
      if (!normalizedIds.length) return counts;

      const { data, error } = await supabase
        .from('story_views')
        .select('story_id')
        .in('story_id', normalizedIds);

      if (error) throw error;

      for (const row of data ?? []) {
        const storyId =
          typeof row.story_id === 'string' ? row.story_id : '';
        if (!storyId) continue;
        counts[storyId] = (counts[storyId] ?? 0) + 1;
      }
      return counts;
    },

    async getViewersForOwner(input) {
      const { data: story, error: storyError } = await supabase
        .from('stories')
        .select('id,user_id,created_at,caption')
        .eq('id', input.storyId)
        .eq('user_id', input.ownerId)
        .maybeSingle();

      if (storyError) throw storyError;
      if (!story) return null;

      const { data: views, error: viewsError } = await supabase
        .from('story_views')
        .select('viewer_id,viewed_at')
        .eq('story_id', input.storyId)
        .order('viewed_at', { ascending: false });

      if (viewsError) throw viewsError;

      const normalize = (value: unknown) => {
        const text = typeof value === 'string' ? value.trim() : '';
        return text || null;
      };

      if (!views?.length) {
        const result: StoryViewersTransportContext = {
          storyId: story.id as string,
          storyCreatedAt: story.created_at as string,
          storyCaption: normalize(story.caption),
          viewers: [],
        };
        return result;
      }

      const viewerIds = Array.from(
        new Set(
          views
            .map((view) => view.viewer_id as string | null)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id,display_name,username,avatar_url')
        .in('id', viewerIds);

      if (profilesError) throw profilesError;

      const profilesById = new Map(
        (profiles ?? []).map((profile) => [
          profile.id as string,
          profile,
        ]),
      );

      return {
        storyId: story.id as string,
        storyCreatedAt: story.created_at as string,
        storyCaption: normalize(story.caption),
        viewers: views.map((view) => {
          const viewerId = view.viewer_id as string;
          const profile = profilesById.get(viewerId);
          return {
            viewerId,
            displayName: normalize(profile?.display_name),
            username: normalize(profile?.username),
            avatarUrl: normalize(profile?.avatar_url),
            viewedAt: view.viewed_at as string,
          };
        }),
      };
    },

    async listActiveVideoDrops(limit) {
      const { data: stories, error } = await supabase
        .from('stories')
        .select('id,user_id,media_storage_path,caption,duration_ms,created_at,expires_at,media_type')
        .eq('media_type', 'video')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      if (!stories?.length) return [];

      const userIds = Array.from(
        new Set(
          stories
            .map((story) => story.user_id as string | null)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id,display_name,username,avatar_url')
        .in('id', userIds);

      if (profilesError) throw profilesError;
      const profilesById = new Map(
        (profiles ?? []).map((profile) => [
          profile.id as string,
          profile,
        ]),
      );

      return stories.map((story): StoryVideoDropTransportRecord => {
        const authorId = story.user_id as string;
        const profile = profilesById.get(authorId);
        return {
          storyId: story.id as string,
          authorId,
          authorDisplayName:
            (profile?.display_name as string | null | undefined) ?? null,
          authorUsername:
            (profile?.username as string | null | undefined) ?? null,
          authorAvatarUrl:
            (profile?.avatar_url as string | null | undefined) ?? null,
          mediaStoragePath:
            (story.media_storage_path as string | null) ?? null,
          caption: (story.caption as string | null) ?? null,
          durationMs: (story.duration_ms as number | null) ?? null,
          createdAt: story.created_at as string,
        };
      });
    },
  };
}
