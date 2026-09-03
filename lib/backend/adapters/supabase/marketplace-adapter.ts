import type {
  MarketplaceDetailRecord,
  MarketplaceFeedRecord,
  MarketplaceReadContract,
  MarketplaceReadFilters,
  MarketplaceReadPage,
} from '@/lib/backend/contracts/marketplace';
import { supabase } from '@/lib/supabase/client';

type FeedRow = {
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

const FEED_SELECT = `
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

function mapFeedRow(row: FeedRow): MarketplaceFeedRecord {
  return {
    id: row.id,
    title: row.title ?? null,
    description: row.description ?? null,
    coverImageUrl: row.cover_image_url ?? null,
    category: row.category ?? null,
    condition: row.item_condition ?? null,
    city: row.city ?? null,
    ownerDisplayName: row.owner_display_name ?? null,
    createdAt: row.created_at,
    distanceKm: row.distance_km ?? null,
  };
}

function applyFeedFilters(builder: any, filters?: MarketplaceReadFilters) {
  let queryBuilder = builder;
  const query = filters?.query?.trim();
  const category = filters?.category?.trim();
  const condition = filters?.condition?.trim();
  const city = filters?.city?.trim();

  if (query) {
    const safeQuery = query.replace(/[%_,]/g, '').trim();
    if (safeQuery) {
      queryBuilder = queryBuilder.or(
        `title.ilike.%${safeQuery}%,description.ilike.%${safeQuery}%,city.ilike.%${safeQuery}%,category.ilike.%${safeQuery}%`,
      );
    }
  }
  if (category) queryBuilder = queryBuilder.eq('category', category);
  if (condition) queryBuilder = queryBuilder.eq('item_condition', condition);
  if (city) queryBuilder = queryBuilder.eq('city', city);

  return queryBuilder;
}

function pageFromRows(rows: FeedRow[], limit: number): MarketplaceReadPage {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  return { items: pageRows.map(mapFeedRow), hasMore };
}

export function createSupabaseMarketplaceReadAdapter(): MarketplaceReadContract {
  return {
    async listFeed(input) {
      const offset = input?.offset ?? 0;
      const limit = input?.limit ?? 20;
      let queryBuilder = supabase.from('marketplace_items').select(FEED_SELECT);
      queryBuilder = applyFeedFilters(queryBuilder, input?.filters);

      const { data, error } = await queryBuilder
        .order('created_at', { ascending: false })
        .range(offset, offset + limit);

      if (error) throw error;
      return pageFromRows((data ?? []) as FeedRow[], limit);
    },

    async listNearbyFeed(input) {
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 20;
      const radiusKm = input.radiusKm ?? 3;

      const { data, error } = await supabase.rpc('get_nearby_marketplace_items', {
        p_latitude: input.latitude,
        p_longitude: input.longitude,
        p_radius_km: radiusKm,
        p_limit: limit + 1,
        p_offset: offset,
      });

      if (error) throw error;
      return pageFromRows((data ?? []) as FeedRow[], limit);
    },

    async getFeedItem(itemId) {
      const normalizedId = itemId.trim();
      if (!normalizedId) return null;

      const { data, error } = await supabase
        .from('marketplace_items')
        .select(FEED_SELECT)
        .eq('id', normalizedId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapFeedRow(data as FeedRow) : null;
    },

    async getDetail(itemId): Promise<MarketplaceDetailRecord | null> {
      const normalizedId = itemId.trim();
      if (!normalizedId) return null;

      const { data: itemData, error: itemError } = await supabase
        .from('items')
        .select(`
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
        `)
        .eq('id', normalizedId)
        .eq('status', 'active')
        .maybeSingle();

      if (itemError) throw itemError;
      if (!itemData) return null;

      const item = itemData as {
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

      const [imagesResult, categoryResult, ownerResult, wantedTagsResult] = await Promise.all([
        supabase.from('item_images').select('image_url, is_primary, sort_order').eq('item_id', normalizedId),
        item.category_id
          ? supabase.from('categories').select('name_ar').eq('id', item.category_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        item.owner_id
          ? supabase
              .from('profiles')
              .select('id, display_name, username, avatar_url, profile_tagline, city, area, successful_swaps_count, response_rate, is_banned')
              .eq('id', item.owner_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from('item_wanted_tags').select('tag').eq('item_id', normalizedId),
      ]);

      if (imagesResult.error) throw imagesResult.error;
      if (categoryResult.error) throw categoryResult.error;
      if (ownerResult.error) throw ownerResult.error;
      if (wantedTagsResult.error) throw wantedTagsResult.error;

      const owner = ownerResult.data as {
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

      if (owner?.is_banned === true) return null;

      return {
        id: item.id,
        title: item.title ?? null,
        description: item.description ?? null,
        condition: item.condition ?? null,
        conditionNotes: item.condition_notes ?? null,
        city: item.city ?? null,
        area: item.area ?? null,
        ownerId: item.owner_id ?? null,
        itemStory: item.item_story ?? null,
        swapReason: item.swap_reason ?? null,
        goodFor: item.good_for ?? null,
        desireMode: item.desire_mode ?? null,
        desireText: item.desire_text ?? null,
        category: (categoryResult.data as { name_ar?: string | null } | null)?.name_ar ?? null,
        wantedTags: (wantedTagsResult.data ?? []).map((row: { tag: string | null }) => row.tag ?? null),
        images: (imagesResult.data ?? []).map((row: {
          image_url: string | null;
          is_primary: boolean | null;
          sort_order: number | null;
        }) => ({
          imageUrl: row.image_url ?? null,
          isPrimary: row.is_primary ?? null,
          sortOrder: row.sort_order ?? null,
        })),
        ownerPresence: owner
          ? {
              id: owner.id,
              displayName: owner.display_name ?? null,
              username: owner.username ?? null,
              avatarUrl: owner.avatar_url ?? null,
              profileTagline: owner.profile_tagline ?? null,
              city: owner.city ?? null,
              area: owner.area ?? null,
              successfulSwapsCount: owner.successful_swaps_count ?? null,
              responseRate: owner.response_rate ?? null,
            }
          : null,
      };
    },
  };
}
