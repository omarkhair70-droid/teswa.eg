import { fetchMotionVideoDrops } from '@/lib/motion-video-drops';
import { createItemVideoSignedUrlCached } from '@/lib/item-videos';
import { teswaBackendRuntime } from '@/lib/backend/runtime';

export type PulseViewerStoryVideoEntry = {
  id: string;
  kind: 'story_video';
  createdAt: string;
  signedVideoUrl: string;
  durationMs: number | null;
  storyId: string;
  authorId: string;
  authorDisplayName: string | null;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  caption: string | null;
};

export type PulseViewerItemTeaserEntry = {
  id: string;
  kind: 'item_teaser';
  createdAt: string;
  signedVideoUrl: string;
  durationMs: number | null;
  itemId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  condition: string | null;
  location: string | null;
  ownerDisplayName: string | null;
};

export type PulseViewerEntry = PulseViewerStoryVideoEntry | PulseViewerItemTeaserEntry;

export type PulseViewerFetchResult = {
  entries: PulseViewerEntry[];
  storyVideosFailed: boolean;
  itemTeasersFailed: boolean;
};

type FetchOptions = { storyLimit?: number; itemLimit?: number; totalLimit?: number };

const clamp = (value: number | undefined, fallback: number, max: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value as number)));
};

async function fetchItemTeaserEntries(
  limit: number,
): Promise<PulseViewerItemTeaserEntry[]> {
  const rows = await teswaBackendRuntime.marketplace.listPulseItemTeasers(limit);
  const result: PulseViewerItemTeaserEntry[] = [];

  for (const row of rows) {
    const signedVideoUrl = await createItemVideoSignedUrlCached(row.videoStoragePath);
    if (!signedVideoUrl) continue;

    result.push({
      id: `item-teaser-${row.id}`,
      kind: 'item_teaser',
      createdAt: row.createdAt,
      signedVideoUrl,
      durationMs: row.durationMs,
      itemId: row.itemId,
      title: row.title,
      description: row.description,
      imageUrl: row.imageUrl,
      category: row.category,
      condition: row.condition,
      location: row.location,
      ownerDisplayName: row.ownerDisplayName,
    });
  }

  return result;
}

export async function fetchPulseViewerEntries(options?: FetchOptions): Promise<PulseViewerFetchResult> {
  const storyLimit = clamp(options?.storyLimit, 10, 20);
  const itemLimit = clamp(options?.itemLimit, 10, 20);
  const totalLimit = clamp(options?.totalLimit, 16, 40);

  let storyVideosFailed = false;
  let itemTeasersFailed = false;

  let storyEntries: PulseViewerStoryVideoEntry[] = [];
  let itemEntries: PulseViewerItemTeaserEntry[] = [];

  try {
    const drops = await fetchMotionVideoDrops({ limit: storyLimit });
    storyEntries = drops
      .filter((drop) => Boolean(drop.signedVideoUrl))
      .map((drop) => ({
        id: `story-video-${drop.storyId}`,
        kind: 'story_video',
        createdAt: drop.createdAt,
        signedVideoUrl: drop.signedVideoUrl as string,
        durationMs: drop.durationMs,
        storyId: drop.storyId,
        authorId: drop.authorId,
        authorDisplayName: drop.authorDisplayName,
        authorUsername: drop.authorUsername,
        authorAvatarUrl: drop.authorAvatarUrl,
        caption: drop.caption,
      }));
  } catch {
    storyVideosFailed = true;
  }

  try {
    itemEntries = await fetchItemTeaserEntries(itemLimit);
  } catch {
    itemTeasersFailed = true;
  }

  const merged = [...storyEntries, ...itemEntries]
    .map((entry, sourceOrder) => ({ entry, sourceOrder }))
    .sort((left, right) => {
      const lt = Date.parse(left.entry.createdAt);
      const rt = Date.parse(right.entry.createdAt);
      const lv = Number.isNaN(lt) ? -1 : lt;
      const rv = Number.isNaN(rt) ? -1 : rt;
      if (rv !== lv) return rv - lv;
      return left.sourceOrder - right.sourceOrder;
    })
    .slice(0, totalLimit)
    .map((record) => record.entry);

  return { entries: merged, storyVideosFailed, itemTeasersFailed };
}
