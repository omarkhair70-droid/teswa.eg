import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';

/**
 * Media upload quality foundation:
 * - validates supported image formats (JPG, PNG, WebP)
 * - validates video teaser duration/size limits
 * - prepares images with safe normalization for upload (max width ~1600, quality ~0.82)
 *
 * Full video compression pipeline is intentionally deferred to a later PR.
 */

const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_WIDTH = 1600;
const IMAGE_COMPRESS_QUALITY = 0.82;
const MAX_VIDEO_TEASER_DURATION_MS = 15_000;
const MAX_VIDEO_TEASER_SIZE_BYTES = 80 * 1024 * 1024;

type UploadQualitySuccess<TAsset extends ImagePickerAsset> = {
  ok: true;
  asset: TAsset;
  warnings?: string[];
  info?: {
    width?: number;
    height?: number;
    durationMs?: number | null;
    sizeBytes?: number | null;
    transformed?: boolean;
  };
};

type UploadQualityFailure = {
  ok: false;
  message: string;
};

export type UploadQualityResult<TAsset extends ImagePickerAsset> = UploadQualitySuccess<TAsset> | UploadQualityFailure;

const looksLikeImageUri = (uri?: string | null) => Boolean(uri && /\.(jpe?g|png|webp)(\?.*)?$/i.test(uri));

export async function getMediaFileInfo(uri: string): Promise<{ exists: boolean; sizeBytes: number | null }> {
  try {
    const file = new File(uri);
    const info = file.info();
    if (!info.exists) return { exists: false, sizeBytes: null };
    return { exists: true, sizeBytes: typeof info.size === 'number' ? info.size : null };
  } catch {
    return { exists: false, sizeBytes: null };
  }
}

export function isSupportedImageAsset(asset: Pick<ImagePickerAsset, 'uri' | 'mimeType' | 'type'>): boolean {
  if (asset.type && asset.type !== 'image') return false;
  if (asset.mimeType) return SUPPORTED_IMAGE_MIME_TYPES.has(asset.mimeType.toLowerCase());
  return looksLikeImageUri(asset.uri);
}

export function validateImageAsset(asset: ImagePickerAsset): UploadQualityResult<ImagePickerAsset> {
  if (!asset?.uri) {
    return { ok: false, message: 'تعذر قراءة الصورة المختارة. حاول مرة أخرى.' };
  }
  if (asset.type && asset.type !== 'image') {
    return { ok: false, message: 'نوع الملف غير مدعوم. استخدم JPG أو PNG أو WebP للصور.' };
  }
  if (!isSupportedImageAsset(asset)) {
    return { ok: false, message: 'نوع الملف غير مدعوم. استخدم JPG أو PNG أو WebP للصور.' };
  }
  return {
    ok: true,
    asset,
    info: {
      width: asset.width,
      height: asset.height,
    },
  };
}

export async function prepareImageForUpload(
  asset: ImagePickerAsset,
  options?: { maxWidth?: number; compress?: number; enableOptimization?: boolean },
): Promise<UploadQualityResult<ImagePickerAsset>> {
  const validated = validateImageAsset(asset);
  if (!validated.ok) return validated;

  if (!options?.enableOptimization) {
    return { ...validated, warnings: [] };
  }

  const width = typeof asset.width === 'number' ? asset.width : null;
  const maxWidth = options?.maxWidth ?? MAX_IMAGE_WIDTH;
  const shouldResize = width != null && width > maxWidth;

  if (!shouldResize) {
    return {
      ok: true,
      asset,
      info: { width: asset.width, height: asset.height, transformed: false },
    };
  }

  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: maxWidth } }],
      {
        compress: options?.compress ?? IMAGE_COMPRESS_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );

    const nextFileName = asset.fileName
      ? asset.fileName.replace(/\.[^.]+$/, '.jpg')
      : null;

    const prepared: ImagePickerAsset = {
      ...asset,
      uri: manipulated.uri,
      width: manipulated.width,
      height: manipulated.height,
      mimeType: 'image/jpeg',
      type: 'image',
      fileName: nextFileName ?? asset.fileName ?? null,
    };

    return {
      ok: true,
      asset: prepared,
      warnings: ['تم تحسين الصور لتكون أخف وأوضح قبل النشر.'],
      info: {
        width: manipulated.width,
        height: manipulated.height,
        transformed: true,
      },
    };
  } catch {
    return {
      ok: true,
      asset,
      warnings: [],
      info: { width: asset.width, height: asset.height, transformed: false },
    };
  }
}

export function isSupportedVideoAsset(asset: Pick<ImagePickerAsset, 'mimeType' | 'type'>): boolean {
  if (asset.type === 'video') return true;
  return Boolean(asset.mimeType?.toLowerCase().startsWith('video/'));
}

export function getVideoDurationBucket(durationMs: number | null | undefined): 'unknown' | 'lte_15s' | 'gt_15s' {
  if (typeof durationMs !== 'number' || Number.isNaN(durationMs) || durationMs <= 0) return 'unknown';
  return durationMs <= MAX_VIDEO_TEASER_DURATION_MS ? 'lte_15s' : 'gt_15s';
}

export async function validateVideoTeaserAsset(asset: ImagePickerAsset): Promise<UploadQualityResult<ImagePickerAsset>> {
  if (!asset?.uri) return { ok: false, message: 'تعذر قراءة فيديو اللمحة. حاول مرة أخرى.' };
  if (!isSupportedVideoAsset(asset)) return { ok: false, message: 'اختر ملف فيديو فقط للمحة الحاجة.' };
  if (asset.duration != null && asset.duration > MAX_VIDEO_TEASER_DURATION_MS) {
    return { ok: false, message: 'فيديو اللمحة يجب ألا يتجاوز 15 ثانية. اختر فيديو أقصر.' };
  }

  const fileInfo = await getMediaFileInfo(asset.uri);
  if (fileInfo.sizeBytes != null && fileInfo.sizeBytes > MAX_VIDEO_TEASER_SIZE_BYTES) {
    return { ok: false, message: 'فيديو اللمحة كبير جدًا. اختر فيديو أقصر أو أخف.' };
  }

  return {
    ok: true,
    asset,
    info: {
      durationMs: asset.duration ?? null,
      sizeBytes: fileInfo.sizeBytes,
    },
  };
}
