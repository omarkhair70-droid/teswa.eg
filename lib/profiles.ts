import { supabase } from '@/lib/supabase/client';

const PROFILE_FETCH_TIMEOUT_MS = 12_000;
export const PROFILE_FETCH_TIMEOUT_CODE = 'PROFILE_FETCH_TIMEOUT';

export type AppProfile = {
  id: string;
  display_name: string | null;
  username: string | null;
  bio?: string | null;
  city?: string | null;
};

export function isProfileComplete(profile: Pick<AppProfile, 'display_name' | 'username'> | null): boolean {
  return Boolean(profile?.display_name?.trim() && profile?.username?.trim());
}

export async function fetchMyProfile(userId: string): Promise<AppProfile | null> {
  const profileRequest = supabase
    .from('profiles')
    .select('id, display_name, username, bio, city')
    .eq('id', userId)
    .maybeSingle();

  const timeoutRequest = new Promise<never>((_, reject) => {
    setTimeout(() => {
      const timeoutError = new Error(PROFILE_FETCH_TIMEOUT_CODE);
      timeoutError.name = PROFILE_FETCH_TIMEOUT_CODE;
      reject(timeoutError);
    }, PROFILE_FETCH_TIMEOUT_MS);
  });

  const { data, error } = await Promise.race([profileRequest, timeoutRequest]);

  if (error) throw error;
  return data;
}


export type AccountProfile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  city: string | null;
  area: string | null;
  bio: string | null;
  successful_swaps_count: number | null;
  response_rate: number | null;
  profile_tagline: string | null;
  created_at: string;
};

export type PublicProfile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  city: string | null;
  area: string | null;
  bio: string | null;
  successful_swaps_count: number | null;
  response_rate: number | null;
  profile_tagline: string | null;
  created_at: string;
};

export async function fetchMyAccountProfile(userId: string): Promise<AccountProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, username, avatar_url, cover_url, city, area, bio, successful_swaps_count, response_rate, profile_tagline, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function fetchPublicProfileById(profileId: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, username, avatar_url, cover_url, city, area, bio, successful_swaps_count, response_rate, profile_tagline, created_at')
    .eq('id', profileId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
