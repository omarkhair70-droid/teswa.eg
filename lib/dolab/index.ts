import { supabase } from '@/lib/supabase/client';
import type { DolabDraftItem } from '@/lib/dolab/draft-types';
import { normalizeDolabPersistenceError, type DolabPersistenceError } from '@/lib/dolab/errors';
import type { DolabSelfMessage, DolabSelfMessageType } from '@/lib/dolab/self-chat-types';
import type { DolabItem, DolabItemSource, DolabItemStatus, DolabNote, DolabNoteType } from '@/lib/dolab/types';

type DolabResult<T> = { data: T; error: DolabPersistenceError | null };

type SaveDolabDraftInput = Pick<DolabDraftItem, 'title' | 'description' | 'category' | 'condition'> & {
  status?: Extract<DolabItemStatus, 'draft' | 'ready'>;
  source?: Extract<DolabItemSource, 'manual'>;
};

type SaveDolabNoteInput = Pick<DolabSelfMessage, 'body'> & {
  messageType: DolabSelfMessageType;
  dolabItemId?: string | null;
};

export type DolabRemoteSnapshot = {
  items: DolabItem[];
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
  const [itemsResult, notesResult] = await Promise.all([
    supabase.from('dolab_items').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('dolab_notes').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
  ]);

  const normalizedError = normalizeDolabPersistenceError(itemsResult.error ?? notesResult.error);

  return {
    data: {
      items: (itemsResult.data as DolabItem[] | null) ?? [],
      notes: (notesResult.data as DolabNote[] | null) ?? [],
    },
    error: normalizedError,
  };
}
