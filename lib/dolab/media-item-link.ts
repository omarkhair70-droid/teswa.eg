import { teswaBackendRuntime } from '@/lib/backend/runtime';
import { normalizeDolabPersistenceError, type DolabPersistenceError } from '@/lib/dolab/errors';

export async function attachDolabMediaToItem(
  userId: string,
  mediaId: string,
  dolabItemId: string,
): Promise<{ ok: boolean; error: DolabPersistenceError | null }> {
  try {
    const result = await teswaBackendRuntime.dolab.attachMediaToItem(
      userId,
      mediaId,
      dolabItemId,
    );

    if (!result.ok) {
      if (result.reason === 'not_found') {
        return {
          ok: false,
          error: {
            kind: 'unknown',
            message: 'تعذر العثور على الميديا السحابية المرتبطة.',
          },
        };
      }

      return {
        ok: false,
        error:
          normalizeDolabPersistenceError(result.cause as any)
          ?? {
            kind: 'unknown',
            message: 'تعذر ربط الميديا السحابية بالمسودة.',
          },
      };
    }

    if (result.data.state === 'linked_elsewhere') {
      return {
        ok: false,
        error: {
          kind: 'unknown',
          message: 'الميديا مرتبطة بالفعل بمسودة سحابية أخرى؛ هنستخدم النسخة المحلية بدل نقلها.',
        },
      };
    }

    return { ok: true, error: null };
  } catch {
    return {
      ok: false,
      error: {
        kind: 'unknown',
        message: 'تعذر ربط الميديا السحابية بالمسودة.',
      },
    };
  }
}
