import { supabase } from '@/lib/supabase/client';
import type { DolabDraftItem } from '@/lib/dolab/draft-types';
import { normalizeDolabPersistenceError, type DolabPersistenceError } from '@/lib/dolab/errors';
import type { DolabSelfMessage, DolabSelfMessageType } from '@/lib/dolab/self-chat-types';
import type { DolabItem, DolabItemSource, DolabItemStatus, DolabMedia, DolabNote, DolabNoteType } from '@/lib/dolab/types';

type DolabResult<T> = { data: T; error: DolabPersistenceError | null };

type SaveDolabDraftInput = Pick<DolabDraftItem, 'title' | 'description' | 'category' | 'condition'> & {
  status?: Extract<DolabItemStatus, 'draft' | 'ready'>;
  source?: Extract<DolabItemSource, 'manual'>;
};
const DOLAB_BUCKET = 'dolab-media';

type SaveDolabNoteInput = Pick<DolabSelfMessage, 'body'> & {
  messageType: DolabSelfMessageType;
  dolabItemId?: string | null;
};

export type DolabRemoteSnapshot = {
  items: DolabItem[];
  media: DolabMedia[];
  notes: DolabNote[];
};

const mapMessageTypeToNoteType = (messageType: DolabSelfMessageType): DolabNoteType => {
  if (messageType === 'voice_placeholder') return 'voice';
  return messageType;
};

export async function saveDolabDraftItem(userId: string, input: SaveDolabDraftInput): Promise<DolabResult<DolabItem | null>> {
  const { data, error } = await supabase
    .from('dolab_items')
    .insert({
      user_id: userId,
      title: input.title || null,
      description: input.description || null,
      category: input.category || null,
      condition: input.condition || null,
      status: input.status ?? 'draft',
      source: input.source ?? 'manual',
    })
    .select('*')
    .single();

  return { data: (data as DolabItem | null) ?? null, error: normalizeDolabPersistenceError(error) };
}

export async function updateDolabDraftItem(userId: string, id: string, input: SaveDolabDraftInput): Promise<DolabResult<DolabItem | null>> {
  const { data, error } = await supabase
    .from('dolab_items')
    .update({
      title: input.title || null,
      description: input.description || null,
      category: input.category || null,
      condition: input.condition || null,
      status: input.status ?? 'draft',
      source: input.source ?? 'manual',
    })
    .eq('user_id', userId)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  return { data: (data as DolabItem | null) ?? null, error: normalizeDolabPersistenceError(error) };
}

export async function updateDolabSavedItem(userId: string, itemId: string, input: SaveDolabDraftInput): Promise<DolabResult<DolabItem | null>> {
  return updateDolabDraftItem(userId, itemId, input);
}

export async function saveDolabSelfNote(userId: string, input: SaveDolabNoteInput): Promise<DolabResult<DolabNote | null>> {
  const { data, error } = await supabase
    .from('dolab_notes')
    .insert({
      user_id: userId,
      body: input.body,
      note_type: mapMessageTypeToNoteType(input.messageType),
      dolab_item_id: input.dolabItemId ?? null,
      media_id: null,
    })
    .select('*')
    .single();

  return { data: (data as DolabNote | null) ?? null, error: normalizeDolabPersistenceError(error) };
}

export async function fetchDolabRemoteSnapshot(userId: string): Promise<DolabResult<DolabRemoteSnapshot>> {
  const [itemsResult, mediaResult, notesResult] = await Promise.all([
    fetchDolabItems(userId),
    fetchDolabMedia(userId),
    fetchDolabNotes(userId),
  ]);

  const normalizedError = itemsResult.error ?? mediaResult.error ?? notesResult.error;

  return {
    data: {
      items: itemsResult.data,
      media: mediaResult.data,
      notes: notesResult.data,
    },
    error: normalizedError,
  };
}

export async function fetchDolabItems(userId: string): Promise<DolabResult<DolabItem[]>> {
  try {
    const { data, error } = await supabase.from('dolab_items').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    return { data: (data as DolabItem[] | null) ?? [], error: normalizeDolabPersistenceError(error) };
  } catch {
    return {
      data: [],
      error: {
        kind: 'unknown',
        message: 'تعذر تحديث الدولاب حاليًا. شغّال محليًا مؤقتًا.',
      },
    };
  }
}

export async function fetchDolabMedia(userId: string): Promise<DolabResult<DolabMedia[]>> {
  try {
    const { data, error } = await supabase.from('dolab_media').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    return { data: (data as DolabMedia[] | null) ?? [], error: normalizeDolabPersistenceError(error) };
  } catch {
    return {
      data: [],
      error: {
        kind: 'unknown',
        message: 'تعذر تحديث الدولاب حاليًا. شغّال محليًا مؤقتًا.',
      },
    };
  }
}

export async function fetchDolabNotes(userId: string): Promise<DolabResult<DolabNote[]>> {
  try {
    const { data, error } = await supabase.from('dolab_notes').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    return { data: (data as DolabNote[] | null) ?? [], error: normalizeDolabPersistenceError(error) };
  } catch {
    return {
      data: [],
      error: {
        kind: 'unknown',
        message: 'تعذر تحديث الدولاب حاليًا. شغّال محليًا مؤقتًا.',
      },
    };
  }
}

export async function deleteDolabNote(userId: string, noteId: string): Promise<DolabResult<{ id: string } | null>> {
  try {
    const { error } = await supabase.from('dolab_notes').delete().eq('id', noteId).eq('user_id', userId);
    return { data: error ? null : { id: noteId }, error: normalizeDolabPersistenceError(error) };
  } catch {
    return {
      data: null,
      error: {
        kind: 'unknown',
        message: 'تعذر حذف الملاحظة من الدولاب حاليًا.',
      },
    };
  }
}

export async function deleteDolabItem(userId: string, itemId: string): Promise<DolabResult<{ id: string } | null>> {
  try {
    const { error } = await supabase.from('dolab_items').delete().eq('id', itemId).eq('user_id', userId);
    return { data: error ? null : { id: itemId }, error: normalizeDolabPersistenceError(error) };
  } catch {
    return {
      data: null,
      error: {
        kind: 'unknown',
        message: 'تعذر حذف العنصر من الدولاب حاليًا.',
      },
    };
  }
}

export async function deleteDolabMedia(
  userId: string,
  mediaId: string,
  storagePath: string,
): Promise<DolabResult<{ id: string } | null>> {
  try {
    // Delete the DB row first so the UI/source-of-truth no longer references this media.
    const { error } = await supabase.from('dolab_media').delete().eq('id', mediaId).eq('user_id', userId);
    if (error) {
      return {
        data: null,
        error: normalizeDolabPersistenceError(error) ?? { kind: 'unknown', message: 'تعذر حذف الميديا من الدولاب.' },
      };
    }

    const storageResult = await supabase.storage.from(DOLAB_BUCKET).remove([storagePath]);
    if (storageResult.error) {
      return {
        data: { id: mediaId },
        error: {
          kind: 'unknown',
          message: 'اتحذف سجل الميديا، لكن تنظيف ملف التخزين السحابي اتعطل.',
        },
      };
    }

    return { data: { id: mediaId }, error: null };
  } catch {
    return {
      data: null,
      error: {
        kind: 'unknown',
        message: 'تعذر حذف الميديا من الدولاب حاليًا.',
      },
    };
  }
}


export async function fetchDolabPublishSource(userId: string, dolabItemId: string): Promise<DolabResult<{ item: DolabItem | null; media: DolabMedia[] }>> {
  try {
    const [itemResult, mediaResult] = await Promise.all([
      supabase.from('dolab_items').select('*').eq('user_id', userId).eq('id', dolabItemId).maybeSingle(),
      supabase.from('dolab_media').select('*').eq('user_id', userId).eq('dolab_item_id', dolabItemId).order('sort_order', { ascending: true }),
    ]);

    return {
      data: {
        item: (itemResult.data as DolabItem | null) ?? null,
        media: (mediaResult.data as DolabMedia[] | null) ?? [],
      },
      error: normalizeDolabPersistenceError(itemResult.error) ?? normalizeDolabPersistenceError(mediaResult.error),
    };
  } catch {
    return { data: { item: null, media: [] }, error: { kind: 'unknown', message: 'تعذر تحميل بيانات النشر من الدولاب.' } };
  }
}

export async function markDolabItemPublished(userId: string, dolabItemId: string, publishedItemId: string): Promise<DolabResult<DolabItem | null>> {
  try {
    const { data, error } = await supabase
      .from('dolab_items')
      .update({ status: 'published', published_item_id: publishedItemId })
      .eq('user_id', userId)
      .eq('id', dolabItemId)
      .select('*')
      .maybeSingle();

    return { data: (data as DolabItem | null) ?? null, error: normalizeDolabPersistenceError(error) };
  } catch {
    return { data: null, error: { kind: 'unknown', message: 'تم نشر العنصر لكن تعذر تحديث حالة الدولاب.' } };
  }
}

export const fetchDolabLibrarySnapshot = fetchDolabRemoteSnapshot;

export { buildDolabStoragePath, saveDolabMediaRow, uploadAndSaveDolabMedia, uploadDolabPendingMedia } from '@/lib/dolab/upload';
export { createDolabMediaSignedUrl, createDolabMediaSignedUrls } from '@/lib/dolab/signed-urls';
