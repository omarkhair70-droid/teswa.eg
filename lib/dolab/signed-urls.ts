import { teswaBackendRuntime } from '@/lib/backend/runtime';
import { normalizeDolabPersistenceError, type DolabPersistenceError } from '@/lib/dolab/errors';
import type { DolabMedia } from '@/lib/dolab/types';

type DolabResult<T> = { data: T; error: DolabPersistenceError | null };

export const DOLAB_MEDIA_SIGNED_URL_EXPIRES_IN = 60 * 60;

export async function createDolabMediaSignedUrl(storagePath: string): Promise<DolabResult<string | null>> {
  const normalizedPath = storagePath.trim();
  if (!normalizedPath) {
    return { data: null, error: null };
  }

  try {
    const result = await teswaBackendRuntime.media.getSignedUrl(
      {
        purpose: 'dolab_media',
        objectKey: normalizedPath,
        contentType: null,
        sizeBytes: null,
      },
      DOLAB_MEDIA_SIGNED_URL_EXPIRES_IN,
    );

    if (!result.ok) {
      return {
        data: null,
        error: normalizeDolabPersistenceError({ message: result.message }),
      };
    }

    return { data: result.data, error: null };
  } catch {
    return {
      data: null,
      error: {
        kind: 'unknown',
        message: 'تعذر تجهيز معاينة الميديا المحفوظة الآن.',
      },
    };
  }
}

export async function createDolabMediaSignedUrls(
  mediaRows: DolabMedia[],
): Promise<DolabResult<Record<string, string | null>>> {
  const urlByMediaId: Record<string, string | null> = {};
  let firstError: DolabPersistenceError | null = null;

  const results = await Promise.all(
    mediaRows.map(async (media) => {
      const result = await createDolabMediaSignedUrl(media.storage_path ?? '');
      return { mediaId: media.id, result };
    }),
  );

  results.forEach(({ mediaId, result }) => {
    urlByMediaId[mediaId] = result.data;
    if (!firstError && result.error) {
      firstError = result.error;
    }
  });

  return { data: urlByMediaId, error: firstError };
}
