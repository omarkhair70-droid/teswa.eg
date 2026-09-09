import { teswaBackendRuntime } from '@/lib/backend/runtime';

const DEFAULT_DISCOVERY_LIMIT = 8;

export type ItemVideoDiscoveryMoment = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  condition: string | null;
  location: string | null;
  ownerDisplayName: string | null;
  hasVideoTeaser: true;
  videoDurationMs: number | null;
  videoCreatedAt: string | null;
};

export async function fetchRecentItemVideoDiscoveryMoments(
  limit = DEFAULT_DISCOVERY_LIMIT,
): Promise<ItemVideoDiscoveryMoment[]> {
  const safeLimit =
    Number.isFinite(limit) && limit > 0
      ? Math.floor(limit)
      : DEFAULT_DISCOVERY_LIMIT;

  try {
    const rows = await teswaBackendRuntime.marketplace.listRecentItemVideoDiscovery(
      safeLimit,
    );
    return rows.map((row) => ({
      ...row,
      hasVideoTeaser: true as const,
    }));
  } catch {
    return [];
  }
}
