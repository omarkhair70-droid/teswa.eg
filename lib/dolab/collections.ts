import type { DolabDraftItem } from '@/lib/dolab/draft-types';
import type { DolabPendingMedia } from '@/lib/dolab/media-types';
import type { DolabPublishDraft } from '@/lib/dolab/publish-bridge-types';
import type { DolabSelfMessage } from '@/lib/dolab/self-chat-types';
import type { DolabInboxItem } from '@/lib/dolab/inbox';
import type { DolabStatusFilter, DolabViewMode } from '@/lib/dolab/organization';

export type DolabCollectionTargetType =
  | 'local_draft'
  | 'saved_item'
  | 'pending_media'
  | 'saved_media'
  | 'self_note'
  | 'saved_note'
  | 'share_draft'
  | 'publish_draft';

export type DolabCollection = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type DolabCollectionAssignment = {
  collectionId: string;
  targetType: DolabCollectionTargetType;
  targetId: string;
  assignedAt: string;
};

export type DolabSmartGroup = {
  id: string;
  title: string;
  description: string;
  count: number;
  severity?: 'normal' | 'good' | 'warning';
  targetMode?: DolabViewMode;
  targetStatus?: DolabStatusFilter;
};

const hasEnoughDraftFields = (draft: DolabDraftItem) =>
  Boolean(draft.title.trim() && draft.description.trim() && draft.category?.trim() && draft.linkedPendingMediaIds.length > 0);

export function buildDolabSmartGroups(input: {
  localDrafts: DolabDraftItem[];
  savedItems: Array<{ id: string; isPublished: boolean; title?: string; description?: string; category?: string; mediaCount: number }>;
  pendingMedia: DolabPendingMedia[];
  savedMedia: Array<{ id: string; linkedItemTitle?: string }>;
  selfMessages: DolabSelfMessage[];
  inboxItems: DolabInboxItem[];
  publishDrafts: DolabPublishDraft[];
  cloudStatus: 'local_only' | 'partial_sync' | 'schema_missing';
}) {
  const readyLocalDrafts = input.localDrafts.filter(hasEnoughDraftFields).length;
  const readySavedUnpublished = input.savedItems.filter((item) => !item.isPublished).length;
  const readyPublishDrafts = input.publishDrafts.filter((draft) => draft.readinessStatus !== 'incomplete').length;

  const missingLocalDrafts = input.localDrafts.filter((draft) => !hasEnoughDraftFields(draft)).length;
  const missingSavedItems = input.savedItems.filter(
    (item) => !item.isPublished && (!item.title?.trim() || !item.description?.trim() || !item.category?.trim() || item.mediaCount === 0),
  ).length;

  const unlinkedPendingMedia = input.pendingMedia.filter((media) => !input.localDrafts.some((draft) => draft.linkedPendingMediaIds.includes(media.id))).length;
  const unlinkedSavedMedia = input.savedMedia.filter((media) => !media.linkedItemTitle).length;

  const exchangeIdeas = input.selfMessages.filter((message) => message.messageType === 'idea' || Boolean(message.body.trim())).length;

  const mediaFailures = input.pendingMedia.filter((media) => media.uploadStatus === 'failed' || media.compressionStatus === 'failed').length;
  const cloudFallback = input.cloudStatus === 'schema_missing' ? 1 : 0;
  const inboxNew = input.inboxItems.filter((item) => !item.convertedAt).length;

  return [
    {
      id: 'ready_to_publish',
      title: 'جاهز للنشر',
      description: 'عناصر ومسودات جاهزة لخطوة السوق.',
      count: readyLocalDrafts + readySavedUnpublished + readyPublishDrafts,
      severity: 'good',
      targetMode: 'ready',
    },
    {
      id: 'missing_data',
      title: 'ناقص بيانات',
      description: 'عناصر محتاجة عنوان/وصف/فئة أو ميديا.',
      count: missingLocalDrafts + missingSavedItems,
      severity: 'warning',
      targetMode: 'drafts',
      targetStatus: 'temporary',
    },
    {
      id: 'orphan_media',
      title: 'ميديا غير مرتبطة',
      description: 'ملفات ميديا لسه مش مرتبطة بعنصر.',
      count: unlinkedPendingMedia + unlinkedSavedMedia,
      severity: 'warning',
      targetMode: 'media',
    },
    {
      id: 'exchange_ideas',
      title: 'أفكار التبادل',
      description: 'أفكار ورسائل تساعدك تبني عروض أسرع.',
      count: exchangeIdeas,
      severity: 'normal',
      targetMode: 'notes',
    },
    {
      id: 'inbox_new',
      title: 'وارد جديد',
      description: 'حاجات جايالك من خارج التطبيق.',
      count: inboxNew,
      severity: 'normal',
      targetMode: 'inbox',
    },
    {
      id: 'needs_review',
      title: 'فشل/يحتاج مراجعة',
      description: 'رفع/ضغط فشل أو وضع سحابي يحتاج متابعة.',
      count: mediaFailures + cloudFallback,
      severity: 'warning',
      targetMode: 'issues',
      targetStatus: 'failed',
    },
  ] satisfies DolabSmartGroup[];
}
