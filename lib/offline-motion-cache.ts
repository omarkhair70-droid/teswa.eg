import { MovingItemInterest } from '@/lib/motion-interest';
import { readOfflineJsonCache, pruneExpiredOfflineJsonCache, writeOfflineJsonCache } from '@/lib/offline-cache';
import { StoryDiscoveryItem } from '@/lib/story-discovery';

const MOTION_FEED_CACHE_KEY = 'motion:public-feed:v1';
const MOTION_FEED_CACHE_TTL_MS = 3 * 60 * 1000;

export type MotionPublicFeedCachePayload = {
  movingItems: MovingItemInterest[];
  storyItems: StoryDiscoveryItem[];
};

export type CachedMotionPublicFeed = {
  payload: MotionPublicFeedCachePayload;
  updatedAtMs: number;
  isExpired: boolean;
};

export async function readFreshMotionPublicFeedCache(): Promise<CachedMotionPublicFeed | null> {
  const cached = await readOfflineJsonCache<MotionPublicFeedCachePayload>({
    key: MOTION_FEED_CACHE_KEY,
    allowExpired: false,
  });

  if (!cached) {
    return null;
  }

  return {
    payload: cached.value,
    updatedAtMs: cached.updatedAtMs,
    isExpired: cached.isExpired,
  };
}

export async function readAnyMotionPublicFeedCache(): Promise<CachedMotionPublicFeed | null> {
  const cached = await readOfflineJsonCache<MotionPublicFeedCachePayload>({
    key: MOTION_FEED_CACHE_KEY,
    allowExpired: true,
  });

  if (!cached) {
    return null;
  }

  return {
    payload: cached.value,
    updatedAtMs: cached.updatedAtMs,
    isExpired: cached.isExpired,
  };
}

export async function writeMotionPublicFeedCache(payload: MotionPublicFeedCachePayload): Promise<void> {
  await writeOfflineJsonCache<MotionPublicFeedCachePayload>({
    key: MOTION_FEED_CACHE_KEY,
    value: payload,
    ttlMs: MOTION_FEED_CACHE_TTL_MS,
  });

  await pruneExpiredOfflineJsonCache();
}
