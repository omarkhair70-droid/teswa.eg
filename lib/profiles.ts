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
