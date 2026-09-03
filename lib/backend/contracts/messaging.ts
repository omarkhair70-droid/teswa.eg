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


export type DirectConversationTransportStatus =
  | 'requested'
  | 'accepted'
  | 'ignored'
  | 'blocked';

export type DirectConversationTransportRecord = {
  conversationId: string;
  status: DirectConversationTransportStatus;
  requestedBy: string;
  otherUserId: string;
  otherDisplayName: string | null;
  otherUsername: string | null;
  otherAvatarUrl: string | null;
  lastMessageBody: string | null;
  lastMessageSenderId: string | null;
  lastMessageAt: IsoDateTime | null;
  unreadCount: number;
  requiresAction: boolean;
};

export type DirectMessageTransportRecord = {
  id: string;
  senderId: string;
  body: string;
  messageType: 'text' | 'voice';
  audioStoragePath: string | null;
  audioDurationMs: number | null;
  audioMimeType: string | null;
  audioSizeBytes: number | null;
  createdAt: IsoDateTime;
  readAt: IsoDateTime | null;
};

export type DirectConversationStartRecord = {
  ok: boolean;
  conversationId: string | null;
  status: DirectConversationTransportStatus | null;
  requiresRequest: boolean;
  message: string | null;
};

export type DirectConversationStartMessageRecord = {
  ok: boolean;
  conversationId: string | null;
  messageId: string | null;
  status: DirectConversationTransportStatus | null;
  createdAt: IsoDateTime | null;
  message: string | null;
};

export type DirectSendMessageRecord = {
  ok: boolean;
  message: string | null;
  messageId: string | null;
  conversationId: string | null;
  createdAt: IsoDateTime | null;
};

export interface DirectMessagingTransportContract {
  startOrGet(targetUserId: string): Promise<TeswaResult<DirectConversationStartRecord, 'unknown'>>;
  startWithMessage(
    targetUserId: string,
    body: string,
  ): Promise<TeswaResult<DirectConversationStartMessageRecord, 'unknown'>>;

  listConversations(): Promise<TeswaResult<DirectConversationTransportRecord[], 'unknown'>>;
  getConversation(
    conversationId: string,
  ): Promise<TeswaResult<DirectConversationTransportRecord | null, 'unknown'>>;
  listMessages(
    conversationId: string,
  ): Promise<TeswaResult<DirectMessageTransportRecord[], 'unknown'>>;

  sendText(
    conversationId: string,
    body: string,
  ): Promise<TeswaResult<DirectSendMessageRecord, 'forbidden' | 'unknown'>>;

  sendVoice(input: {
    conversationId: string;
    audioStoragePath: string;
    audioMimeType: string;
    audioDurationMs: number;
    audioSizeBytes: number | null;
  }): Promise<TeswaResult<{
    ok: boolean;
    message: string | null;
    messageId: string | null;
    createdAt: IsoDateTime | null;
  }, 'unknown'>>;

  actOnRequest(
    action: 'accept' | 'ignore',
    conversationId: string,
  ): Promise<TeswaResult<{ ok: boolean; message: string | null }, 'unknown'>>;

  markRead(conversationId: string): Promise<TeswaResult<void, 'unknown'>>;
}
