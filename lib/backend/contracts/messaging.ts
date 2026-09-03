import type { BackendConnectionState, IsoDateTime, TeswaResult, TeswaUnsubscribe } from '@/lib/backend/contracts/core';

export type ConversationKind = 'direct' | 'contextual';

export type MessageAttachment = {
  id: string;
  kind: 'image' | 'video' | 'file' | 'audio';
  url: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type ConversationMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  kind: 'text' | 'voice' | 'media';
  attachments: MessageAttachment[];
  createdAt: IsoDateTime;
  readAt: IsoDateTime | null;
};

export type ConversationSummary = {
  id: string;
  kind: ConversationKind;
  participantIds: string[];
  lastMessage: ConversationMessage | null;
  unreadCount: number;
};

export type ConversationRealtimeEvent =
  | { type: 'message_changed'; conversationId: string }
  | { type: 'attachment_changed'; conversationId: string }
  | { type: 'reaction_changed'; conversationId: string }
  | { type: 'typing_changed'; conversationId: string }
  | { type: 'conversation_changed'; conversationId: string }
  | { type: 'status'; conversationId: string; status: BackendConnectionState };

export interface MessagingContract {
  listInbox(userId: string): Promise<ConversationSummary[]>;
  getMessages(conversationId: string, input?: { limit?: number; before?: string | null }): Promise<ConversationMessage[]>;

  startDirectConversation(input: {
    currentUserId: string;
    otherUserId: string;
    initialMessage?: string;
  }): Promise<TeswaResult<{ conversationId: string }, 'blocked' | 'unknown'>>;

  sendText(input: {
    conversationId: string;
    senderId: string;
    body: string;
  }): Promise<TeswaResult<ConversationMessage, 'blocked' | 'unauthorized' | 'unknown'>>;

  markRead(conversationId: string, userId: string): Promise<void>;
  setTyping(conversationId: string, userId: string, isTyping: boolean): Promise<void>;
  toggleReaction(messageId: string, userId: string, reaction: 'love' | 'thumbs_up'): Promise<TeswaResult<void, 'unknown'>>;
  deleteMessage(messageId: string, userId: string): Promise<TeswaResult<void, 'unauthorized' | 'unknown'>>;

  subscribe(
    conversationId: string,
    listener: (event: ConversationRealtimeEvent) => void,
  ): TeswaUnsubscribe;
}


export type DealRealtimeMessage = {
  id: string;
  dealId: string;
  senderId: string;
  body: string;
  messageType: 'text' | 'voice';
  audioStoragePath: string | null;
  audioDurationMs: number | null;
  audioMimeType: string | null;
  audioSizeBytes: number | null;
  createdAt: IsoDateTime;
};

export type ContextualRealtimeMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  messageKind: 'text' | 'voice';
  mediaStoragePath: string | null;
  mediaDurationMs: number | null;
  createdAt: IsoDateTime;
};

export interface MessagingRealtimeContract {
  subscribeInbox(
    userId: string,
    onChanged: () => void,
  ): TeswaUnsubscribe;

  subscribeDeal(
    dealId: string,
    handlers: {
      onMessage: (message: DealRealtimeMessage) => void;
      onDealChanged: () => void;
      onConfirmationChanged: () => void;
      onStatus?: (status: BackendConnectionState) => void;
    },
  ): TeswaUnsubscribe;

  subscribeContextual(
    conversationId: string,
    handlers: {
      onMessage: (message: ContextualRealtimeMessage) => void;
      onStatus?: (status: BackendConnectionState) => void;
    },
  ): TeswaUnsubscribe;

  subscribeDirect(
    conversationId: string,
    handlers: {
      onConversationChanged?: () => void;
      onMessagesChanged?: () => void;
      onAttachmentsChanged?: () => void;
      onReactionsChanged?: () => void;
      onTypingChanged?: () => void;
      onStatus?: (status: BackendConnectionState) => void;
    },
  ): TeswaUnsubscribe;
}
