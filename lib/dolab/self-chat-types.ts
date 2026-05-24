export type DolabSelfMessageType = 'text' | 'idea' | 'checklist' | 'voice_placeholder';

export type DolabSelfMessage = {
  id: string;
  body: string;
  messageType: DolabSelfMessageType;
  linkedDraftId?: string;
  linkedPendingMediaIds: string[];
  createdAt: string;
};

export type DolabSelfMessageInput = {
  body: string;
  messageType: DolabSelfMessageType;
  linkedDraftId?: string;
  linkedPendingMediaIds: string[];
};
