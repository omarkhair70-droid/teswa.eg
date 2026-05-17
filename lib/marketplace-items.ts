import { supabase } from '@/lib/supabase/client';

const MARKETPLACE_PAGE_SIZE = 20;

type MarketplaceItemRow = {
  id: string;
  title: string | null;
  description: string | null;
  cover_image_url: string | null;
  category: string | null;
  item_condition: string | null;
  city: string | null;
  owner_display_name: string | null;
  created_at: string;
};

export type MarketplaceItem = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  condition: string | null;
  location: string | null;
  ownerDisplayName: string | null;
};

export type MarketplaceItemsPage = {
  items: MarketplaceItem[];
  hasMore: boolean;
};

function mapRowToMarketplaceItem(row: MarketplaceItemRow): MarketplaceItem {
  return {
    id: row.id,
    title: row.title?.trim() || 'عنصر بدون عنوان',
    description: row.description,
    imageUrl: row.cover_image_url,
    category: row.category,
    condition: row.item_condition,
    location: row.city,
    ownerDisplayName: row.owner_display_name,
  };
}

const itemSelect = `
  id,
  title,
  description,
  cover_image_url,
  category,
  item_condition,
  city,
  owner_display_name,
  created_at
`;

export async function fetchMarketplaceItemsPage(options?: { offset?: number; limit?: number }): Promise<MarketplaceItemsPage> {
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? MARKETPLACE_PAGE_SIZE;

  const { data, error } = await supabase
    .from('marketplace_items')
    .select(itemSelect)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as MarketplaceItemRow[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: pageRows.map((row) => mapRowToMarketplaceItem(row)),
    hasMore,
  };
}

export async function fetchMarketplaceItems(): Promise<MarketplaceItem[]> {
  const page = await fetchMarketplaceItemsPage({ offset: 0, limit: MARKETPLACE_PAGE_SIZE });
  return page.items;
}

export async function fetchMarketplaceItemById(id: string): Promise<MarketplaceItem | null> {
  const { data, error } = await supabase
    .from('marketplace_items')
    .select(itemSelect)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mapRowToMarketplaceItem(data as MarketplaceItemRow);
}
