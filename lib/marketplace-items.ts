import { supabase } from '@/lib/supabase/client';
import { fetchItemVideoPresenceMap } from '@/lib/item-video-presence';
import { fetchItemVideoTeaserByItemId, type ItemVideoTeaser } from '@/lib/item-videos';

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
  distance_km?: number | null;
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
  hasVideoTeaser: boolean;
  distanceKm?: number | null;
};

export type MarketplaceItemsPage = {
  items: MarketplaceItem[];
  hasMore: boolean;
};

export type MarketplaceItemDetailImage = {
  imageUrl: string;
  isPrimary: boolean;
  sortOrder: number | null;
};

export type MarketplaceItemOwnerPresence = {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  profileTagline: string | null;
  city: string | null;
  area: string | null;
  successfulSwapsCount: number | null;
  responseRate: number | null;
};

export type MarketplaceItemDetail = MarketplaceItem & {
  area: string | null;
  conditionNotes: string | null;
  itemStory: string | null;
  swapReason: string | null;
  goodFor: string | null;
  desireMode: 'specific' | 'flexible' | 'surprise' | null;
  desireText: string | null;
  wantedTags: string[];
  images: MarketplaceItemDetailImage[];
  videoTeaser: ItemVideoTeaser | null;
  ownerPresence?: MarketplaceItemOwnerPresence | null;
};

function mapRowToMarketplaceItem(row: MarketplaceItemRow, hasVideoTeaser = false): MarketplaceItem {
  return {
    id: row.id,
    title: row.title?.trim() || 'عنصر بدون عنوان',
    description: row.description,
    imageUrl: row.cover_image_url,
    category: row.category,
    condition: row.item_condition,
    location: row.city,
    ownerDisplayName: row.owner_display_name,
    hasVideoTeaser,
    distanceKm: row.distance_km ?? null,
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

  const videoPresenceByItemId = await fetchItemVideoPresenceMap(pageRows.map((row) => row.id));

  return {
    items: pageRows.map((row) => mapRowToMarketplaceItem(row, videoPresenceByItemId.get(row.id) === true)),
    hasMore,
  };
}

export async function fetchMarketplaceItems(): Promise<MarketplaceItem[]> {
  const page = await fetchMarketplaceItemsPage({ offset: 0, limit: MARKETPLACE_PAGE_SIZE });
  return page.items;
}

export async function fetchNearbyMarketplaceItemsPage(options: {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  offset?: number;
  limit?: number;
}): Promise<MarketplaceItemsPage> {
  const offset = options.offset ?? 0;
  const limit = options.limit ?? MARKETPLACE_PAGE_SIZE;
  const radiusKm = options.radiusKm ?? 3;

  const { data, error } = await supabase.rpc('get_nearby_marketplace_items', {
    p_latitude: options.latitude,
    p_longitude: options.longitude,
    p_radius_km: radiusKm,
    p_limit: limit + 1,
    p_offset: offset,
  });

  if (error) throw error;

  const rows = (data ?? []) as MarketplaceItemRow[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const videoPresenceByItemId = await fetchItemVideoPresenceMap(pageRows.map((row) => row.id));

  return {
    items: pageRows.map((row) => mapRowToMarketplaceItem(row, videoPresenceByItemId.get(row.id) === true)),
    hasMore,
  };
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

  const row = data as MarketplaceItemRow;
  const videoPresenceByItemId = await fetchItemVideoPresenceMap([row.id]);

  return mapRowToMarketplaceItem(row, videoPresenceByItemId.get(row.id) === true);
}

type ItemDetailRow = {
  id: string;
  title: string | null;
  description: string | null;
  category_id: string | null;
  condition: string | null;
  condition_notes: string | null;
  city: string | null;
  area: string | null;
  owner_id: string | null;
  item_story: string | null;
  swap_reason: string | null;
  good_for: string | null;
  desire_mode: 'specific' | 'flexible' | 'surprise' | null;
  desire_text: string | null;
};

type ItemImageRow = {
  image_url: string | null;
  is_primary: boolean | null;
  sort_order: number | null;
};

function normalizeNullableText(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function fetchMarketplaceItemDetailById(id: string): Promise<MarketplaceItemDetail | null> {
  const { data: itemData, error: itemError } = await supabase
    .from('items')
    .select(
      `
      id,
      title,
      description,
      category_id,
      condition,
      condition_notes,
      city,
      area,
      owner_id,
      item_story,
      swap_reason,
      good_for,
      desire_mode,
      desire_text,
      status
    `,
    )
    .eq('id', id)
    .eq('status', 'active')
    .maybeSingle();

  if (itemError) throw itemError;
  if (!itemData) return null;

  const item = itemData as ItemDetailRow;

  const [imagesResult, categoryResult, ownerResult, wantedTagsResult, videoTeaser] = await Promise.all([
    supabase.from('item_images').select('image_url, is_primary, sort_order').eq('item_id', id),
    item.category_id ? supabase.from('categories').select('name_ar').eq('id', item.category_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    item.owner_id ? supabase.from('profiles').select('id, display_name, username, avatar_url, profile_tagline, city, area, successful_swaps_count, response_rate, is_banned').eq('id', item.owner_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from('item_wanted_tags').select('tag').eq('item_id', id),
    fetchItemVideoTeaserByItemId(id),
  ]);

  if (imagesResult.error) throw imagesResult.error;
  if (categoryResult.error) throw categoryResult.error;
  if (ownerResult.error) throw ownerResult.error;
  if (wantedTagsResult.error) throw wantedTagsResult.error;

  const images = ((imagesResult.data ?? []) as ItemImageRow[])
    .filter((row): row is Required<Pick<ItemImageRow, 'image_url'>> & ItemImageRow => Boolean(row.image_url))
    .sort((a, b) => {
      if (Boolean(a.is_primary) !== Boolean(b.is_primary)) {
        return a.is_primary ? -1 : 1;
      }
      const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.image_url!.localeCompare(b.image_url!);
    })
    .map((row) => ({
      imageUrl: row.image_url!,
      isPrimary: Boolean(row.is_primary),
      sortOrder: row.sort_order,
    }));


  const ownerProfile = ownerResult.data as {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
    profile_tagline: string | null;
    city: string | null;
    area: string | null;
    successful_swaps_count: number | null;
    response_rate: number | null;
    is_banned: boolean | null;
  } | null;
  if (ownerProfile?.is_banned === true) return null;

  const wantedTags = ((wantedTagsResult.data ?? []) as { tag: string | null }[])
    .map((row: { tag: string | null }) => normalizeNullableText(row.tag))
    .filter((tag: string | null): tag is string => Boolean(tag));

  return {
    id: item.id,
    title: item.title?.trim() || 'عنصر بدون عنوان',
    description: normalizeNullableText(item.description),
    imageUrl: images[0]?.imageUrl ?? null,
    category: normalizeNullableText((categoryResult.data as { name_ar: string | null } | null)?.name_ar ?? null),
    condition: normalizeNullableText(item.condition),
    location: normalizeNullableText(item.city),
    ownerDisplayName: normalizeNullableText(ownerProfile?.display_name ?? null),
    hasVideoTeaser: Boolean(videoTeaser),
    area: normalizeNullableText(item.area),
    conditionNotes: normalizeNullableText(item.condition_notes),
    itemStory: normalizeNullableText(item.item_story),
    swapReason: normalizeNullableText(item.swap_reason),
    goodFor: normalizeNullableText(item.good_for),
    desireMode: item.desire_mode,
    desireText: normalizeNullableText(item.desire_text),
    wantedTags,
    images,
    videoTeaser,
    ownerPresence: ownerProfile
      ? {
          id: ownerProfile.id,
          displayName: normalizeNullableText(ownerProfile.display_name),
          username: normalizeNullableText(ownerProfile.username),
          avatarUrl: normalizeNullableText(ownerProfile.avatar_url),
          profileTagline: normalizeNullableText(ownerProfile.profile_tagline),
          city: normalizeNullableText(ownerProfile.city),
          area: normalizeNullableText(ownerProfile.area),
          successfulSwapsCount: ownerProfile.successful_swaps_count,
          responseRate: ownerProfile.response_rate,
        }
      : null,
  };
}
