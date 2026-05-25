import {
  hasStreamChatConfig,
  STREAM_CHAT_ENABLED,
} from './stream-chat-config';
import type {
  TeswaChatMessageRef,
  TeswaChatProvider,
  TeswaDirectConversationRef,
} from './teswa-chat-types';

export interface TeswaChatAdapter {
  readonly provider: TeswaChatProvider;
  getConversationById(id: string): Promise<TeswaDirectConversationRef | null>;
  listMessages(conversationId: string): Promise<TeswaChatMessageRef[]>;
  sendTextMessage(input: {
    conversationId: string;
    text: string;
  }): Promise<TeswaChatMessageRef>;
}

export function getActiveChatProvider(): TeswaChatProvider {
  return 'supabase';
}

export function isStreamChatAvailable(): boolean {
  return STREAM_CHAT_ENABLED && hasStreamChatConfig;
}
