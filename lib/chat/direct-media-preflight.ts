import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { Video as VideoCompressor } from 'react-native-compressor';

export type DirectLocalAttachment = {
  id: string;
  kind: 'image' | 'video' | 'file' | 'audio';
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

const IMAGE_COMPRESSION_THRESHOLD = 1.5 * 1024 * 1024;
const VIDEO_COMPRESSION_THRESHOLD = 8 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

async function resolveSize(uri: string, fallback?: number | null) {
  if (typeof fallback === 'number' && fallback > 0) return fallback;
  if (/^https?:\/\//i.test(uri)) return null;
  try {
    const info = await new File(uri).info();
    return typeof info.size === 'number' && info.size > 0 ? info.size : null;
  } catch {
    return null;
  }
}

function jpegName(value?: string | null) {
  const base = value?.trim() || `image-${Date.now()}.jpg`;
  if (/\.jpe?g$/i.test(base)) return base;
  if (/\.[a-z0-9]{1,8}$/i.test(base)) return base.replace(/\.[a-z0-9]{1,8}$/i, '.jpg');
  return `${base}.jpg`;
}

export async function prepareDirectAttachment(
  input: DirectLocalAttachment,
): Promise<{ ok: true; attachment: DirectLocalAttachment; compressed: boolean } | { ok: false; message: string }> {
  const initialSize = await resolveSize(input.uri, input.sizeBytes);

  if (input.kind === 'file' || input.kind === 'audio' || /^https?:\/\//i.test(input.uri)) {
    if (initialSize && initialSize > MAX_ATTACHMENT_BYTES) {
      return { ok: false, message: 'حجم المرفق أكبر من 50 MB.' };
    }
    return { ok: true, attachment: { ...input, sizeBytes: initialSize ?? input.sizeBytes }, compressed: false };
  }

  if (input.kind === 'image' && initialSize && initialSize > IMAGE_COMPRESSION_THRESHOLD) {
    try {
      const result = await ImageManipulator.manipulateAsync(input.uri, [], {
        compress: 0.78,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      const compressedSize = await resolveSize(result.uri, null);
      const useCompressed = !!compressedSize && (!initialSize || compressedSize < initialSize);
      if (useCompressed) {
        if (compressedSize > MAX_ATTACHMENT_BYTES) return { ok: false, message: 'الصورة أكبر من الحد المسموح بعد التجهيز.' };
        return {
          ok: true,
          attachment: {
            ...input,
            uri: result.uri,
            fileName: jpegName(input.fileName),
            mimeType: 'image/jpeg',
            sizeBytes: compressedSize,
          },
          compressed: true,
        };
      }
    } catch {}
  }

  if (input.kind === 'video' && initialSize && initialSize > VIDEO_COMPRESSION_THRESHOLD) {
    try {
      const compressedUri = await VideoCompressor.compress(input.uri, { compressionMethod: 'auto' });
      const compressedSize = compressedUri ? await resolveSize(compressedUri, null) : null;
      const useCompressed = !!compressedUri && !!compressedSize && (!initialSize || compressedSize < initialSize);
      if (useCompressed) {
        if (compressedSize > MAX_ATTACHMENT_BYTES) return { ok: false, message: 'الفيديو أكبر من الحد المسموح بعد التجهيز.' };
        return {
          ok: true,
          attachment: {
            ...input,
            uri: compressedUri,
            sizeBytes: compressedSize,
          },
          compressed: true,
        };
      }
    } catch {}
  }

  const finalSize = await resolveSize(input.uri, initialSize);
  if (finalSize && finalSize > MAX_ATTACHMENT_BYTES) {
    return { ok: false, message: 'حجم المرفق أكبر من 50 MB.' };
  }
  return {
    ok: true,
    attachment: { ...input, sizeBytes: finalSize ?? input.sizeBytes },
    compressed: false,
  };
}

export const directAttachmentLimits = {
  maxAttachmentsPerMessage: 5,
  maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
} as const;
