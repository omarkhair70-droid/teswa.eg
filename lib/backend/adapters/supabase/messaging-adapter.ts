import type {
  DirectConversationStartMessageRecord,
  DirectConversationStartRecord,
  DirectConversationTransportRecord,
  DirectConversationTransportStatus,
  DirectMessageTransportRecord,
  DirectMessagingTransportContract,
  DirectSendMessageRecord,
} from '@/lib/backend/contracts/messaging';
import { supabase } from '@/lib/supabase/client';

function firstRow<T>(data: unknown): T | null {
  return Array.isArray(data) ? (data[0] as T | undefined) ?? null : null;
}

function mapConversation(row: any): DirectConversationTransportRecord {
  return {
    conversationId: row.conversation_id as string,
    status: row.status as DirectConversationTransportStatus,
    requestedBy: row.requested_by as string,
    otherUserId: row.other_user_id as string,
    otherDisplayName: (row.other_display_name as string | null) ?? null,
    otherUsername: (row.other_username as string | null) ?? null,
    otherAvatarUrl: (row.other_avatar_url as string | null) ?? null,
    lastMessageBody: (row.last_message_body as string | null) ?? null,
    lastMessageSenderId: (row.last_message_sender_id as string | null) ?? null,
    lastMessageAt: (row.last_message_at as string | null) ?? null,
    unreadCount: Number(row.unread_count ?? 0),
    requiresAction: Boolean(row.requires_action),
  };
}

function mapMessage(row: any): DirectMessageTransportRecord {
  return {
    id: row.id as string,
    senderId: row.sender_id as string,
    body: row.body as string,
    messageType: row.message_type === 'voice' ? 'voice' : 'text',
    audioStoragePath: (row.audio_storage_path as string | null) ?? null,
    audioDurationMs: (row.audio_duration_ms as number | null) ?? null,
    audioMimeType: (row.audio_mime_type as string | null) ?? null,
    audioSizeBytes: (row.audio_size_bytes as number | null) ?? null,
    createdAt: row.created_at as string,
    readAt: (row.read_at as string | null) ?? null,
  };
}

export function createSupabaseDirectMessagingAdapter(): DirectMessagingTransportContract {
  return {
    async startOrGet(targetUserId) {
      const { data, error } = await supabase.rpc('start_or_get_direct_conversation', {
        p_target_user_id: targetUserId,
      });
      if (error) return { ok: false, reason: 'unknown', message: error.message, cause: error };

      const row = firstRow<any>(data);
      const result: DirectConversationStartRecord = {
        ok: Boolean(row?.ok),
        conversationId: row?.conversation_id ?? null,
        status: row?.status ?? null,
        requiresRequest: Boolean(row?.requires_request),
        message: row?.message ?? null,
      };
      return { ok: true, data: result };
    },

    async startWithMessage(targetUserId, body) {
      const { data, error } = await supabase.rpc('start_direct_conversation_with_message', {
        p_target_user_id: targetUserId,
        p_body: body,
      });
      if (error) return { ok: false, reason: 'unknown', message: error.message, cause: error };

      const row = firstRow<any>(data);
      const result: DirectConversationStartMessageRecord = {
        ok: Boolean(row?.ok),
        conversationId: row?.conversation_id ?? null,
        messageId: row?.message_id ?? null,
        status: row?.status ?? null,
        createdAt: row?.created_at ?? null,
        message: row?.message ?? null,
      };
      return { ok: true, data: result };
    },

    async listConversations() {
      const { data, error } = await supabase.rpc('get_my_direct_conversations');
      if (error) return { ok: false, reason: 'unknown', message: error.message, cause: error };
      return { ok: true, data: (data ?? []).map(mapConversation) };
    },

    async getConversation(conversationId) {
      const { data, error } = await supabase.rpc('get_direct_conversation', {
        p_conversation_id: conversationId,
      });
      if (error) return { ok: false, reason: 'unknown', message: error.message, cause: error };
      const row = firstRow<any>(data);
      return { ok: true, data: row ? mapConversation(row) : null };
    },

    async listMessages(conversationId) {
      const { data, error } = await supabase.rpc('get_direct_conversation_messages', {
        p_conversation_id: conversationId,
      });
      if (error) return { ok: false, reason: 'unknown', message: error.message, cause: error };
      return { ok: true, data: (data ?? []).map(mapMessage) };
    },

    async sendText(conversationId, body) {
      const { data, error } = await supabase.rpc('send_direct_message', {
        p_conversation_id: conversationId,
        p_body: body,
      });
      if (error) {
        return {
          ok: false,
          reason: error.code === '42501' ? 'forbidden' : 'unknown',
          message: error.message,
          cause: error,
        };
      }

      const row = firstRow<any>(data);
      const result: DirectSendMessageRecord = {
        ok: Boolean(row?.ok),
        message: row?.message ?? null,
        messageId: row?.message_id ?? null,
        conversationId: row?.conversation_id ?? null,
        createdAt: row?.created_at ?? null,
      };
      return { ok: true, data: result };
    },

    async sendVoice(input) {
      const { data, error } = await supabase.rpc('send_direct_voice_message', {
        p_conversation_id: input.conversationId,
        p_audio_storage_path: input.audioStoragePath,
        p_audio_mime_type: input.audioMimeType,
        p_audio_duration_ms: input.audioDurationMs,
        p_audio_size_bytes: input.audioSizeBytes,
      });
      if (error) return { ok: false, reason: 'unknown', message: error.message, cause: error };

      const row = firstRow<any>(data);
      return {
        ok: true,
        data: {
          ok: Boolean(row?.ok),
          message: row?.message ?? null,
          messageId: row?.message_id ?? null,
          createdAt: row?.created_at ?? null,
        },
      };
    },

    async actOnRequest(action, conversationId) {
      const rpc = action === 'accept'
        ? 'accept_direct_message_request'
        : 'ignore_direct_message_request';
      const { data, error } = await supabase.rpc(rpc, {
        p_conversation_id: conversationId,
      });
      if (error) return { ok: false, reason: 'unknown', message: error.message, cause: error };

      const row = firstRow<any>(data);
      return {
        ok: true,
        data: {
          ok: Boolean(row?.ok),
          message: row?.message ?? null,
        },
      };
    },

    async markRead(conversationId) {
      // Preserve legacy behavior: this RPC updates read state as part of fetching.
      const { error } = await supabase.rpc('get_direct_conversation_messages', {
        p_conversation_id: conversationId,
      });
      if (error) return { ok: false, reason: 'unknown', message: error.message, cause: error };
      return { ok: true, data: undefined };
    },

    async listNativeMessages(input) {
      const { data, error } = await supabase.rpc('get_direct_native_messages', {
        p_conversation_id: input.conversationId,
        p_limit: input.limit,
        p_before: input.before ?? null,
      });
      if (error) {
        return { ok: false, reason: 'unknown', message: error.message, cause: error };
      }

      const normalizeAttachment = (value: any) => {
        if (!value || typeof value !== 'object') return null;
        const kind = value.kind;
        const storagePath = value.storagePath ?? value.storage_path;
        if (
          !['image', 'video', 'file', 'audio'].includes(kind)
          || typeof storagePath !== 'string'
          || !storagePath
        ) {
          return null;
        }
        return {
          id: typeof value.id === 'string' ? value.id : undefined,
          kind: kind as 'image' | 'video' | 'file' | 'audio',
          storagePath,
          storageBucket:
            typeof (value.storageBucket ?? value.storage_bucket) === 'string'
              ? value.storageBucket ?? value.storage_bucket
              : null,
          fileName: value.fileName ?? value.file_name ?? null,
          mimeType: value.mimeType ?? value.mime_type ?? null,
          sizeBytes: value.sizeBytes ?? value.size_bytes ?? null,
          durationMs: value.durationMs ?? value.duration_ms ?? null,
          width: value.width ?? null,
          height: value.height ?? null,
        };
      };

      const normalizeReaction = (value: any) => {
        if (!value || typeof value !== 'object') return null;
        const reaction = value.reaction;
        const userId = value.userId ?? value.user_id;
        if (
          !['love', 'thumbs_up'].includes(reaction)
          || typeof userId !== 'string'
          || !userId
        ) {
          return null;
        }
        return {
          reaction: reaction as 'love' | 'thumbs_up',
          userId,
          createdAt: value.createdAt ?? value.created_at ?? null,
        };
      };

      const messages = (data ?? []).map((row: any) => ({
        id: row.id as string,
        senderId: row.sender_id as string,
        body: (row.body as string | null) ?? '',
        messageType: row.message_type === 'voice' ? 'voice' as const : 'text' as const,
        createdAt: row.created_at as string,
        readAt: (row.read_at as string | null) ?? null,
        replyToMessageId: (row.reply_to_message_id as string | null) ?? null,
        replySenderId: (row.reply_sender_id as string | null) ?? null,
        replyBody: (row.reply_body as string | null) ?? null,
        metadata:
          row.metadata && typeof row.metadata === 'object'
            ? row.metadata as Record<string, unknown>
            : {},
        deletedAt: (row.deleted_at as string | null) ?? null,
        attachments: Array.isArray(row.attachments)
          ? row.attachments.map(normalizeAttachment).filter(Boolean)
          : [],
        reactions: Array.isArray(row.reactions)
          ? row.reactions.map(normalizeReaction).filter(Boolean)
          : [],
      }));

      return { ok: true, data: messages.reverse() };
    },

    async sendNativeMessage(input) {
      const attachments = (input.attachments ?? []).map((attachment) => ({
        id: attachment.id,
        kind: attachment.kind,
        storagePath: attachment.storagePath,
        storageBucket: attachment.storageBucket,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        durationMs: attachment.durationMs,
        width: attachment.width,
        height: attachment.height,
      }));

      const { data, error } = await supabase.rpc('send_direct_native_message', {
        p_conversation_id: input.conversationId,
        p_body: input.body?.trim() || null,
        p_reply_to_message_id: input.replyToMessageId ?? null,
        p_attachments: attachments,
        p_metadata: input.metadata ?? {},
      });

      if (error) {
        return { ok: false, reason: 'unknown', message: error.message, cause: error };
      }

      const row = firstRow<any>(data);
      return {
        ok: true,
        data: {
          ok: Boolean(row?.ok),
          message: row?.message ?? null,
          messageId: row?.message_id ?? null,
          createdAt: row?.created_at ?? null,
        },
      };
    },

    async markNativeRead(conversationId) {
      const { data, error } = await supabase.rpc(
        'mark_direct_conversation_read_v2',
        { p_conversation_id: conversationId },
      );
      if (error) {
        return { ok: false, reason: 'unknown', message: error.message, cause: error };
      }
      const row = firstRow<any>(data);
      return {
        ok: true,
        data: {
          ok: Boolean(row?.ok),
          readAt: row?.read_at ?? null,
        },
      };
    },

    async toggleNativeReaction(messageId, reaction) {
      const { data, error } = await supabase.rpc(
        'toggle_direct_message_reaction_v2',
        {
          p_message_id: messageId,
          p_reaction: reaction,
        },
      );
      if (error) {
        return { ok: false, reason: 'unknown', message: error.message, cause: error };
      }
      const row = firstRow<any>(data);
      return {
        ok: true,
        data: {
          ok: Boolean(row?.ok),
          enabled: Boolean(row?.enabled),
          count: Number(row?.reaction_count ?? 0),
        },
      };
    },

    async setNativeTyping(conversationId, isTyping) {
      const { data, error } = await supabase.rpc('set_direct_typing_state_v2', {
        p_conversation_id: conversationId,
        p_is_typing: isTyping,
      });
      if (error) {
        return { ok: false, reason: 'unknown', message: error.message, cause: error };
      }
      return { ok: true, data: data === true };
    },

    async listNativeTypingUsers(conversationId) {
      const { data, error } = await supabase
        .from('direct_typing_state')
        .select('user_id,expires_at')
        .eq('conversation_id', conversationId)
        .eq('is_typing', true)
        .gt('expires_at', new Date().toISOString());

      if (error) {
        return { ok: false, reason: 'unknown', message: error.message, cause: error };
      }

      return {
        ok: true,
        data: (data ?? [])
          .map((row) => row.user_id as string | null)
          .filter((value): value is string => typeof value === 'string'),
      };
    },

    async deleteNativeMessage(messageId) {
      const { data, error } = await supabase.rpc('delete_direct_message_v2', {
        p_message_id: messageId,
      });
      if (error) {
        return { ok: false, reason: 'unknown', message: error.message, cause: error };
      }

      const row = firstRow<any>(data);
      if (!row?.ok) {
        return {
          ok: false,
          reason: 'unknown',
          message: row?.message ?? 'Delete failed.',
          cause: row,
        };
      }

      return {
        ok: true,
        data: {
          storagePaths: Array.isArray(row.storage_paths)
            ? row.storage_paths.filter(
                (value: unknown): value is string =>
                  typeof value === 'string' && value.length > 0,
              )
            : [],
        },
      };
},
  };
}
