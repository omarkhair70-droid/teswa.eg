import { supabase } from '@/lib/supabase/client';

export type PeopleDirectoryEntry = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  profileTagline: string | null;
  bio: string | null;
  city: string | null;
  area: string | null;
  successfulSwapsCount: number;
  responseRate: number | null;
  activeItemsCount: number;
  createdAt: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  profile_tagline: string | null;
  bio: string | null;
  city: string | null;
  area: string | null;
  successful_swaps_count: number | null;
  response_rate: number | null;
  created_at: string | null;
};

function sanitizePeopleSearchQuery(raw: string): string {
  return raw
    .trim()
    .slice(0, 80)
    .replace(/[%]/g, '')
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const normalizeText = (value: string | null | undefined) => {
  const clean = value?.trim();
  return clean ? clean : null;
};

export async function fetchPeopleDirectory(input?: { query?: string; limit?: number }): Promise<PeopleDirectoryEntry[]> {
  const query = sanitizePeopleSearchQuery(input?.query ?? '');
  const rawLimit = Number(input?.limit);
  const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.floor(rawLimit))) : 24;

  let profilesQuery = supabase
    .from('profiles')
    .select('id, display_name, username, avatar_url, cover_url, profile_tagline, bio, city, area, successful_swaps_count, response_rate, created_at')
    .not('username', 'is', null)
    .order('successful_swaps_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (query) {
    const pattern = `%${query}%`;
    profilesQuery = profilesQuery.or(`display_name.ilike.${pattern},username.ilike.${pattern},city.ilike.${pattern},area.ilike.${pattern}`);
  }

  const { data: profiles, error: profilesError } = await profilesQuery.returns<ProfileRow[]>();

  if (profilesError) {
    throw profilesError;
  }

  if (!profiles?.length) {
    return [];
  }

  const profileIds = profiles.map((profile: ProfileRow) => profile.id);
  const { data: activeItems, error: activeItemsError } = await supabase
    .from('items')
    .select('owner_id, id')
    .eq('status', 'active')
    .in('owner_id', profileIds)
    .returns<{ owner_id: string | null; id: string }[]>();

  if (activeItemsError && __DEV__) {
    console.warn('[people] active items count query failed', activeItemsError);
  }

  const activeCountByOwner = new Map<string, number>();
  for (const item of activeItems ?? []) {
    if (!item.owner_id) {
      continue;
    }
    activeCountByOwner.set(item.owner_id, (activeCountByOwner.get(item.owner_id) ?? 0) + 1);
  }

  return profiles.map((profile: ProfileRow) => {
    const username = normalizeText(profile.username) ?? '';
    const displayName = (normalizeText(profile.display_name) ?? username) || 'مستخدم';

    return {
      id: profile.id,
      displayName,
      username,
      avatarUrl: normalizeText(profile.avatar_url),
      coverUrl: normalizeText(profile.cover_url),
      profileTagline: normalizeText(profile.profile_tagline),
      bio: normalizeText(profile.bio),
      city: normalizeText(profile.city),
      area: normalizeText(profile.area),
      successfulSwapsCount: profile.successful_swaps_count ?? 0,
      responseRate: typeof profile.response_rate === 'number' ? profile.response_rate : null,
      activeItemsCount: activeCountByOwner.get(profile.id) ?? 0,
      createdAt: profile.created_at,
    };
  });
}
