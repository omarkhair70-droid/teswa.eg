import { teswaBackendRuntime } from '@/lib/backend/runtime';
import { normalizeDolabPersistenceError, type DolabPersistenceError } from '@/lib/dolab/errors';

export async function linkDolabNoteToMedia(
  userId: string,
  noteId: string,
  mediaId: string,
): Promise<{ ok: boolean; error: DolabPersistenceError | null }> {
  try {
    const result = await teswaBackendRuntime.dolab.linkNoteToMedia(
      userId,
      noteId,
      mediaId,
    );

    if (result.ok) return { ok: true, error: null };

    return {
      ok: false,
      error:
        normalizeDolabPersistenceError(result.cause as any)
        ?? {
          kind: 'unknown',
          message: 'اتحفظ التسجيل، لكن تعذر ربطه بالملاحظة السحابية.',
        },
    };
  } catch {
    return {
      ok: false,
      error: {
        kind: 'unknown',
        message: 'اتحفظ التسجيل، لكن تعذر ربطه بالملاحظة السحابية.',
      },
    };
  }
}
