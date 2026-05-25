export type TeswaChatProvider = 'supabase' | 'stream';

export type TeswaDirectConversationRef = {
  id: string;
  provider: TeswaChatProvider;
  participantUserIds: string[];
};

export type TeswaChatMessageRef = {
  id: string;
  conversationId: string;
  provider: TeswaChatProvider;
  senderUserId: string;
  createdAt: string;
};
