import type {
  ContextualConversationSummaryTransportRecord,
  ContextualMessageTransportRecord,
  ContextualMessagingTransportContract,
  ContextualParticipantTransportRecord,
  ContextualThreadTransportRecord,
} from '@/lib/backend/contracts/messaging';
import { supabase } from '@/lib/supabase/client';

function mapMessage(row: any): ContextualMessageTransportRecord {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    senderId: row.sender_id as string,
    body: (row.body as string | null) ?? null,
    messageKind: row.message_kind === 'voice' ? 'voice' : 'text',
    mediaStoragePath: (row.media_storage_path as string | null) ?? null,
    mediaDurationMs: (row.media_duration_ms as number | null) ?? null,
    createdAt: row.created_at as string,
  };
}

function mapParticipant(
  id: string,
  profile: any | undefined,
): ContextualParticipantTransportRecord {
  return {
    id,
    displayName: (profile?.display_name as string | null | undefined) ?? null,
    username: (profile?.username as string | null | undefined) ?? null,
    avatarUrl: (profile?.avatar_url as string | null | undefined) ?? null,
  };
}

export function createSupabaseContextualMessagingAdapter(): ContextualMessagingTransportContract {
  return {
    async notifyMessage(input) {
      const { error } = await supabase.rpc('create_contextual_message_notification', {
        p_conversation_id: input.conversationId,
        p_message_id: input.messageId,
        p_kind: input.kind,
      });
      if (error) {
        return { ok: false, reason: 'unknown', message: error.message, cause: error };
      }
      return { ok: true, data: undefined };
    },

    async markRead(conversationId) {
      const { error } = await supabase.rpc('mark_contextual_thread_read', {
        p_conversation_id: conversationId,
      });
      if (error) {
        return { ok: false, reason: 'unknown', message: error.message, cause: error };
      }
      return { ok: true, data: undefined };
    },

    async getUnreadCount() {
      const { data, error } = await supabase.rpc('get_unread_contextual_messages_count');
      if (error) throw error;
      return typeof data === 'number' ? Math.max(0, data) : 0;
    },

    async getStoryOwnerId(storyId) {
      const { data, error } = await supabase
        .from('stories')
        .select('user_id')
        .eq('id', storyId)
        .maybeSingle();
      if (error) throw error;
      return (data?.user_id as string | undefined) ?? null;
    },

    async createStoryReplyThread(input) {
      const { data, error } = await supabase.rpc('create_story_reply_thread', {
        p_story_id: input.storyId,
        p_body: input.body,
      });
      if (error) {
        return { ok: false, reason: 'unknown', message: error.message, cause: error };
      }
      const row = Array.isArray(data) ? data[0] : null;
      if (!row?.conversation_id || !row?.message_id) {
        return {
          ok: false,
          reason: 'not_found',
          message: 'Story reply thread was not created.',
        };
      }
      return {
        ok: true,
        data: {
          conversationId: row.conversation_id as string,
          messageId: row.message_id as string,
        },
      };
    },

    async listSummaries(userId) {
      const { data: conversations, error: conversationsError } = await supabase
        .from('contextual_conversations')
        .select('id,context_type,context_entity_id,starter_id,recipient_id,created_at,updated_at')
        .eq('context_type', 'story_reply')
        .or(`starter_id.eq.${userId},recipient_id.eq.${userId}`);
      if (conversationsError) throw conversationsError;
      if (!conversations?.length) return [];

      const conversationIds = conversations.map((row) => row.id as string);
      const participantIds = Array.from(
        new Set(
          conversations.flatMap((row) => [
            row.starter_id as string,
            row.recipient_id as string,
          ]),
        ),
      );

      const [profilesRes, messagesRes, readsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id,display_name,username,avatar_url')
          .in('id', participantIds),
        supabase
          .from('contextual_messages')
          .select('id,conversation_id,sender_id,body,message_kind,media_storage_path,media_duration_ms,created_at')
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('contextual_message_reads')
          .select('conversation_id,last_read_at')
          .eq('user_id', userId)
          .in('conversation_id', conversationIds),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (messagesRes.error) throw messagesRes.error;
      if (readsRes.error) throw readsRes.error;

      const profilesById = new Map(
        (profilesRes.data ?? []).map((row) => [row.id as string, row]),
      );
      const messagesByConversation = new Map<string, any[]>();
      for (const message of messagesRes.data ?? []) {
        const conversationId = message.conversation_id as string;
        const current = messagesByConversation.get(conversationId) ?? [];
        current.push(message);
        messagesByConversation.set(conversationId, current);
      }
      const readMap = new Map(
        (readsRes.data ?? []).map((row) => [
          row.conversation_id as string,
          (row.last_read_at as string | null) ?? null,
        ]),
      );

      return conversations
        .map((conversation): ContextualConversationSummaryTransportRecord => {
          const starterId = conversation.starter_id as string;
          const recipientId = conversation.recipient_id as string;
          const otherId = userId === starterId ? recipientId : starterId;
          const messages = messagesByConversation.get(conversation.id as string) ?? [];
          const latest = messages[0];
          const lastReadAt = readMap.get(conversation.id as string) ?? null;
          const unreadCount = messages.filter(
            (message) =>
              message.sender_id !== userId
              && (!lastReadAt || message.created_at > lastReadAt),
          ).length;

          return {
            conversationId: conversation.id as string,
            contextType: 'story_reply',
            contextEntityId: conversation.context_entity_id as string,
            otherParticipant: mapParticipant(
              otherId,
              profilesById.get(otherId),
            ),
            latestMessage: latest
              ? {
                  id: latest.id as string,
                  body:
                    (latest.body as string | null)
                    ?? (latest.message_kind === 'voice' ? 'رسالة صوتية' : ''),
                  senderId: latest.sender_id as string,
                  createdAt: latest.created_at as string,
                  kind: latest.message_kind === 'voice' ? 'voice' : 'text',
                  durationMs:
                    (latest.media_duration_ms as number | null) ?? null,
                }
              : null,
            unreadCount,
            lastActivityAt:
              (latest?.created_at as string | undefined)
              ?? (conversation.updated_at as string | null)
              ?? (conversation.created_at as string | null)
              ?? new Date(0).toISOString(),
          };
        })
        .sort(
          (a, b) =>
            Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt),
        );
    },

    async getThread(input) {
      const { data: conversation, error } = await supabase
        .from('contextual_conversations')
        .select('id,context_type,context_entity_id,starter_id,recipient_id')
        .eq('id', input.conversationId)
        .maybeSingle();

      if (error) {
        return { ok: false, reason: 'unknown', message: error.message, cause: error };
      }
      if (!conversation) return { ok: true, data: null };

      const starterId = conversation.starter_id as string;
      const recipientId = conversation.recipient_id as string;
      if (
        input.currentUserId !== starterId
        && input.currentUserId !== recipientId
      ) {
        return {
          ok: false,
          reason: 'unauthorized',
          message: 'User is not a conversation participant.',
        };
      }

      const [profilesRes, messagesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id,display_name,username,avatar_url')
          .in('id', [starterId, recipientId]),
        supabase
          .from('contextual_messages')
          .select('id,conversation_id,sender_id,body,message_kind,media_storage_path,media_duration_ms,created_at')
          .eq('conversation_id', input.conversationId)
          .order('created_at', { ascending: true })
          .limit(200),
      ]);

      if (profilesRes.error) {
        return {
          ok: false,
          reason: 'unknown',
          message: profilesRes.error.message,
          cause: profilesRes.error,
        };
      }
      if (messagesRes.error) {
        return {
          ok: false,
          reason: 'unknown',
          message: messagesRes.error.message,
          cause: messagesRes.error,
        };
      }

      const profilesById = new Map(
        (profilesRes.data ?? []).map((row) => [row.id as string, row]),
      );
      const otherId =
        input.currentUserId === starterId ? recipientId : starterId;

      const thread: ContextualThreadTransportRecord = {
        id: conversation.id as string,
        contextType: 'story_reply',
        contextEntityId: conversation.context_entity_id as string,
        starterId,
        recipientId,
        otherParticipant: mapParticipant(
          otherId,
          profilesById.get(otherId),
        ),
        messages: (messagesRes.data ?? []).map(mapMessage),
      };
      return { ok: true, data: thread };
    },

    async getOtherParticipantId(input) {
      const { data, error } = await supabase
        .from('contextual_conversations')
        .select('starter_id,recipient_id')
        .eq('id', input.conversationId)
        .maybeSingle();

      if (error || !data) return null;
      const starterId = data.starter_id as string;
      const recipientId = data.recipient_id as string;
      if (
        input.currentUserId !== starterId
        && input.currentUserId !== recipientId
      ) {
        return null;
      }
      return input.currentUserId === starterId ? recipientId : starterId;
    },

    async sendText(input) {
      const { data, error } = await supabase
        .from('contextual_messages')
        .insert({
          conversation_id: input.conversationId,
          sender_id: input.senderId,
          body: input.body,
          message_kind: 'text',
        })
        .select('id,conversation_id,sender_id,body,message_kind,media_storage_path,media_duration_ms,created_at')
        .single();

      if (error || !data) {
        return {
          ok: false,
          reason: 'unknown',
          message: error?.message ?? 'Message insert returned no row.',
          cause: error ?? undefined,
        };
      }
      return { ok: true, data: mapMessage(data) };
    },

    async ensureStoryReplyConversation(storyId) {
      const { data, error } = await supabase.rpc(
        'ensure_story_reply_conversation',
        { p_story_id: storyId },
      );
      if (error) {
        return { ok: false, reason: 'unknown', message: error.message, cause: error };
      }
      const row = Array.isArray(data) ? data[0] : null;
      const conversationId =
        typeof row?.conversation_id === 'string'
          ? row.conversation_id.trim()
          : '';
      if (!conversationId) {
        return {
          ok: false,
          reason: 'not_found',
          message: 'Conversation was not created.',
        };
      }
      return { ok: true, data: { conversationId } };
    },

    async sendVoiceMetadata(input) {
      const { data, error } = await supabase
        .from('contextual_messages')
        .insert({
          conversation_id: input.conversationId,
          sender_id: input.senderId,
          body: 'رسالة صوتية',
          message_kind: 'voice',
          media_storage_path: input.mediaStoragePath,
          media_duration_ms: input.mediaDurationMs,
        })
        .select('id,conversation_id,sender_id,body,message_kind,media_storage_path,media_duration_ms,created_at')
        .single();

      if (error || !data) {
        return {
          ok: false,
          reason: 'unknown',
          message: error?.message ?? 'Voice message insert returned no row.',
          cause: error ?? undefined,
        };
      }
      return { ok: true, data: mapMessage(data) };
    },
  };
}
