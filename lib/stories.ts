import * as Crypto from 'expo-crypto';
import type { ImagePickerAsset } from 'expo-image-picker';
import { supabase } from '@/lib/supabase/client';

export type StoryMediaType = 'image' | 'video';

export type StoryRecord = {
  id: string;
  userId: string;
  mediaType: StoryMediaType;
  mediaStoragePath: string;
  mediaThumbnailStoragePath: string | null;
  caption: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  expiresAt: string;
};

export type StoryAuthorSummary = {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export type ActiveStorySummary = {
  author: StoryAuthorSummary;
  stories: StoryRecord[];
  latestCreatedAt: string;
};

export type StoryViewerContext = {
  author: StoryAuthorSummary;
  stories: StoryRecord[];
};

export type StoryPublishStage =
  | 'preparing'
  | 'uploading'
  | 'saving'
  | 'cleanup';

export type StoryPublishProgress = {
  stage: StoryPublishStage;
  uploadPercent: number | null;
  message: string;
};

export type PublishStoryInput = {
  userId: string;
  asset: ImagePickerAsset;
  caption?: string;
  onProgress?: (progress: StoryPublishProgress) => void;
};


export type DeleteStoryResult =
  | { ok: true; storageCleanupFailed?: boolean }
  | {
    ok: false;
    reason: 'invalid_user' | 'invalid_story' | 'not_found' | 'delete_failed';
    message: string;
  };

export type PublishStoryResult =
  | { ok: true; storyId: string }
  | {
    ok: false;
    reason:
      | 'invalid_user'
      | 'invalid_asset'
      | 'invalid_caption'
      | 'read_failed'
      | 'upload_failed'
      | 'insert_failed';
    message: string;
  };

function toStoryRecord(row: Record<string, unknown>): StoryRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    mediaType: row.media_type as StoryMediaType,
    mediaStoragePath: row.media_storage_path as string,
    mediaThumbnailStoragePath: (row.media_thumbnail_storage_path as string | null) ?? null,
    caption: (row.caption as string | null) ?? null,
    durationMs: (row.duration_ms as number | null) ?? null,
    width: (row.width as number | null) ?? null,
    height: (row.height as number | null) ?? null,
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
  };
}

function detectMediaType(asset: ImagePickerAsset): StoryMediaType | null {
  if (asset.type === 'image' || asset.type === 'video') return asset.type;
  if (asset.mimeType?.startsWith('image/')) return 'image';
  if (asset.mimeType?.startsWith('video/')) return 'video';
  return null;
}

function extensionFromAsset(asset: ImagePickerAsset, mediaType: StoryMediaType): string {
  const fileName = asset.fileName?.trim();
  if (fileName && fileName.includes('.')) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext) return ext;
  }

  const mimeExt = asset.mimeType?.split('/')[1]?.toLowerCase();
  if (mimeExt) {
    if (mimeExt.includes('jpeg')) return 'jpg';
    if (mimeExt.includes('quicktime')) return 'mov';
    return mimeExt;
  }

  return mediaType === 'video' ? 'mp4' : 'jpg';
}

function contentTypeFromAsset(asset: ImagePickerAsset, mediaType: StoryMediaType): string {
  if (asset.mimeType?.trim()) return asset.mimeType;
  return mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
}


async function uploadStoryMediaWithProgress(params: {
  storagePath: string;
  fileBuffer: ArrayBuffer;
  contentType: string;
  onProgress?: (progress: StoryPublishProgress) => void;
}): Promise<{ error: Error | null }> {
  const { storagePath, fileBuffer, contentType, onProgress } = params;
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (!accessToken) return { error: new Error('Missing auth session') };

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return { error: new Error('Missing Supabase config') };

  const uploadUrl = `${supabaseUrl}/storage/v1/object/story-media/${encodeURIComponent(storagePath).replace(/%2F/g, '/')}`;

  return await new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('apikey', supabaseAnonKey);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = (event) => {
      if (!onProgress) return;
      if (!event.lengthComputable) {
        onProgress({ stage: 'uploading', uploadPercent: null, message: 'جارٍ رفع الوسائط...' });
        return;
      }
      const percent = Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100)));
      onProgress({ stage: 'uploading', uploadPercent: percent, message: 'جارٍ رفع الوسائط...' });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve({ error: null });
      resolve({ error: new Error(`Upload failed with status ${xhr.status}`) });
    };

    xhr.onerror = () => resolve({ error: new Error('Network error during upload') });
    xhr.onabort = () => resolve({ error: new Error('Upload aborted') });
    xhr.send(fileBuffer);
  });
}

async function fetchStoryAuthorsByUserIds(userIds: string[]): Promise<Map<string, StoryAuthorSummary>> {
  if (!userIds.length) return new Map();

  const { data, error } = await supabase
    .from('profiles')
    .select('id,display_name,username,avatar_url')
    .in('id', userIds);

  if (error) throw error;

  return new Map((data ?? []).map((profile: Record<string, unknown>) => [
    profile.id as string,
    {
      id: profile.id as string,
      displayName: (profile.display_name as string | null) ?? null,
      username: (profile.username as string | null) ?? null,
      avatarUrl: (profile.avatar_url as string | null) ?? null,
    },
  ]));
}

export async function publishStoryFromMobile(input: PublishStoryInput): Promise<PublishStoryResult> {
  const emitProgress = input.onProgress;
  const userId = input.userId?.trim();
  if (!userId) return { ok: false, reason: 'invalid_user', message: 'يجب تسجيل الدخول أولاً لنشر القصة.' };

  const asset = input.asset;
  if (!asset?.uri) return { ok: false, reason: 'invalid_asset', message: 'لم يتم العثور على ملف الوسائط.' };

  const mediaType = detectMediaType(asset);
  if (!mediaType) return { ok: false, reason: 'invalid_asset', message: 'نوع الوسائط غير مدعوم. اختر صورة أو فيديو فقط.' };

  const normalizedCaption = input.caption?.trim() ?? '';
  if (normalizedCaption.length > 220) {
    return { ok: false, reason: 'invalid_caption', message: 'تعليق القصة يجب ألا يتجاوز 220 حرفاً.' };
  }

  const extension = extensionFromAsset(asset, mediaType);
  const contentType = contentTypeFromAsset(asset, mediaType);
  const storagePath = createStoryUploadPath(userId, mediaType, extension);

  emitProgress?.({ stage: 'preparing', uploadPercent: null, message: 'نجهّز ملف القصة...' });

  let fileBuffer: ArrayBuffer;
  try {
    const response = await fetch(asset.uri);
    fileBuffer = await response.arrayBuffer();
  } catch {
    return { ok: false, reason: 'read_failed', message: 'تعذر قراءة ملف الوسائط. حاول مرة أخرى.' };
  }

  emitProgress?.({ stage: 'uploading', uploadPercent: 0, message: 'جارٍ رفع الوسائط...' });
  const { error: uploadError } = await uploadStoryMediaWithProgress({
    storagePath,
    fileBuffer,
    contentType,
    onProgress: emitProgress,
  });

  if (uploadError) {
    return { ok: false, reason: 'upload_failed', message: 'تعذر رفع الوسائط حالياً. حاول مرة أخرى.' };
  }

  emitProgress?.({ stage: 'saving', uploadPercent: 100, message: 'نثبت القصة...' });

  const durationMs = mediaType === 'video' ? Math.max(0, Math.round(asset.duration ?? 0)) || null : null;

  const { data, error: insertError } = await supabase
    .from('stories')
    .insert({
      user_id: userId,
      media_type: mediaType,
      media_storage_path: storagePath,
      media_thumbnail_storage_path: null,
      caption: normalizedCaption ? normalizedCaption : null,
      duration_ms: durationMs,
      width: asset.width ?? null,
      height: asset.height ?? null,
    })
    .select('id')
    .single();

  if (insertError || !data?.id) {
    emitProgress?.({ stage: 'cleanup', uploadPercent: 100, message: 'نعالج فشل النشر...' });
    await supabase.storage.from('story-media').remove([storagePath]);
    return { ok: false, reason: 'insert_failed', message: 'تم رفع الوسائط لكن تعذر نشر القصة. حاول مرة أخرى.' };
  }

  return { ok: true, storyId: data.id as string };
}


export async function deleteStoryFromMobile(input: {
  userId: string;
  storyId: string;
}): Promise<DeleteStoryResult> {
  const userId = input.userId?.trim();
  if (!userId) return { ok: false, reason: 'invalid_user', message: 'يجب تسجيل الدخول أولاً.' };

  const storyId = input.storyId?.trim();
  if (!storyId) return { ok: false, reason: 'invalid_story', message: 'تعذر تحديد القصة المطلوبة.' };

  const { data: storyRow, error: fetchError } = await supabase
    .from('stories')
    .select('id,user_id,media_storage_path,media_thumbnail_storage_path')
    .eq('id', storyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    if (__DEV__) console.warn('[stories] deleteStoryFromMobile fetch failed', fetchError.message);
    return { ok: false, reason: 'delete_failed', message: 'تعذر حذف القصة حالياً. حاول مرة أخرى.' };
  }

  if (!storyRow) {
    return { ok: false, reason: 'not_found', message: 'لم يتم العثور على القصة أو لم تعد متاحة.' };
  }

  const { error: deleteError } = await supabase
    .from('stories')
    .delete()
    .eq('id', storyId)
    .eq('user_id', userId);

  if (deleteError) {
    if (__DEV__) console.warn('[stories] deleteStoryFromMobile delete failed', deleteError.message);
    return { ok: false, reason: 'delete_failed', message: 'تعذر حذف القصة حالياً. حاول مرة أخرى.' };
  }

  const storagePaths = [storyRow.media_storage_path, storyRow.media_thumbnail_storage_path]
    .filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
    .map((path) => path.trim());

  if (!storagePaths.length) return { ok: true };

  const { error: storageError } = await supabase.storage.from('story-media').remove(storagePaths);
  if (storageError) {
    if (__DEV__) console.warn('[stories] deleteStoryFromMobile storage cleanup failed', storageError.message);
    return { ok: true, storageCleanupFailed: true };
  }

  return { ok: true };
}

export async function fetchActiveStoriesByUserId(userId: string): Promise<StoryRecord[]> {
  // Ordered oldest -> newest to simplify sequential viewer playback.
  const { data, error } = await supabase
    .from('stories')
    .select('id,user_id,media_type,media_storage_path,media_thumbnail_storage_path,caption,duration_ms,width,height,created_at,expires_at')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toStoryRecord);
}

export async function fetchActiveStoriesForHome(): Promise<ActiveStorySummary[]> {
  const { data, error } = await supabase
    .from('stories')
    .select('id,user_id,media_type,media_storage_path,media_thumbnail_storage_path,caption,duration_ms,width,height,created_at,expires_at')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) throw error;

  const rows: Record<string, unknown>[] = (data ?? []) as Record<string, unknown>[];
  if (!rows.length) return [];

  const stories = rows.map(toStoryRecord);
  const userIds: string[] = Array.from(new Set(stories.map((story) => story.userId)));
  const authorsById = await fetchStoryAuthorsByUserIds(userIds);

  const grouped = new Map<string, StoryRecord[]>();
  for (const story of stories) {
    const existing = grouped.get(story.userId) ?? [];
    existing.push(story);
    grouped.set(story.userId, existing);
  }

  return userIds
    .map((userId) => {
      const author = authorsById.get(userId) ?? {
        id: userId,
        displayName: null,
        username: null,
        avatarUrl: null,
      };
      const userStories = (grouped.get(userId) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const latestCreatedAt = userStories[userStories.length - 1]?.createdAt ?? '';

      return {
        author,
        stories: userStories,
        latestCreatedAt,
      };
    })
    .sort((a, b) => b.latestCreatedAt.localeCompare(a.latestCreatedAt));
}

export function createStoryUploadPath(userId: string, mediaType: StoryMediaType, extension: string): string {
  const normalizedExt = extension.replace(/^\./, '').toLowerCase() || (mediaType === 'video' ? 'mp4' : 'jpg');
  const timestamp = Date.now();
  return `${userId}/${timestamp}-${Crypto.randomUUID()}.${normalizedExt}`;
}



type StorySignedUrlCacheEntry = {
  signedUrl: string;
  expiresAtMs: number;
};

const STORY_SIGNED_URL_EXPIRY_SAFETY_BUFFER_MS = 60_000;
const storySignedUrlCache = new Map<string, StorySignedUrlCacheEntry>();

export async function createStoryMediaSignedUrl(storagePath: string, expiresInSeconds = 3600): Promise<string | null> {
  const normalizedPath = storagePath.trim();
  if (!normalizedPath) return null;

  const { data, error } = await supabase.storage
    .from('story-media')
    .createSignedUrl(normalizedPath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    if (__DEV__) console.warn('[stories] createStoryMediaSignedUrl failed', error?.message ?? 'unknown');
    return null;
  }

  return data.signedUrl;
}



export async function createStoryMediaSignedUrlCached(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const normalizedPath = storagePath.trim();
  if (!normalizedPath) return null;

  const cached = storySignedUrlCache.get(normalizedPath);
  if (cached && Date.now() < (cached.expiresAtMs - STORY_SIGNED_URL_EXPIRY_SAFETY_BUFFER_MS)) {
    return cached.signedUrl;
  }

  const signedUrl = await createStoryMediaSignedUrl(normalizedPath, expiresInSeconds);
  if (!signedUrl) return null;

  storySignedUrlCache.set(normalizedPath, {
    signedUrl,
    expiresAtMs: Date.now() + (expiresInSeconds * 1000),
  });

  return signedUrl;
}

export async function fetchStoryViewerContextByUserId(userId: string): Promise<StoryViewerContext | null> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return null;

  const stories = await fetchActiveStoriesByUserId(normalizedUserId);
  if (!stories.length) return null;

  const authors = await fetchStoryAuthorsByUserIds([normalizedUserId]);
  const author = authors.get(normalizedUserId) ?? {
    id: normalizedUserId,
    displayName: null,
    username: null,
    avatarUrl: null,
  };

  return { author, stories };
}
