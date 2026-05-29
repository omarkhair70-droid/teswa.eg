import { createVideoPlayer, type VideoSource } from 'expo-video';

import { readOfflineJsonCache, writeOfflineJsonCache } from '@/lib/offline-cache';

type ThumbnailSource = { uri: string } | object;

export type GeneratedVideoThumbnail = {
  cacheKey: string;
  source: ThumbnailSource;
  uri: string | null;
  width: number | null;
  height: number | null;
};

type CachedVideoThumbnail = {
  uri: string;
  width: number | null;
  height: number | null;
};

type VideoThumbnailOptions = {
  videoUrl: string | null | undefined;
  cacheKeyParts: Array<string | null | undefined>;
  timeSeconds?: number;
  maxWidth?: number;
  maxHeight?: number;
};

const CACHE_PREFIX = 'direct-chat:video-thumbnail:v1:';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const memoryCache = new Map<string, GeneratedVideoThumbnail | null>();
const inFlight = new Map<string, Promise<GeneratedVideoThumbnail | null>>();

function normalizeVideoUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('file://')) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function stableUrlKey(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return value.split('?')[0]?.split('#')[0] ?? value;
  }
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function buildDirectVideoThumbnailCacheKey(input: { videoUrl: string; cacheKeyParts?: Array<string | null | undefined> }): string {
  const safeParts = (input.cacheKeyParts ?? [])
    .map((part) => part?.trim() ?? '')
    .filter(Boolean);
  const stableIdentity = safeParts.length > 0 ? safeParts.join(':') : stableUrlKey(input.videoUrl);
  return `${CACHE_PREFIX}${hashString(stableIdentity)}`;
}

function getThumbnailUri(thumbnail: unknown): string | null {
  if (!thumbnail || typeof thumbnail !== 'object') return null;
  const record = thumbnail as Record<string, unknown>;
  const candidates = [record.uri, record.localUri, record.url];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function getDimension(thumbnail: unknown, key: 'width' | 'height'): number | null {
  if (!thumbnail || typeof thumbnail !== 'object') return null;
  const value = (thumbnail as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export async function generateDirectVideoThumbnail(options: VideoThumbnailOptions): Promise<GeneratedVideoThumbnail | null> {
  const videoUrl = normalizeVideoUrl(options.videoUrl);
  if (!videoUrl) return null;

  const cacheKey = buildDirectVideoThumbnailCacheKey({ videoUrl, cacheKeyParts: options.cacheKeyParts });
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey) ?? null;

  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    const cached = await readOfflineJsonCache<CachedVideoThumbnail>({ key: cacheKey });
    if (cached?.value?.uri) {
      const value: GeneratedVideoThumbnail = {
        cacheKey,
        source: { uri: cached.value.uri },
        uri: cached.value.uri,
        width: cached.value.width,
        height: cached.value.height,
      };
      memoryCache.set(cacheKey, value);
      return value;
    }

    let player: ReturnType<typeof createVideoPlayer> | null = null;
    try {
      const source: VideoSource = { uri: videoUrl, useCaching: true };
      player = createVideoPlayer(source);
      const generator = player.generateThumbnailsAsync;
      if (typeof generator !== 'function') return null;

      const thumbnails = await generator.call(player, options.timeSeconds ?? 1, {
        maxWidth: options.maxWidth ?? 480,
        maxHeight: options.maxHeight ?? 270,
      });
      const thumbnail = Array.isArray(thumbnails) ? thumbnails[0] : null;
      if (!thumbnail) return null;

      const uri = getThumbnailUri(thumbnail);
      const value: GeneratedVideoThumbnail = {
        cacheKey,
        source: uri ? { uri } : thumbnail,
        uri,
        width: getDimension(thumbnail, 'width'),
        height: getDimension(thumbnail, 'height'),
      };

      if (uri) {
        await writeOfflineJsonCache<CachedVideoThumbnail>({
          key: cacheKey,
          value: { uri, width: value.width, height: value.height },
          ttlMs: CACHE_TTL_MS,
        });
      }

      memoryCache.set(cacheKey, value);
      return value;
    } catch (error) {
      if (__DEV__) console.warn('[direct-video-thumbnails] generation failed', error);
      memoryCache.set(cacheKey, null);
      return null;
    } finally {
      try {
        player?.release();
      } catch {}
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}
