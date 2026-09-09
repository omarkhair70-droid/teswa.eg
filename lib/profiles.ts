import { teswaBackendRuntime } from '@/lib/backend/runtime';
import { fetchItemVideoPresenceMap } from '@/lib/item-video-presence';
import { validateUsername } from '@/lib/username';
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
  const profileRequest = teswaBackendRuntime.profiles.getMine(userId);

  const timeoutRequest = new Promise<never>((_, reject) => {
    setTimeout(() => {
      const timeoutError = new Error(PROFILE_FETCH_TIMEOUT_CODE);
      timeoutError.name = PROFILE_FETCH_TIMEOUT_CODE;
      reject(timeoutError);
    }, PROFILE_FETCH_TIMEOUT_MS);
  });

  const profile = await Promise.race([profileRequest, timeoutRequest]);
  if (!profile) return null;

  return {
    id: profile.id,
    display_name: profile.displayName,
    username: profile.username,
    bio: profile.bio,
    city: profile.city,
  };
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

export type PublicProfileListing = {
  id: string;
  title: string;
  imageUrl: string | null;
  category: string | null;
  city: string | null;
  area: string | null;
  createdAt: string | null;
  hasVideoTeaser: boolean;
};

export type UpdateMyProfileInput = {
  userId: string;
  displayName: string;
  username: string;
  profileTagline?: string | null;
  city?: string | null;
  area?: string | null;
  bio?: string | null;
};

export type UpdateMyProfileResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      reason:
        | 'invalid_user'
        | 'invalid_display_name'
        | 'invalid_username'
        | 'invalid_profile_tagline'
        | 'username_taken'
        | 'not_found_or_unauthorized'
        | 'save_failed';
      message: string;
    };

const normalizeOptional = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export async function updateMyProfileFromMobile(
  input: UpdateMyProfileInput,
): Promise<UpdateMyProfileResult> {
  const userId = input.userId.trim();
  const normalizedDisplayName = input.displayName.trim();
  const usernameValidation = validateUsername(input.username);
  const normalizedTagline = normalizeOptional(input.profileTagline);
  const normalizedCity = normalizeOptional(input.city);
  const normalizedArea = normalizeOptional(input.area);
  const normalizedBio = normalizeOptional(input.bio);

  if (!userId) {
    return { ok: false, reason: 'invalid_user', message: 'يجب تسجيل الدخول أولاً لتعديل الملف.' };
  }

  if (!normalizedDisplayName) {
    return { ok: false, reason: 'invalid_display_name', message: 'الاسم الظاهر مطلوب.' };
  }

if (!usernameValidation.ok) {
  return {
    ok: false,
    reason: 'invalid_username',
    message: usernameValidation.message,
  };
}

  if (normalizedTagline && normalizedTagline.length > 120) {
    return {
      ok: false,
      reason: 'invalid_profile_tagline',
      message: 'الجملة التعريفية يجب ألا تتجاوز 120 حرفًا.',
    };
  }

  const result = await teswaBackendRuntime.profiles.updateMine({
    userId,
    displayName: normalizedDisplayName,
    username: usernameValidation.normalized,
    profileTagline: normalizedTagline,
    city: normalizedCity,
    area: normalizedArea,
    bio: normalizedBio,
  });

  if (!result.ok) {
    if (result.reason === 'username_taken') {
      return { ok: false, reason: 'username_taken', message: 'اسم المستخدم ده مستخدم قبل كده.' };
    }
    if (result.reason === 'not_found') {
      return {
        ok: false,
        reason: 'not_found_or_unauthorized',
        message: 'تعذر العثور على ملفك أو لا تملك صلاحية تعديله.',
      };
    }
    return {
      ok: false,
      reason: 'save_failed',
      message: 'تعذر حفظ تعديلات الملف حالياً. حاول مرة أخرى.',
    };
  }

  return { ok: true, message: 'تم حفظ تعديلات ملفك بنجاح.' };
}

export async function fetchMyAccountProfile(userId: string): Promise<AccountProfile | null> {
  const profile = await teswaBackendRuntime.profiles.getMine(userId);
  if (!profile) return null;
  return {
    id: profile.id,
    display_name: profile.displayName,
    username: profile.username,
    avatar_url: profile.avatarUrl,
    cover_url: profile.coverUrl,
    city: profile.city,
    area: profile.area,
    bio: profile.bio,
    successful_swaps_count: profile.successfulSwapsCount,
    response_rate: profile.responseRate,
    profile_tagline: profile.profileTagline,
    created_at: profile.createdAt ?? '',
  };
}

export async function fetchPublicProfileById(profileId: string): Promise<PublicProfile | null> {
  const profile = await teswaBackendRuntime.profiles.getPublic(profileId);
  if (!profile) return null;
  return {
    id: profile.id,
    display_name: profile.displayName,
    username: profile.username,
    avatar_url: profile.avatarUrl,
    cover_url: profile.coverUrl,
    city: profile.city,
    area: profile.area,
    bio: profile.bio,
    successful_swaps_count: profile.successfulSwapsCount,
    response_rate: profile.responseRate,
    profile_tagline: profile.profileTagline,
    created_at: profile.createdAt ?? '',
  };
}

export async function fetchPublicProfileActiveListings(
  profileId: string,
  limit = 6,
): Promise<PublicProfileListing[]> {
  if (!profileId.trim()) return [];

  const items = await teswaBackendRuntime.marketplace.listActiveByOwner(profileId, limit);
  if (!items.length) return [];

  const videoPresenceByItemId = await fetchItemVideoPresenceMap(items.map((item) => item.id));

  return items.map((item) => ({
    id: item.id,
    title: item.title?.trim() || 'عنصر بدون عنوان',
    imageUrl: item.imageUrl,
    category: item.category,
    city: item.city?.trim() || null,
    area: item.area?.trim() || null,
    createdAt: item.createdAt,
    hasVideoTeaser: videoPresenceByItemId.get(item.id) === true,
  }));
}
