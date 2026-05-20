import * as Crypto from 'expo-crypto';
import type { ImagePickerAsset } from 'expo-image-picker';
import { supabase } from '@/lib/supabase/client';
import { compressItemImage } from '@/lib/media/compress-item-image';
import { ITEM_VIDEOS_BUCKET, uploadItemVideoTeaser } from '@/lib/item-videos';

const ITEM_IMAGES_BUCKET = 'item-images';
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
  const { data, error } = await supabase.from('categories').select('id,name_ar').eq('is_active', true).order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ActiveCategory[];
}

function sanitizeFileName(name: string | null | undefined, fallback: string): string {
  const raw = (name || fallback).toLowerCase();
  return raw.replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-');
}

async function fileUriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  return response.arrayBuffer();
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
      const body = await fileUriToArrayBuffer(optimized.uri);

      const { error: uploadError } = await supabase.storage.from(ITEM_IMAGES_BUCKET).upload(path, body, { contentType, upsert: false });
      if (uploadError) {
        if (__DEV__) console.log('[publishItem] image upload failed', { userId, itemId, path, code: (uploadError as { code?: string }).code, message: uploadError.message });
        await cleanupStorage(uploadedPaths);
        return { ok: false, reason: 'upload_failed', message: 'تعذر رفع الصور. تأكد من الاتصال وحاول مرة أخرى.' };
      }
      uploadedPaths.push(path);


      const { data: publicUrlData } = supabase.storage.from(ITEM_IMAGES_BUCKET).getPublicUrl(path);
      uploadedImages.push({ image_url: publicUrlData.publicUrl, is_primary: i === 0, sort_order: i });
    }

    const { error: itemError } = await supabase.from('items').insert({
      id: itemId,
      owner_id: userId,
      title: payload.title,
      category_id: payload.categoryId,
      description: payload.description,
      condition: payload.condition,
      condition_notes: payload.conditionNotes,
      city: payload.city,
      area: payload.area,
      location_latitude: payload.locationLatitude,
      location_longitude: payload.locationLongitude,
      desire_mode: payload.desireMode,
      desire_text: payload.desireText,
      item_story: payload.itemStory,
      swap_reason: payload.swapReason,
      good_for: payload.goodFor,
      status: 'active',
      source: 'direct_listing',
    });

    if (itemError) {
      if (__DEV__) console.log('[publishItem] item insert failed', { userId, itemId, code: itemError.code, message: itemError.message });
      await cleanupStorage(uploadedPaths);
      return { ok: false, reason: 'item_insert_failed', message: 'تعذر نشر العنصر. حاول مرة أخرى.' };
    }

    const { error: imagesError } = await supabase.from('item_images').insert(uploadedImages.map((img) => ({ ...img, item_id: itemId })));
    if (imagesError) {
      if (__DEV__) console.log('[publishItem] image metadata insert failed', { userId, itemId, code: imagesError.code, message: imagesError.message });
      await supabase.from('items').update({ status: 'archived' }).eq('id', itemId).eq('owner_id', userId);
      await cleanupStorage(uploadedPaths);
      return { ok: false, reason: 'images_insert_failed', message: 'تعذر تثبيت صور العنصر. حاول مرة أخرى.' };
    }

    if (videoTeaserAsset) {
      onProgress?.({ phase: 'video_uploading', current: 1, total: 1 });
      const videoUpload = await uploadItemVideoTeaser({ asset: videoTeaserAsset, itemId, userId });

      if (!videoUpload.ok) {
        await supabase.from('items').update({ status: 'archived' }).eq('id', itemId).eq('owner_id', userId);
        const imageCleanup = await cleanupInsertedImageRowsThenStorage(itemId, uploadedPaths);
        if (!imageCleanup.ok) {
          return { ok: false, reason: 'upload_failed', message: 'تعذر إكمال نشر فيديو العنصر أو تنظيف الصور بأمان. حاول مرة أخرى.' };
        }
        return { ok: false, reason: 'upload_failed', message: videoUpload.message || 'تعذر رفع فيديو العنصر. حاول مرة أخرى.' };
      }

      uploadedVideoPath = videoUpload.storagePath;

      const { error: videoInsertError } = await supabase.from('item_videos').insert({
        item_id: itemId,
        video_storage_path: videoUpload.storagePath,
        duration_ms: videoUpload.durationMs,
        width: videoUpload.width,
        height: videoUpload.height,
      });

      if (videoInsertError) {
        if (__DEV__) console.log('[publishItem] video metadata insert failed', { userId, itemId, code: videoInsertError.code, message: videoInsertError.message });
        await supabase.from('items').update({ status: 'archived' }).eq('id', itemId).eq('owner_id', userId);
        await cleanupItemVideoStorage(uploadedVideoPath);
        const imageCleanup = await cleanupInsertedImageRowsThenStorage(itemId, uploadedPaths);
        if (!imageCleanup.ok) {
          return { ok: false, reason: 'video_insert_failed', message: 'تعذر تثبيت فيديو العنصر أو تنظيف الصور بأمان. حاول مرة أخرى.' };
        }
        return { ok: false, reason: 'video_insert_failed', message: 'تعذر تثبيت فيديو العنصر. حاول مرة أخرى.' };
      }
    }

    if (payload.wantedTags.length) {
      const { error: tagsError } = await supabase.from('item_wanted_tags').insert(payload.wantedTags.map((tag) => ({ item_id: itemId, tag })));
      if (tagsError && __DEV__) {
        console.log('[publishItem] wanted tags insert failed', { itemId, message: tagsError.message });
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
  await supabase.storage.from(ITEM_IMAGES_BUCKET).remove(paths);
}

async function cleanupItemVideoStorage(path: string | null) {
  if (!path) return;
  await supabase.storage.from(ITEM_VIDEOS_BUCKET).remove([path]);
}

async function cleanupInsertedImageRowsThenStorage(itemId: string, storagePaths: string[]): Promise<{ ok: true } | { ok: false }> {
  const { error: deleteRowsError } = await supabase.from('item_images').delete().eq('item_id', itemId);
  if (deleteRowsError) {
    if (__DEV__) console.log('[publishItem] image metadata cleanup failed', { itemId, code: deleteRowsError.code, message: deleteRowsError.message });
    return { ok: false };
  }

  await cleanupStorage(storagePaths);
  return { ok: true };
}
