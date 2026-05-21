import { supabase } from '@/lib/supabase/client';

export type BadgeCategory = 'trust' | 'early' | 'swap' | 'community' | 'profile' | 'special';

export type UserBadge = {
  badgeKey: string;
  labelAr: string;
  descriptionAr: string;
  category: BadgeCategory | string;
  iconName: string | null;
  priority: number;
  awardedAt: string;
};

type UserBadgeRow = {
  badge_key: string;
  label_ar: string;
  description_ar: string;
  category: BadgeCategory | string;
  icon_name: string | null;
  priority: number | null;
  awarded_at: string;
};

type RefreshBadgesResult = {
  awarded_badges?: string[];
};

function mapBadgeRow(row: UserBadgeRow): UserBadge {
  return {
    badgeKey: row.badge_key,
    labelAr: row.label_ar,
    descriptionAr: row.description_ar,
    category: row.category,
    iconName: row.icon_name,
    priority: row.priority ?? 100,
    awardedAt: row.awarded_at,
  };
}

export async function fetchUserBadges(userId: string): Promise<UserBadge[]> {
  const targetId = userId.trim();
  if (!targetId) return [];

  const { data, error } = await supabase.rpc('get_user_badges', { p_user_id: targetId });
  if (error) {
    if (__DEV__) console.warn('[badges] get_user_badges failed', { userId: targetId, code: error.code, message: error.message });
    return [];
  }

  const rows = Array.isArray(data) ? (data as UserBadgeRow[]) : [];
  return rows.map(mapBadgeRow);
}

export async function fetchMyBadges(): Promise<UserBadge[]> {
  const { data, error } = await supabase.rpc('get_my_badges');
  if (error) {
    if (__DEV__) console.warn('[badges] get_my_badges failed', { code: error.code, message: error.message });
    return [];
  }

  const rows = Array.isArray(data) ? (data as UserBadgeRow[]) : [];
  return rows.map(mapBadgeRow);
}

export async function refreshMyBadges(): Promise<RefreshBadgesResult> {
  const { data, error } = await supabase.rpc('refresh_my_badges');
  if (error) {
    if (__DEV__) console.warn('[badges] refresh_my_badges failed', { code: error.code, message: error.message });
    return { awarded_badges: [] };
  }

  if (data && typeof data === 'object' && !Array.isArray(data)) return data as RefreshBadgesResult;
  return { awarded_badges: [] };
}
