import type {
  MarketplaceDetailRecord,
  MarketplaceFeedRecord,
  MarketplaceCoreContract,
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

export function createSupabaseMarketplaceReadAdapter(): MarketplaceCoreContract {
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

    async listActiveByOwner(profileId, limit = 6) {
      const normalizedId = profileId.trim();
      if (!normalizedId) return [];

      const { data: items, error: itemsError } = await supabase
        .from('items')
        .select('id, title, category_id, city, area, created_at')
        .eq('owner_id', normalizedId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (itemsError) throw itemsError;
      if (!items?.length) return [];

      const itemIds = items.map((item) => item.id);
      const categoryIds = Array.from(
        new Set(items.map((item) => item.category_id).filter((value): value is string => typeof value === 'string' && value.length > 0)),
      );

      const [imagesResult, categoriesResult] = await Promise.all([
        supabase
          .from('item_images')
          .select('item_id, image_url, is_primary, sort_order')
          .in('item_id', itemIds),
        categoryIds.length > 0
          ? supabase.from('categories').select('id, name_ar').in('id', categoryIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (imagesResult.error) throw imagesResult.error;
      if (categoriesResult.error) throw categoriesResult.error;

      const imagesByItem = new Map<string, Array<{
        imageUrl: string | null;
        isPrimary: boolean | null;
        sortOrder: number | null;
      }>>();

      for (const image of imagesResult.data ?? []) {
        const list = imagesByItem.get(image.item_id) ?? [];
        list.push({
          imageUrl: image.image_url ?? null,
          isPrimary: image.is_primary ?? null,
          sortOrder: image.sort_order ?? null,
        });
        imagesByItem.set(image.item_id, list);
      }

      const categoriesById = new Map(
        (categoriesResult.data ?? []).map((category) => [category.id, category.name_ar ?? null]),
      );

      const pickCover = (itemId: string): string | null => {
        const images = imagesByItem.get(itemId);
        if (!images?.length) return null;

        const sorted = [...images].sort((a, b) => {
          const aPrimary = a.isPrimary ? 0 : 1;
          const bPrimary = b.isPrimary ? 0 : 1;
          if (aPrimary !== bPrimary) return aPrimary - bPrimary;
          const aSort = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
          const bSort = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
          if (aSort !== bSort) return aSort - bSort;
          return (a.imageUrl ?? '').localeCompare(b.imageUrl ?? '');
        });
        return sorted[0]?.imageUrl ?? null;
      };

      return items.map((item) => ({
        id: item.id,
        title: item.title ?? null,
        imageUrl: pickCover(item.id),
        category: item.category_id ? categoriesById.get(item.category_id) ?? null : null,
        city: item.city ?? null,
        area: item.area ?? null,
        createdAt: item.created_at ?? null,
      }));
    },

    async getLikeSummaries(itemIds, viewerId) {
      const normalizedIds = Array.from(
        new Set(itemIds.map((id) => id.trim()).filter(Boolean)),
      );
      const result = new Map<string, { likeCount: number; likedByMe: boolean }>();
      if (!normalizedIds.length) return result;

      const { data, error } = await supabase
        .from('item_likes')
        .select('item_id,user_id')
        .in('item_id', normalizedIds);
      if (error) throw error;

      const normalizedViewerId = viewerId?.trim() || null;
      for (const row of data ?? []) {
        const itemId = (row.item_id as string | null)?.trim();
        if (!itemId) continue;
        const current = result.get(itemId) ?? { likeCount: 0, likedByMe: false };
        current.likeCount += 1;
        if (
          normalizedViewerId
          && (row.user_id as string | null)?.trim() === normalizedViewerId
        ) {
          current.likedByMe = true;
        }
        result.set(itemId, current);
      }
      return result;
    },

    async setLiked(itemId, userId, liked) {
      if (liked) {
        const { error } = await supabase
          .from('item_likes')
          .insert({ item_id: itemId, user_id: userId });
        if (!error || error.code === '23505') {
          return { ok: true, data: { liked: true } };
        }
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }

      const { error } = await supabase
        .from('item_likes')
        .delete()
        .eq('item_id', itemId)
        .eq('user_id', userId);
      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }
      return { ok: true, data: { liked: false } };
    },

    async listMine(userId) {
      const { data: itemsData, error: itemsError } = await supabase
        .from('items')
        .select('id,title,category_id,condition,city,area,status,created_at')
        .eq('owner_id', userId)
        .in('status', ['active', 'reserved', 'swapped', 'archived'])
        .order('created_at', { ascending: false });
      if (itemsError) throw itemsError;

      const items = itemsData ?? [];
      if (!items.length) return [];

      const itemIds = items.map((item) => item.id as string);
      const categoryIds = Array.from(
        new Set(
          items
            .map((item) => item.category_id as string | null)
            .filter((value): value is string => Boolean(value)),
        ),
      );

      const [imagesResult, categoriesResult, offersResult] = await Promise.all([
        supabase
          .from('item_images')
          .select('item_id,image_url,is_primary,sort_order')
          .in('item_id', itemIds),
        categoryIds.length
          ? supabase.from('categories').select('id,name_ar').in('id', categoryIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('offers')
          .select('requested_item_id')
          .eq('receiver_id', userId)
          .in('requested_item_id', itemIds)
          .in('status', ['pending', 'thinking']),
      ]);

      if (imagesResult.error) throw imagesResult.error;
      if (categoriesResult.error) throw categoriesResult.error;
      if (offersResult.error) throw offersResult.error;

      const imagesByItemId = new Map<string, any[]>();
      for (const row of imagesResult.data ?? []) {
        const itemId = row.item_id as string;
        const current = imagesByItemId.get(itemId) ?? [];
        current.push(row);
        imagesByItemId.set(itemId, current);
      }

      const categoryById = new Map<string, string | null>();
      for (const row of categoriesResult.data ?? []) {
        categoryById.set(
          row.id as string,
          typeof row.name_ar === 'string' && row.name_ar.trim()
            ? row.name_ar.trim()
            : null,
        );
      }

      const offersCountByItemId = new Map<string, number>();
      for (const row of offersResult.data ?? []) {
        const requestedItemId = row.requested_item_id as string | null;
        if (!requestedItemId) continue;
        offersCountByItemId.set(
          requestedItemId,
          (offersCountByItemId.get(requestedItemId) ?? 0) + 1,
        );
      }

      const normalize = (value: unknown) => {
        const text = typeof value === 'string' ? value.trim() : '';
        return text || null;
      };

      const pickImage = (rows: any[]) => {
        const sorted = rows
          .filter((row) => Boolean(normalize(row.image_url)))
          .sort((a, b) => {
            if (Boolean(a.is_primary) !== Boolean(b.is_primary)) {
              return a.is_primary ? -1 : 1;
            }
            const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
            const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return String(a.image_url ?? '').localeCompare(String(b.image_url ?? ''));
          });
        return normalize(sorted[0]?.image_url);
      };

      return items.map((item) => ({
        id: item.id as string,
        title: normalize(item.title) ?? 'عنصر بدون عنوان',
        imageUrl: pickImage(imagesByItemId.get(item.id as string) ?? []),
        category: item.category_id
          ? categoryById.get(item.category_id as string) ?? null
          : null,
        condition: normalize(item.condition),
        city: normalize(item.city),
        area: normalize(item.area),
        status: item.status as 'active' | 'reserved' | 'swapped' | 'archived',
        createdAt: (item.created_at as string | null) ?? null,
        openIncomingOffersCount: offersCountByItemId.get(item.id as string) ?? 0,
      }));
    },

    async archiveOwned(itemId) {
      const { data, error } = await supabase.rpc('archive_owned_listing_if_safe', {
        p_item_id: itemId,
      });
      if (error) throw error;
      return data as import('@/lib/backend/contracts/marketplace').ListingLifecycleCode;
    },

    async reactivateOwned(itemId) {
      const { data, error } = await supabase.rpc('reactivate_owned_archived_listing', {
        p_item_id: itemId,
      });
      if (error) throw error;
      return data as import('@/lib/backend/contracts/marketplace').ListingLifecycleCode;
    },

    async getImageUrls(itemId) {
      const { data, error } = await supabase
        .from('item_images')
        .select('image_url')
        .eq('item_id', itemId);
      if (error) throw error;
      return (data ?? [])
        .map((row) => (row.image_url as string | null)?.trim() || '')
        .filter(Boolean);
    },

    async deleteOwnedArchived(itemId) {
      const { data, error } = await supabase.rpc(
        'delete_owned_archived_listing_if_safe',
        { p_item_id: itemId },
      );
      if (error) throw error;
      return data as import('@/lib/backend/contracts/marketplace').ListingLifecycleCode;
},

    async getEditableListing(itemId, ownerId) {
      const { data: item, error } = await supabase
        .from('items')
        .select('id,status,title,category_id,city,area,condition,condition_notes,description,item_story,swap_reason,good_for,desire_mode,desire_text')
        .eq('id', itemId)
        .eq('owner_id', ownerId)
        .in('status', ['active', 'archived'])
        .maybeSingle();

      if (error) throw error;
      if (!item) return null;

      const { data: tags, error: tagsError } = await supabase
        .from('item_wanted_tags')
        .select('tag')
        .eq('item_id', itemId);
      if (tagsError) throw tagsError;

      const normalize = (value: unknown) => {
        const text = typeof value === 'string' ? value.trim() : '';
        return text || null;
      };

      return {
        id: item.id as string,
        status: item.status as 'active' | 'archived',
        title: normalize(item.title) ?? 'عنصر بدون عنوان',
        categoryId: (item.category_id as string | null) ?? null,
        city: normalize(item.city),
        area: normalize(item.area),
        condition: item.condition as string,
        conditionNotes: normalize(item.condition_notes),
        description: normalize(item.description),
        itemStory: normalize(item.item_story),
        swapReason: normalize(item.swap_reason),
        goodFor: normalize(item.good_for),
        desireMode: item.desire_mode as 'specific' | 'flexible' | 'surprise',
        desireText: normalize(item.desire_text),
        wantedTags: (tags ?? [])
          .map((entry) => normalize(entry.tag))
          .filter((tag): tag is string => Boolean(tag)),
      };
    },

    async updateListingCore(input) {
      const { data: item, error: itemLookupError } = await supabase
        .from('items')
        .select('id,status,city,area')
        .eq('id', input.itemId)
        .eq('owner_id', input.ownerId)
        .maybeSingle();

      if (itemLookupError) {
        return {
          ok: false,
          reason: 'unknown',
          message: itemLookupError.message,
          cause: itemLookupError,
        };
      }
      if (!item) {
        return {
          ok: false,
          reason: 'not_found_or_unauthorized',
          message: 'Listing not found.',
        };
      }
      if (item.status !== 'active' && item.status !== 'archived') {
        return {
          ok: false,
          reason: 'not_editable',
          message: 'Listing status is not editable.',
        };
      }

      const normalize = (value: string | null) => {
        const text = value?.trim();
        return text ? text : null;
      };
      const normalizedCity = normalize(input.city);
      const normalizedArea = normalize(input.area);
      const currentCity = normalize((item.city as string | null) ?? null);
      const currentArea = normalize((item.area as string | null) ?? null);
      const locationChanged =
        normalizedCity !== currentCity || normalizedArea !== currentArea;

      const { error: updateError } = await supabase
        .from('items')
        .update({
          title: input.title,
          category_id: input.categoryId,
          city: normalizedCity,
          area: normalizedArea,
          condition: input.condition,
          condition_notes: normalize(input.conditionNotes),
          description: normalize(input.description),
          item_story: normalize(input.itemStory),
          swap_reason: normalize(input.swapReason),
          good_for: normalize(input.goodFor),
          desire_mode: input.desireMode,
          desire_text: normalize(input.desireText),
          ...(locationChanged
            ? { location_latitude: null, location_longitude: null }
            : {}),
        })
        .eq('id', input.itemId)
        .eq('owner_id', input.ownerId);

      if (updateError) {
        return {
          ok: false,
          reason: 'item_update_failed',
          message: updateError.message,
          cause: updateError,
        };
      }

      const { error: deleteTagsError } = await supabase
        .from('item_wanted_tags')
        .delete()
        .eq('item_id', input.itemId);

      if (deleteTagsError) {
        return {
          ok: false,
          reason: 'tags_update_failed',
          message: deleteTagsError.message,
          cause: deleteTagsError,
        };
      }

      if (input.wantedTags.length) {
        const { error: insertTagsError } = await supabase
          .from('item_wanted_tags')
          .insert(input.wantedTags.map((tag) => ({ item_id: input.itemId, tag })));
        if (insertTagsError) {
          return {
            ok: false,
            reason: 'tags_update_failed',
            message: insertTagsError.message,
            cause: insertTagsError,
          };
        }
      }

      return { ok: true, data: undefined };
    },
  };
}
