import { teswaBackendRuntime } from '@/lib/backend/runtime';
import { supabase } from '@/lib/supabase/client';
import { normalizeDolabPersistenceError, type DolabPersistenceError } from '@/lib/dolab/errors';
import type { DolabPendingMedia } from '@/lib/dolab/media-types';
import type { DolabMedia, DolabMediaType } from '@/lib/dolab/types';

type DolabResult<T> = { data: T; error: DolabPersistenceError | null };

type SaveDolabMediaRowInput = {
  dolabItemId?: string | null;
  mediaType: DolabMediaType;
  storagePath: string;
  durationMs?: number;
  width?: number;
  height?: number;
  mimeType?: string;
  sizeBytes?: number;
  sortOrder?: number;
};

const BUCKET_MISSING_CODES = new Set(['404', 'NoSuchBucket']);

function isBucketMissingError(error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined): boolean {
  if (!error) return false;
  const code = `${error.code ?? ''}`;
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();

  return BUCKET_MISSING_CODES.has(code)
    || text.includes('bucket') && text.includes('not found')
    || text.includes('bucket') && text.includes('does not exist');
}

function normalizeUploadError(error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined): DolabPersistenceError | null {
  if (!error) return null;

  if (isBucketMissingError(error)) {
    return {
      kind: 'schema_missing',
      message: 'تعذر الوصول لمخزن الدولاب السحابي. نسخة الجهاز ما زالت محفوظة.',
      code: error.code ?? undefined,
    };
  }

  return normalizeDolabPersistenceError(error);
}

function safeFileName(name?: string): string {
  if (!name) return 'media';
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'media';
}

function fallbackContentType(media: DolabPendingMedia): string {
  if (media.mediaType === 'image') return 'image/jpeg';
  if (media.mediaType === 'video') return 'video/mp4';
  if (media.mediaType === 'audio') return 'audio/m4a';
  return 'application/octet-stream';
}

export function buildDolabStoragePath(userId: string, dolabItemIdOrInbox: string, media: DolabPendingMedia): string {
  const stamp = media.id || `${Date.now()}`;
  const fileName = safeFileName(media.fileName ?? media.uri.split('/').pop());
  return `${userId}/${dolabItemIdOrInbox}/${stamp}-${fileName}`;
}

export async function uploadDolabPendingMedia(
  userId: string,
  media: DolabPendingMedia,
  dolabItemId?: string | null,
): Promise<DolabResult<{ storagePath: string } | null>> {
  const storagePath = buildDolabStoragePath(userId, dolabItemId ?? 'inbox', media);
  try {
    const uploadResult = await teswaBackendRuntime.media.upload({
      purpose: 'dolab_media',
      ownerId: userId,
      source: {
        uri: media.uri,
        fileName: media.fileName,
        mimeType: media.mimeType ?? fallbackContentType(media),
        sizeBytes: media.sizeBytes,
      },
      objectKeyHint: storagePath,
    });

    if (!uploadResult.ok) {
      if (uploadResult.reason === 'invalid_source') {
        return {
          data: null,
          error: { kind: 'unknown', message: 'الملف المحلي فاضي أو غير متاح. نسخة الدولاب ما اتغيرتش.' },
        };
      }
      return {
        data: null,
        error: normalizeUploadError({ message: uploadResult.message }),
      };
    }

    return { data: { storagePath: uploadResult.data.objectKey }, error: null };
  } catch {
    return {
      data: null,
      error: {
        kind: 'unknown',
        message: 'تعذر قراءة الملف من الجهاز أو رفعه. النسخة المحلية ما زالت محفوظة.',
      },
    };
  }
}

export async function saveDolabMediaRow(userId: string, input: SaveDolabMediaRowInput): Promise<DolabResult<DolabMedia | null>> {
  const { data, error } = await supabase
    .from('dolab_media')
    .insert({
      user_id: userId,
      dolab_item_id: input.dolabItemId ?? null,
      media_type: input.mediaType,
      storage_path: input.storagePath,
      thumbnail_path: null,
      duration_ms: input.durationMs ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      mime_type: input.mimeType ?? null,
      size_bytes: input.sizeBytes ?? null,
      sort_order: input.sortOrder ?? 0,
    })
    .select('*')
    .single();

  const normalized = normalizeDolabPersistenceError(error);
  if (normalized?.kind === 'schema_missing') {
    return {
      data: null,
      error: { ...normalized, message: 'تعذر تسجيل الميديا في الدولاب السحابي. النسخة المحلية ما زالت محفوظة.' },
    };
  }

  return { data: (data as DolabMedia | null) ?? null, error: normalized };
}

export async function uploadAndSaveDolabMedia(
  userId: string,
  media: DolabPendingMedia,
  options?: { dolabItemId?: string | null; sortOrder?: number },
): Promise<DolabResult<{ storagePath: string; media: DolabMedia } | null>> {
  const uploadResult = await uploadDolabPendingMedia(userId, media, options?.dolabItemId);
  if (uploadResult.error || !uploadResult.data) {
    return { data: null, error: uploadResult.error };
  }

  const rowResult = await saveDolabMediaRow(userId, {
    dolabItemId: options?.dolabItemId ?? null,
    mediaType: media.mediaType,
    storagePath: uploadResult.data.storagePath,
    durationMs: media.durationMs,
    width: media.width,
    height: media.height,
    mimeType: media.mimeType ?? fallbackContentType(media),
    sizeBytes: media.sizeBytes,
    sortOrder: options?.sortOrder,
  });

  if (rowResult.error || !rowResult.data) {
    void teswaBackendRuntime.media.remove([
      {
        purpose: 'dolab_media',
        objectKey: uploadResult.data.storagePath,
        contentType: media.mimeType ?? fallbackContentType(media),
        sizeBytes: media.sizeBytes ?? null,
      },
    ]);
    return { data: null, error: rowResult.error };
  }

  return {
    data: {
      storagePath: uploadResult.data.storagePath,
      media: rowResult.data,
    },
    error: null,
  };
}
