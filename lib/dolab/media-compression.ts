import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { Video as VideoCompressor } from 'react-native-compressor';
import type { DolabPendingMedia } from '@/lib/dolab/media-types';

export const IMAGE_COMPRESSION_THRESHOLD_BYTES = 1.5 * 1024 * 1024;
export const VIDEO_COMPRESSION_THRESHOLD_BYTES = 8 * 1024 * 1024;

export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 80 * 1024 * 1024;
export const MAX_AUDIO_UPLOAD_BYTES = 20 * 1024 * 1024;

const UNKNOWN_SIZE_FALLBACK = 0;

type DolabResult<T> = { data: T; error: string | null };

async function getFileSizeBytes(uri: string): Promise<number | undefined> {
  const info = await FileSystem.getInfoAsync(uri, { size: true });
  if (!info.exists) return undefined;
  return typeof info.size === 'number' && info.size > 0 ? info.size : undefined;
}

export function maxUploadBytesForType(mediaType: DolabPendingMedia['mediaType']): number {
  if (mediaType === 'image') return MAX_IMAGE_UPLOAD_BYTES;
  if (mediaType === 'video') return MAX_VIDEO_UPLOAD_BYTES;
  return MAX_AUDIO_UPLOAD_BYTES;
}

export function shouldCompressDolabMedia(media: DolabPendingMedia): DolabResult<boolean> {
  if (media.mediaType === 'audio') return { data: false, error: null };
  if (media.compressionStatus === 'compressed' && media.compressedSizeBytes && media.uri) return { data: false, error: null };

  const size = media.sizeBytes ?? media.originalSizeBytes ?? UNKNOWN_SIZE_FALLBACK;
  if (media.mediaType === 'image') return { data: size > IMAGE_COMPRESSION_THRESHOLD_BYTES, error: null };
  if (media.mediaType === 'video') return { data: size > VIDEO_COMPRESSION_THRESHOLD_BYTES, error: null };
  return { data: false, error: null };
}

export async function compressDolabMedia(media: DolabPendingMedia): Promise<DolabResult<DolabPendingMedia>> {
  try {
    const originalSizeBytes = media.originalSizeBytes ?? media.sizeBytes;
    if (media.mediaType === 'audio') {
      return { data: { ...media, compressionStatus: 'not_needed', compressionError: undefined }, error: null };
    }

    if (media.compressionStatus === 'compressed' && media.compressedSizeBytes) {
      return { data: media, error: null };
    }

    if (media.mediaType === 'image') {
      const imageResult = await ImageManipulator.manipulateAsync(media.uri, [], { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG });
      const compressedSizeBytes = await getFileSizeBytes(imageResult.uri);
      return {
        data: {
          ...media,
          originalUri: media.originalUri ?? media.uri,
          originalSizeBytes: originalSizeBytes ?? media.sizeBytes,
          uri: imageResult.uri,
          mimeType: 'image/jpeg',
          compressedSizeBytes,
          sizeBytes: compressedSizeBytes ?? media.sizeBytes,
          compressionStatus: 'compressed',
          compressionError: undefined,
        },
        error: null,
      };
    }

    const compressedUri = await VideoCompressor.compress(media.uri, { compressionMethod: 'auto' });
    const compressedSizeBytes = compressedUri ? await getFileSizeBytes(compressedUri) : undefined;
    return {
      data: {
        ...media,
        originalUri: media.originalUri ?? media.uri,
        originalSizeBytes: originalSizeBytes ?? media.sizeBytes,
        uri: compressedUri || media.uri,
        compressedSizeBytes,
        sizeBytes: compressedSizeBytes ?? media.sizeBytes,
        compressionStatus: compressedUri ? 'compressed' : 'failed',
        compressionError: compressedUri ? undefined : 'تعذر ضغط الفيديو.',
      },
      error: compressedUri ? null : 'تعذر ضغط الفيديو.',
    };
  } catch {
    return {
      data: {
        ...media,
        compressionStatus: 'failed',
        compressionError: 'تعذر ضغط بعض الملفات. هنحاول نحفظ الأصل لو حجمه مناسب.',
      },
      error: 'تعذر ضغط بعض الملفات. هنحاول نحفظ الأصل لو حجمه مناسب.',
    };
  }
}

export function formatCompressionSavings(originalSizeBytes?: number, compressedSizeBytes?: number): DolabResult<string | null> {
  if (!originalSizeBytes || !compressedSizeBytes || compressedSizeBytes >= originalSizeBytes) return { data: null, error: null };
  const savedPercent = Math.round(((originalSizeBytes - compressedSizeBytes) / originalSizeBytes) * 100);
  if (savedPercent <= 0) return { data: null, error: null };
  return { data: `تم تقليل الحجم ${savedPercent}%`, error: null };
}
