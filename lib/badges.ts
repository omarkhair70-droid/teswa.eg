import type { DetailedProfileBadge } from '@/lib/backend/contracts/profile';
import { teswaBackendRuntime } from '@/lib/backend/runtime';

export type BadgeCategory =
  | 'trust'
  | 'early'
  | 'swap'
  | 'community'
  | 'profile'
  | 'special';

export type UserBadge = DetailedProfileBadge;

type RefreshBadgesResult = {
  awarded_badges?: string[];
};

export async function fetchUserBadges(userId: string): Promise<UserBadge[]> {
  const targetId = userId.trim();
  if (!targetId) return [];

  try {
    return await teswaBackendRuntime.profiles.getBadges(targetId);
  } catch (error) {
    if (__DEV__) {
      console.warn('[badges] get_user_badges failed', {
        userId: targetId,
        message: (error as Error)?.message,
      });
    }
    return [];
  }
}

export async function fetchMyBadges(): Promise<UserBadge[]> {
  try {
    return await teswaBackendRuntime.profiles.getMyBadges();
  } catch (error) {
    if (__DEV__) {
      console.warn('[badges] get_my_badges failed', {
        message: (error as Error)?.message,
      });
    }
    return [];
  }
}

export async function refreshMyBadges(): Promise<RefreshBadgesResult> {
  try {
    const awarded = await teswaBackendRuntime.profiles.refreshMyBadges();
    return { awarded_badges: awarded };
  } catch (error) {
    if (__DEV__) {
      console.warn('[badges] refresh_my_badges failed', {
        message: (error as Error)?.message,
      });
    }
    return { awarded_badges: [] };
  }
}
