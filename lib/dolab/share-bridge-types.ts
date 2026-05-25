export type DolabShareDraftTargetMode = 'choose_later' | 'direct_chat';

export type DolabShareDraftStatus = 'prepared' | 'sent';

export type DolabShareDraft = {
  id: string;
  sourceMessageId: string;
  body: string;
  linkedDraftId?: string;
  linkedPendingMediaIds: string[];
  targetMode: DolabShareDraftTargetMode;
  targetConversationId?: string;
  createdAt: string;
  preparedAt?: string;
  sentAt?: string;
  status: DolabShareDraftStatus;
};
