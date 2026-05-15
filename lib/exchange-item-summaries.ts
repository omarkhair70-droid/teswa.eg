import { supabase } from '@/lib/supabase/client';

export type ExchangeItemSummary = {
  id: string;
  title: string;
  imageUrl: string | null;
  category: string | null;
  condition: string | null;
  location: string | null;
  ownerDisplayName: string | null;
  status: string;
};

type ItemRow = {
  id: string;
  title: string | null;
  category_id: string | null;
  owner_id: string;
  condition: string | null;
  city: string | null;
  status: string;
};

export async function fetchExchangeItemSummariesByIds(itemIds: string[]): Promise<ExchangeItemSummary[]> {
  const uniqueIds = [...new Set(itemIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const { data: items, error: itemsError } = await supabase
    .from('items')
    .select('id,title,category_id,owner_id,condition,city,status')
    .in('id', uniqueIds)
    .in('status', ['active', 'reserved', 'swapped']);

  if (itemsError) throw itemsError;
  const rows = (items ?? []) as ItemRow[];
  if (rows.length === 0) return [];

  const categoryIds = [...new Set(rows.map((row) => row.category_id).filter((v): v is string => Boolean(v)))];
  const ownerIds = [...new Set(rows.map((row) => row.owner_id).filter(Boolean))];

  const [{ data: images, error: imagesError }, { data: categories, error: categoriesError }, { data: profiles, error: profilesError }] = await Promise.all([
    supabase.from('item_images').select('item_id,image_url,is_primary,sort_order').in('item_id', uniqueIds),
    categoryIds.length ? supabase.from('categories').select('id,name_ar').in('id', categoryIds) : Promise.resolve({ data: [], error: null }),
    ownerIds.length ? supabase.from('profiles').select('id,display_name').in('id', ownerIds) : Promise.resolve({ data: [], error: null }),
  ]);

  if (imagesError) throw imagesError;
  if (categoriesError) throw categoriesError;
  if (profilesError) throw profilesError;

  const imageByItemId = new Map<string, string | null>();
  const groupedImages = new Map<string, Array<{ image_url: string; is_primary: boolean | null; sort_order: number | null }>>();

  for (const img of images ?? []) {
    const itemId = img.item_id as string;
    const list = groupedImages.get(itemId) ?? [];
    list.push({ image_url: img.image_url as string, is_primary: (img.is_primary as boolean | null) ?? false, sort_order: (img.sort_order as number | null) ?? null });
    groupedImages.set(itemId, list);
  }

  for (const [itemId, list] of groupedImages.entries()) {
    const chosen = [...list].sort((a, b) => {
      const pA = a.is_primary ? 0 : 1;
      const pB = b.is_primary ? 0 : 1;
      if (pA !== pB) return pA - pB;
      return (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER);
    })[0];
    imageByItemId.set(itemId, chosen?.image_url ?? null);
  }

  const categoryById = new Map((categories ?? []).map((cat) => [cat.id as string, (cat.name_ar as string | null) ?? null]));
  const profileById = new Map((profiles ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? null]));

  const mapped = new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        title: row.title?.trim() || 'عنصر بدون عنوان',
        imageUrl: imageByItemId.get(row.id) ?? null,
        category: row.category_id ? categoryById.get(row.category_id) ?? null : null,
        condition: row.condition,
        location: row.city,
        ownerDisplayName: profileById.get(row.owner_id) ?? null,
        status: row.status,
      } satisfies ExchangeItemSummary,
    ]),
  );

  return uniqueIds.map((id) => mapped.get(id)).filter((row): row is ExchangeItemSummary => Boolean(row));
}
