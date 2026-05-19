import { supabase } from '@/lib/supabase/client';

const DEFAULT_DISCOVERY_LIMIT = 8;

type ItemVideoDiscoveryRow = {
  item_id: string | null;
  duration_ms: number | null;
  created_at: string | null;
};

type MarketplaceDiscoveryRow = {
  id: string;
  title: string | null;
  description: string | null;
  cover_image_url: string | null;
  category: string | null;
  item_condition: string | null;
  city: string | null;
  owner_display_name: string | null;
};

export type ItemVideoDiscoveryMoment = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  condition: string | null;
  location: string | null;
  ownerDisplayName: string | null;
  hasVideoTeaser: true;
  videoDurationMs: number | null;
  videoCreatedAt: string | null;
};

export async function fetchRecentItemVideoDiscoveryMoments(limit = DEFAULT_DISCOVERY_LIMIT): Promise<ItemVideoDiscoveryMoment[]> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_DISCOVERY_LIMIT;
  const { data: videoRowsData, error: videosError } = await supabase
    .from('item_videos')
    .select('item_id,duration_ms,created_at')
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (videosError) return [];

  const videoRows = ((videoRowsData ?? []) as ItemVideoDiscoveryRow[]).filter(
    (row): row is ItemVideoDiscoveryRow & { item_id: string } => Boolean(row.item_id?.trim()),
  );

  if (videoRows.length === 0) return [];

  const orderedUniqueItemIds = Array.from(new Set(videoRows.map((row) => row.item_id.trim())));
  const { data: itemRowsData, error: itemsError } = await supabase
    .from('marketplace_items')
    .select('id,title,description,cover_image_url,category,item_condition,city,owner_display_name')
    .in('id', orderedUniqueItemIds);

  if (itemsError) return [];

  const itemsById = new Map(((itemRowsData ?? []) as MarketplaceDiscoveryRow[]).map((row) => [row.id, row]));

  return videoRows
    .map((row) => {
      const item = itemsById.get(row.item_id.trim());
      if (!item) return null;

      return {
        id: item.id,
        title: item.title?.trim() || 'عنصر بدون عنوان',
        description: item.description,
        imageUrl: item.cover_image_url,
        category: item.category,
        condition: item.item_condition,
        location: item.city,
        ownerDisplayName: item.owner_display_name,
        hasVideoTeaser: true,
        videoDurationMs: row.duration_ms ?? null,
        videoCreatedAt: row.created_at ?? null,
      } satisfies ItemVideoDiscoveryMoment;
    })
    .filter((moment): moment is ItemVideoDiscoveryMoment => moment !== null);
}
