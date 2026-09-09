import type { ImagePickerAsset } from 'expo-image-picker';
import { teswaBackendRuntime } from '@/lib/backend/runtime';
import { compressItemImage } from '@/lib/media/compress-item-image';

const MAX_ITEM_IMAGES = 4;

export type EditableListingImage = {
  id: string;
  imageUrl: string;
  isPrimary: boolean;
  sortOrder: number | null;
  createdAt: string | null;
};

export type EditableListingImagesContext = {
  itemId: string;
  title: string;
  status: 'active' | 'archived';
  images: EditableListingImage[];
};

export type ListingImageDraftInput =
  | { kind: 'existing'; imageId: string; imageUrl: string }
  | { kind: 'new'; asset: ImagePickerAsset };

export type UpdateListingImagesProgress =
  | { phase: 'optimizing'; current: number; total: number }
  | { phase: 'uploading'; current: number; total: number }
  | { phase: 'saving' };

export type UpdateListingImagesResult =
  | { ok: true; imageCount: number; storageCleanupFailed?: true }
  | {
      ok: false;
      reason:
        | 'not_found_or_unauthorized'
        | 'not_editable'
        | 'invalid_input'
        | 'upload_failed'
        | 'images_insert_failed'
        | 'images_metadata_update_failed'
        | 'images_delete_failed'
        | 'unknown';
      message: string;
    };

function sanitizeFileName(name: string | null | undefined, fallback: string): string {
  const raw = (name || fallback).toLowerCase();
  return raw.replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-');
}

function itemImageRef(objectKey: string, contentType: string | null = null) {
  return {
    purpose: 'item_image' as const,
    objectKey,
    contentType,
    sizeBytes: null,
  };
}

async function cleanupItemImageStorage(paths: string[]) {
  if (!paths.length) return { ok: true as const, data: undefined };
  return teswaBackendRuntime.media.remove(paths.map((path) => itemImageRef(path)));
}

export async function fetchEditableListingImagesContext(
  itemId: string,
  ownerId: string,
): Promise<EditableListingImagesContext | null> {
  return teswaBackendRuntime.marketplace.getEditableListingImagesContext(itemId, ownerId);
}

export async function updateListingImagesFromMobile(input: {
  itemId: string;
  ownerId: string;
  orderedImages: ListingImageDraftInput[];
  onProgress?: (progress: UpdateListingImagesProgress) => void;
}): Promise<UpdateListingImagesResult> {
  const { itemId, ownerId, orderedImages, onProgress } = input;

  if (!itemId || !ownerId) {
    return {
      ok: false,
      reason: 'invalid_input',
      message: 'بيانات العنصر غير مكتملة.',
    };
  }
  if (!orderedImages.length) {
    return {
      ok: false,
      reason: 'invalid_input',
      message: 'يجب الاحتفاظ بصورة واحدة على الأقل للعنصر.',
    };
  }
  if (orderedImages.length > MAX_ITEM_IMAGES) {
    return {
      ok: false,
      reason: 'invalid_input',
      message: 'يمكنك استخدام 4 صور كحد أقصى.',
    };
  }

  let currentContext: EditableListingImagesContext | null = null;
  try {
    currentContext = await teswaBackendRuntime.marketplace.getEditableListingImagesContext(
      itemId,
      ownerId,
    );
  } catch {
    return {
      ok: false,
      reason: 'unknown',
      message: 'تعذر تحميل صور العنصر الحالية.',
    };
  }

  if (!currentContext) {
    return {
      ok: false,
      reason: 'not_found_or_unauthorized',
      message: 'العنصر غير موجود أو لا تملك صلاحية تعديله.',
    };
  }

  const currentExistingById = new Map(
    currentContext.images.map((row) => [row.id, row.imageUrl]),
  );
  const usedExisting = new Set<string>();

  for (const draft of orderedImages) {
    if (draft.kind === 'existing') {
      const imageId = draft.imageId?.trim();
      const imageUrl = draft.imageUrl?.trim();
      const knownUrl = imageId ? currentExistingById.get(imageId) : null;
      if (!imageId || !imageUrl || !knownUrl || knownUrl !== imageUrl) {
        return {
          ok: false,
          reason: 'invalid_input',
          message: 'تعذر التحقق من بعض الصور الحالية. أعد فتح الشاشة وحاول مرة أخرى.',
        };
      }
      if (usedExisting.has(imageId)) {
        return {
          ok: false,
          reason: 'invalid_input',
          message: 'لا يمكن تكرار نفس الصورة أكثر من مرة.',
        };
      }
      usedExisting.add(imageId);
      continue;
    }

    if (!draft.asset?.uri) {
      return {
        ok: false,
        reason: 'invalid_input',
        message: 'تعذر قراءة إحدى الصور الجديدة.',
      };
    }
    if (
      draft.asset.mimeType
      && !['image/jpeg', 'image/png', 'image/webp'].includes(draft.asset.mimeType)
    ) {
      return {
        ok: false,
        reason: 'invalid_input',
        message: 'نوع الصورة غير مدعوم. استخدم JPEG أو PNG أو WEBP.',
      };
    }
  }

  const uploadedPaths: string[] = [];
  const orderedPlan: Array<
    | { kind: 'existing'; imageId: string; imageUrl: string }
    | { kind: 'new'; imageUrl: string }
  > = [];

  try {
    for (let i = 0; i < orderedImages.length; i += 1) {
      const draft = orderedImages[i];
      if (draft.kind === 'existing') {
        orderedPlan.push({
          kind: 'existing',
          imageId: draft.imageId,
          imageUrl: draft.imageUrl.trim(),
        });
        continue;
      }

      onProgress?.({
        phase: 'optimizing',
        current: i + 1,
        total: orderedImages.length,
      });
      const optimized = await compressItemImage(draft.asset.uri);
      const ext = optimized.usedCompressedOutput
        ? optimized.extension
        : draft.asset.fileName?.split('.').pop()
          || (draft.asset.mimeType?.split('/').pop() ?? 'jpg');
      const baseName = optimized.usedCompressedOutput
        ? `image-${i + 1}.jpg`
        : draft.asset.fileName;
      const safeName = sanitizeFileName(baseName, `image-${i + 1}.${ext}`);
      const path = `items/${ownerId}/${itemId}/${Date.now()}-${safeName}`;
      const contentType = optimized.usedCompressedOutput
        ? optimized.contentType
        : draft.asset.mimeType || 'image/jpeg';

      onProgress?.({
        phase: 'uploading',
        current: i + 1,
        total: orderedImages.length,
      });
      const uploadResult = await teswaBackendRuntime.media.upload({
        purpose: 'item_image',
        ownerId,
        source: {
          uri: optimized.uri,
          fileName: safeName,
          mimeType: contentType,
        },
        objectKeyHint: path,
      });

      if (!uploadResult.ok) {
        await cleanupItemImageStorage(uploadedPaths);
        return {
          ok: false,
          reason: 'upload_failed',
          message: 'تعذر رفع الصور الجديدة. تأكد من الاتصال وحاول مرة أخرى.',
        };
      }

      uploadedPaths.push(uploadResult.data.objectKey);
      const imageUrl = teswaBackendRuntime.media.getPublicUrl(uploadResult.data);
      if (!imageUrl) {
        await cleanupItemImageStorage(uploadedPaths);
        return {
          ok: false,
          reason: 'upload_failed',
          message: 'تعذر تجهيز رابط إحدى الصور الجديدة.',
        };
      }

      orderedPlan.push({ kind: 'new', imageUrl });
    }

    onProgress?.({ phase: 'saving' });

    const saveResult = await teswaBackendRuntime.marketplace.applyListingImagePlan({
      itemId,
      ownerId,
      orderedRows: orderedPlan,
    });

    if (!saveResult.ok) {
      if (saveResult.reason !== 'images_delete_failed') {
        await cleanupItemImageStorage(uploadedPaths);
      }

      switch (saveResult.reason) {
        case 'not_found_or_unauthorized':
          return {
            ok: false,
            reason: 'not_found_or_unauthorized',
            message: 'العنصر غير موجود أو لا تملك صلاحية تعديله.',
          };
        case 'not_editable':
          return {
            ok: false,
            reason: 'not_editable',
            message: 'لا يمكن تعديل صور هذا العنصر في حالته الحالية.',
          };
        case 'invalid_input':
          return {
            ok: false,
            reason: 'invalid_input',
            message: 'تعذر التحقق من بعض الصور الحالية. أعد فتح الشاشة وحاول مرة أخرى.',
          };
        case 'images_insert_failed':
          return {
            ok: false,
            reason: 'images_insert_failed',
            message: 'تعذر حفظ الصور الجديدة. حاول مرة أخرى.',
          };
        case 'images_metadata_update_failed':
          return {
            ok: false,
            reason: 'images_metadata_update_failed',
            message: 'تعذر حفظ ترتيب الصور بالكامل. أعد فتح الشاشة وحاول مرة أخرى.',
          };
        case 'images_delete_failed':
          return {
            ok: false,
            reason: 'images_delete_failed',
            message: 'تم حفظ الصور الجديدة والترتيب، لكن تعذر حذف بعض الصور القديمة. حاول مرة أخرى.',
          };
        default:
          return {
            ok: false,
            reason: 'unknown',
            message: 'حدث خطأ غير متوقع أثناء حفظ الصور.',
          };
      }
    }

    const removablePaths = saveResult.data.removedImageUrls
      .map((url) =>
        teswaBackendRuntime.media.getObjectKeyFromPublicUrl('item_image', url),
      )
      .filter((value): value is string => Boolean(value));

    if (removablePaths.length) {
      const cleanupResult = await cleanupItemImageStorage(removablePaths);
      if (!cleanupResult.ok) {
        return {
          ok: true,
          imageCount: orderedPlan.length,
          storageCleanupFailed: true,
        };
      }
    }

    return { ok: true, imageCount: orderedPlan.length };
  } catch {
    await cleanupItemImageStorage(uploadedPaths);
    return {
      ok: false,
      reason: 'unknown',
      message: 'حدث خطأ غير متوقع أثناء حفظ الصور.',
    };
  }
}
