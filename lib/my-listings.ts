import { supabase } from '@/lib/supabase/client';

export type MyListingStatus = 'active' | 'reserved' | 'swapped' | 'archived';

export type MyListingSummary = {
  id: string;
  title: string;
  imageUrl: string | null;
  category: string | null;
  condition: string | null;
  city: string | null;
  area: string | null;
  status: MyListingStatus;
  createdAt: string | null;
  openIncomingOffersCount: number;
};

type ItemRow = {
  id: string;
  title: string | null;
  category_id: string | null;
  condition: string | null;
  city: string | null;
  area: string | null;
  status: MyListingStatus;
  created_at: string | null;
};

type ItemImageRow = {
  item_id: string;
  image_url: string | null;
  is_primary: boolean | null;
  sort_order: number | null;
};

function normalizeNullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function pickBestImageUrl(rows: ItemImageRow[]): string | null {
  const sortedRows = rows
    .filter((row): row is ItemImageRow & { image_url: string } => Boolean(normalizeNullableText(row.image_url)))
    .sort((a, b) => {
      if (Boolean(a.is_primary) !== Boolean(b.is_primary)) return a.is_primary ? -1 : 1;

      const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;

      return a.image_url.localeCompare(b.image_url);
    });

  return sortedRows[0]?.image_url ?? null;
}

export async function fetchMyListings(userId: string): Promise<MyListingSummary[]> {
  const { data: itemsData, error: itemsError } = await supabase
    .from('items')
    .select('id, title, category_id, condition, city, area, status, created_at')
    .eq('owner_id', userId)
    .in('status', ['active', 'reserved', 'swapped', 'archived'])
    .order('created_at', { ascending: false });

  if (itemsError) throw itemsError;

  const items = (itemsData ?? []) as ItemRow[];
  if (!items.length) return [];

  const itemIds = items.map((item) => item.id);
  const categoryIds = Array.from(new Set(items.map((item) => item.category_id).filter((value): value is string => Boolean(value))));

  const [imagesResult, categoriesResult, offersResult] = await Promise.all([
    supabase.from('item_images').select('item_id, image_url, is_primary, sort_order').in('item_id', itemIds),
    categoryIds.length
      ? supabase.from('categories').select('id, name_ar').in('id', categoryIds)
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

  const imagesByItemId = new Map<string, ItemImageRow[]>();
  ((imagesResult.data ?? []) as ItemImageRow[]).forEach((row) => {
    const current = imagesByItemId.get(row.item_id) ?? [];
    current.push(row);
    imagesByItemId.set(row.item_id, current);
  });

  const categoryById = new Map<string, string | null>();
  ((categoriesResult.data ?? []) as { id: string; name_ar: string | null }[]).forEach((row) => {
    categoryById.set(row.id, normalizeNullableText(row.name_ar));
  });

  const offersCountByItemId = new Map<string, number>();
  ((offersResult.data ?? []) as { requested_item_id: string | null }[]).forEach((row) => {
    if (!row.requested_item_id) return;
    offersCountByItemId.set(row.requested_item_id, (offersCountByItemId.get(row.requested_item_id) ?? 0) + 1);
  });

  return items.map((item) => ({
    id: item.id,
    title: normalizeNullableText(item.title) ?? 'عنصر بدون عنوان',
    imageUrl: pickBestImageUrl(imagesByItemId.get(item.id) ?? []),
    category: item.category_id ? categoryById.get(item.category_id) ?? null : null,
    condition: normalizeNullableText(item.condition),
    city: normalizeNullableText(item.city),
    area: normalizeNullableText(item.area),
    status: item.status,
    createdAt: item.created_at,
    openIncomingOffersCount: offersCountByItemId.get(item.id) ?? 0,
  }));
}
