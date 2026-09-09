import * as Crypto from 'expo-crypto';

import type {
  ContextualRealtimeMessage,
  DealRealtimeMessage,
  MessagingRealtimeContract,
} from '@/lib/backend/contracts/messaging';
import type { BackendConnectionState } from '@/lib/backend/contracts/core';
import { supabase } from '@/lib/supabase/client';

function mapStatus(status: string): BackendConnectionState {
  if (status === 'SUBSCRIBED') return 'live';
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
    return 'offline';
  }
  return 'connecting';
}

function mapDealMessage(row: any): DealRealtimeMessage {
  return {
    id: row.id as string,
    dealId: row.deal_id as string,
    senderId: row.sender_id as string,
    body: (row.body as string | null) ?? '',
    messageType: row.message_type === 'voice' ? 'voice' : 'text',
    audioStoragePath: (row.audio_storage_path as string | null) ?? null,
    audioDurationMs: (row.audio_duration_ms as number | null) ?? null,
    audioMimeType: (row.audio_mime_type as string | null) ?? null,
    audioSizeBytes: (row.audio_size_bytes as number | null) ?? null,
    createdAt: (row.created_at as string | null) ?? new Date().toISOString(),
  };
}

function mapContextualMessage(row: any): ContextualRealtimeMessage {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    senderId: row.sender_id as string,
    body: (row.body as string | null) ?? '',
    messageKind: row.message_kind === 'voice' ? 'voice' : 'text',
    mediaStoragePath: (row.media_storage_path as string | null) ?? null,
    mediaDurationMs: (row.media_duration_ms as number | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export function createSupabaseMessagingRealtimeAdapter(): MessagingRealtimeContract {
  return {
    subscribeInbox(userId, onChanged) {
      const channel = supabase
        .channel(`messages-inbox:${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_conversations' }, onChanged)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, onChanged)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'deal_messages' }, onChanged)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'contextual_messages' }, onChanged)
        .subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    },

    subscribeDeal(dealId, handlers) {
      handlers.onStatus?.('connecting');
      const channel = supabase
        .channel(`deal-room:${dealId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'deal_messages',
            filter: `deal_id=eq.${dealId}`,
          },
          (payload) => handlers.onMessage(mapDealMessage(payload.new)),
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'swap_deals',
            filter: `id=eq.${dealId}`,
          },
          handlers.onDealChanged,
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'deal_confirmations',
            filter: `deal_id=eq.${dealId}`,
          },
          handlers.onConfirmationChanged,
        )
        .subscribe((status) => handlers.onStatus?.(mapStatus(status)));

      return () => {
        void supabase.removeChannel(channel);
      };
    },

    subscribeContextual(conversationId, handlers) {
      handlers.onStatus?.('connecting');
      const channel = supabase
        .channel(`contextual_${conversationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'contextual_messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => handlers.onMessage(mapContextualMessage(payload.new)),
        )
        .subscribe((status) => handlers.onStatus?.(mapStatus(status)));

      return () => {
        void supabase.removeChannel(channel);
      };
    },

    subscribeDirect(conversationId, handlers) {
      handlers.onStatus?.('connecting');
      const channel = supabase
        .channel(`direct-native:${conversationId}:${Crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'direct_conversations',
            filter: `id=eq.${conversationId}`,
          },
          () => handlers.onConversationChanged?.(),
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'direct_messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          () => handlers.onMessagesChanged?.(),
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'direct_message_attachments',
            filter: `conversation_id=eq.${conversationId}`,
          },
          () => handlers.onAttachmentsChanged?.(),
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'direct_message_reactions',
            filter: `conversation_id=eq.${conversationId}`,
          },
          () => handlers.onReactionsChanged?.(),
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'direct_typing_state',
            filter: `conversation_id=eq.${conversationId}`,
          },
          () => handlers.onTypingChanged?.(),
        )
        .subscribe((status) => handlers.onStatus?.(mapStatus(status)));

      return () => {
        void supabase.removeChannel(channel);
      };
    },
  };
}
