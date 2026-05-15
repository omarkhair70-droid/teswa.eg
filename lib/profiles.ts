import { supabase } from '@/lib/supabase/client';

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
  if (__DEV__) {
    console.log('[Profiles] fetchMyProfile userId', userId);
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, username, bio, city')
    .eq('id', userId)
    .maybeSingle();

  if (__DEV__) {
    console.log('[Profiles] fetchMyProfile data', data);
    console.log('[Profiles] fetchMyProfile error', error);
  }

  if (error) throw error;
  return data;
}
