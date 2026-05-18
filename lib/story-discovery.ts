import { supabase } from '@/lib/supabase/client';

export type StoryDiscoveryItem = {
  id: string;
  title: string;
  imageUrl: string | null;
  category: string | null;
  city: string | null;
  area: string | null;
  ownerId: string | null;
  ownerDisplayName: string | null;
  storyLabel: 'حكاية العنصر' | 'ليه صاحبه بيبدله' | 'مفيد لمين';
  storySnippet: string;
  createdAt: string | null;
};

type ItemRow = {
  id: string;
  title: string | null;
  category_id: string | null;
  city: string | null;
  area: string | null;
  owner_id: string | null;
  item_story: string | null;
  swap_reason: string | null;
  good_for: string | null;
  created_at: string | null;
};

type ImageRow = { item_id: string; image_url: string | null; is_primary: boolean | null; sort_order: number | null };
type CategoryRow = { id: string; name_ar: string | null };
type ProfileRow = { id: string; display_name: string | null };

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function fetchStoryDiscoveryItems(input?: { limit?: number }): Promise<StoryDiscoveryItem[]> {
  const resolvedLimit = Math.min(24, Math.max(1, Math.floor(input?.limit ?? 12)));
  const rawLimit = Math.max(resolvedLimit, resolvedLimit * 2);

  const { data, error } = await supabase
    .from('items')
    .select('id,title,category_id,city,area,owner_id,item_story,swap_reason,good_for,created_at')
    .eq('status', 'active')
    .or('item_story.not.is.null,swap_reason.not.is.null,good_for.not.is.null')
    .order('created_at', { ascending: false })
    .limit(rawLimit);

  if (error) throw error;

  const normalizedRows = ((data ?? []) as ItemRow[])
    .map((row) => {
      const itemStory = cleanText(row.item_story);
      const swapReason = cleanText(row.swap_reason);
      const goodFor = cleanText(row.good_for);
      if (!itemStory && !swapReason && !goodFor) return null;

      if (itemStory) return { row, storyLabel: 'حكاية العنصر' as const, storySnippet: itemStory };
      if (swapReason) return { row, storyLabel: 'ليه صاحبه بيبدله' as const, storySnippet: swapReason };
      return { row, storyLabel: 'مفيد لمين' as const, storySnippet: goodFor as string };
    })
    .filter((entry): entry is { row: ItemRow; storyLabel: StoryDiscoveryItem['storyLabel']; storySnippet: string } => entry !== null);

  if (!normalizedRows.length) return [];

  const itemIds = normalizedRows.map(({ row }) => row.id);
  const categoryIds = Array.from(new Set(normalizedRows.map(({ row }) => row.category_id).filter((value): value is string => Boolean(value))));
  const ownerIds = Array.from(new Set(normalizedRows.map(({ row }) => row.owner_id).filter((value): value is string => Boolean(value))));

  const [imagesResult, categoriesResult, profilesResult] = await Promise.all([
    supabase.from('item_images').select('item_id,image_url,is_primary,sort_order').in('item_id', itemIds),
    categoryIds.length ? supabase.from('categories').select('id,name_ar').in('id', categoryIds) : Promise.resolve({ data: [] as CategoryRow[], error: null }),
    ownerIds.length ? supabase.from('profiles').select('id,display_name').in('id', ownerIds) : Promise.resolve({ data: [] as ProfileRow[], error: null }),
  ]);

  if (imagesResult.error) throw imagesResult.error;
  if (categoriesResult.error) throw categoriesResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const imagesByItemId = new Map<string, ImageRow[]>();
  for (const image of (imagesResult.data ?? []) as ImageRow[]) {
    const current = imagesByItemId.get(image.item_id) ?? [];
    current.push(image);
    imagesByItemId.set(image.item_id, current);
  }

  const categoryById = new Map<string, string | null>(((categoriesResult.data ?? []) as CategoryRow[]).map((category) => [category.id, cleanText(category.name_ar)]));
  const visibleProfiles = (profilesResult.data ?? []) as ProfileRow[];
  const visibleOwnerIds = new Set(visibleProfiles.map((profile) => profile.id));
  const ownerById = new Map<string, string | null>(visibleProfiles.map((profile) => [profile.id, cleanText(profile.display_name)]));

  const publiclyVisibleRows = normalizedRows.filter(({ row }) => !row.owner_id || visibleOwnerIds.has(row.owner_id));

  return publiclyVisibleRows.slice(0, resolvedLimit).map(({ row, storyLabel, storySnippet }) => {
    const itemImages = [...(imagesByItemId.get(row.id) ?? [])].sort((a, b) => {
      if (Boolean(b.is_primary) !== Boolean(a.is_primary)) return Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary));
      const sortA = a.sort_order ?? Number.MAX_SAFE_INTEGER;
      const sortB = b.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (sortA !== sortB) return sortA - sortB;
      return (a.image_url ?? '').localeCompare(b.image_url ?? '');
    });

    return {
      id: row.id,
      title: cleanText(row.title) ?? 'عنصر بدون عنوان',
      imageUrl: cleanText(itemImages[0]?.image_url ?? null),
      category: row.category_id ? (categoryById.get(row.category_id) ?? null) : null,
      city: cleanText(row.city),
      area: cleanText(row.area),
      ownerId: row.owner_id ?? null,
      ownerDisplayName: row.owner_id ? (ownerById.get(row.owner_id) ?? null) : null,
      storyLabel,
      storySnippet,
      createdAt: row.created_at ?? null,
    };
  });
}
