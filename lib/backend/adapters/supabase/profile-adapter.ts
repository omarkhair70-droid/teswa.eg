import type { ProfileReadContract, TeswaProfile } from '@/lib/backend/contracts/profile';
import { supabase } from '@/lib/supabase/client';

type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  city: string | null;
  area: string | null;
  profile_tagline: string | null;
  successful_swaps_count: number | null;
  response_rate: number | null;
  created_at: string | null;
};

const PROFILE_SELECT =
  'id, display_name, username, bio, avatar_url, cover_url, city, area, profile_tagline, successful_swaps_count, response_rate, created_at';

function mapProfile(row: ProfileRow): TeswaProfile {
  return {
    id: row.id,
    displayName: row.display_name ?? null,
    username: row.username ?? null,
    bio: row.bio ?? null,
    avatarUrl: row.avatar_url ?? null,
    coverUrl: row.cover_url ?? null,
    city: row.city ?? null,
    area: row.area ?? null,
    profileTagline: row.profile_tagline ?? null,
    successfulSwapsCount: row.successful_swaps_count ?? null,
    responseRate: row.response_rate ?? null,
    createdAt: row.created_at ?? null,
  };
}

async function getProfile(profileId: string): Promise<TeswaProfile | null> {
  const normalizedId = profileId.trim();
  if (!normalizedId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', normalizedId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapProfile(data as ProfileRow) : null;
}

export function createSupabaseProfileReadAdapter(): ProfileReadContract {
  return {
    getMine: getProfile,
    getPublic: getProfile,
  };
}
