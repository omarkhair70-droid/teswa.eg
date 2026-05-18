import { supabase } from '@/lib/supabase/client';

export type MovingItemInterest = {
  id: string;
  title: string;
  imageUrl: string | null;
  category: string | null;
  condition: string | null;
  location: string | null;
  ownerDisplayName: string | null;
  openInterestCount: number;
  latestInterestAt: string | null;
};

type PublicMovingItemRow = {
  item_id: string;
  open_interest_count: number | string | null;
  latest_interest_at: string | null;
};

type MarketplaceItemRow = {
  id: string;
  title: string | null;
  cover_image_url: string | null;
  category: string | null;
  item_condition: string | null;
  city: string | null;
  owner_display_name: string | null;
};

export async function fetchMovingItems(input?: { limit?: number }): Promise<MovingItemInterest[]> {
  const normalizedLimit = Math.min(Math.max(input?.limit ?? 12, 1), 24);

  const { data: rankedRows, error: rankedError } = await supabase.rpc('get_public_moving_items', {
    p_limit: normalizedLimit,
  });

  if (rankedError) {
    throw rankedError;
  }

  const rows = (rankedRows ?? []) as PublicMovingItemRow[];
  if (rows.length === 0) {
    return [];
  }

  const itemIds = rows.map((row) => row.item_id);

  const { data: marketplaceRows, error: marketplaceError } = await supabase
    .from('marketplace_items')
    .select('id, title, cover_image_url, category, item_condition, city, owner_display_name')
    .in('id', itemIds);

  if (marketplaceError) {
    throw marketplaceError;
  }

  const itemMap = new Map((marketplaceRows as MarketplaceItemRow[] | null ?? []).map((item) => [item.id, item]));

  return rows.flatMap((row) => {
    const item = itemMap.get(row.item_id);
    if (!item) {
      return [];
    }

    return [{
      id: item.id,
      title: item.title?.trim() || 'عنصر بدون عنوان',
      imageUrl: item.cover_image_url ?? null,
      category: item.category ?? null,
      condition: item.item_condition ?? null,
      location: item.city ?? null,
      ownerDisplayName: item.owner_display_name ?? null,
      openInterestCount: Number(row.open_interest_count ?? 0),
      latestInterestAt: row.latest_interest_at ?? null,
    }];
  });
}
