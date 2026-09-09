import { teswaBackendRuntime } from '@/lib/backend/runtime';

export async function fetchItemVideoPresenceMap(
  itemIds: string[],
): Promise<Map<string, boolean>> {
  const normalizedIds = Array.from(
    new Set(
      itemIds
        .map((itemId) => itemId?.trim())
        .filter((itemId): itemId is string => Boolean(itemId)),
    ),
  );

  if (!normalizedIds.length) return new Map();

  try {
    return await teswaBackendRuntime.marketplace.getItemVideoPresence(normalizedIds);
  } catch {
    return new Map();
  }
}
