export type DolabDraftItem = {
  id: string;
  title: string;
  description: string;
  category?: string;
  condition?: string;
  exchangeIntent?: string;
  linkedPendingMediaIds: string[];
  remoteDolabItemId?: string;
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
