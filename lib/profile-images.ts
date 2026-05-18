import type { ImagePickerAsset } from 'expo-image-picker';
import { compressItemImage } from '@/lib/media/compress-item-image';
import { supabase } from '@/lib/supabase/client';

const PROFILE_IMAGES_BUCKET = 'profile-images';
const PROFILE_IMAGES_PUBLIC_MARKER = '/storage/v1/object/public/profile-images/';

export type ProfileImageKind = 'avatar' | 'cover';

export type ProfileImageMutationResult =
  | {
      ok: true;
      imageUrl: string | null;
      storageCleanupFailed?: true;
      message: string;
    }
  | {
      ok: false;
      reason:
        | 'invalid_user'
        | 'invalid_asset'
        | 'unsupported_type'
        | 'upload_failed'
        | 'save_failed'
        | 'not_found_or_unauthorized'
        | 'unknown';
      message: string;
    };

function sanitizeFileName(name: string | null | undefined, fallback: string): string {
  const raw = (name || fallback).toLowerCase();
  return raw.replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-');
}

async function fileUriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  return response.arrayBuffer();
}

function deriveStoragePathFromPublicUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  const markerIndex = trimmed.indexOf(PROFILE_IMAGES_PUBLIC_MARKER);
  if (markerIndex < 0) return null;
  const afterMarker = trimmed.slice(markerIndex + PROFILE_IMAGES_PUBLIC_MARKER.length).split('?')[0];
  if (!afterMarker) return null;
  try {
    return decodeURIComponent(afterMarker);
  } catch {
    return afterMarker;
  }
}

export async function replaceProfileImageFromMobile(input: {
  userId: string;
  kind: ProfileImageKind;
  asset: ImagePickerAsset;
  previousImageUrl?: string | null;
}): Promise<ProfileImageMutationResult> {
  const { userId, kind, asset, previousImageUrl } = input;

  if (!userId?.trim()) {
    return { ok: false, reason: 'invalid_user', message: 'يجب تسجيل الدخول أولاً لتحديث صور الملف.' };
  }

  if (!asset?.uri) {
    return { ok: false, reason: 'invalid_asset', message: 'تعذر قراءة الصورة المختارة.' };
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (asset.mimeType && !allowedTypes.includes(asset.mimeType)) {
    return { ok: false, reason: 'unsupported_type', message: 'نوع الصورة غير مدعوم. استخدم JPEG أو PNG أو WEBP.' };
  }

  const optimized = await compressItemImage(asset.uri);
  const ext = optimized.usedCompressedOutput
    ? optimized.extension
    : asset.fileName?.split('.').pop() || (asset.mimeType?.split('/').pop() ?? 'jpg');
  const baseName = optimized.usedCompressedOutput ? `${kind}.jpg` : asset.fileName;
  const safeName = sanitizeFileName(baseName, `${kind}.${ext}`);
  const path = kind === 'avatar'
    ? `profiles/${userId}/avatar/${Date.now()}-${safeName}`
    : `profiles/${userId}/cover/${Date.now()}-${safeName}`;
  const contentType = optimized.contentType || asset.mimeType || 'image/jpeg';

  try {
    const body = await fileUriToArrayBuffer(optimized.uri);
    const { error: uploadError } = await supabase.storage.from(PROFILE_IMAGES_BUCKET).upload(path, body, { contentType, upsert: false });
    if (uploadError) {
      return {
        ok: false,
        reason: 'upload_failed',
        message: kind === 'avatar' ? 'تعذر رفع صورة الملف. حاول مرة أخرى.' : 'تعذر رفع صورة الغلاف. حاول مرة أخرى.',
      };
    }

    const { data: publicUrlData } = supabase.storage.from(PROFILE_IMAGES_BUCKET).getPublicUrl(path);
    const imageUrl = publicUrlData.publicUrl;

    const updatePayload = kind === 'avatar'
      ? { avatar_url: imageUrl, updated_at: new Date().toISOString() }
      : { cover_url: imageUrl, updated_at: new Date().toISOString() };

    const { data, error } = await supabase.from('profiles').update(updatePayload).eq('id', userId).select('id').maybeSingle();

    if (error) {
      await supabase.storage.from(PROFILE_IMAGES_BUCKET).remove([path]);
      return { ok: false, reason: 'save_failed', message: 'تعذر حفظ الصورة الجديدة في ملفك. حاول مرة أخرى.' };
    }

    if (!data) {
      await supabase.storage.from(PROFILE_IMAGES_BUCKET).remove([path]);
      return { ok: false, reason: 'not_found_or_unauthorized', message: 'تعذر العثور على ملفك أو لا تملك صلاحية تعديله.' };
    }

    const oldPath = deriveStoragePathFromPublicUrl(previousImageUrl);
    if (oldPath && oldPath !== path) {
      const { error: cleanupError } = await supabase.storage.from(PROFILE_IMAGES_BUCKET).remove([oldPath]);
      if (cleanupError) {
        return {
          ok: true,
          imageUrl,
          storageCleanupFailed: true,
          message: kind === 'avatar'
            ? 'تم تحديث صورة الملف، لكن تعذر تنظيف الملف القديم من التخزين.'
            : 'تم تحديث غلاف الملف، لكن تعذر تنظيف الملف القديم من التخزين.',
        };
      }
    }

    return {
      ok: true,
      imageUrl,
      message: kind === 'avatar' ? 'تم تحديث صورة الملف بنجاح.' : 'تم تحديث غلاف الملف بنجاح.',
    };
  } catch {
    return { ok: false, reason: 'unknown', message: 'حدث خطأ غير متوقع أثناء حفظ الصورة.' };
  }
}

export async function removeProfileImageFromMobile(input: {
  userId: string;
  kind: ProfileImageKind;
  currentImageUrl?: string | null;
}): Promise<ProfileImageMutationResult> {
  const { userId, kind, currentImageUrl } = input;

  if (!userId?.trim()) {
    return { ok: false, reason: 'invalid_user', message: 'يجب تسجيل الدخول أولاً لتحديث صور الملف.' };
  }

  const updatePayload = kind === 'avatar'
    ? { avatar_url: null, updated_at: new Date().toISOString() }
    : { cover_url: null, updated_at: new Date().toISOString() };

  const { data, error } = await supabase.from('profiles').update(updatePayload).eq('id', userId).select('id').maybeSingle();

  if (error) {
    return {
      ok: false,
      reason: 'save_failed',
      message: kind === 'avatar' ? 'تعذر حذف صورة الملف حالياً.' : 'تعذر حذف غلاف الملف حالياً.',
    };
  }

  if (!data) {
    return { ok: false, reason: 'not_found_or_unauthorized', message: 'تعذر العثور على ملفك أو لا تملك صلاحية تعديله.' };
  }

  const oldPath = deriveStoragePathFromPublicUrl(currentImageUrl);
  if (oldPath) {
    const { error: cleanupError } = await supabase.storage.from(PROFILE_IMAGES_BUCKET).remove([oldPath]);
    if (cleanupError) {
      return {
        ok: true,
        imageUrl: null,
        storageCleanupFailed: true,
        message: kind === 'avatar'
          ? 'تم حذف صورة الملف، لكن تعذر تنظيف الملف القديم من التخزين.'
          : 'تم حذف غلاف الملف، لكن تعذر تنظيف الملف القديم من التخزين.',
      };
    }
  }

  return {
    ok: true,
    imageUrl: null,
    message: kind === 'avatar' ? 'تم حذف صورة الملف.' : 'تم حذف غلاف الملف.',
  };
}
