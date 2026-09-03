import type { DetailedTrustMetrics, TrustLevelKey } from '@/lib/backend/contracts/profile';
import { teswaBackendRuntime } from '@/lib/backend/runtime';

export type { TrustLevelKey };

export type UserTrustMetrics = DetailedTrustMetrics;

export async function fetchUserTrustMetrics(userId: string): Promise<UserTrustMetrics | null> {
  const targetId = userId.trim();
  if (!targetId) return null;

  try {
    return await teswaBackendRuntime.profiles.getTrustMetrics(targetId);
  } catch (error) {
    if (__DEV__) {
      console.warn('[trust-metrics] get_user_trust_metrics failed', {
        userId: targetId,
        message: (error as Error)?.message,
      });
    }
    return null;
  }
}

export async function fetchMyTrustMetrics(): Promise<UserTrustMetrics | null> {
  try {
    return await teswaBackendRuntime.profiles.getMyTrustMetrics();
  } catch (error) {
    if (__DEV__) {
      console.warn('[trust-metrics] get_my_trust_metrics failed', {
        message: (error as Error)?.message,
      });
    }
    return null;
  }
}
