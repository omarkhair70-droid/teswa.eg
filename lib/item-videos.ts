import * as Crypto from 'expo-crypto';
import type { ImagePickerAsset } from 'expo-image-picker';
import { supabase } from '@/lib/supabase/client';

export const ITEM_VIDEOS_BUCKET = 'item-videos';

export type ItemVideoTeaser = {
  id: string;
  itemId: string;
  videoStoragePath: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  signedVideoUrl: string | null;
};

export type UploadItemVideoTeaserResult =
  | { ok: true; storagePath: string; durationMs: number | null; width: number | null; height: number | null }
  | { ok: false; message: string };

type ItemVideoRow = {
  id: string;
  item_id: string;
  video_storage_path: string | null;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
};

type ItemVideoSignedUrlCacheEntry = {
  signedUrl: string;
  expiresAtMs: number;
};

const ITEM_VIDEO_SIGNED_URL_EXPIRY_SAFETY_BUFFER_MS = 60_000;
const itemVideoSignedUrlCache = new Map<string, ItemVideoSignedUrlCacheEntry>();

function isVideoAsset(asset: ImagePickerAsset): boolean {
  return asset.type === 'video' || asset.mimeType?.startsWith('video/') === true;
}

function extensionFromVideoAsset(asset: ImagePickerAsset): string {
  const fileName = asset.fileName?.trim();
  if (fileName && fileName.includes('.')) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext) return ext;
  }

  const mimeExt = asset.mimeType?.split('/')[1]?.toLowerCase();
  if (mimeExt) {
    if (mimeExt.includes('quicktime')) return 'mov';
    return mimeExt;
  }

  return 'mp4';
}

function contentTypeFromVideoAsset(asset: ImagePickerAsset): string {
  return asset.mimeType?.trim() || 'video/mp4';
}

function createItemVideoUploadPath(userId: string, itemId: string, extension: string): string {
  const normalizedExt = extension.replace(/^\./, '').toLowerCase() || 'mp4';
  return `${userId}/${itemId}/${Date.now()}-${Crypto.randomUUID()}.${normalizedExt}`;
}

function normalizePositiveInteger(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : null;
}

function toItemVideoTeaser(row: ItemVideoRow, signedVideoUrl: string | null): ItemVideoTeaser | null {
  if (!row.video_storage_path) return null;

  return {
    id: row.id,
    itemId: row.item_id,
    videoStoragePath: row.video_storage_path,
    durationMs: row.duration_ms ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    createdAt: row.created_at,
    signedVideoUrl,
  };
}

async function fileUriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  return response.arrayBuffer();
}

export async function uploadItemVideoTeaser(params: {
  asset: ImagePickerAsset;
  itemId: string;
  userId: string;
}): Promise<UploadItemVideoTeaserResult> {
  const { asset, itemId, userId } = params;
  if (!asset?.uri || !itemId.trim() || !userId.trim()) {
    return { ok: false, message: 'لم يتم العثور على فيديو صالح للنشر.' };
  }

  if (!isVideoAsset(asset)) {
    return { ok: false, message: 'ملف لمحة الفيديو يجب أن يكون فيديو.' };
  }

  const storagePath = createItemVideoUploadPath(userId, itemId, extensionFromVideoAsset(asset));

  try {
    const body = await fileUriToArrayBuffer(asset.uri);
    const { error } = await supabase.storage
      .from(ITEM_VIDEOS_BUCKET)
      .upload(storagePath, body, { contentType: contentTypeFromVideoAsset(asset), upsert: false });

    if (error) {
      if (__DEV__) console.warn('[item-videos] upload failed', error.message);
      return { ok: false, message: 'تعذر رفع فيديو العنصر. حاول مرة أخرى.' };
    }

    return {
      ok: true,
      storagePath,
      durationMs: normalizePositiveInteger(asset.duration),
      width: normalizePositiveInteger(asset.width),
      height: normalizePositiveInteger(asset.height),
    };
  } catch (error) {
    if (__DEV__) console.warn('[item-videos] upload unexpected failure', (error as { message?: string })?.message);
    return { ok: false, message: 'تعذر قراءة أو رفع فيديو العنصر. حاول مرة أخرى.' };
  }
}

export async function createItemVideoSignedUrlCached(storagePath: string, expiresInSeconds = 3600): Promise<string | null> {
  const normalizedPath = storagePath.trim();
  if (!normalizedPath) return null;

  const cached = itemVideoSignedUrlCache.get(normalizedPath);
  if (cached && Date.now() < cached.expiresAtMs - ITEM_VIDEO_SIGNED_URL_EXPIRY_SAFETY_BUFFER_MS) {
    return cached.signedUrl;
  }

  const { data, error } = await supabase.storage
    .from(ITEM_VIDEOS_BUCKET)
    .createSignedUrl(normalizedPath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    if (__DEV__) console.warn('[item-videos] signed url failed', error?.message ?? 'unknown');
    return null;
  }

  itemVideoSignedUrlCache.set(normalizedPath, {
    signedUrl: data.signedUrl,
    expiresAtMs: Date.now() + expiresInSeconds * 1000,
  });

  return data.signedUrl;
}

export async function fetchItemVideoTeaserByItemId(itemId: string): Promise<ItemVideoTeaser | null> {
  const normalizedItemId = itemId.trim();
  if (!normalizedItemId) return null;

  const { data, error } = await supabase
    .from('item_videos')
    .select('id,item_id,video_storage_path,duration_ms,width,height,created_at')
    .eq('item_id', normalizedItemId)
    .maybeSingle();

  if (error) {
    if (__DEV__) console.warn('[item-videos] fetch failed', error.message);
    return null;
  }

  const row = data as ItemVideoRow | null;
  if (!row?.video_storage_path) return null;

  const signedVideoUrl = await createItemVideoSignedUrlCached(row.video_storage_path);
  return toItemVideoTeaser(row, signedVideoUrl);
}
