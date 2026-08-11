import { supabase } from '@/lib/supabase/client';
import { normalizeDolabPersistenceError, type DolabPersistenceError } from '@/lib/dolab/errors';

export async function linkDolabNoteToMedia(
  userId: string,
  noteId: string,
  mediaId: string,
): Promise<{ ok: boolean; error: DolabPersistenceError | null }> {
  try {
    const { error } = await supabase
      .from('dolab_notes')
      .update({ media_id: mediaId })
      .eq('id', noteId)
      .eq('user_id', userId);

    return { ok: !error, error: normalizeDolabPersistenceError(error) };
  } catch {
    return {
      ok: false,
      error: { kind: 'unknown', message: 'اتحفظ التسجيل، لكن تعذر ربطه بالملاحظة السحابية.' },
    };
  }
}
