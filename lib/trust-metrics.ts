import { supabase } from '@/lib/supabase/client';

export type TrustLevelKey = 'new_swapper' | 'rising_swapper' | 'reliable_swapper' | 'trusted_swapper';

export type UserTrustMetrics = {
  userId: string;
  successfulSwapsCount: number;
  completedDealsCount: number;
  cancelledDealsCount: number;
  totalReviewsReceived: number;
  averageRating: number | null;
  clearDescriptionCount: number;
  goodCommunicationCount: number;
  onTimeCount: number;
  respectfulSwapperCount: number;
  responseRate: number | null;
  avgResponseTimeMinutes: number | null;
  trustLevelKey: TrustLevelKey;
  trustScore: number;
};

type TrustMetricsRow = {
  user_id: string;
  successful_swaps_count: number | null;
  completed_deals_count: number | null;
  cancelled_deals_count: number | null;
  total_reviews_received: number | null;
  average_rating: number | null;
  clear_description_count: number | null;
  good_communication_count: number | null;
  on_time_count: number | null;
  respectful_swapper_count: number | null;
  response_rate: number | null;
  avg_response_time_minutes: number | null;
  trust_level_key: TrustLevelKey | string | null;
  trust_score: number | null;
};

function normalizeTrustLevelKey(value: string | null | undefined): TrustLevelKey {
  if (value === 'rising_swapper' || value === 'reliable_swapper' || value === 'trusted_swapper') return value;
  return 'new_swapper';
}

function mapRow(row: TrustMetricsRow): UserTrustMetrics {
  return {
    userId: row.user_id,
    successfulSwapsCount: row.successful_swaps_count ?? 0,
    completedDealsCount: row.completed_deals_count ?? 0,
    cancelledDealsCount: row.cancelled_deals_count ?? 0,
    totalReviewsReceived: row.total_reviews_received ?? 0,
    averageRating: row.average_rating ?? null,
    clearDescriptionCount: row.clear_description_count ?? 0,
    goodCommunicationCount: row.good_communication_count ?? 0,
    onTimeCount: row.on_time_count ?? 0,
    respectfulSwapperCount: row.respectful_swapper_count ?? 0,
    responseRate: row.response_rate ?? null,
    avgResponseTimeMinutes: row.avg_response_time_minutes ?? null,
    trustLevelKey: normalizeTrustLevelKey(row.trust_level_key),
    trustScore: row.trust_score ?? 0,
  };
}

export async function fetchUserTrustMetrics(userId: string): Promise<UserTrustMetrics | null> {
  const targetId = userId.trim();
  if (!targetId) return null;

  const { data, error } = await supabase.rpc('get_user_trust_metrics', { p_user_id: targetId });
  if (error) {
    if (__DEV__) console.warn('[trust-metrics] get_user_trust_metrics failed', { userId: targetId, code: error.code, message: error.message });
    return null;
  }

  const row = (Array.isArray(data) ? data[0] : null) as TrustMetricsRow | null;
  if (!row) return null;
  return mapRow(row);
}

export async function fetchMyTrustMetrics(): Promise<UserTrustMetrics | null> {
  const { data, error } = await supabase.rpc('get_my_trust_metrics');
  if (error) {
    if (__DEV__) console.warn('[trust-metrics] get_my_trust_metrics failed', { code: error.code, message: error.message });
    return null;
  }

  const row = (Array.isArray(data) ? data[0] : null) as TrustMetricsRow | null;
  if (!row) return null;
  return mapRow(row);
}
