import type {
  DolabContract,
  DolabItemWriteInput,
  DolabMediaWriteInput,
} from '@/lib/backend/contracts/dolab';
import type { DolabItem, DolabMedia, DolabNote } from '@/lib/dolab/types';
import { supabase } from '@/lib/supabase/client';

function itemPayload(input: DolabItemWriteInput) {
  return {
    title: input.title,
    description: input.description,
    category: input.category,
    condition: input.condition,
    exchange_intent: input.exchangeIntent,
    status: input.status,
    source: input.source,
  };
}

function mediaPayload(userId: string, input: DolabMediaWriteInput) {
  return {
    user_id: userId,
    dolab_item_id: input.dolabItemId,
    media_type: input.mediaType,
    storage_path: input.storagePath,
    thumbnail_path: null,
    duration_ms: input.durationMs,
    width: input.width,
    height: input.height,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    sort_order: input.sortOrder,
  };
}

export function createSupabaseDolabAdapter(): DolabContract {
  return {
    async createItem(userId, input) {
      const { data, error } = await supabase
        .from('dolab_items')
        .insert({
          user_id: userId,
          ...itemPayload(input),
        })
        .select('*')
        .single();

      if (error || !data) {
        return {
          ok: false,
          reason: 'unknown',
          message: error?.message ?? 'Dolab item insert returned no row.',
          cause: error ?? undefined,
        };
      }

      return { ok: true, data: data as DolabItem };
    },

    async updateItem(userId, itemId, input) {
      const { data, error } = await supabase
        .from('dolab_items')
        .update(itemPayload(input))
        .eq('user_id', userId)
        .eq('id', itemId)
        .select('*')
        .maybeSingle();

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }

      return { ok: true, data: (data as DolabItem | null) ?? null };
    },

    async createNote(input) {
      const { data, error } = await supabase
        .from('dolab_notes')
        .insert({
          user_id: input.userId,
          body: input.body,
          note_type: input.noteType,
          dolab_item_id: input.dolabItemId,
          media_id: input.mediaId,
        })
        .select('*')
        .single();

      if (error || !data) {
        return {
          ok: false,
          reason: 'unknown',
          message: error?.message ?? 'Dolab note insert returned no row.',
          cause: error ?? undefined,
        };
      }

      return { ok: true, data: data as DolabNote };
    },

    async listItems(userId) {
      const { data, error } = await supabase
        .from('dolab_items')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }

      return { ok: true, data: (data as DolabItem[] | null) ?? [] };
    },

    async listMedia(userId) {
      const { data, error } = await supabase
        .from('dolab_media')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }

      return { ok: true, data: (data as DolabMedia[] | null) ?? [] };
    },

    async listNotes(userId) {
      const { data, error } = await supabase
        .from('dolab_notes')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }

      return { ok: true, data: (data as DolabNote[] | null) ?? [] };
    },

    async deleteNote(userId, noteId) {
      const { error } = await supabase
        .from('dolab_notes')
        .delete()
        .eq('id', noteId)
        .eq('user_id', userId);

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }

      return { ok: true, data: undefined };
    },

    async deleteItem(userId, itemId) {
      const { error } = await supabase
        .from('dolab_items')
        .delete()
        .eq('id', itemId)
        .eq('user_id', userId);

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }

      return { ok: true, data: undefined };
    },

    async deleteMediaRow(userId, mediaId) {
      const { error } = await supabase
        .from('dolab_media')
        .delete()
        .eq('id', mediaId)
        .eq('user_id', userId);

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }

      return { ok: true, data: undefined };
    },

    async getPublishSource(userId, dolabItemId) {
      const [itemResult, mediaResult] = await Promise.all([
        supabase
          .from('dolab_items')
          .select('*')
          .eq('user_id', userId)
          .eq('id', dolabItemId)
          .maybeSingle(),
        supabase
          .from('dolab_media')
          .select('*')
          .eq('user_id', userId)
          .eq('dolab_item_id', dolabItemId)
          .order('sort_order', { ascending: true }),
      ]);

      if (itemResult.error) {
        return {
          ok: false,
          reason: 'unknown',
          message: itemResult.error.message,
          cause: itemResult.error,
        };
      }
      if (mediaResult.error) {
        return {
          ok: false,
          reason: 'unknown',
          message: mediaResult.error.message,
          cause: mediaResult.error,
        };
      }

      return {
        ok: true,
        data: {
          item: (itemResult.data as DolabItem | null) ?? null,
          media: (mediaResult.data as DolabMedia[] | null) ?? [],
        },
      };
    },

    async markItemPublished(userId, dolabItemId, publishedItemId) {
      const { data, error } = await supabase
        .from('dolab_items')
        .update({
          status: 'published',
          published_item_id: publishedItemId,
        })
        .eq('user_id', userId)
        .eq('id', dolabItemId)
        .select('*')
        .maybeSingle();

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }

      return { ok: true, data: (data as DolabItem | null) ?? null };
    },

    async markNoteShared(userId, noteId, conversationId) {
      const { error } = await supabase
        .from('dolab_notes')
        .update({ shared_to_conversation_id: conversationId })
        .eq('id', noteId)
        .eq('user_id', userId);

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }

      return { ok: true, data: undefined };
    },

    async attachMediaToItem(userId, mediaId, dolabItemId) {
      const { data: existing, error: existingError } = await supabase
        .from('dolab_media')
        .select('id,dolab_item_id')
        .eq('id', mediaId)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingError) {
        return {
          ok: false,
          reason: 'unknown',
          message: existingError.message,
          cause: existingError,
        };
      }
      if (!existing?.id) {
        return {
          ok: false,
          reason: 'not_found',
          message: 'Dolab media was not found.',
        };
      }

      const currentItemId = existing.dolab_item_id as string | null;
      if (currentItemId === dolabItemId) {
        return { ok: true, data: { state: 'already_linked' } };
      }
      if (currentItemId) {
        return { ok: true, data: { state: 'linked_elsewhere' } };
      }

      const { data, error } = await supabase
        .from('dolab_media')
        .update({ dolab_item_id: dolabItemId })
        .eq('id', mediaId)
        .eq('user_id', userId)
        .is('dolab_item_id', null)
        .select('id')
        .maybeSingle();

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }
      if (!data?.id) {
        return {
          ok: false,
          reason: 'unknown',
          message: 'Dolab media could not be linked.',
        };
      }

      return { ok: true, data: { state: 'linked' } };
    },

    async linkNoteToMedia(userId, noteId, mediaId) {
      const { error } = await supabase
        .from('dolab_notes')
        .update({ media_id: mediaId })
        .eq('id', noteId)
        .eq('user_id', userId);

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }

      return { ok: true, data: undefined };
    },

    async createMediaRow(userId, input) {
      const { data, error } = await supabase
        .from('dolab_media')
        .insert(mediaPayload(userId, input))
        .select('*')
        .single();

      if (error || !data) {
        return {
          ok: false,
          reason: 'unknown',
          message: error?.message ?? 'Dolab media insert returned no row.',
          cause: error ?? undefined,
        };
      }

      return { ok: true, data: data as DolabMedia };
    },
  };
}
