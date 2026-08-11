export type DolabDraftSyncState = 'device_only' | 'pending' | 'synced' | 'error';

export type DolabDraftItem = {
  id: string;
  title: string;
  description: string;
  category?: string;
  condition?: string;
  exchangeIntent?: string;
  linkedPendingMediaIds: string[];
  remoteDolabItemId?: string;
  syncState?: DolabDraftSyncState;
  syncError?: string;
  createdAt: string;
  updatedAt: string;
};

export type DolabDraftItemInput = {
  title: string;
  description: string;
  category: string;
  condition: string;
  exchangeIntent: string;
  linkedPendingMediaIds: string[];
};
