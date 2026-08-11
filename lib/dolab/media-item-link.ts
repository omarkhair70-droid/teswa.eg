import { supabase } from '@/lib/supabase/client';
import { normalizeDolabPersistenceError, type DolabPersistenceError } from '@/lib/dolab/errors';

export async function attachDolabMediaToItem(
  userId: string,
  mediaId: string,
  dolabItemId: string,
): Promise<{ ok: boolean; error: DolabPersistenceError | null }> {
  try {
    const { data, error } = await supabase
      .from('dolab_media')
      .update({ dolab_item_id: dolabItemId })
      .eq('id', mediaId)
      .eq('user_id', userId)
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
