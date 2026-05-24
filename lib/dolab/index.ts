import { supabase } from '@/lib/supabase/client';
import type {
  DolabDashboardSummary,
  DolabItem,
  DolabItemSource,
  DolabItemStatus,
  DolabMedia,
  DolabNote,
  DolabNoteType,
} from '@/lib/dolab/types';

type DolabResult<T> = { data: T; error: string | null };

type CreateDolabItemDraftInput = {
  userId: string;
  title?: string | null;
  description?: string | null;
  category?: string | null;
  condition?: string | null;
  source?: DolabItemSource;
  status?: DolabItemStatus;
};

type CreateDolabNoteInput = {
  userId: string;
  dolabItemId?: string | null;
  noteType?: DolabNoteType;
  body?: string | null;
  mediaId?: string | null;
  sharedToConversationId?: string | null;
};

const getSafeErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unexpected Dolab error');

export async function fetchDolabItems(userId: string): Promise<DolabResult<DolabItem[]>> {
  try {
    const { data, error } = await supabase
      .from('dolab_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as DolabItem[], error: null };
  } catch (error) {
    return { data: [], error: getSafeErrorMessage(error) };
  }
}

export async function fetchDolabMedia(userId: string): Promise<DolabResult<DolabMedia[]>> {
  try {
    const { data, error } = await supabase
      .from('dolab_media')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as DolabMedia[], error: null };
  } catch (error) {
    return { data: [], error: getSafeErrorMessage(error) };
  }
}

export async function fetchDolabNotes(userId: string): Promise<DolabResult<DolabNote[]>> {
  try {
    const { data, error } = await supabase
      .from('dolab_notes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as DolabNote[], error: null };
  } catch (error) {
    return { data: [], error: getSafeErrorMessage(error) };
  }
}

export async function fetchDolabDashboardSummary(userId: string): Promise<DolabResult<DolabDashboardSummary>> {
  const emptySummary: DolabDashboardSummary = {
    totalItems: 0,
    draftItems: 0,
    readyItems: 0,
    publishedItems: 0,
    exchangedItems: 0,
    archivedItems: 0,
    totalMedia: 0,
    totalNotes: 0,
  };

  const [itemsResult, mediaResult, notesResult] = await Promise.all([
    fetchDolabItems(userId),
    fetchDolabMedia(userId),
    fetchDolabNotes(userId),
  ]);

  const error = itemsResult.error || mediaResult.error || notesResult.error;
  if (error) return { data: emptySummary, error };

  return {
    data: {
      totalItems: itemsResult.data.length,
      draftItems: itemsResult.data.filter((item) => item.status === 'draft').length,
      readyItems: itemsResult.data.filter((item) => item.status === 'ready').length,
      publishedItems: itemsResult.data.filter((item) => item.status === 'published').length,
      exchangedItems: itemsResult.data.filter((item) => item.status === 'exchanged').length,
      archivedItems: itemsResult.data.filter((item) => item.status === 'archived').length,
      totalMedia: mediaResult.data.length,
      totalNotes: notesResult.data.length,
    },
    error: null,
  };
}

export async function createDolabItemDraft(input: CreateDolabItemDraftInput): Promise<DolabResult<DolabItem | null>> {
  try {
    const { data, error } = await supabase
      .from('dolab_items')
      .insert({
        user_id: input.userId,
        title: input.title ?? null,
        description: input.description ?? null,
        category: input.category ?? null,
        condition: input.condition ?? null,
        source: input.source ?? 'manual',
        status: input.status ?? 'draft',
      })
      .select('*')
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as DolabItem, error: null };
  } catch (error) {
    return { data: null, error: getSafeErrorMessage(error) };
  }
}

export async function createDolabNote(input: CreateDolabNoteInput): Promise<DolabResult<DolabNote | null>> {
  try {
    const { data, error } = await supabase
      .from('dolab_notes')
      .insert({
        user_id: input.userId,
        dolab_item_id: input.dolabItemId ?? null,
        note_type: input.noteType ?? 'text',
        body: input.body ?? null,
        media_id: input.mediaId ?? null,
        shared_to_conversation_id: input.sharedToConversationId ?? null,
      })
      .select('*')
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as DolabNote, error: null };
  } catch (error) {
    return { data: null, error: getSafeErrorMessage(error) };
  }
}
