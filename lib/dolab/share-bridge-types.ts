export type DolabShareDraftTargetMode = 'choose_later' | 'direct_chat_placeholder';

export type DolabShareDraft = {
  id: string;
  sourceMessageId: string;
  body: string;
  linkedDraftId?: string;
  linkedPendingMediaIds: string[];
  targetMode: DolabShareDraftTargetMode;
  createdAt: string;
};
