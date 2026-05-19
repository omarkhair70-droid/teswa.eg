import { Image as ExpoImage } from 'expo-image';
import type { VideoSource } from 'expo-video';

export function buildCachedVideoSource(uri: string | null | undefined): VideoSource | null {
  const normalizedUri = uri?.trim();
  if (!normalizedUri) return null;
  return {
    uri: normalizedUri,
    useCaching: true,
  };
}

export async function prefetchImagesMemoryDisk(urls: Array<string | null | undefined>): Promise<void> {
  const normalized = Array.from(new Set(
    urls
      .map((value) => value?.trim() ?? '')
      .filter((value) => value.length > 0),
  ));

  if (!normalized.length) return;

  try {
    await ExpoImage.prefetch(normalized, 'memory-disk');
  } catch (error) {
    if (__DEV__) console.warn('[media-performance] image prefetch failed', error);
  }
}

export function getMediaNeighborIndexes(
  activeIndex: number,
  total: number,
  options?: { previous?: number; next?: number },
): number[] {
  if (total <= 0) return [];

  const previous = Math.max(0, options?.previous ?? 0);
  const next = Math.max(0, options?.next ?? 0);
  const indexes: number[] = [];

  for (let offset = 1; offset <= previous; offset += 1) {
    const index = activeIndex - offset;
    if (index >= 0) indexes.push(index);
  }

  for (let offset = 1; offset <= next; offset += 1) {
    const index = activeIndex + offset;
    if (index < total) indexes.push(index);
  }

  return indexes;
}
