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
  };
}
