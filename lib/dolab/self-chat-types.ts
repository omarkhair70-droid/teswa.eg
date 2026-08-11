export type DolabSelfMessageType = 'text' | 'idea' | 'checklist' | 'voice_placeholder';
export type DolabSelfMessageSyncState = 'device_only' | 'pending' | 'synced' | 'error';

export type DolabSelfMessage = {
  id: string;
  body: string;
  messageType: DolabSelfMessageType;
  linkedDraftId?: string;
  linkedPendingMediaIds: string[];
  remoteNoteId?: string;
  syncState?: DolabSelfMessageSyncState;
  syncError?: string;
  createdAt: string;
};

export type DolabSelfMessageInput = {
  body: string;
  messageType: DolabSelfMessageType;
  linkedDraftId?: string;
  linkedPendingMediaIds: string[];
};
