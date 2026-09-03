import type { ImagePickerAsset } from 'expo-image-picker';
import { teswaBackendRuntime } from '@/lib/backend/runtime';
import { compressItemImage } from '@/lib/media/compress-item-image';

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

function profileMediaRef(objectKey: string, contentType: string | null = null) {
  return {
    purpose: 'profile_image' as const,
    objectKey,
    contentType,
    sizeBytes: null,
  };
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
    const uploadResult = await teswaBackendRuntime.media.upload({
      purpose: 'profile_image',
      ownerId: userId,
      source: {
        uri: optimized.uri,
        fileName: safeName,
        mimeType: contentType,
      },
      objectKeyHint: path,
    });
    if (!uploadResult.ok) {
      return {
        ok: false,
        reason: 'upload_failed',
        message: kind === 'avatar' ? 'تعذر رفع صورة الملف. حاول مرة أخرى.' : 'تعذر رفع صورة الغلاف. حاول مرة أخرى.',
      };
    }

    const uploadedObject = uploadResult.data;
    const imageUrl = teswaBackendRuntime.media.getPublicUrl(uploadedObject);
    if (!imageUrl) {
      await teswaBackendRuntime.media.remove([uploadedObject]);
      return {
        ok: false,
        reason: 'upload_failed',
        message: kind === 'avatar' ? 'تعذر تجهيز رابط صورة الملف.' : 'تعذر تجهيز رابط صورة الغلاف.',
      };
    }

    const saveResult = await teswaBackendRuntime.profiles.setProfileImageUrl(
      userId,
      kind,
      imageUrl,
    );

    if (!saveResult.ok) {
      await teswaBackendRuntime.media.remove([uploadedObject]);
      return saveResult.reason === 'not_found'
        ? {
            ok: false,
            reason: 'not_found_or_unauthorized',
            message: 'تعذر العثور على ملفك أو لا تملك صلاحية تعديله.',
          }
        : {
            ok: false,
            reason: 'save_failed',
            message: 'تعذر حفظ الصورة الجديدة في ملفك. حاول مرة أخرى.',
          };
    }

    const oldPath = teswaBackendRuntime.media.getObjectKeyFromPublicUrl('profile_image', previousImageUrl);
    if (oldPath && oldPath !== path) {
      const cleanupResult = await teswaBackendRuntime.media.remove([profileMediaRef(oldPath)]);
      if (!cleanupResult.ok) {
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

  const saveResult = await teswaBackendRuntime.profiles.setProfileImageUrl(
    userId,
    kind,
    null,
  );

  if (!saveResult.ok) {
    if (saveResult.reason === 'not_found') {
      return {
        ok: false,
        reason: 'not_found_or_unauthorized',
        message: 'تعذر العثور على ملفك أو لا تملك صلاحية تعديله.',
      };
    }
    return {
      ok: false,
      reason: 'save_failed',
      message: kind === 'avatar'
        ? 'تعذر حذف صورة الملف حالياً.'
        : 'تعذر حذف غلاف الملف حالياً.',
    };
  }

  const oldPath = teswaBackendRuntime.media.getObjectKeyFromPublicUrl('profile_image', currentImageUrl);
  if (oldPath) {
    const cleanupResult = await teswaBackendRuntime.media.remove([profileMediaRef(oldPath)]);
    if (!cleanupResult.ok) {
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
