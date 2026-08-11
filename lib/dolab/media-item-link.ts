import { supabase } from '@/lib/supabase/client';
import { normalizeDolabPersistenceError, type DolabPersistenceError } from '@/lib/dolab/errors';

export async function attachDolabMediaToItem(
  userId: string,
  mediaId: string,
  dolabItemId: string,
): Promise<{ ok: boolean; error: DolabPersistenceError | null }> {
  try {
    const existingResult = await supabase
      .from('dolab_media')
      .select('id,dolab_item_id')
      .eq('id', mediaId)
      .eq('user_id', userId)
      .maybeSingle();

    const existingError = normalizeDolabPersistenceError(existingResult.error);
    if (existingError) return { ok: false, error: existingError };
    if (!existingResult.data?.id) {
      return { ok: false, error: { kind: 'unknown', message: 'تعذر العثور على الميديا السحابية المرتبطة.' } };
    }

    const currentItemId = existingResult.data.dolab_item_id as string | null;
    if (currentItemId === dolabItemId) return { ok: true, error: null };
    if (currentItemId) {
      return {
        ok: false,
        error: {
          kind: 'unknown',
          message: 'الميديا مرتبطة بالفعل بمسودة سحابية أخرى؛ هنستخدم النسخة المحلية بدل نقلها.',
        },
      };
    }

    const { data, error } = await supabase
      .from('dolab_media')
      .update({ dolab_item_id: dolabItemId })
      .eq('id', mediaId)
      .eq('user_id', userId)
      .is('dolab_item_id', null)
      .select('id')
      .maybeSingle();

    const normalized = normalizeDolabPersistenceError(error);
    if (normalized) return { ok: false, error: normalized };
    if (!data?.id) {
      return { ok: false, error: { kind: 'unknown', message: 'الميديا موجودة في السحابة لكن تعذر ربطها بالمسودة.' } };
    }
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: { kind: 'unknown', message: 'تعذر ربط الميديا السحابية بالمسودة.' } };
  }
}
