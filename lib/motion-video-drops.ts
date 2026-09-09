import { teswaBackendRuntime } from '@/lib/backend/runtime';
import { createStoryMediaSignedUrlCached } from '@/lib/stories';

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
  const rows = await teswaBackendRuntime.stories.listActiveVideoDrops(limit);

  return Promise.all(
    rows.map(async (story) => {
      let signedVideoUrl: string | null = null;
      if (story.mediaStoragePath) {
        try {
          signedVideoUrl = await createStoryMediaSignedUrlCached(
            story.mediaStoragePath,
          );
        } catch {
          signedVideoUrl = null;
        }
      }

      return {
        storyId: story.storyId,
        authorId: story.authorId,
        authorDisplayName: story.authorDisplayName,
        authorUsername: story.authorUsername,
        authorAvatarUrl: story.authorAvatarUrl,
        caption: story.caption,
        durationMs: story.durationMs,
        createdAt: story.createdAt,
        signedVideoUrl,
      };
    }),
  );
}
