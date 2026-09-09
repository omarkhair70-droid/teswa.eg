import type { IsoDateTime, TeswaResult } from '@/lib/backend/contracts/core';

export type StoryMediaKind = 'image' | 'video';

export type StoryTransportRecord = {
  id: string;
  userId: string;
  mediaType: StoryMediaKind;
  mediaStoragePath: string;
  mediaThumbnailStoragePath: string | null;
  caption: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  createdAt: IsoDateTime;
  expiresAt: IsoDateTime;
};

export type StoryAuthorTransportRecord = {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export type ActiveStorySummaryTransportRecord = {
  author: StoryAuthorTransportRecord;
  stories: StoryTransportRecord[];
  latestCreatedAt: IsoDateTime;
};

export type StoryViewerTransportEntry = {
  viewerId: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  viewedAt: IsoDateTime;
};

export type StoryViewersTransportContext = {
  storyId: string;
  storyCreatedAt: IsoDateTime;
  storyCaption: string | null;
  viewers: StoryViewerTransportEntry[];
};

export type StoryVideoDropTransportRecord = {
  storyId: string;
  authorId: string;
  authorDisplayName: string | null;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  mediaStoragePath: string | null;
  caption: string | null;
  durationMs: number | null;
  createdAt: IsoDateTime;
};

export interface StoriesContract {
  create(input: {
    userId: string;
    mediaType: StoryMediaKind;
    mediaStoragePath: string;
    mediaThumbnailStoragePath?: string | null;
    caption?: string | null;
    durationMs?: number | null;
    width?: number | null;
    height?: number | null;
  }): Promise<TeswaResult<{ storyId: string }, 'unknown'>>;

  deleteOwned(input: {
    userId: string;
    storyId: string;
  }): Promise<
    TeswaResult<
      { storagePaths: string[] },
      'not_found' | 'unknown'
    >
  >;

  listActiveByUser(userId: string): Promise<StoryTransportRecord[]>;
  listActiveForHome(): Promise<ActiveStorySummaryTransportRecord[]>;
  getAuthor(userId: string): Promise<StoryAuthorTransportRecord | null>;

  getLikeState(
    viewerId: string,
    storyIds: string[],
  ): Promise<Record<string, boolean>>;

  setLiked(input: {
    storyId: string;
    likerId: string;
    liked: boolean;
  }): Promise<TeswaResult<{ liked: boolean }, 'unknown'>>;

  getLikeCounts(storyIds: string[]): Promise<Record<string, number>>;

  markViewed(input: {
    storyId: string;
    viewerId: string;
  }): Promise<TeswaResult<void, 'unknown'>>;

  getViewCounts(storyIds: string[]): Promise<Record<string, number>>;

  getViewersForOwner(input: {
    ownerId: string;
    storyId: string;
  }): Promise<StoryViewersTransportContext | null>;

  listActiveVideoDrops(limit: number): Promise<StoryVideoDropTransportRecord[]>;
}
