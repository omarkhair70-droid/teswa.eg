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

    async getEditableListingImagesContext(itemId, ownerId) {
      const { data: item, error } = await supabase
        .from('items')
        .select('id,title,status')
        .eq('id', itemId)
        .eq('owner_id', ownerId)
        .in('status', ['active', 'archived'])
        .maybeSingle();

      if (error) throw error;
      if (!item) return null;

      const { data: images, error: imagesError } = await supabase
        .from('item_images')
        .select('id,image_url,is_primary,sort_order,created_at')
        .eq('item_id', itemId);
      if (imagesError) throw imagesError;

      const normalized = (images ?? [])
        .map((entry) => ({
          id: entry.id as string,
          imageUrl: (entry.image_url as string | null)?.trim() || '',
          isPrimary: Boolean(entry.is_primary),
          sortOrder:
            typeof entry.sort_order === 'number'
              ? entry.sort_order
              : null,
          createdAt: (entry.created_at as string | null) ?? null,
        }))
        .filter((entry) => entry.imageUrl.length > 0)
        .sort((a, b) => {
          if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
          const aSort = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
          const bSort = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
          if (aSort !== bSort) return aSort - bSort;
          const aCreated = a.createdAt ?? '';
          const bCreated = b.createdAt ?? '';
          if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
          return a.imageUrl.localeCompare(b.imageUrl);
        });

      return {
        itemId: item.id as string,
        title:
          typeof item.title === 'string' && item.title.trim()
            ? item.title.trim()
            : 'عنصر بدون عنوان',
        status: item.status as 'active' | 'archived',
        images: normalized,
      };
    },

    async applyListingImagePlan(input) {
      const { data: item, error: itemError } = await supabase
        .from('items')
        .select('id,status')
        .eq('id', input.itemId)
        .eq('owner_id', input.ownerId)
        .maybeSingle();

      if (itemError) {
        return {
          ok: false,
          reason: 'unknown',
          message: itemError.message,
          cause: itemError,
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
          message: 'Listing is not editable.',
        };
      }

      const { data: currentRows, error: currentError } = await supabase
        .from('item_images')
        .select('id,image_url')
        .eq('item_id', input.itemId);

      if (currentError) {
        return {
          ok: false,
          reason: 'unknown',
          message: currentError.message,
          cause: currentError,
        };
      }

      const currentById = new Map(
        (currentRows ?? []).map((row) => [
          row.id as string,
          (row.image_url as string | null)?.trim() || '',
        ]),
      );
      const usedExisting = new Set<string>();

      for (const row of input.orderedRows) {
        if (row.kind !== 'existing') continue;
        const knownUrl = currentById.get(row.imageId);
        if (
          !row.imageId
          || !row.imageUrl
          || !knownUrl
          || knownUrl !== row.imageUrl
          || usedExisting.has(row.imageId)
        ) {
          return {
            ok: false,
            reason: 'invalid_input',
            message: 'Existing image plan is stale or invalid.',
          };
        }
        usedExisting.add(row.imageId);
      }

      const newRows = input.orderedRows
        .map((row, index) =>
          row.kind === 'new'
            ? {
                image_url: row.imageUrl,
                is_primary: index === 0,
                sort_order: index,
              }
            : null,
        )
        .filter((row): row is {
          image_url: string;
          is_primary: boolean;
          sort_order: number;
        } => Boolean(row));

      if (newRows.length) {
        const { error: insertError } = await supabase
          .from('item_images')
          .insert(
            newRows.map((row) => ({
              item_id: input.itemId,
              image_url: row.image_url,
              is_primary: row.is_primary,
              sort_order: row.sort_order,
            })),
          );

        if (insertError) {
          return {
            ok: false,
            reason: 'images_insert_failed',
            message: insertError.message,
            cause: insertError,
          };
        }
      }

      for (let i = 0; i < input.orderedRows.length; i += 1) {
        const row = input.orderedRows[i];
        const updateQuery = supabase
          .from('item_images')
          .update({ is_primary: i === 0, sort_order: i })
          .eq('item_id', input.itemId);

        const { error: updateError } = row.kind === 'existing'
          ? await updateQuery.eq('id', row.imageId)
          : await updateQuery.eq('image_url', row.imageUrl);

        if (updateError) {
          if (newRows.length) {
            await supabase
              .from('item_images')
              .delete()
              .eq('item_id', input.itemId)
              .in(
                'image_url',
                newRows.map((entry) => entry.image_url),
              );
          }
          return {
            ok: false,
            reason: 'images_metadata_update_failed',
            message: updateError.message,
            cause: updateError,
          };
        }
      }

      const removedExistingRows = (currentRows ?? []).filter(
        (row) => !usedExisting.has(row.id as string),
      );

      if (removedExistingRows.length) {
        const { error: deleteError } = await supabase
          .from('item_images')
          .delete()
          .eq('item_id', input.itemId)
          .in(
            'id',
            removedExistingRows.map((row) => row.id as string),
          );

        if (deleteError) {
          return {
            ok: false,
            reason: 'images_delete_failed',
            message: deleteError.message,
            cause: deleteError,
          };
        }
      }

      return {
        ok: true,
        data: {
          removedImageUrls: removedExistingRows
            .map((row) => (row.image_url as string | null)?.trim() || '')
            .filter(Boolean),
        },
      };
},

    async listActiveCategories() {
      const { data, error } = await supabase
        .from('categories')
        .select('id,name_ar')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id as string,
        nameAr: row.name_ar as string,
      }));
    },

    async createPublishedListingBase(input) {
      const { error: itemError } = await supabase
        .from('items')
        .insert({
          id: input.itemId,
          owner_id: input.ownerId,
          title: input.title,
          category_id: input.categoryId,
          description: input.description,
          condition: input.condition,
          condition_notes: input.conditionNotes,
          city: input.city,
          area: input.area,
          location_latitude: input.locationLatitude,
          location_longitude: input.locationLongitude,
          desire_mode: input.desireMode,
          desire_text: input.desireText,
          item_story: input.itemStory,
          swap_reason: input.swapReason,
          good_for: input.goodFor,
          status: 'active',
          source: 'direct_listing',
        });

      if (itemError) {
        return {
          ok: false,
          reason: 'item_insert_failed',
          message: itemError.message,
          cause: itemError,
        };
      }

      const { error: imagesError } = await supabase
        .from('item_images')
        .insert(
          input.images.map((image) => ({
            item_id: input.itemId,
            image_url: image.imageUrl,
            is_primary: image.isPrimary,
            sort_order: image.sortOrder,
          })),
        );

      if (imagesError) {
        await supabase
          .from('items')
          .update({ status: 'archived' })
          .eq('id', input.itemId)
          .eq('owner_id', input.ownerId);

        return {
          ok: false,
          reason: 'images_insert_failed',
          message: imagesError.message,
          cause: imagesError,
        };
      }

      return { ok: true, data: undefined };
    },

    async markPublishFailed(itemId, ownerId) {
      const { error } = await supabase
        .from('items')
        .update({ status: 'archived' })
        .eq('id', itemId)
        .eq('owner_id', ownerId);

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }
      return { ok: true, data: undefined };
    },

    async attachPublishedVideo(input) {
      const { error } = await supabase
        .from('item_videos')
        .insert({
          item_id: input.itemId,
          video_storage_path: input.videoStoragePath,
          duration_ms: input.durationMs,
          width: input.width,
          height: input.height,
        });

      if (error) {
        return {
          ok: false,
          reason: 'video_insert_failed',
          message: error.message,
          cause: error,
        };
      }
      return { ok: true, data: undefined };
    },

    async addPublishedWantedTags(itemId, tags) {
      if (!tags.length) return { ok: true, data: undefined };
      const { error } = await supabase
        .from('item_wanted_tags')
        .insert(tags.map((tag) => ({ item_id: itemId, tag })));

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }
      return { ok: true, data: undefined };
    },

    async deletePublishedImageMetadata(itemId) {
      const { error } = await supabase
        .from('item_images')
        .delete()
        .eq('item_id', itemId);

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }
      return { ok: true, data: undefined };
    },

    async getItemVideoMetadata(itemId) {
      const { data, error } = await supabase
        .from('item_videos')
        .select('id,item_id,video_storage_path,duration_ms,width,height,created_at')
        .eq('item_id', itemId)
        .maybeSingle();

      if (error) throw error;
      if (!data?.video_storage_path) return null;

      return {
        id: data.id as string,
        itemId: data.item_id as string,
        videoStoragePath: data.video_storage_path as string,
        durationMs: (data.duration_ms as number | null) ?? null,
        width: (data.width as number | null) ?? null,
        height: (data.height as number | null) ?? null,
        createdAt: data.created_at as string,
      };
    },

    async getExchangeItemSummaries(itemIds) {
      const uniqueIds = [...new Set(itemIds.filter(Boolean))];
      if (!uniqueIds.length) return [];

      const { data: items, error: itemsError } = await supabase
        .from('items')
        .select('id,title,category_id,owner_id,condition,city,status')
        .in('id', uniqueIds)
        .in('status', ['active', 'reserved', 'swapped']);
      if (itemsError) throw itemsError;

      const rows = items ?? [];
      if (!rows.length) return [];

      const categoryIds = [...new Set(
        rows
          .map((row) => row.category_id as string | null)
          .filter((value): value is string => Boolean(value)),
      )];
      const ownerIds = [...new Set(
        rows
          .map((row) => row.owner_id as string | null)
          .filter((value): value is string => Boolean(value)),
      )];

      const [imagesResult, categoriesResult, profilesResult] = await Promise.all([
        supabase
          .from('item_images')
          .select('item_id,image_url,is_primary,sort_order')
          .in('item_id', uniqueIds),
        categoryIds.length
          ? supabase.from('categories').select('id,name_ar').in('id', categoryIds)
          : Promise.resolve({ data: [], error: null }),
        ownerIds.length
          ? supabase.from('profiles').select('id,display_name').in('id', ownerIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (imagesResult.error) throw imagesResult.error;
      if (categoriesResult.error) throw categoriesResult.error;
      if (profilesResult.error) throw profilesResult.error;

      const groupedImages = new Map<string, any[]>();
      for (const image of imagesResult.data ?? []) {
        const itemId = image.item_id as string;
        const current = groupedImages.get(itemId) ?? [];
        current.push(image);
        groupedImages.set(itemId, current);
      }

      const imageByItemId = new Map<string, string | null>();
      for (const [itemId, list] of groupedImages.entries()) {
        const chosen = [...list].sort((a, b) => {
          const primaryA = a.is_primary ? 0 : 1;
          const primaryB = b.is_primary ? 0 : 1;
          if (primaryA !== primaryB) return primaryA - primaryB;
          return (a.sort_order ?? Number.MAX_SAFE_INTEGER)
            - (b.sort_order ?? Number.MAX_SAFE_INTEGER);
        })[0];
        imageByItemId.set(
          itemId,
          (chosen?.image_url as string | null) ?? null,
        );
      }

      const categoryById = new Map(
        (categoriesResult.data ?? []).map((row) => [
          row.id as string,
          (row.name_ar as string | null) ?? null,
        ]),
      );
      const profileById = new Map(
        (profilesResult.data ?? []).map((row) => [
          row.id as string,
          (row.display_name as string | null) ?? null,
        ]),
      );

      const mapped = new Map(
        rows.map((row) => [
          row.id as string,
          {
            id: row.id as string,
            title:
              typeof row.title === 'string' && row.title.trim()
                ? row.title.trim()
                : 'عنصر بدون عنوان',
            imageUrl: imageByItemId.get(row.id as string) ?? null,
            category: row.category_id
              ? categoryById.get(row.category_id as string) ?? null
              : null,
            condition: (row.condition as string | null) ?? null,
            location: (row.city as string | null) ?? null,
            ownerDisplayName:
              profileById.get(row.owner_id as string) ?? null,
            status: row.status as string,
          },
        ]),
      );

      return uniqueIds
        .map((id) => mapped.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
    },

    async getItemVideoPresence(itemIds) {
      const normalizedIds = Array.from(
        new Set(itemIds.map((id) => id.trim()).filter(Boolean)),
      );
      if (!normalizedIds.length) return new Map();

      const { data, error } = await supabase
        .from('item_videos')
        .select('item_id')
        .in('item_id', normalizedIds);
      if (error) throw error;

      return new Map(
        (data ?? [])
          .map((row) => (row.item_id as string | null)?.trim())
          .filter((id): id is string => Boolean(id))
          .map((id): [string, boolean] => [id, true]),
      );
    },

    async listRecentItemVideoDiscovery(limit) {
      const { data: videoRowsData, error: videosError } = await supabase
        .from('item_videos')
        .select('item_id,duration_ms,created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (videosError) throw videosError;

      const videoRows = (videoRowsData ?? []).filter(
        (row) => Boolean((row.item_id as string | null)?.trim()),
      );
      if (!videoRows.length) return [];

      const orderedUniqueItemIds = Array.from(
        new Set(videoRows.map((row) => (row.item_id as string).trim())),
      );

      const { data: itemRowsData, error: itemsError } = await supabase
        .from('marketplace_items')
        .select('id,title,description,cover_image_url,category,item_condition,city,owner_display_name')
        .in('id', orderedUniqueItemIds);
      if (itemsError) throw itemsError;

      const itemsById = new Map(
        (itemRowsData ?? []).map((row) => [row.id as string, row]),
      );

      return videoRows.flatMap((row) => {
        const item = itemsById.get((row.item_id as string).trim());
        if (!item) return [];
        return [{
          id: item.id as string,
          title:
            typeof item.title === 'string' && item.title.trim()
              ? item.title.trim()
              : 'عنصر بدون عنوان',
          description: (item.description as string | null) ?? null,
          imageUrl: (item.cover_image_url as string | null) ?? null,
          category: (item.category as string | null) ?? null,
          condition: (item.item_condition as string | null) ?? null,
          location: (item.city as string | null) ?? null,
          ownerDisplayName:
            (item.owner_display_name as string | null) ?? null,
          videoDurationMs: (row.duration_ms as number | null) ?? null,
          videoCreatedAt: (row.created_at as string | null) ?? null,
        }];
      });
    },

    async listMovingItems(limit) {
      const { data: rankedRows, error: rankedError } = await supabase.rpc(
        'get_public_moving_items',
        { p_limit: limit },
      );
      if (rankedError) throw rankedError;

      const rows = rankedRows ?? [];
      if (!rows.length) return [];

      const itemIds = rows.map((row: any) => row.item_id as string);
      const [marketplaceResult, videoPresence] = await Promise.all([
        supabase
          .from('marketplace_items')
          .select('id,title,cover_image_url,category,item_condition,city,owner_display_name')
          .in('id', itemIds),
        (async () => {
          const { data, error } = await supabase
            .from('item_videos')
            .select('item_id')
            .in('item_id', itemIds);
          if (error) throw error;
          return new Set(
            (data ?? [])
              .map((row) => row.item_id as string | null)
              .filter((id): id is string => Boolean(id)),
          );
        })(),
      ]);
      if (marketplaceResult.error) throw marketplaceResult.error;

      const itemMap = new Map(
        (marketplaceResult.data ?? []).map((item) => [
          item.id as string,
          item,
        ]),
      );

      return rows.flatMap((row: any) => {
        const item = itemMap.get(row.item_id as string);
        if (!item) return [];
        return [{
          id: item.id as string,
          title:
            typeof item.title === 'string' && item.title.trim()
              ? item.title.trim()
              : 'عنصر بدون عنوان',
          imageUrl: (item.cover_image_url as string | null) ?? null,
          category: (item.category as string | null) ?? null,
          condition: (item.item_condition as string | null) ?? null,
          location: (item.city as string | null) ?? null,
          ownerDisplayName:
            (item.owner_display_name as string | null) ?? null,
          openInterestCount: Number(row.open_interest_count ?? 0),
          latestInterestAt:
            (row.latest_interest_at as string | null) ?? null,
          hasVideoTeaser: videoPresence.has(item.id as string),
        }];
      });
    },

    async listPulseItemTeasers(limit) {
      const { data: rowsData, error } = await supabase
        .from('item_videos')
        .select('id,item_id,video_storage_path,duration_ms,created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;

      const rows = rowsData ?? [];
      if (!rows.length) return [];

      const itemIds = Array.from(
        new Set(
          rows
            .map((row) => row.item_id as string | null)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const { data: items, error: itemsError } = await supabase
        .from('marketplace_items')
        .select('id,title,description,cover_image_url,category,item_condition,city,owner_display_name')
        .in('id', itemIds);
      if (itemsError) throw itemsError;

      const itemsById = new Map(
        (items ?? []).map((item) => [item.id as string, item]),
      );

      return rows.flatMap((row) => {
        const storagePath =
          (row.video_storage_path as string | null)?.trim() || '';
        if (!storagePath) return [];
        const item = itemsById.get(row.item_id as string);
        if (!item) return [];

        return [{
          id: row.id as string,
          createdAt: row.created_at as string,
          videoStoragePath: storagePath,
          durationMs: (row.duration_ms as number | null) ?? null,
          itemId: item.id as string,
          title:
            typeof item.title === 'string' && item.title.trim()
              ? item.title.trim()
              : 'عنصر بدون عنوان',
          description: (item.description as string | null) ?? null,
          imageUrl: (item.cover_image_url as string | null) ?? null,
          category: (item.category as string | null) ?? null,
          condition: (item.item_condition as string | null) ?? null,
          location: (item.city as string | null) ?? null,
          ownerDisplayName:
            (item.owner_display_name as string | null) ?? null,
        }];
      });
    },

    async countMarketplaceItemsSince(sinceIso) {
      const { count, error } = await supabase
        .from('marketplace_items')
        .select('id', { head: true, count: 'exact' })
        .gt('created_at', sinceIso);
      if (error) throw error;
      return count ?? 0;
},

    async listItemStoryDiscovery(limit) {
      const resolvedLimit = Math.min(24, Math.max(1, Math.floor(limit)));
      const rawLimit = Math.max(resolvedLimit, resolvedLimit * 2);

      const { data, error } = await supabase
        .from('items')
        .select('id,title,category_id,city,area,owner_id,item_story,swap_reason,good_for,created_at')
        .eq('status', 'active')
        .or('item_story.not.is.null,swap_reason.not.is.null,good_for.not.is.null')
        .order('created_at', { ascending: false })
        .limit(rawLimit);
      if (error) throw error;

      const clean = (value: unknown) => {
        const text = typeof value === 'string' ? value.trim() : '';
        return text || null;
      };

      const normalizedRows = (data ?? [])
        .map((row) => {
          const itemStory = clean(row.item_story);
          const swapReason = clean(row.swap_reason);
          const goodFor = clean(row.good_for);
          if (!itemStory && !swapReason && !goodFor) return null;
          if (itemStory) {
            return {
              row,
              storyLabel: 'حكاية العنصر' as const,
              storySnippet: itemStory,
            };
          }
          if (swapReason) {
            return {
              row,
              storyLabel: 'ليه صاحبه بيبدله' as const,
              storySnippet: swapReason,
            };
          }
          return {
            row,
            storyLabel: 'مفيد لمين' as const,
            storySnippet: goodFor as string,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

      if (!normalizedRows.length) return [];

      const itemIds = normalizedRows.map(({ row }) => row.id as string);
      const categoryIds = Array.from(
        new Set(
          normalizedRows
            .map(({ row }) => row.category_id as string | null)
            .filter((value): value is string => Boolean(value)),
        ),
      );
      const ownerIds = Array.from(
        new Set(
          normalizedRows
            .map(({ row }) => row.owner_id as string | null)
            .filter((value): value is string => Boolean(value)),
        ),
      );

      const [imagesResult, categoriesResult, profilesResult, videosResult] =
        await Promise.all([
          supabase
            .from('item_images')
            .select('item_id,image_url,is_primary,sort_order')
            .in('item_id', itemIds),
          categoryIds.length
            ? supabase.from('categories').select('id,name_ar').in('id', categoryIds)
            : Promise.resolve({ data: [], error: null }),
          ownerIds.length
            ? supabase.from('profiles').select('id,display_name').in('id', ownerIds)
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from('item_videos')
            .select('item_id')
            .in('item_id', itemIds),
        ]);

      if (imagesResult.error) throw imagesResult.error;
      if (categoriesResult.error) throw categoriesResult.error;
      if (profilesResult.error) throw profilesResult.error;
      if (videosResult.error) throw videosResult.error;

      const imagesByItemId = new Map<string, any[]>();
      for (const image of imagesResult.data ?? []) {
        const itemId = image.item_id as string;
        const current = imagesByItemId.get(itemId) ?? [];
        current.push(image);
        imagesByItemId.set(itemId, current);
      }

      const categoryById = new Map(
        (categoriesResult.data ?? []).map((category) => [
          category.id as string,
          clean(category.name_ar),
        ]),
      );
      const visibleOwnerIds = new Set(
        (profilesResult.data ?? []).map((profile) => profile.id as string),
      );
      const ownerById = new Map(
        (profilesResult.data ?? []).map((profile) => [
          profile.id as string,
          clean(profile.display_name),
        ]),
      );
      const videoItemIds = new Set(
        (videosResult.data ?? [])
          .map((row) => row.item_id as string | null)
          .filter((id): id is string => Boolean(id)),
      );

      return normalizedRows
        .filter(({ row }) => {
          const ownerId = row.owner_id as string | null;
          return !ownerId || visibleOwnerIds.has(ownerId);
        })
        .slice(0, resolvedLimit)
        .map(({ row, storyLabel, storySnippet }) => {
          const itemId = row.id as string;
          const itemImages = [...(imagesByItemId.get(itemId) ?? [])].sort(
            (a, b) => {
              if (Boolean(b.is_primary) !== Boolean(a.is_primary)) {
                return Number(Boolean(b.is_primary))
                  - Number(Boolean(a.is_primary));
              }
              const sortA = a.sort_order ?? Number.MAX_SAFE_INTEGER;
              const sortB = b.sort_order ?? Number.MAX_SAFE_INTEGER;
              if (sortA !== sortB) return sortA - sortB;
              return String(a.image_url ?? '').localeCompare(
                String(b.image_url ?? ''),
              );
            },
          );
          const ownerId = (row.owner_id as string | null) ?? null;

          return {
            id: itemId,
            title: clean(row.title) ?? 'عنصر بدون عنوان',
            imageUrl: clean(itemImages[0]?.image_url),
            category: row.category_id
              ? categoryById.get(row.category_id as string) ?? null
              : null,
            city: clean(row.city),
            area: clean(row.area),
            ownerId,
            ownerDisplayName: ownerId
              ? ownerById.get(ownerId) ?? null
              : null,
            storyLabel,
            storySnippet,
            createdAt: (row.created_at as string | null) ?? null,
            hasVideoTeaser: videoItemIds.has(itemId),
          };
        });
,
  };
}
