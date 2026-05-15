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

export async function fetchMarketplaceItems(): Promise<MarketplaceItem[]> {
  const { data, error } = await supabase
    .from('marketplace_items')
    .select(itemSelect)
    .order('created_at', { ascending: false })
    .limit(MARKETPLACE_PAGE_SIZE);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapRowToMarketplaceItem(row as MarketplaceItemRow));
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
