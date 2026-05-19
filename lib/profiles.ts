import { fetchItemVideoPresenceMap } from '@/lib/item-video-presence';
import { supabase } from '@/lib/supabase/client';

const PROFILE_FETCH_TIMEOUT_MS = 12_000;
export const PROFILE_FETCH_TIMEOUT_CODE = 'PROFILE_FETCH_TIMEOUT';
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

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
  const normalizedUsername = input.username.trim();
  const normalizedUsernameLowercase = normalizedUsername.toLowerCase();
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

  if (!normalizedUsername || !USERNAME_REGEX.test(normalizedUsername)) {
    return {
      ok: false,
      reason: 'invalid_username',
      message: 'اسم المستخدم لازم يكون من 3 إلى 20 حرف أو رقم أو _.',
    };
  }

  if (normalizedTagline && normalizedTagline.length > 120) {
    return {
      ok: false,
      reason: 'invalid_profile_tagline',
      message: 'الجملة التعريفية يجب ألا تتجاوز 120 حرفًا.',
    };
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      display_name: normalizedDisplayName,
      username: normalizedUsernameLowercase,
      profile_tagline: normalizedTagline,
      city: normalizedCity,
      area: normalizedArea,
      bio: normalizedBio,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id')
    .maybeSingle();

  if (error?.code === '23505') {
    return { ok: false, reason: 'username_taken', message: 'اسم المستخدم ده مستخدم قبل كده.' };
  }

  if (error) {
    return {
      ok: false,
      reason: 'save_failed',
      message: 'تعذر حفظ تعديلات الملف حالياً. حاول مرة أخرى.',
    };
  }

  if (!data?.id) {
    return {
      ok: false,
      reason: 'not_found_or_unauthorized',
      message: 'تعذر العثور على ملفك أو لا تملك صلاحية تعديله.',
    };
  }

  return { ok: true, message: 'تم حفظ تعديلات ملفك بنجاح.' };
}

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

export async function fetchPublicProfileActiveListings(
  profileId: string,
  limit = 6,
): Promise<PublicProfileListing[]> {
  if (!profileId.trim()) return [];

  const { data: items, error: itemsError } = await supabase
    .from('items')
    .select('id, title, category_id, city, area, created_at')
    .eq('owner_id', profileId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (itemsError) throw itemsError;
  if (!items || items.length === 0) return [];

  const itemIds = items.map((item) => item.id);
  const categoryIds = Array.from(new Set(items.map((item) => item.category_id).filter(Boolean)));

  const [imagesResult, categoriesResult, videoPresenceByItemId] = await Promise.all([
    supabase
      .from('item_images')
      .select('item_id, image_url, is_primary, sort_order')
      .in('item_id', itemIds),
    categoryIds.length > 0
      ? supabase.from('categories').select('id, name_ar').in('id', categoryIds)
      : Promise.resolve({ data: [], error: null }),
    fetchItemVideoPresenceMap(itemIds),
  ]);

  if (imagesResult.error) throw imagesResult.error;
  if (categoriesResult.error) throw categoriesResult.error;

  const imagesByItem = new Map<string, Array<{ image_url: string | null; is_primary: boolean | null; sort_order: number | null }>>();
  for (const image of imagesResult.data ?? []) {
    const list = imagesByItem.get(image.item_id) ?? [];
    list.push({
      image_url: image.image_url ?? null,
      is_primary: image.is_primary ?? null,
      sort_order: image.sort_order ?? null,
    });
    imagesByItem.set(image.item_id, list);
  }

  const categoriesById = new Map((categoriesResult.data ?? []).map((category) => [category.id, category.name_ar ?? null]));

  const pickCover = (itemId: string): string | null => {
    const images = imagesByItem.get(itemId);
    if (!images || images.length === 0) return null;

    const sorted = [...images].sort((a, b) => {
      const aPrimary = a.is_primary ? 0 : 1;
      const bPrimary = b.is_primary ? 0 : 1;
      if (aPrimary !== bPrimary) return aPrimary - bPrimary;
      const aSort = a.sort_order ?? Number.MAX_SAFE_INTEGER;
      const bSort = b.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (aSort !== bSort) return aSort - bSort;
      return (a.image_url ?? '').localeCompare(b.image_url ?? '');
    });

    return sorted[0]?.image_url ?? null;
  };

  return items.map((item) => ({
    id: item.id,
    title: item.title?.trim() || 'عنصر بدون عنوان',
    imageUrl: pickCover(item.id),
    category: item.category_id ? categoriesById.get(item.category_id) ?? null : null,
    city: item.city?.trim() || null,
    area: item.area?.trim() || null,
    createdAt: item.created_at ?? null,
    hasVideoTeaser: videoPresenceByItemId.get(item.id) === true,
  }));
}
