import { supabase } from '@/lib/supabase/client';

type ItemVideoPresenceRow = {
  item_id: string | null;
};

export async function fetchItemVideoPresenceMap(itemIds: string[]): Promise<Map<string, boolean>> {
  const normalizedIds = Array.from(
    new Set(
      itemIds
        .map((itemId) => itemId?.trim())
        .filter((itemId): itemId is string => Boolean(itemId)),
    ),
  );

  if (normalizedIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('item_videos')
    .select('item_id')
    .in('item_id', normalizedIds);

  if (error) {
    return new Map();
  }

  return new Map(
    ((data ?? []) as ItemVideoPresenceRow[])
      .map((row) => row.item_id?.trim())
      .filter((itemId): itemId is string => Boolean(itemId))
      .map((itemId): [string, boolean] => [itemId, true]),
  );
}
