import { fetchMotionVideoDrops } from '@/lib/motion-video-drops';
import { createItemVideoSignedUrlCached } from '@/lib/item-videos';
import { supabase } from '@/lib/supabase/client';

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

async function fetchItemTeaserEntries(limit: number): Promise<PulseViewerItemTeaserEntry[]> {
  const { data, error } = await supabase
    .from('item_videos')
    .select('id,item_id,video_storage_path,duration_ms,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const rows = (data ?? []) as Array<{ id: string; item_id: string; video_storage_path: string | null; duration_ms: number | null; created_at: string }>;
  if (!rows.length) return [];

  const itemIds = Array.from(new Set(rows.map((row) => row.item_id).filter(Boolean)));
  const { data: items, error: itemsError } = await supabase
    .from('marketplace_items')
    .select('id,title,description,cover_image_url,category,item_condition,city,owner_display_name')
    .in('id', itemIds);

  if (itemsError) throw itemsError;

  const itemsById = new Map((items ?? []).map((item: any) => [item.id, item]));
  const result: PulseViewerItemTeaserEntry[] = [];

  for (const row of rows) {
    if (!row.video_storage_path) continue;
    const item = itemsById.get(row.item_id);
    if (!item) continue;
    const signedVideoUrl = await createItemVideoSignedUrlCached(row.video_storage_path);
    if (!signedVideoUrl) continue;
    result.push({
      id: `item-teaser-${row.id}`,
      kind: 'item_teaser',
      createdAt: row.created_at,
      signedVideoUrl,
      durationMs: row.duration_ms ?? null,
      itemId: item.id,
      title: item.title,
      description: item.description ?? null,
      imageUrl: item.cover_image_url ?? null,
      category: item.category ?? null,
      condition: item.item_condition ?? null,
      location: item.city ?? null,
      ownerDisplayName: item.owner_display_name ?? null,
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
