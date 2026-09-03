import * as Crypto from 'expo-crypto';
import type { ImagePickerAsset } from 'expo-image-picker';
import { teswaBackendRuntime } from '@/lib/backend/runtime';
import { compressItemImage } from '@/lib/media/compress-item-image';
import { uploadItemVideoTeaser } from '@/lib/item-videos';

const MAX_VIDEO_TEASER_DURATION_MS = 15_000;

export type ActiveCategory = { id: string; name_ar: string };
export type ItemCondition = 'almost_new' | 'good_used' | 'minor_issues' | 'needs_repair';
export type DesireMode = 'specific' | 'flexible' | 'surprise';

export type PublishItemPayload = {
  title: string;
  categoryId: string | null;
  city: string | null;
  area: string | null;
  locationLatitude: number | null;
  locationLongitude: number | null;
  condition: ItemCondition;
  conditionNotes: string | null;
  description: string | null;
  itemStory: string | null;
  swapReason: string | null;
  goodFor: string | null;
  desireMode: DesireMode;
  desireText: string | null;
  wantedTags: string[];
};

export type PublishItemResult =
  | { ok: true; itemId: string }
  | { ok: false; reason: 'upload_failed' | 'item_insert_failed' | 'images_insert_failed' | 'video_insert_failed' | 'invalid_input'; message: string };

export async function fetchActiveCategories(): Promise<ActiveCategory[]> {
  const categories = await teswaBackendRuntime.marketplace.listActiveCategories();
  return categories.map((category) => ({
    id: category.id,
    name_ar: category.nameAr,
  }));
}

function sanitizeFileName(name: string | null | undefined, fallback: string): string {
  const raw = (name || fallback).toLowerCase();
  return raw.replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-');
}

export type PublishProgress =
  | { phase: 'optimizing'; current: number; total: number }
  | { phase: 'uploading'; current: number; total: number }
  | { phase: 'video_uploading'; current: number; total: number };

export async function publishItem(payload: PublishItemPayload, assets: ImagePickerAsset[], userId: string, onProgress?: (progress: PublishProgress) => void, videoTeaserAsset?: ImagePickerAsset | null): Promise<PublishItemResult> {
  if (!assets.length) return { ok: false, reason: 'invalid_input', message: 'الصور مطلوبة قبل النشر.' };

  if (videoTeaserAsset && videoTeaserAsset.type !== 'video' && !videoTeaserAsset.mimeType?.startsWith('video/')) {
    return { ok: false, reason: 'invalid_input', message: 'فيديو اللمحة يجب أن يكون ملف فيديو.' };
  }

  if (videoTeaserAsset?.duration != null && videoTeaserAsset.duration > MAX_VIDEO_TEASER_DURATION_MS) {
    return { ok: false, reason: 'invalid_input', message: 'فيديو اللمحة يجب ألا يتجاوز 15 ثانية.' };
  }

  const itemId = Crypto.randomUUID();
  const uploadedPaths: string[] = [];
  let uploadedVideoPath: string | null = null;

  try {
    const uploadedImages: { image_url: string; is_primary: boolean; sort_order: number }[] = [];

    for (let i = 0; i < assets.length; i += 1) {
      const asset = assets[i];
      onProgress?.({ phase: 'optimizing', current: i + 1, total: assets.length });
      const optimized = await compressItemImage(asset.uri);

      const ext = optimized.usedCompressedOutput
        ? optimized.extension
        : asset.fileName?.split('.').pop() || (asset.mimeType?.split('/').pop() ?? 'jpg');
      const baseName = optimized.usedCompressedOutput ? `image-${i + 1}.jpg` : asset.fileName;
      const safeName = sanitizeFileName(baseName, `image-${i + 1}.${ext}`);
      const path = `items/${userId}/${itemId}/${Date.now()}-${safeName}`;
      const contentType = optimized.usedCompressedOutput ? optimized.contentType : asset.mimeType || 'image/jpeg';

      onProgress?.({ phase: 'uploading', current: i + 1, total: assets.length });
      const uploadResult = await teswaBackendRuntime.media.upload({
        purpose: 'item_image',
        ownerId: userId,
        source: {
          uri: optimized.uri,
          fileName: safeName,
          mimeType: contentType,
        },
        objectKeyHint: path,
      });
      if (!uploadResult.ok) {
        if (__DEV__) console.log('[publishItem] image upload failed', { userId, itemId, path, message: uploadResult.message });
        await cleanupStorage(uploadedPaths);
        return { ok: false, reason: 'upload_failed', message: 'تعذر رفع الصور. تأكد من الاتصال وحاول مرة أخرى.' };
      }
      uploadedPaths.push(uploadResult.data.objectKey);

      const publicUrl = teswaBackendRuntime.media.getPublicUrl(uploadResult.data);
      if (!publicUrl) {
        await cleanupStorage(uploadedPaths);
        return { ok: false, reason: 'upload_failed', message: 'تعذر تجهيز رابط إحدى الصور.' };
      }
      uploadedImages.push({ image_url: publicUrl, is_primary: i === 0, sort_order: i });
    }

    const baseResult = await teswaBackendRuntime.marketplace.createPublishedListingBase({
      itemId,
      ownerId: userId,
      title: payload.title,
      categoryId: payload.categoryId,
      description: payload.description,
      condition: payload.condition,
      conditionNotes: payload.conditionNotes,
      city: payload.city,
      area: payload.area,
      locationLatitude: payload.locationLatitude,
      locationLongitude: payload.locationLongitude,
      desireMode: payload.desireMode,
      desireText: payload.desireText,
      itemStory: payload.itemStory,
      swapReason: payload.swapReason,
      goodFor: payload.goodFor,
      images: uploadedImages.map((image) => ({
        imageUrl: image.image_url,
        isPrimary: image.is_primary,
        sortOrder: image.sort_order,
      })),
    });

    if (!baseResult.ok) {
      if (__DEV__) {
        console.log('[publishItem] base metadata failed', {
          userId,
          itemId,
          reason: baseResult.reason,
          message: baseResult.message,
        });
      }
      await cleanupStorage(uploadedPaths);
      return {
        ok: false,
        reason:
          baseResult.reason === 'images_insert_failed'
            ? 'images_insert_failed'
            : 'item_insert_failed',
        message:
          baseResult.reason === 'images_insert_failed'
            ? 'تعذر تثبيت صور العنصر. حاول مرة أخرى.'
            : 'تعذر نشر العنصر. حاول مرة أخرى.',
      };
    }

    if (videoTeaserAsset) {
      onProgress?.({ phase: 'video_uploading', current: 1, total: 1 });
      const videoUpload = await uploadItemVideoTeaser({ asset: videoTeaserAsset, itemId, userId });

      if (!videoUpload.ok) {
        await teswaBackendRuntime.marketplace.markPublishFailed(itemId, userId);
        const imageCleanup = await cleanupInsertedImageRowsThenStorage(itemId, uploadedPaths);
        if (!imageCleanup.ok) {
          return {
            ok: false,
            reason: 'upload_failed',
            message: 'تعذر إكمال نشر فيديو العنصر أو تنظيف الصور بأمان. حاول مرة أخرى.',
          };
        }
        return {
          ok: false,
          reason: 'upload_failed',
          message: videoUpload.message || 'تعذر رفع فيديو العنصر. حاول مرة أخرى.',
        };
      }

      uploadedVideoPath = videoUpload.storagePath;

      const videoInsertResult = await teswaBackendRuntime.marketplace.attachPublishedVideo({
        itemId,
        videoStoragePath: videoUpload.storagePath,
        durationMs: videoUpload.durationMs,
        width: videoUpload.width,
        height: videoUpload.height,
      });

      if (!videoInsertResult.ok) {
        if (__DEV__) {
          console.log('[publishItem] video metadata insert failed', {
            userId,
            itemId,
            message: videoInsertResult.message,
          });
        }
        await teswaBackendRuntime.marketplace.markPublishFailed(itemId, userId);
        await cleanupItemVideoStorage(uploadedVideoPath);
        const imageCleanup = await cleanupInsertedImageRowsThenStorage(itemId, uploadedPaths);
        if (!imageCleanup.ok) {
          return {
            ok: false,
            reason: 'video_insert_failed',
            message: 'تعذر تثبيت فيديو العنصر أو تنظيف الصور بأمان. حاول مرة أخرى.',
          };
        }
        return {
          ok: false,
          reason: 'video_insert_failed',
          message: 'تعذر تثبيت فيديو العنصر. حاول مرة أخرى.',
        };
      }
    }

    if (payload.wantedTags.length) {
      const tagsResult = await teswaBackendRuntime.marketplace.addPublishedWantedTags(
        itemId,
        payload.wantedTags,
      );
      if (!tagsResult.ok && __DEV__) {
        console.log('[publishItem] wanted tags insert failed', {
          itemId,
          message: tagsResult.message,
        });
      }
    }

    return { ok: true, itemId };
  } catch (error) {
    if (__DEV__) console.log('[publishItem] unexpected failure', { userId, itemId, code: (error as { code?: string })?.code, message: (error as { message?: string })?.message });
    await cleanupStorage(uploadedPaths);
    await cleanupItemVideoStorage(uploadedVideoPath);
    return { ok: false, reason: 'upload_failed', message: 'حدث خطأ غير متوقع أثناء النشر.' };
  }
}

async function cleanupStorage(paths: string[]) {
  if (!paths.length) return;
  await teswaBackendRuntime.media.remove(
    paths.map((objectKey) => ({
      purpose: 'item_image' as const,
      objectKey,
      contentType: null,
      sizeBytes: null,
    })),
  );
}

async function cleanupItemVideoStorage(path: string | null) {
  if (!path) return;
  await teswaBackendRuntime.media.remove([
    {
      purpose: 'item_video',
      objectKey: path,
      contentType: null,
      sizeBytes: null,
    },
  ]);
}

async function cleanupInsertedImageRowsThenStorage(
  itemId: string,
  storagePaths: string[],
): Promise<{ ok: true } | { ok: false }> {
  const deleteResult = await teswaBackendRuntime.marketplace.deletePublishedImageMetadata(itemId);
  if (!deleteResult.ok) {
    if (__DEV__) {
      console.log('[publishItem] image metadata cleanup failed', {
        itemId,
        message: deleteResult.message,
      });
    }
    return { ok: false };
  }

  await cleanupStorage(storagePaths);
  return { ok: true };
}
