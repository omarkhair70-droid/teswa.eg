import type { DolabDraftItem } from '@/lib/dolab/draft-types';
import type { DolabPendingMedia } from '@/lib/dolab/media-types';

export type DolabPublishReadinessStatus = 'incomplete' | 'ready' | 'prepared';

export type DolabPublishDraft = {
  id: string;
  sourceDraftId: string;
  title: string;
  description: string;
  category?: string;
  condition?: string;
  exchangeIntent?: string;
  linkedPendingMediaIds: string[];
  readinessStatus: DolabPublishReadinessStatus;
  missingFields: string[];
  createdAt: string;
  updatedAt: string;
};

export const buildPublishDraftFromDolabDraft = (
  draft: DolabDraftItem,
  linkedPendingMedia: DolabPendingMedia[],
): Omit<DolabPublishDraft, 'id' | 'createdAt' | 'updatedAt'> => {
  const missingFields: string[] = [];

  if (!draft.title.trim()) {
    missingFields.push('title');
  }

  if (!draft.description.trim() && !(draft.exchangeIntent ?? '').trim()) {
    missingFields.push('details_or_exchange_intent');
  }

  if (linkedPendingMedia.length === 0) {
    missingFields.push('linked_media');
  }

  return {
    sourceDraftId: draft.id,
    title: draft.title,
    description: draft.description,
    category: draft.category,
    condition: draft.condition,
    exchangeIntent: draft.exchangeIntent,
    linkedPendingMediaIds: linkedPendingMedia.map((item) => item.id),
    readinessStatus: missingFields.length > 0 ? 'incomplete' : 'ready',
    missingFields,
  };
};
