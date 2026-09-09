import type {
  CityPulseActiveStoryAuthorRecord,
  CityPulseMovingItemRecord,
  CityPulsePersonRecord,
  CityPulseStoryItemRecord,
  DiscoveryContract,
} from '@/lib/backend/contracts/discovery';
import { supabase } from '@/lib/supabase/client';

type ItemRow = {
  id: string;
  title: string | null;
  city: string | null;
  area: string | null;
  condition: string | null;
  owner_id: string | null;
  category_id: string | null;
  item_story?: string | null;
  swap_reason?: string | null;
  good_for?: string | null;
  created_at?: string | null;
};

const clean = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
};

const toSafeLikeTerm = (term: string) =>
  term.replace(/[%(),]/g, ' ').replace(/\s+/g, ' ').trim();

function buildLocationOrFilter(terms: string[]) {
  const clauses: string[] = [];
  for (const term of terms.map(toSafeLikeTerm).filter(Boolean)) {
    clauses.push(`city.ilike.%${term}%`, `area.ilike.%${term}%`);
  }
  return clauses.join(',');
}

async function fetchMovingItems(
  matchTerms: string[],
  limit: number,
): Promise<CityPulseMovingItemRecord[]> {
  const { data: rpcRows, error: rpcError } = await supabase.rpc(
    'get_public_city_pulse_moving_items',
    { p_match_terms: matchTerms, p_limit: limit },
  );
  if (rpcError) throw rpcError;

  const rows = (rpcRows ?? []) as Array<{
    item_id: string;
    open_interest_count: number | string | null;
    latest_interest_at: string | null;
  }>;
  if (!rows.length) return [];

  const itemIds = rows.map((row) => row.item_id);
  const { data: items, error: itemsError } = await supabase
    .from('items')
    .select('id,title,city,area,condition,owner_id,category_id')
    .in('id', itemIds)
    .eq('status', 'active');
  if (itemsError) throw itemsError;

  const valid = (items ?? []) as ItemRow[];
  const categoryIds = Array.from(
    new Set(
      valid
        .map((item) => item.category_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const ownerIds = Array.from(
    new Set(
      valid
        .map((item) => item.owner_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const [imagesRes, categoriesRes, profilesRes] = await Promise.all([
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
  ]);

  if (imagesRes.error) throw imagesRes.error;
  if (categoriesRes.error) throw categoriesRes.error;
  if (profilesRes.error) throw profilesRes.error;

  const itemMap = new Map(valid.map((item) => [item.id, item]));
  const categoryMap = new Map(
    (categoriesRes.data ?? []).map((category) => [
      category.id as string,
      clean(category.name_ar),
    ]),
  );
  const ownerMap = new Map(
    (profilesRes.data ?? []).map((profile) => [
      profile.id as string,
      clean(profile.display_name),
    ]),
  );

  const imageMap = new Map<string, string | null>();
  for (const itemId of itemIds) {
    const images = (imagesRes.data ?? [])
      .filter((image) => image.item_id === itemId)
      .sort(
        (a, b) =>
          Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary))
          || (a.sort_order ?? 9999) - (b.sort_order ?? 9999),
      );
    imageMap.set(itemId, clean(images[0]?.image_url));
  }

  return rows.flatMap((row) => {
    const item = itemMap.get(row.item_id);
    if (!item) return [];

    return [{
      id: item.id,
      title: clean(item.title) ?? 'عنصر بدون عنوان',
      imageUrl: imageMap.get(item.id) ?? null,
      category: item.category_id
        ? categoryMap.get(item.category_id) ?? null
        : null,
      condition: clean(item.condition),
      city: clean(item.city),
      area: clean(item.area),
      ownerDisplayName: item.owner_id
        ? ownerMap.get(item.owner_id) ?? null
        : null,
      openInterestCount: Number(row.open_interest_count ?? 0),
      latestInterestAt: row.latest_interest_at ?? null,
    }];
  });
}

async function fetchStoryItems(
  matchTerms: string[],
  limit: number,
): Promise<CityPulseStoryItemRecord[]> {
  const rawLimit = limit * 2;
  let query = supabase
    .from('items')
    .select('id,title,category_id,city,area,condition,owner_id,item_story,swap_reason,good_for,created_at,status')
    .eq('status', 'active')
    .or('item_story.not.is.null,swap_reason.not.is.null,good_for.not.is.null')
    .order('created_at', { ascending: false })
    .limit(rawLimit);

  const locationFilter = buildLocationOrFilter(matchTerms);
  if (locationFilter) query = query.or(locationFilter);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as ItemRow[];
  const normalized = rows
    .map((row) => {
      const itemStory = clean(row.item_story);
      const swapReason = clean(row.swap_reason);
      const goodFor = clean(row.good_for);
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
      if (goodFor) {
        return {
          row,
          storyLabel: 'مفيد لمين' as const,
          storySnippet: goodFor,
        };
      }
      return null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (!normalized.length) return [];

  const itemIds = normalized.map((entry) => entry.row.id);
  const categoryIds = Array.from(
    new Set(
      normalized
        .map((entry) => entry.row.category_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const ownerIds = Array.from(
    new Set(
      normalized
        .map((entry) => entry.row.owner_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const [imagesRes, categoriesRes, profilesRes] = await Promise.all([
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
  ]);

  if (imagesRes.error) throw imagesRes.error;
  if (categoriesRes.error) throw categoriesRes.error;
  if (profilesRes.error) throw profilesRes.error;

  const visibleOwnerIds = new Set(
    (profilesRes.data ?? []).map((profile) => profile.id as string),
  );
  const ownerMap = new Map(
    (profilesRes.data ?? []).map((profile) => [
      profile.id as string,
      clean(profile.display_name),
    ]),
  );
  const categoryMap = new Map(
    (categoriesRes.data ?? []).map((category) => [
      category.id as string,
      clean(category.name_ar),
    ]),
  );

  return normalized
    .filter(
      (entry) =>
        !entry.row.owner_id || visibleOwnerIds.has(entry.row.owner_id),
    )
    .slice(0, limit)
    .map((entry) => {
      const row = entry.row;
      const images = (imagesRes.data ?? [])
        .filter((image) => image.item_id === row.id)
        .sort(
          (a, b) =>
            Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary))
            || (a.sort_order ?? 9999) - (b.sort_order ?? 9999),
        );

      return {
        id: row.id,
        title: clean(row.title) ?? 'عنصر بدون عنوان',
        imageUrl: clean(images[0]?.image_url),
        category: row.category_id
          ? categoryMap.get(row.category_id) ?? null
          : null,
        city: clean(row.city),
        area: clean(row.area),
        ownerId: row.owner_id ?? null,
        ownerDisplayName: row.owner_id
          ? ownerMap.get(row.owner_id) ?? null
          : null,
        storyLabel: entry.storyLabel,
        storySnippet: entry.storySnippet,
        createdAt: row.created_at ?? null,
      };
    });
}

async function fetchPeople(
  matchTerms: string[],
  limit: number,
): Promise<CityPulsePersonRecord[]> {
  let query = supabase
    .from('profiles')
    .select('id,display_name,username,avatar_url,profile_tagline,city,area,successful_swaps_count,created_at')
    .not('username', 'is', null)
    .order('successful_swaps_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  const locationFilter = buildLocationOrFilter(matchTerms);
  if (locationFilter) query = query.or(locationFilter);

  const { data, error } = await query;
  if (error) throw error;

  const profiles = data ?? [];
  if (!profiles.length) return [];

  const ids = profiles.map((profile) => profile.id as string);
  const { data: items, error: itemsError } = await supabase
    .from('items')
    .select('owner_id,id')
    .eq('status', 'active')
    .in('owner_id', ids);
  if (itemsError) throw itemsError;

  const counts = new Map<string, number>();
  for (const item of items ?? []) {
    const ownerId = item.owner_id as string | null;
    if (!ownerId) continue;
    counts.set(ownerId, (counts.get(ownerId) ?? 0) + 1);
  }

  return profiles.map((profile) => ({
    id: profile.id as string,
    displayName:
      clean(profile.display_name) ?? clean(profile.username) ?? 'مستخدم',
    username: clean(profile.username) ?? '',
    avatarUrl: clean(profile.avatar_url),
    city: clean(profile.city),
    area: clean(profile.area),
    profileTagline: clean(profile.profile_tagline),
    activeItemsCount: counts.get(profile.id as string) ?? 0,
  }));
}

async function fetchActiveStoryAuthors(
  matchTerms: string[],
  limit: number,
): Promise<CityPulseActiveStoryAuthorRecord[]> {
  let query = supabase
    .from('profiles')
    .select('id,display_name,username,avatar_url,city,area')
    .order('created_at', { ascending: false })
    .limit(40);

  const locationFilter = buildLocationOrFilter(matchTerms);
  if (locationFilter) query = query.or(locationFilter);

  const { data: profiles, error } = await query;
  if (error) throw error;

  const nearbyProfiles = profiles ?? [];
  if (!nearbyProfiles.length) return [];

  const profileMap = new Map(
    nearbyProfiles.map((profile) => [profile.id as string, profile]),
  );
  const ids = nearbyProfiles.map((profile) => profile.id as string);

  const { data: stories, error: storiesError } = await supabase
    .from('stories')
    .select('user_id,created_at,expires_at')
    .in('user_id', ids)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (storiesError) throw storiesError;

  const grouped = new Map<
    string,
    { storiesCount: number; latestCreatedAt: string }
  >();

  for (const story of stories ?? []) {
    const userId = story.user_id as string | null;
    const createdAt = story.created_at as string | null;
    if (!userId || !createdAt) continue;

    const current = grouped.get(userId);
    if (!current) {
      grouped.set(userId, { storiesCount: 1, latestCreatedAt: createdAt });
    } else {
      current.storiesCount += 1;
      if (Date.parse(createdAt) > Date.parse(current.latestCreatedAt)) {
        current.latestCreatedAt = createdAt;
      }
    }
  }

  return Array.from(grouped.entries())
    .map(([id, value]) => {
      const profile = profileMap.get(id);
      return {
        author: {
          id,
          displayName: clean(profile?.display_name),
          username: clean(profile?.username),
          avatarUrl: clean(profile?.avatar_url),
        },
        storiesCount: value.storiesCount,
        latestCreatedAt: value.latestCreatedAt,
      };
    })
    .sort(
      (a, b) => Date.parse(b.latestCreatedAt) - Date.parse(a.latestCreatedAt),
    )
    .slice(0, limit);
}

export function createSupabaseDiscoveryAdapter(): DiscoveryContract {
  return {
    async getCityPulse(input) {
      const [
        movingItems,
        storyItems,
        people,
        activeStoryAuthors,
      ] = await Promise.all([
        fetchMovingItems(input.matchTerms, input.movingItemsLimit),
        fetchStoryItems(input.matchTerms, input.storyItemsLimit),
        fetchPeople(input.matchTerms, input.peopleLimit),
        fetchActiveStoryAuthors(input.matchTerms, input.storyAuthorsLimit),
      ]);

      return {
        movingItems,
        storyItems,
        people,
        activeStoryAuthors,
      };
    },
  };
}
