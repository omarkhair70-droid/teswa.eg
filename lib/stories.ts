import * as Crypto from 'expo-crypto';
import type { ImagePickerAsset } from 'expo-image-picker';
import { teswaBackendRuntime } from '@/lib/backend/runtime';

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



async function fetchStoryAuthorsByUserIds(
  userIds: string[],
): Promise<Map<string, StoryAuthorSummary>> {
  if (!userIds.length) return new Map();

  const authors = await Promise.all(
    userIds.map(async (userId) => {
      const author = await teswaBackendRuntime.stories.getAuthor(userId);
      return [
        userId,
        author ?? {
          id: userId,
          displayName: null,
          username: null,
          avatarUrl: null,
        },
      ] as const;
    }),
  );

  return new Map(authors);
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
  const uploadResult = await teswaBackendRuntime.media.upload({
    purpose: 'story_media',
    ownerId: userId,
    objectKeyHint: storagePath,
    source: {
      uri: asset.uri,
      fileName: asset.fileName ?? null,
      mimeType: contentType,
      sizeBytes: asset.fileSize ?? fileBuffer.byteLength,
      buffer: fileBuffer,
    },
    onProgress: (progress) => {
      emitProgress?.({
        stage: 'uploading',
        uploadPercent: progress.percent,
        message: 'جارٍ رفع الوسائط...',
      });
    },
  });

  if (!uploadResult.ok) {
    return { ok: false, reason: 'upload_failed', message: 'تعذر رفع الوسائط حالياً. حاول مرة أخرى.' };
  }

  emitProgress?.({ stage: 'saving', uploadPercent: 100, message: 'نثبت القصة...' });

  const durationMs = mediaType === 'video' ? Math.max(0, Math.round(asset.duration ?? 0)) || null : null;

  const insertResult = await teswaBackendRuntime.stories.create({
    userId,
    mediaType,
    mediaStoragePath: storagePath,
    mediaThumbnailStoragePath: null,
    caption: normalizedCaption ? normalizedCaption : null,
    durationMs,
    width: asset.width ?? null,
    height: asset.height ?? null,
  });

  if (!insertResult.ok) {
    emitProgress?.({
      stage: 'cleanup',
      uploadPercent: 100,
      message: 'نعالج فشل النشر...',
    });
    await teswaBackendRuntime.media.remove([{
      purpose: 'story_media',
      objectKey: storagePath,
      contentType,
      sizeBytes: fileBuffer.byteLength,
    }]);
    return {
      ok: false,
      reason: 'insert_failed',
      message: 'تم رفع الوسائط لكن تعذر نشر القصة. حاول مرة أخرى.',
    };
  }

  return { ok: true, storyId: insertResult.data.storyId };
}


export async function deleteStoryFromMobile(input: {
  userId: string;
  storyId: string;
}): Promise<DeleteStoryResult> {
  const userId = input.userId?.trim();
  if (!userId) {
    return {
      ok: false,
      reason: 'invalid_user',
      message: 'يجب تسجيل الدخول أولاً.',
    };
  }

  const storyId = input.storyId?.trim();
  if (!storyId) {
    return {
      ok: false,
      reason: 'invalid_story',
      message: 'تعذر تحديد القصة المطلوبة.',
    };
  }

  const deleteResult = await teswaBackendRuntime.stories.deleteOwned({
    userId,
    storyId,
  });

  if (!deleteResult.ok) {
    if (deleteResult.reason === 'not_found') {
      return {
        ok: false,
        reason: 'not_found',
        message: 'لم يتم العثور على القصة أو لم تعد متاحة.',
      };
    }
    if (__DEV__) {
      console.warn('[stories] deleteStoryFromMobile failed', deleteResult.message);
    }
    return {
      ok: false,
      reason: 'delete_failed',
      message: 'تعذر حذف القصة حالياً. حاول مرة أخرى.',
    };
  }

  if (!deleteResult.data.storagePaths.length) return { ok: true };

  const storageResult = await teswaBackendRuntime.media.remove(
    deleteResult.data.storagePaths.map((objectKey) => ({
      purpose: 'story_media' as const,
      objectKey,
      contentType: null,
      sizeBytes: null,
    })),
  );

  if (!storageResult.ok) {
    if (__DEV__) {
      console.warn(
        '[stories] deleteStoryFromMobile storage cleanup failed',
        storageResult.message,
      );
    }
    return { ok: true, storageCleanupFailed: true };
  }

  return { ok: true };
}

export async function fetchActiveStoriesByUserId(
  userId: string,
): Promise<StoryRecord[]> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return [];
  return teswaBackendRuntime.stories.listActiveByUser(normalizedUserId);
}

export async function fetchActiveStoriesForHome(): Promise<ActiveStorySummary[]> {
  return teswaBackendRuntime.stories.listActiveForHome();
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

  const result = await teswaBackendRuntime.media.getSignedUrl(
    {
      purpose: 'story_media',
      objectKey: normalizedPath,
      contentType: null,
      sizeBytes: null,
    },
    expiresInSeconds,
  );

  if (!result.ok) {
    if (__DEV__) console.warn('[stories] createStoryMediaSignedUrl failed', result.message);
    return null;
  }

  return result.data;
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
