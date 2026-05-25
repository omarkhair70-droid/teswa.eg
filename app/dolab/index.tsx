import { useEffect, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import * as ImagePicker from 'expo-image-picker';
import { AppActionSheet } from '@/components/sheets/AppActionSheet';
import { AppBottomSheet } from '@/components/sheets/AppBottomSheet';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { DolabDraftItem, DolabDraftItemInput } from '@/lib/dolab/draft-types';
import { createPendingAudioMedia, createPendingMediaFromInboxItem, toPendingMedia } from '@/lib/dolab/local-media';
import type { DolabPendingMedia } from '@/lib/dolab/media-types';
import { DolabSelfChatPanel } from '@/components/dolab/DolabSelfChatPanel';
import { DolabShareBridgeSheet } from '@/components/dolab/DolabShareBridgeSheet';
import { DolabConversationPickerSheet } from '@/components/dolab/DolabConversationPickerSheet';
import { DolabPublishBridgeSheet } from '@/components/dolab/DolabPublishBridgeSheet';
import { DolabPendingMediaStrip } from '@/components/dolab/DolabPendingMediaStrip';
import { DolabVaultHero } from '@/components/dolab/DolabVaultHero';
import { DolabAnimatedSection } from '@/components/dolab/DolabAnimatedSection';
import { DolabPressableCard } from '@/components/dolab/DolabPressableCard';
import { DolabSavedLibrarySection } from '@/components/dolab/DolabSavedLibrarySection';
import { DolabAudioRecorderSheet } from '@/components/dolab/DolabAudioRecorderSheet';
import { DolabSearchBar } from '@/components/dolab/DolabSearchBar';
import { DolabFilterChips } from '@/components/dolab/DolabFilterChips';
import { DolabEmptyFilteredState } from '@/components/dolab/DolabEmptyFilteredState';
import { DolabCollectionsSection } from '@/components/dolab/DolabCollectionsSection';
import { DolabCollectionPickerSheet } from '@/components/dolab/DolabCollectionPickerSheet';
import { DolabCollectionBadge } from '@/components/dolab/DolabCollectionBadge';
import type { DolabSavedMediaCardModel } from '@/components/dolab/DolabSavedMediaPreviewCard';
import type { DolabSelfMessage, DolabSelfMessageType } from '@/lib/dolab/self-chat-types';
import type { DolabShareDraft, DolabShareDraftTargetMode } from '@/lib/dolab/share-bridge-types';
import { buildPublishDraftFromDolabDraft, type DolabPublishDraft } from '@/lib/dolab/publish-bridge-types';
import { useAuth } from '@/lib/auth';
import { createDolabMediaSignedUrls, deleteDolabItem, deleteDolabMedia, deleteDolabNote, fetchDolabLibrarySnapshot, markDolabNoteShared, saveDolabDraftItem, saveDolabSelfNote, updateDolabDraftItem, updateDolabSavedItem, uploadAndSaveDolabMedia } from '@/lib/dolab';
import { type DirectConversationSummary, sendDirectMessage } from '@/lib/direct-messages';
import { buildDolabShareToChatBody } from '@/lib/dolab/share-to-chat';
import { compressDolabMedia, maxUploadBytesForType, resolveDolabMediaSize, shouldCompressDolabMedia } from '@/lib/dolab/media-compression';
import { byTime, includesQuery, type DolabSortMode, type DolabStatusFilter, type DolabViewMode } from '@/lib/dolab/organization';
import { type DolabCollection, type DolabCollectionAssignment } from '@/lib/dolab/collections';
import { consumePendingInboundDolabInboxItems } from '@/lib/inbound-shared-media';
import { createInboxFileItem, createInboxTextItem, type DolabInboxItem } from '@/lib/dolab/inbox';
import { DolabInboxSection } from '@/components/dolab/DolabInboxSection';
import { DolabShelvesOverview } from '@/components/dolab/DolabShelvesOverview';
import { DolabShelfHeader } from '@/components/dolab/DolabShelfHeader';
import { DolabShelfActionSheet } from '@/components/dolab/DolabShelfActionSheet';
import { DolabSavedMediaGrid } from '@/components/dolab/DolabSavedMediaGrid';

const emptyDraftForm: DolabDraftItemInput = {
  title: '',
  description: '',
  category: '',
  condition: '',
  exchangeIntent: '',
  linkedPendingMediaIds: [],
};

export default function DolabScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const addSheetRef = useRef<BottomSheetModal>(null);
  const draftStudioRef = useRef<BottomSheetModal>(null);
  const shareBridgeRef = useRef<BottomSheetModal>(null);
  const publishBridgeRef = useRef<BottomSheetModal>(null);
  const conversationPickerRef = useRef<BottomSheetModal>(null);
  const confirmDeleteRef = useRef<BottomSheetModal>(null);
  const audioRecorderSheetRef = useRef<BottomSheetModal>(null);
  const inboxQuickNoteSheetRef = useRef<BottomSheetModal>(null);
  const collectionPickerSheetRef = useRef<BottomSheetModal>(null);
  const shelfActionSheetRef = useRef<BottomSheetModal>(null);

  const [inlineFeedback, setInlineFeedback] = useState<string | null>(null);
  const [pendingMedia, setPendingMedia] = useState<DolabPendingMedia[]>([]);
  const [localDrafts, setLocalDrafts] = useState<DolabDraftItem[]>([]);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [draftForm, setDraftForm] = useState<DolabDraftItemInput>(emptyDraftForm);
  const [selfMessages, setSelfMessages] = useState<DolabSelfMessage[]>([]);
  const [selfComposerBody, setSelfComposerBody] = useState('');
  const [selfComposerType, setSelfComposerType] = useState<DolabSelfMessageType>('text');
  const [selfComposerDraftId, setSelfComposerDraftId] = useState<string | null>(null);
  const [selfComposerMediaIds, setSelfComposerMediaIds] = useState<string[]>([]);
  const [selfComposerError, setSelfComposerError] = useState<string | null>(null);
  const [shareDrafts, setShareDrafts] = useState<DolabShareDraft[]>([]);
  const [shareBridgeMessageId, setShareBridgeMessageId] = useState<string | null>(null);
  const [shareBridgeBody, setShareBridgeBody] = useState('');
  const [shareBridgeTargetMode, setShareBridgeTargetMode] = useState<DolabShareDraftTargetMode>('choose_later');
  const [publishDrafts, setPublishDrafts] = useState<DolabPublishDraft[]>([]);
  const [selectedPublishSourceDraftId, setSelectedPublishSourceDraftId] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<'local_only' | 'partial_sync' | 'schema_missing'>('local_only');
  const [remoteSnapshot, setRemoteSnapshot] = useState<{ items: number; notes: number; media: number }>({ items: 0, notes: 0, media: 0 });
  const [savedRemote, setSavedRemote] = useState<{ items: any[]; notes: any[]; media: any[] }>({ items: [], notes: [], media: [] });
  const [savedMediaSignedUrls, setSavedMediaSignedUrls] = useState<Record<string, string | null>>({});
  const [isUploadingCloud, setIsUploadingCloud] = useState(false);
  const [selectedDelete, setSelectedDelete] = useState<{ type: 'item'|'note'|'media'; id: string; storagePath?: string } | null>(null);
  const [isSendingShareToChat, setIsSendingShareToChat] = useState(false);
  const [conversationPickerRefreshKey, setConversationPickerRefreshKey] = useState(0);
  const [viewMode, setViewMode] = useState<DolabViewMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<DolabSortMode>('newest');
  const [statusFilter, setStatusFilter] = useState<DolabStatusFilter>('all');
  const [collections, setCollections] = useState<DolabCollection[]>([
    { id: 'collection-sell-soon', name: 'للبيع قريبًا', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'collection-trade', name: 'للتبديل', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'collection-photo-needed', name: 'محتاج تصوير', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'collection-ideas', name: 'أفكار', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ]);
  const [collectionAssignments, setCollectionAssignments] = useState<DolabCollectionAssignment[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [collectionAssignTarget, setCollectionAssignTarget] = useState<{ type: 'local_draft'; id: string } | null>(null);
  const [inboxItems, setInboxItems] = useState<DolabInboxItem[]>([]);
  const [inboxQuickNoteBody, setInboxQuickNoteBody] = useState('');
  const [activeShelfForActions, setActiveShelfForActions] = useState<DolabViewMode>('all');

  const refreshRemoteSnapshot = async (targetUserId: string): Promise<boolean> => {
    const result = await fetchDolabLibrarySnapshot(targetUserId);
    if (result.error) {
      if (result.error.kind === 'schema_missing') {
        setCloudStatus('schema_missing');
        setInlineFeedback('الحفظ السحابي لسه غير مفعّل. شغّال محليًا مؤقتًا.');
      }
      return false;
    }

    setRemoteSnapshot({ items: result.data.items.length, notes: result.data.notes.length, media: result.data.media.length });
    setSavedRemote({ items: result.data.items, notes: result.data.notes, media: result.data.media });
    const signedUrlsResult = await createDolabMediaSignedUrls(result.data.media);
    setSavedMediaSignedUrls(signedUrlsResult.data);
    if (signedUrlsResult.error) {
      setInlineFeedback((prev) => prev ?? 'تم تحديث الدولاب، وبعض معاينات الميديا غير متاحة الآن.');
    }
    if (result.data.items.length > 0 || result.data.notes.length > 0 || result.data.media.length > 0) {
      setCloudStatus('partial_sync');
    } else {
      setCloudStatus('local_only');
    }

    return true;
  };

  useEffect(() => {
    const inbound = consumePendingInboundDolabInboxItems();
    if (inbound.length > 0) {
      setInboxItems((prev) => [...inbound, ...prev]);
      setInlineFeedback('تمت إضافة الوارد من خارج التطبيق.');
    }
  }, []);

  useEffect(() => {
    const loadRemoteSnapshot = async () => {
      if (!user?.id) {
        setCloudStatus('local_only');
        return;
      }

      await refreshRemoteSnapshot(user.id);
    };

    void loadRemoteSnapshot();
  }, [user?.id]);



  const mappedSavedMedia = useMemo<DolabSavedMediaCardModel[]>(
    () =>
      savedRemote.media.map((m) => {
        const signedUrl = savedMediaSignedUrls[m.id] ?? undefined;
        const mediaTypeLabel = m.media_type === 'image' ? 'صورة' : m.media_type === 'video' ? 'فيديو' : 'تسجيل صوتي';
        const previewStatus = !m.storage_path ? 'unavailable' : signedUrl ? 'ready' : 'failed';
        return {
          id: m.id,
          remoteMediaId: m.id,
          mediaType: m.media_type,
          mediaTypeLabel,
          storagePath: m.storage_path,
          signedUrl,
          linkedItemTitle: savedRemote.items.find((i) => i.id === m.dolab_item_id)?.title || undefined,
          meta:
            [m.width && m.height ? `${m.width}x${m.height}` : null, m.size_bytes ? `${Math.round(m.size_bytes / 1024)}KB` : null, m.duration_ms ? `${Math.round(m.duration_ms / 1000)}ث` : null]
              .filter(Boolean)
              .join(' · ') || 'بدون بيانات إضافية',
          previewStatus,
        };
      }),
    [savedRemote.media, savedRemote.items, savedMediaSignedUrls],
  );

  const mappedSavedItems = useMemo(() => savedRemote.items.map((item) => ({
    id: item.id,
    title: item.title || 'عنصر محفوظ بدون عنوان',
    description: item.description || '',
    category: item.category || '',
    mediaCount: savedRemote.media.filter((m) => m.dolab_item_id === item.id).length,
    badge: item.status === 'published' ? 'اتنشرت' : (item.status === 'draft' ? 'مسودة على الرف' : 'محفوظة كمسودة'),
    isPublished: item.status === 'published',
    publishedItemId: item.published_item_id ?? null,
    createdAt: item.created_at ?? null,
    updatedAt: item.updated_at ?? null,
  })), [savedRemote.items, savedRemote.media]);

  const mappedSavedNotes = useMemo(() => savedRemote.notes.map((n) => ({ id: n.id, body: n.body || 'ملاحظة بدون نص', label: n.note_type, createdAt: n.created_at })), [savedRemote.notes]);

  const visibleLocalDrafts = useMemo(() => localDrafts.filter((draft) => !draft.remoteDolabItemId), [localDrafts]);
  const query = searchQuery.trim().toLowerCase();
  const isStatusMatch = (value: DolabStatusFilter) => statusFilter === 'all' || statusFilter === value;
  const issuesMedia = useMemo(
    () => pendingMedia.filter((item) => item.uploadStatus === 'failed' || item.compressionStatus === 'failed'),
    [pendingMedia],
  );
  const visiblePendingMedia = useMemo(
    () =>
      byTime(
        pendingMedia.filter((item) => includesQuery([item.fileName, item.mediaType, item.mimeType, item.uploadStatus, item.compressionStatus], query)).filter((item) => {
          if (statusFilter === 'failed') return item.uploadStatus === 'failed' || item.compressionStatus === 'failed';
          if (statusFilter === 'temporary') return true;
          return statusFilter === 'all';
        }),
        (item) => new Date(item.createdAt).getTime(),
        sortMode,
      ),
    [pendingMedia, query, sortMode, statusFilter],
  );
  const visibleSavedItems = useMemo(
    () =>
      byTime(
        mappedSavedItems.filter((item) => includesQuery([item.title, item.description], query)).filter((item) => {
          if (statusFilter === 'saved') return !item.isPublished;
          if (statusFilter === 'published') return item.isPublished;
          return statusFilter === 'all';
        }),
        (item) => {
          const raw = item.updatedAt ?? item.createdAt;
          return raw ? new Date(raw).getTime() : 0;
        },
        sortMode,
        (item) => (item.isPublished ? 2 : 1),
      ),
    [mappedSavedItems, query, sortMode, statusFilter],
  );
  const visibleSavedNotes = useMemo(
    () =>
      byTime(
        mappedSavedNotes.filter((item) => includesQuery([item.body, item.label], query)).filter(() => isStatusMatch('saved')),
        (item) => new Date(item.createdAt).getTime(),
        sortMode,
      ),
    [mappedSavedNotes, query, sortMode, statusFilter],
  );
  const visibleSelfMessages = useMemo(
    () =>
      byTime(
        selfMessages.filter((item) => includesQuery([item.body], query)).filter(() => isStatusMatch('temporary')),
        (item) => new Date(item.createdAt).getTime(),
        sortMode,
      ),
    [selfMessages, query, sortMode, statusFilter],
  );
  const visibleSavedMedia = useMemo(
    () =>
      byTime(
        mappedSavedMedia
          .filter((item) => includesQuery([item.linkedItemTitle, item.mediaTypeLabel, item.meta, item.storagePath], query))
          .filter((item) => {
            if (statusFilter === 'saved') return true;
            if (statusFilter === 'failed') return item.previewStatus === 'failed';
            return statusFilter === 'all';
          }),
        () => 0,
        sortMode,
      ),
    [mappedSavedMedia, query, statusFilter, sortMode],
  );
  const visibleLocalDraftCards = useMemo(
    () =>
      byTime(
        visibleLocalDrafts
          .filter((item) => includesQuery([item.title, item.description, item.category, item.exchangeIntent], query))
          .filter(() => statusFilter === 'all' || statusFilter === 'temporary'),
        (item) => new Date(item.updatedAt ?? item.createdAt).getTime(),
        sortMode,
      ),
    [visibleLocalDrafts, query, statusFilter, sortMode],
  );
  const visiblePublishDrafts = useMemo(
    () =>
      byTime(
        publishDrafts
          .filter((item) => includesQuery([item.title, item.description, item.category, item.exchangeIntent], query))
          .filter((item) => {
            if (statusFilter === 'published') return false;
            if (statusFilter === 'temporary') return true;
            if (statusFilter === 'failed') return item.readinessStatus === 'incomplete';
            return statusFilter === 'all' || statusFilter === 'saved';
          }),
        (item) => new Date(item.updatedAt ?? item.createdAt).getTime(),
        sortMode,
        (item) => (item.readinessStatus === 'ready' ? 3 : item.readinessStatus === 'prepared' ? 2 : 1),
      ),
    [publishDrafts, query, statusFilter, sortMode],
  );
  const visibleShareDrafts = useMemo(
    () =>
      byTime(
        shareDrafts
          .filter((item) => includesQuery([item.body], query))
          .filter((item) => {
            if (statusFilter === 'published') return item.status === 'sent';
            if (statusFilter === 'temporary') return item.status !== 'sent';
            if (statusFilter === 'saved') return false;
            return statusFilter === 'all';
          }),
        (item) => new Date(item.sentAt ?? item.preparedAt ?? item.createdAt).getTime(),
        sortMode,
      ),
    [shareDrafts, query, statusFilter, sortMode],
  );
  const visibleInboxItems = useMemo(
    () =>
      byTime(
        inboxItems
          .filter((item) => includesQuery([item.title, item.body, item.fileName, item.source, item.type], query))
          .filter(() => statusFilter === 'all' || statusFilter === 'temporary'),
        (item) => new Date(item.createdAt).getTime(),
        sortMode,
      ),
    [inboxItems, query, sortMode, statusFilter],
  );
  const collectionCountById = useMemo(
    () =>
      collectionAssignments.reduce((acc, item) => {
        acc[item.collectionId] = (acc[item.collectionId] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    [collectionAssignments],
  );
  const selectedCollectionName = collections.find((item) => item.id === selectedCollectionId)?.name ?? null;
  const isCollectionFocusActive = Boolean(selectedCollectionId);
  const visibleLocalDraftCardsFiltered = useMemo(() => {
    if (!selectedCollectionId) return visibleLocalDraftCards;
    const assignedIds = new Set(
      collectionAssignments.filter((item) => item.collectionId === selectedCollectionId && item.targetType === 'local_draft').map((item) => item.targetId),
    );
    return visibleLocalDraftCards.filter((draft) => assignedIds.has(draft.id));
  }, [collectionAssignments, selectedCollectionId, visibleLocalDraftCards]);
  const hasVisibleContentForCurrentMode = useMemo(() => {
    if (viewMode === 'media') return visiblePendingMedia.length + visibleSavedMedia.length > 0;
    if (viewMode === 'drafts') return visibleLocalDraftCards.length + visibleSavedItems.length > 0;
    if (viewMode === 'notes') return visibleSelfMessages.length + visibleSavedNotes.length + visibleShareDrafts.length > 0;
    if (viewMode === 'ready') return visiblePublishDrafts.length + visibleSavedItems.length + visibleLocalDraftCards.length > 0;
    if (viewMode === 'issues') return issuesMedia.length > 0 || cloudStatus === 'schema_missing';
    if (viewMode === 'inbox') return visibleInboxItems.length > 0;
    return (
      visiblePendingMedia.length +
        visibleSavedItems.length +
        visibleSavedNotes.length +
        visibleSelfMessages.length +
        visiblePublishDrafts.length +
        visibleShareDrafts.length +
        visibleInboxItems.length >
      0
    );
  }, [viewMode, visiblePendingMedia.length, visibleSavedMedia.length, visibleLocalDraftCards.length, visibleSavedItems.length, visibleSelfMessages.length, visibleSavedNotes.length, visibleShareDrafts.length, visiblePublishDrafts.length, issuesMedia.length, cloudStatus, visibleInboxItems.length]);
  const hasAnyDolabContent = useMemo(
    () =>
      pendingMedia.length +
        mappedSavedItems.length +
        mappedSavedMedia.length +
        savedRemote.notes.length +
        localDrafts.length +
        selfMessages.length +
        publishDrafts.length +
        shareDrafts.length +
        inboxItems.length >
      0,
    [
      pendingMedia.length,
      mappedSavedItems.length,
      mappedSavedMedia.length,
      savedRemote.notes.length,
      localDrafts.length,
      selfMessages.length,
      publishDrafts.length,
      shareDrafts.length,
      inboxItems.length,
    ],
  );
  const shelfMeta: Partial<Record<DolabViewMode, { title: string; description: string; iconName: keyof typeof Ionicons.glyphMap }>> = {
    notes: { title: 'الكلام مع نفسي', description: 'نوتس، ريكوردات، وأفكار سريعة بينك وبين نفسك.', iconName: 'chatbox-ellipses-outline' },
    media: { title: 'رف الميديا', description: 'صور، فيديوهات، وتسجيلات محفوظة.', iconName: 'images-outline' },
    drafts: { title: 'مسودات على الرف', description: 'حاجات بتتجهز عشان تطلع للسوق.', iconName: 'cube-outline' },
    ready: { title: 'جاهز يطلع للسوق', description: 'تحضيرات وعناصر جاهزة للخطوة التالية.', iconName: 'rocket-outline' },
    inbox: { title: 'وارد الدولاب', description: 'نصوص، روابط، وملفات جاية من برّه التطبيق.', iconName: 'download-outline' },
    issues: { title: 'مشاكل الرفوف', description: 'العناصر اللي محتاجة متابعة أو إعادة محاولة.', iconName: 'alert-circle-outline' },
  };
  const shelvesCounts = {
    notes: selfMessages.length + mappedSavedNotes.length,
    media: pendingMedia.length + mappedSavedMedia.length,
    drafts: localDrafts.length + mappedSavedItems.length,
    inbox: inboxItems.length,
    ideas: selfMessages.filter((item) => item.messageType === 'idea' || item.messageType === 'checklist').length,
  };
  const isMediaShelfEmpty = visiblePendingMedia.length + visibleSavedMedia.length === 0;
  const mediaStats = useMemo(() => {
    const allMedia = [...visiblePendingMedia, ...visibleSavedMedia];
    const photos = allMedia.filter((item) => item.mediaType === 'image').length;
    const videos = allMedia.filter((item) => item.mediaType === 'video').length;
    const recordings = allMedia.filter((item) => item.mediaType === 'audio').length;
    const localCount = visiblePendingMedia.length;
    const savedCount = visibleSavedMedia.length;
    return { photos, videos, recordings, localCount, savedCount };
  }, [visiblePendingMedia, visibleSavedMedia]);
  const isInboxShelfEmpty = visibleInboxItems.length === 0;
  const isDraftsShelfEmpty = visibleLocalDraftCardsFiltered.length + visibleSavedItems.length === 0;


  const draftReadinessMeta = (draft: DolabDraftItem) => {
    const hasTitle = Boolean(draft.title?.trim());
    const hasDescription = Boolean(draft.description?.trim() || draft.exchangeIntent?.trim());
    const hasMedia = draft.linkedPendingMediaIds.length > 0;
    const isPreparedForPublish = publishDrafts.some((item) => item.sourceDraftId === draft.id);

    if (isPreparedForPublish) {
      return { badge: 'جاهزة', hint: 'جاهزة تطلع للسوق. راجع قبل النشر.' };
    }
    if (!hasMedia) {
      return { badge: 'ناقصة ميديا', hint: 'لسه محتاجة ميديا.' };
    }
    if (!hasTitle || !hasDescription) {
      return { badge: 'ناقصة تفاصيل', hint: 'لسه محتاجة وصف أو تفاصيل أساسية.' };
    }
    return { badge: 'جاهزة', hint: 'جاهزة للمراجعة قبل ما تطلع للسوق.' };
  };

  const draftsShelfCounters = useMemo(() => {
    const local = visibleLocalDraftCardsFiltered;
    const readyLocal = local.filter((draft) => draftReadinessMeta(draft).badge === 'جاهزة').length;
    const missingLocal = local.filter((draft) => draftReadinessMeta(draft).badge !== 'جاهزة').length;
    return {
      drafts: local.length,
      ready: readyLocal,
      missing: missingLocal,
      saved: visibleSavedItems.length,
    };
  }, [visibleLocalDraftCardsFiltered, visibleSavedItems.length, publishDrafts]);

  const appendMedia = (items: DolabPendingMedia[]) => {
    setPendingMedia((prev) => [...items, ...prev]);
  };

  const removePendingMedia = (mediaId: string) => {
    setPendingMedia((prev) => prev.filter((item) => item.id !== mediaId));
    setDraftForm((prev) => ({
      ...prev,
      linkedPendingMediaIds: prev.linkedPendingMediaIds.filter((id) => id !== mediaId),
    }));
    setLocalDrafts((prev) => prev.map((draft) => ({ ...draft, linkedPendingMediaIds: draft.linkedPendingMediaIds.filter((id) => id !== mediaId) })));
    setSelfComposerMediaIds((prev) => prev.filter((id) => id !== mediaId));
    setSelfMessages((prev) =>
      prev.map((message) => ({
        ...message,
        linkedPendingMediaIds: message.linkedPendingMediaIds.filter((id) => id !== mediaId),
      })),
    );
    setShareDrafts((prev) =>
      prev.map((draft) => ({ ...draft, linkedPendingMediaIds: draft.linkedPendingMediaIds.filter((id) => id !== mediaId) })),
    );
    setPublishDrafts((prev) =>
      prev.map((draft) => ({ ...draft, linkedPendingMediaIds: draft.linkedPendingMediaIds.filter((id) => id !== mediaId) })),
    );
  };

  const findLinkedRemoteDraftId = (mediaId: string): string | null => {
    const linkedRemoteIds = localDrafts
      .filter((draft) => draft.linkedPendingMediaIds.includes(mediaId) && draft.remoteDolabItemId)
      .map((draft) => draft.remoteDolabItemId as string);

    const uniqueIds = [...new Set(linkedRemoteIds)];
    if (uniqueIds.length === 1) return uniqueIds[0];
    return null;
  };

  const uploadPendingMediaToCloud = async () => {
    if (isUploadingCloud) return;
    setIsUploadingCloud(true);
    try {
      if (!user?.id) {
        setInlineFeedback('سجّل الدخول عشان تحفظ ميديا الدولاب سحابيًا.');
        return;
      }

      const toProcess = pendingMedia.filter((item) => item.uploadStatus !== 'uploaded' && item.uploadStatus !== 'uploading' && !item.remoteMediaId);
      if (toProcess.length === 0) {
        setInlineFeedback('كل الميديا الحالية محفوظة أو لا تحتاج رفع الآن.');
        return;
      }

      let successCount = 0;
      let failCount = 0;

      let compressedCount = 0;
      let compressionFailedCount = 0;

      for (const media of toProcess) {
        let uploadCandidate = media;
        setPendingMedia((prev) => prev.map((item) => (item.id === media.id ? { ...item, uploadStatus: 'uploading', uploadError: undefined } : item)));

        const sizeResolved = await resolveDolabMediaSize(uploadCandidate);
        uploadCandidate = sizeResolved.data;
        if (sizeResolved.error) {
          setPendingMedia((prev) => prev.map((item) => (item.id === media.id ? { ...item, ...uploadCandidate } : item)));
        }

        const shouldCompressResult = shouldCompressDolabMedia(uploadCandidate);
        if (shouldCompressResult.data) {
          setPendingMedia((prev) => prev.map((item) => (item.id === media.id ? { ...item, compressionStatus: 'compressing', compressionError: undefined } : item)));
          setInlineFeedback('بنجهز الميديا للرفع...');
          const compressedResult = await compressDolabMedia(uploadCandidate);
          uploadCandidate = compressedResult.data;
          if (compressedResult.error) compressionFailedCount += 1;
          if (!compressedResult.error && uploadCandidate.compressionStatus === 'compressed') compressedCount += 1;
          setPendingMedia((prev) => prev.map((item) => (item.id === media.id ? { ...item, ...uploadCandidate } : item)));
        } else if (media.mediaType === 'audio') {
          uploadCandidate = { ...media, compressionStatus: 'not_needed', compressionError: undefined };
        } else if (!media.compressionStatus) {
          uploadCandidate = { ...media, compressionStatus: 'not_needed', compressionError: undefined };
        }

        const candidateSize = uploadCandidate.compressedSizeBytes ?? uploadCandidate.sizeBytes ?? uploadCandidate.originalSizeBytes;
        const hardMax = maxUploadBytesForType(uploadCandidate.mediaType);
        if (typeof candidateSize !== 'number') {
          failCount += 1;
          setPendingMedia((prev) => prev.map((item) => (item.id === media.id ? { ...item, ...uploadCandidate, uploadStatus: 'failed', uploadError: 'تعذر تحديد حجم الملف الآن. هنحاول الرفع بحذر.' } : item)));
          continue;
        }
        if (candidateSize > hardMax) {
          failCount += 1;
          setPendingMedia((prev) => prev.map((item) => (item.id === media.id ? { ...item, ...uploadCandidate, uploadStatus: 'failed', uploadError: 'حجم الملف كبير جدًا. جرّب ملف أصغر.' } : item)));
          continue;
        }

        const linkedRemoteDraftId = findLinkedRemoteDraftId(media.id);
        const result = await uploadAndSaveDolabMedia(user.id, uploadCandidate, { dolabItemId: linkedRemoteDraftId, sortOrder: 0 });

        if (result.error || !result.data) {
          failCount += 1;
          setPendingMedia((prev) =>
            prev.map((item) => (item.id === media.id ? { ...item, uploadStatus: 'failed', uploadError: result.error?.message } : item)),
          );
          if (result.error?.kind === 'schema_missing') setCloudStatus('schema_missing');
          continue;
        }

        successCount += 1;
        setPendingMedia((prev) =>
          prev.map((item) =>
            item.id === media.id
              ? {
                  ...item,
                  uploadStatus: 'uploaded',
                  uploadError: undefined,
                  storagePath: result.data?.storagePath,
                  remoteMediaId: result.data?.media.id,
                }
              : item,
          ),
        );
      }

      if (successCount > 0) {
        setCloudStatus('partial_sync');
        await refreshRemoteSnapshot(user.id);
      }

      if (compressedCount > 0) {
        setInlineFeedback('تم ضغط بعض الملفات قبل الحفظ السحابي.');
      }
      if (compressionFailedCount > 0) {
        setInlineFeedback('تعذر ضغط بعض الملفات. هنحاول نحفظ الأصل لو حجمه مناسب.');
      }

      if (failCount > 0 && successCount > 0) {
        setInlineFeedback(`تم حفظ ${successCount} عنصر سحابيًا، وتعذر حفظ ${failCount} عنصر. شغّال محليًا مؤقتًا.`);
        return;
      }
      if (failCount > 0) {
        setInlineFeedback('تعذر حفظ بعض الميديا سحابيًا. شغّال محليًا مؤقتًا.');
        return;
      }
      setInlineFeedback('تم حفظ الميديا السحابية بنجاح.');
    } finally {
      setIsUploadingCloud(false);
    }
  };

  const resetDraftForm = () => {
    setEditingDraftId(null);
    setDraftForm(emptyDraftForm);
  };

  const pickImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setInlineFeedback('محتاجين إذن الصور عشان ترفع صور للدولاب.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 8,
    });

    if (result.canceled) {
      setInlineFeedback('تم إلغاء اختيار الصور.');
      return;
    }

    const items = result.assets.map((asset) => toPendingMedia(asset, 'image'));
    appendMedia(items);
    setInlineFeedback(`تمت إضافة ${items.length} صورة للدولاب المحلي.`);
  };

  const pickVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setInlineFeedback('محتاجين إذن الصور والفيديو عشان ترفع فيديو.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
    });

    if (result.canceled) {
      setInlineFeedback('تم إلغاء اختيار الفيديو.');
      return;
    }

    const items = result.assets.map((asset) => toPendingMedia(asset, 'video'));
    appendMedia(items);
    setInlineFeedback('تمت إضافة فيديو للدولاب المحلي.');
  };

  const captureImage = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setInlineFeedback('إذن الكاميرا مرفوض. فعّله من الإعدادات للتصوير.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });

    if (result.canceled) {
      setInlineFeedback('تم إلغاء التصوير.');
      return;
    }

    const items = result.assets.map((asset) => toPendingMedia(asset, 'image'));
    appendMedia(items);
    setViewMode('media');
    setInlineFeedback('تم التقاط صورة واتحفظت في رف الميديا.');
  };

  const openDraftStudioForNew = () => {
    resetDraftForm();
    draftStudioRef.current?.present();
  };

  const openDraftStudioForEdit = (draft: DolabDraftItem) => {
    setEditingDraftId(draft.id);
    setDraftForm({
      title: draft.title,
      description: draft.description,
      category: draft.category ?? '',
      condition: draft.condition ?? '',
      exchangeIntent: draft.exchangeIntent ?? '',
      linkedPendingMediaIds: draft.linkedPendingMediaIds,
    });
    draftStudioRef.current?.present();
  };

  const toggleMediaLink = (mediaId: string) => {
    setDraftForm((prev) => ({
      ...prev,
      linkedPendingMediaIds: prev.linkedPendingMediaIds.includes(mediaId)
        ? prev.linkedPendingMediaIds.filter((id) => id !== mediaId)
        : [...prev.linkedPendingMediaIds, mediaId],
    }));
  };

  const toggleSelfComposerMedia = (mediaId: string) => {
    setSelfComposerMediaIds((prev) => (prev.includes(mediaId) ? prev.filter((id) => id !== mediaId) : [...prev, mediaId]));
  };

  const saveSelfMessage = async () => {
    const cleanBody = selfComposerBody.trim();
    if (!cleanBody) {
      setSelfComposerError('اكتب ملاحظة أو فكرة الأول قبل الحفظ.');
      return;
    }

    const newMessage: DolabSelfMessage = {
      id: `local-self-message-${Date.now()}`,
      body: cleanBody,
      messageType: selfComposerType,
      linkedDraftId: selfComposerDraftId ?? undefined,
      linkedPendingMediaIds: selfComposerMediaIds,
      createdAt: new Date().toISOString(),
    };

    setSelfMessages((prev) => [newMessage, ...prev]);
    setSelfComposerBody('');
    setSelfComposerError(null);

    if (!user?.id) {
      setInlineFeedback('سجّل الدخول عشان تحفظ دولابك سحابيًا.');
      return;
    }

    const linkedDraft = localDrafts.find((draft) => draft.id === newMessage.linkedDraftId);
    const result = await saveDolabSelfNote(user.id, {
      body: newMessage.body,
      messageType: newMessage.messageType,
      dolabItemId: linkedDraft?.remoteDolabItemId ?? null,
    });

    if (result.error) {
      setInlineFeedback(result.error.message);
      if (result.error.kind === 'schema_missing') setCloudStatus('schema_missing');
      return;
    }

    if (result.data?.id) {
      setSelfMessages((prev) => prev.map((item) => (item.id === newMessage.id ? { ...item, remoteNoteId: result.data?.id } : item)));
      setCloudStatus('partial_sync');
      await refreshRemoteSnapshot(user.id);
      setInlineFeedback('تم حفظ ملاحظة السيلف-شات سحابيًا بشكل جزئي.');
    }
  };

  const deleteSelfMessage = (messageId: string) => {
    setSelfMessages((prev) => prev.filter((message) => message.id !== messageId));
    setShareDrafts((prev) => prev.filter((draft) => draft.sourceMessageId !== messageId));
  };
  const openNotesComposer = () => {
    setViewMode('notes');
    setSelfComposerType('text');
    setSelfComposerError(null);
    setInlineFeedback('سيب نوت صغيرة لنفسك وارجعلها وقت ما تحب.');
  };
  const openNotesRecorder = () => {
    setViewMode('notes');
    audioRecorderSheetRef.current?.present();
  };
  const createCollection = () => {
    const clean = newCollectionName.trim();
    if (!clean) return;
    const exists = collections.some((collection) => collection.name.trim().toLocaleLowerCase() === clean.toLocaleLowerCase());
    if (exists) {
      setInlineFeedback('المجموعة دي موجودة بالفعل.');
      return;
    }
    const now = new Date().toISOString();
    setCollections((prev) => [{ id: `collection-${Date.now()}`, name: clean, createdAt: now, updatedAt: now }, ...prev]);
    setNewCollectionName('');
    setInlineFeedback('تمت إضافة مجموعة محلية.');
  };
  const openAssignCollection = (draftId: string) => {
    setCollectionAssignTarget({ type: 'local_draft', id: draftId });
    collectionPickerSheetRef.current?.present();
  };
  const assignTargetToCollection = (collectionId: string) => {
    if (!collectionAssignTarget) return;
    setCollectionAssignments((prev) => [
      ...prev.filter(
        (item) =>
          !(item.collectionId === collectionId && item.targetType === collectionAssignTarget.type && item.targetId === collectionAssignTarget.id),
      ),
      { collectionId, targetType: collectionAssignTarget.type, targetId: collectionAssignTarget.id, assignedAt: new Date().toISOString() },
    ]);
    collectionPickerSheetRef.current?.dismiss();
    setInlineFeedback('اتضاف للمجموعة.');
  };



  const addInboxItem = (item: DolabInboxItem, feedback = 'اتضاف لوارد الدولاب.') => {
    setInboxItems((prev) => [item, ...prev]);
    setInlineFeedback(feedback);
  };

  const captureClipboard = async () => {
    try {
      const text = (await Clipboard.getStringAsync()).trim();
      if (!text) {
        setInlineFeedback('الحافظة فاضية.');
        return;
      }
      addInboxItem(createInboxTextItem({ body: text, source: 'clipboard' }));
    } catch {
      setInlineFeedback('تعذر قراءة الحافظة حاليًا.');
    }
  };

  const captureDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: '*/*',
      });
      if (result.canceled || result.assets.length === 0) return;
      const asset = result.assets[0];
      addInboxItem(
        createInboxFileItem({
          source: 'document_picker',
          uri: asset.uri,
          fileName: asset.name,
          mimeType: asset.mimeType ?? undefined,
          sizeBytes: asset.size ?? undefined,
        }),
        'اتضاف الملف لوارد الدولاب.',
      );
    } catch {
      setInlineFeedback('تعذر اختيار الملف حاليًا.');
    }
  };

  const captureManualText = (value: string) => {
    const clean = value.trim();
    if (!clean) {
      setInlineFeedback('اكتب نص الأول.');
      return false;
    }
    addInboxItem(createInboxTextItem({ body: clean, source: 'manual' }));
    return true;
  };

  const convertInboxToMedia = (item: DolabInboxItem) => {
    if (item.type === 'file') {
      setInlineFeedback('الملفات العامة محفوظة كوارد فقط حاليًا.');
      return;
    }
    const pending = createPendingMediaFromInboxItem(item);
    if (!pending) return;
    appendMedia([pending]);
    setInboxItems((prev) => prev.filter((entry) => entry.id !== item.id));
    setInlineFeedback('اتحول لرف الميديا في دولابك.');
  };

  const convertInboxToNote = (item: DolabInboxItem) => {
    const body = item.type === 'file' ? `ملف محفوظ: ${item.fileName ?? item.title}` : (item.body ?? item.title);
    const messageType: DolabSelfMessageType = item.type === 'link' ? 'idea' : 'text';
    setSelfMessages((prev) => [{ id: `local-self-message-${Date.now()}`, body, messageType, linkedPendingMediaIds: [], createdAt: new Date().toISOString() }, ...prev]);
    setInboxItems((prev) => prev.filter((entry) => entry.id !== item.id));
    setInlineFeedback('اتحول للكلام مع نفسي في دولابك.');
  };

  const openShareBridge = (messageId: string) => {
    const message = selfMessages.find((item) => item.id === messageId);
    if (!message) {
      setInlineFeedback('تعذر تحميل الرسالة المختارة للمشاركة.');
      return;
    }

    setShareBridgeMessageId(message.id);
    setShareBridgeBody(message.body);
    setShareBridgeTargetMode('choose_later');
    shareBridgeRef.current?.present();
  };


  const openConversationPicker = () => {
    const sourceMessage = selfMessages.find((item) => item.id === shareBridgeMessageId);
    const cleanBody = (shareBridgeBody.trim() || sourceMessage?.body || '').trim();

    if (!user?.id) {
      setInlineFeedback('سجل الدخول الأول عشان تشارك في الشات.');
      return;
    }
    if (!cleanBody) {
      setInlineFeedback('اكتب نص المشاركة الأول.');
      return;
    }

    setConversationPickerRefreshKey((prev) => prev + 1);
    conversationPickerRef.current?.present();
  };

  const sendShareToConversation = async (conversation: DirectConversationSummary) => {
    if (!conversation?.conversationId || isSendingShareToChat) return;
    const sourceMessage = selfMessages.find((item) => item.id === shareBridgeMessageId);
    if (!sourceMessage) { setInlineFeedback('الرسالة المختارة غير متاحة الآن.'); return; }

    const linkedDraft = localDrafts.find((draft) => draft.id === sourceMessage.linkedDraftId);
    const shareText = shareBridgeBody.trim() || sourceMessage.body;
    const body = buildDolabShareToChatBody({ shareText, linkedDraft, linkedMediaCount: sourceMessage.linkedPendingMediaIds.length });
    if (!body.trim()) { setInlineFeedback('نص المشاركة فارغ.'); return; }

    setIsSendingShareToChat(true);
    try {
      const sendResult = await sendDirectMessage(conversation.conversationId, body);

      if (!sendResult.ok) {
        setInlineFeedback(sendResult.message);
        return;
      }

    const now = new Date().toISOString();
    setShareDrafts((prev) => [{
      id: `local-share-draft-${Date.now()}`,
      sourceMessageId: sourceMessage.id,
      body: shareText,
      linkedDraftId: sourceMessage.linkedDraftId,
      linkedPendingMediaIds: sourceMessage.linkedPendingMediaIds,
      targetMode: 'direct_chat',
      targetConversationId: conversation.conversationId,
      createdAt: now,
      preparedAt: now,
      sentAt: now,
      status: 'sent',
    }, ...prev.filter((item) => item.sourceMessageId !== sourceMessage.id)]);

    if (user?.id && sourceMessage.remoteNoteId) {
      void markDolabNoteShared(user.id, sourceMessage.remoteNoteId, conversation.conversationId);
    }

    conversationPickerRef.current?.dismiss();
    shareBridgeRef.current?.dismiss();
    setInlineFeedback('اترسلت في الشات.');
    } catch {
      setInlineFeedback('تعذر إرسال المشاركة للشات حاليًا.');
    } finally {
      setIsSendingShareToChat(false);
    }
  };

  const prepareShareDraft = () => {
    if (!shareBridgeMessageId) {
      return;
    }

    const sourceMessage = selfMessages.find((item) => item.id === shareBridgeMessageId);
    if (!sourceMessage) {
      setInlineFeedback('تعذر تجهيز الرسالة للمشاركة.');
      return;
    }

    const cleanBody = shareBridgeBody.trim() || sourceMessage.body;
    const draft: DolabShareDraft = {
      id: `local-share-draft-${Date.now()}`,
      sourceMessageId: sourceMessage.id,
      body: cleanBody,
      linkedDraftId: sourceMessage.linkedDraftId,
      linkedPendingMediaIds: sourceMessage.linkedPendingMediaIds,
      targetMode: shareBridgeTargetMode,
      createdAt: new Date().toISOString(),
      preparedAt: new Date().toISOString(),
      status: 'prepared',
    };

    setShareDrafts((prev) => [draft, ...prev.filter((item) => item.sourceMessageId !== sourceMessage.id)]);
    shareBridgeRef.current?.dismiss();
    setInlineFeedback('مجهز للمشاركة.');
  };

  const selectedShareMessage = useMemo(
    () => selfMessages.find((message) => message.id === shareBridgeMessageId) ?? null,
    [selfMessages, shareBridgeMessageId],
  );

  const selectedShareLinkedDraft = useMemo(
    () => localDrafts.find((draft) => draft.id === selectedShareMessage?.linkedDraftId),
    [localDrafts, selectedShareMessage?.linkedDraftId],
  );


  const selectedPublishSourceDraft = useMemo(
    () => localDrafts.find((draft) => draft.id === selectedPublishSourceDraftId) ?? null,
    [localDrafts, selectedPublishSourceDraftId],
  );

  const selectedPublishLinkedMedia = useMemo(() => {
    if (!selectedPublishSourceDraft) {
      return [];
    }

    return pendingMedia.filter((item) => selectedPublishSourceDraft.linkedPendingMediaIds.includes(item.id));
  }, [pendingMedia, selectedPublishSourceDraft]);

  const selectedPublishBridgeData = useMemo(() => {
    if (!selectedPublishSourceDraft) {
      return null;
    }

    return buildPublishDraftFromDolabDraft(selectedPublishSourceDraft, selectedPublishLinkedMedia);
  }, [selectedPublishLinkedMedia, selectedPublishSourceDraft]);

  const openPublishBridge = (draft: DolabDraftItem) => {
    setSelectedPublishSourceDraftId(draft.id);
    publishBridgeRef.current?.present();
  };

  const preparePublishDraft = () => {
    if (!selectedPublishSourceDraft || !selectedPublishBridgeData) {
      return;
    }

    const now = new Date().toISOString();

    setPublishDrafts((prev) => {
      const existing = prev.find((item) => item.sourceDraftId === selectedPublishSourceDraft.id);
      const nextDraft: DolabPublishDraft = {
        ...selectedPublishBridgeData,
        id: existing?.id ?? `local-publish-draft-${Date.now()}`,
        readinessStatus: selectedPublishBridgeData.missingFields.length === 0 ? 'prepared' : 'incomplete',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      return [nextDraft, ...prev.filter((item) => item.sourceDraftId !== selectedPublishSourceDraft.id)];
    });

    publishBridgeRef.current?.dismiss();
    setInlineFeedback('العرض اتجهز. افتح إضافة عنصر وراجعه قبل النشر.');
  };

  const saveLocalDraft = async () => {
    const now = new Date().toISOString();
    const nextDraftId = editingDraftId ?? `local-draft-${Date.now()}`;
    const localDraft: DolabDraftItem = {
      id: nextDraftId,
      title: draftForm.title,
      description: draftForm.description,
      category: draftForm.category || undefined,
      condition: draftForm.condition || undefined,
      exchangeIntent: draftForm.exchangeIntent || undefined,
      linkedPendingMediaIds: draftForm.linkedPendingMediaIds,
      createdAt: now,
      updatedAt: now,
    };

    if (editingDraftId) {
      setLocalDrafts((prev) =>
        prev.map((draft) =>
          draft.id === editingDraftId
            ? {
                ...draft,
                ...draftForm,
                category: draftForm.category || undefined,
                condition: draftForm.condition || undefined,
                exchangeIntent: draftForm.exchangeIntent || undefined,
                updatedAt: now,
              }
            : draft,
        ),
      );
    } else {
      setLocalDrafts((prev) => [localDraft, ...prev]);
    }

    draftStudioRef.current?.dismiss();
    setViewMode('drafts');
    setInlineFeedback('اتحفظت في مسودات على الرف.');
    resetDraftForm();

    if (!user?.id) {
      setInlineFeedback('سجّل الدخول عشان تحفظ دولابك سحابيًا.');
      return;
    }

    const existingRemoteId = editingDraftId?.startsWith('remote-') ? editingDraftId.replace('remote-','') : localDrafts.find((item) => item.id === nextDraftId)?.remoteDolabItemId;
    const remoteResult = existingRemoteId
      ? await updateDolabSavedItem(user.id, existingRemoteId, localDraft)
      : await saveDolabDraftItem(user.id, localDraft);

    if (remoteResult.error) {
      setInlineFeedback(remoteResult.error.message);
      if (remoteResult.error.kind === 'schema_missing') setCloudStatus('schema_missing');
      return;
    }

    if (remoteResult.data?.id) {
      setLocalDrafts((prev) => prev.map((item) => (item.id === nextDraftId ? { ...item, remoteDolabItemId: remoteResult.data?.id } : item)));
      setCloudStatus('partial_sync');
      await refreshRemoteSnapshot(user.id);
      setInlineFeedback('تم حفظ المسودة في مسودات على الرف (محليًا وسحابيًا بشكل جزئي).');
    }
  };




  const requestDelete = (target: { type: 'item' | 'note' | 'media'; id: string; storagePath?: string }) => {
    setSelectedDelete(target);
    confirmDeleteRef.current?.present();
  };

  const confirmDelete = async () => {
    if (!user?.id || !selectedDelete) return;
    let error = null;
    if (selectedDelete.type === 'note') {
      const r = await deleteDolabNote(user.id, selectedDelete.id); error = r.error;
      if (!error) setInlineFeedback('اتحذفت الملاحظة من دولابك.');
    } else if (selectedDelete.type === 'media' && selectedDelete.storagePath) {
      const r = await deleteDolabMedia(user.id, selectedDelete.id, selectedDelete.storagePath); error = r.error;
    } else if (selectedDelete.type === 'item') {
      const linked = savedRemote.media.filter((m) => m.dolab_item_id === selectedDelete.id);
      for (const m of linked) {
        const rm = await deleteDolabMedia(user.id, m.id, m.storage_path);
        if (rm.error) { error = rm.error; break; }
      }
      if (!error) { const di = await deleteDolabItem(user.id, selectedDelete.id); error = di.error; }
    }
    confirmDeleteRef.current?.dismiss();
    setSelectedDelete(null);
    if (error) { setInlineFeedback(error.message); return; }
    await refreshRemoteSnapshot(user.id);
    setInlineFeedback('تم الحذف من الدولاب السحابي.');
  };

  const routeSavedItemToAdd = (itemId: string) => {
    router.push({ pathname: '/(tabs)/add', params: { dolabItemId: itemId, source: 'dolab' } });
  };

  const openPublishedItem = (publishedItemId: string) => {
    router.push(`/item/${publishedItemId}`);
  };

  const editSavedItem = (itemId: string) => {
    const remote = savedRemote.items.find((item) => item.id === itemId);
    if (!remote) return;
    setEditingDraftId(`remote-${itemId}`);
    setDraftForm({ title: remote.title || '', description: remote.description || '', category: remote.category || '', condition: remote.condition || '', exchangeIntent: '', linkedPendingMediaIds: [] });
    draftStudioRef.current?.present();
  };

  const sheetActions = useMemo(
    () => [
      {
        label: 'صوّر حاجة',
        iconName: 'camera-outline' as const,
        description: 'التقط صورة محلية محفوظة على جهازك.',
        onPress: () => {
          addSheetRef.current?.dismiss();
          void captureImage();
        },
      },
      {
        label: 'ارفع صور',
        iconName: 'images-outline' as const,
        description: 'اختار صورة أو أكثر من جهازك.',
        onPress: () => {
          addSheetRef.current?.dismiss();
          void pickImages();
        },
      },
      {
        label: 'ارفع فيديو',
        iconName: 'videocam-outline' as const,
        description: 'اختَر فيديو محلي للدولاب.',
        onPress: () => {
          addSheetRef.current?.dismiss();
          void pickVideo();
        },
      },
      {
        label: 'اكتب ملاحظة',
        iconName: 'document-text-outline' as const,
        description: 'سجّل فكرة تبادل أو وصف سريع.',
        onPress: () => {
          addSheetRef.current?.dismiss();
          setInlineFeedback('اكتب نص سريع وسيبه في وارد الدولاب.');
          inboxQuickNoteSheetRef.current?.present();
        },
      },
      {
        label: 'الصق من الحافظة',
        iconName: 'clipboard-outline' as const,
        description: 'التقط نص أو رابط من الحافظة لوارد الدولاب.',
        onPress: () => { addSheetRef.current?.dismiss(); void captureClipboard(); },
      },
      {
        label: 'اختار ملف',
        iconName: 'document-attach-outline' as const,
        description: 'اختَر أي ملف واحفظه كوارد بدون رفع.',
        onPress: () => { addSheetRef.current?.dismiss(); void captureDocument(); },
      },
      {
        label: 'اكتب نص سريع',
        iconName: 'create-outline' as const,
        description: 'سجل فكرة سريعة في وارد الدولاب.',
        onPress: () => { addSheetRef.current?.dismiss(); inboxQuickNoteSheetRef.current?.present(); },
      },
      {
        label: 'سجل صوت',
        iconName: 'mic-outline' as const,
        description: 'احفظ ملاحظة صوتية لنفسك لاحقًا.',
        onPress: () => {
          addSheetRef.current?.dismiss();
          audioRecorderSheetRef.current?.present();
        },
      },
      {
        label: 'مسودة عنصر',
        iconName: 'cube-outline' as const,
        description: 'ابدأ عنصرًا يتحول لاحقًا لعرض.',
        onPress: () => {
          addSheetRef.current?.dismiss();
          openDraftStudioForNew();
        },
      },
    ],
    [],
  );
  const handleAddHere = () => {
    setActiveShelfForActions(viewMode);
    shelfActionSheetRef.current?.present();
  };

  return (
    <AppScreen backgroundVariant="alive" style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="الرجوع من شاشة دولاب تسوى"
          >
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </Pressable>
          <AppText weight="bold" style={styles.headerTitle}>
            دولاب تسوى
          </AppText>
        </View>

        {viewMode === 'all' ? (
          <>
            <DolabVaultHero />
            <AppText muted style={styles.cloudStatusText}>
              {cloudStatus === 'schema_missing'
                ? 'الحفظ السحابي غير مفعّل بعد'
                : cloudStatus === 'partial_sync'
                  ? `متزامن جزئيًا · عناصر ${remoteSnapshot.items} · ميديا ${remoteSnapshot.media} · ملاحظات ${remoteSnapshot.notes}`
                  : 'محلي فقط'}
            </AppText>
            <Pressable
              style={styles.actionBtnInline}
              onPress={async () => {
                if (!user?.id) {
                  setInlineFeedback('سجّل الدخول عشان تجيب دولابك المحفوظ.');
                  return;
                }

                const refreshed = await refreshRemoteSnapshot(user.id);
                if (refreshed) {
                  setInlineFeedback('اتحدّث الدولاب.');
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="تحديث الدولاب المحفوظ"
            >
              <AppText style={styles.actionBtnInlineText}>حدّث الدولاب</AppText>
            </Pressable>
            <AppCard>
              <View style={styles.guidanceHead}>
                <AppText weight="bold">ابدأ من هنا</AppText>
                <AppText muted>
                  افتح رف وسيب الحاجة في مكانها. صورة في رف الميديا، فكرة في الكلام مع نفسي، ومسودة في مسودات على الرف.
                </AppText>
              </View>
              <View style={styles.guidanceSteps}>
                <View style={styles.guidanceStep}>
                  <AppText weight="semibold">عندك صورة؟</AppText>
                  <AppText muted>رف الميديا</AppText>
                </View>
                <View style={styles.guidanceStep}>
                  <AppText weight="semibold">عندك فكرة؟</AppText>
                  <AppText muted>الكلام مع نفسي</AppText>
                </View>
                <View style={styles.guidanceStep}>
                  <AppText weight="semibold">هتنشر حاجة؟</AppText>
                  <AppText muted>مسودات على الرف</AppText>
                </View>
              </View>
            </AppCard>
            <DolabShelvesOverview
              counts={shelvesCounts}
              onOpenShelf={setViewMode}
              onQuickNote={() => {
                setViewMode('notes');
                setSelfComposerType('text');
                setInlineFeedback('اكتب نوتك في الكلام مع نفسي.');
              }}
              onQuickAudio={() => audioRecorderSheetRef.current?.present()}
              onQuickCamera={() => {
                void captureImage();
              }}
              onQuickDraft={() => {
                setInlineFeedback('ابدأ مسودتك في مسودات على الرف.');
                openDraftStudioForNew();
              }}
            />
          </>
        ) : (
          <>
            {shelfMeta[viewMode] ? (
              <DolabShelfHeader
                title={shelfMeta[viewMode]!.title}
                description={shelfMeta[viewMode]!.description}
                iconName={shelfMeta[viewMode]!.iconName}
                onBack={() => setViewMode('all')}
                onAddHere={handleAddHere}
              />
            ) : null}
            {(['media', 'drafts', 'inbox', 'notes'] as DolabViewMode[]).includes(viewMode) ? (
              <DolabSearchBar value={searchQuery} onChange={setSearchQuery} />
            ) : null}
            {viewMode !== 'notes' ? (
              <DolabFilterChips sort={sortMode} status={statusFilter} onSortChange={setSortMode} onStatusChange={setStatusFilter} />
            ) : null}
            {(viewMode === 'drafts' || viewMode === 'media') && (
              <DolabCollectionsSection
                collections={collections}
                counts={collectionCountById}
                selectedCollectionId={selectedCollectionId}
                onSelectCollection={setSelectedCollectionId}
                newCollectionName={newCollectionName}
                onChangeNewCollectionName={setNewCollectionName}
                onCreateCollection={createCollection}
              />
            )}
          </>
        )}

        {!isCollectionFocusActive && viewMode === 'inbox' && (
          <DolabAnimatedSection delay={12}>
            {isInboxShelfEmpty && (
              <AppCard>
                <EmptyState
                  title="الوارد فاضي."
                  description="الوارد فاضي. الصق نص، اختار ملف، أو اكتب حاجة سريعة."
                  iconName="download-outline"
                />
                <AppButton label="أضف هنا" variant="neutral" onPress={handleAddHere} />
              </AppCard>
            )}
            {!isInboxShelfEmpty && (
              <DolabInboxSection
                items={visibleInboxItems}
                onConvertToNote={convertInboxToNote}
                onConvertToMedia={convertInboxToMedia}
                onDelete={(id) => setInboxItems((prev) => prev.filter((item) => item.id !== id))}
              />
            )}
          </DolabAnimatedSection>
        )}

        {selectedCollectionName ? (
          <View style={styles.collectionFocusWrap}>
            <DolabCollectionBadge name={selectedCollectionName} />
            <Pressable style={styles.actionBtnInline} onPress={() => setSelectedCollectionId(null)} accessibilityRole="button" accessibilityLabel="عرض كل عناصر الدولاب">
              <AppText style={styles.actionBtnInlineText}>عرض الكل</AppText>
            </Pressable>
          </View>
        ) : null}

        {viewMode === 'drafts' && (
          <DolabAnimatedSection delay={200}>
            <AppCard>
              <View style={styles.sectionHeader}>
                <AppText weight="bold">مسودات على الرف</AppText>
                <AppText muted>هنا بتجهّز الحاجة قبل ما تطلع للسوق: صور، وصف، حالة، والمقابل اللي يناسبك.</AppText>
              </View>
              <View style={styles.mediaCountersRow}>
                <AppText muted style={styles.smallText}>مسودات: {draftsShelfCounters.drafts}</AppText>
                <AppText muted style={styles.smallText}>جاهزة: {draftsShelfCounters.ready}</AppText>
                <AppText muted style={styles.smallText}>ناقصة بيانات: {draftsShelfCounters.missing}</AppText>
                <AppText muted style={styles.smallText}>محفوظة: {draftsShelfCounters.saved}</AppText>
              </View>
              <View style={styles.mediaActionsRow}>
                <Pressable style={styles.actionBtnInline} onPress={openDraftStudioForNew} accessibilityRole="button"><AppText style={styles.actionBtnInlineText}>ابدأ مسودة</AppText></Pressable>
                <Pressable style={styles.actionBtnInline} onPress={() => { openDraftStudioForNew(); setInlineFeedback('اختار ميديا من رف الميديا واربطها بالمسودة.'); }} accessibilityRole="button"><AppText style={styles.actionBtnInlineText}>حوّل ميديا لمسودة</AppText></Pressable>
                <Pressable style={styles.actionBtnInline} onPress={() => router.push('/(tabs)/add')} accessibilityRole="button"><AppText style={styles.actionBtnInlineText}>افتح إضافة عنصر</AppText></Pressable>
              </View>
            </AppCard>
          </DolabAnimatedSection>
        )}


        {!isCollectionFocusActive && (viewMode === 'ready' || (viewMode === 'drafts' && !isDraftsShelfEmpty)) && (
        <DolabAnimatedSection delay={20}>
          <DolabSavedLibrarySection
            title={viewMode === 'drafts' ? 'محفوظة كمسودات' : undefined}
            description={viewMode === 'drafts' ? 'حاجات محفوظة تقدر تكملها أو تراجعها قبل ما تطلع للسوق.' : undefined}
            items={visibleSavedItems}
            notes={viewMode === 'drafts' ? [] : visibleSavedNotes}
            media={viewMode === 'drafts' || viewMode === 'ready' ? [] : visibleSavedMedia}
            onDeleteNote={(id) => requestDelete({ type: 'note', id })}
            onDeleteItem={(id) => requestDelete({ type: 'item', id })}
            onDeleteMedia={(item) =>
              requestDelete({
                type: 'media',
                id: item.id,
                storagePath: item.storagePath,
              })}
            onEditItem={editSavedItem}
            onPublishItem={routeSavedItemToAdd}
            onOpenPublishedItem={openPublishedItem}
          />
        </DolabAnimatedSection>)}

        {!isCollectionFocusActive && viewMode === 'media' && (
          <DolabAnimatedSection delay={24}>
            <AppCard>
              <View style={styles.sectionHeader}>
                <AppText weight="bold">رف الميديا</AppText>
                <AppText muted>صور، فيديوهات، وتسجيلات محفوظة لحد ما تقرر تعمل بيها إيه.</AppText>
              </View>
              <View style={styles.mediaCountersRow}>
                <AppText muted style={styles.smallText}>صور: {mediaStats.photos}</AppText>
                <AppText muted style={styles.smallText}>فيديوهات: {mediaStats.videos}</AppText>
                <AppText muted style={styles.smallText}>تسجيلات: {mediaStats.recordings}</AppText>
              </View>
              <AppText muted style={styles.smallText}>محفوظ سحابيًا: {mediaStats.savedCount} · على الجهاز: {mediaStats.localCount}</AppText>
            </AppCard>
            {!isMediaShelfEmpty && (
              <View style={styles.mediaActionsRow}>
                <Pressable style={styles.actionBtnInline} onPress={() => { void captureImage(); }} accessibilityRole="button">
                  <AppText style={styles.actionBtnInlineText}>صوّر حاجة</AppText>
                </Pressable>
                <Pressable style={styles.actionBtnInline} onPress={() => { void pickImages(); }} accessibilityRole="button">
                  <AppText style={styles.actionBtnInlineText}>ارفع صور</AppText>
                </Pressable>
                <Pressable style={styles.actionBtnInline} onPress={() => { void pickVideo(); }} accessibilityRole="button">
                  <AppText style={styles.actionBtnInlineText}>ارفع فيديو</AppText>
                </Pressable>
                <Pressable style={styles.actionBtnInline} onPress={() => audioRecorderSheetRef.current?.present()} accessibilityRole="button">
                  <AppText style={styles.actionBtnInlineText}>سجل صوت</AppText>
                </Pressable>
              </View>
            )}
          </DolabAnimatedSection>
        )}

        {!isCollectionFocusActive && (viewMode === 'media' || viewMode === 'issues') && (viewMode === 'issues' || !isMediaShelfEmpty) && <DolabAnimatedSection delay={30}>
        <AppCard>
          <View style={styles.sectionHeader}>
            <AppText weight="bold">على الرف الآن</AppText>
            <AppText muted>الحاجات دي على الرف. احفظ المهم منها عشان تفضل معاك.</AppText>
          </View>
          <AppButton label="احفظ المهم سحابيًا" variant="neutral" onPress={() => { void uploadPendingMediaToCloud(); }} />
          <AppText muted style={styles.smallText}>تقدر تعيد محاولة حفظ العناصر الفاشلة.</AppText>

          <DolabPendingMediaStrip
            pendingMedia={viewMode === 'issues' ? issuesMedia : visiblePendingMedia}
            mode="preview"
            onRemove={removePendingMedia}
            emptyText="رف الميديا فاضي. صوّر حاجة أو ارفع صورة تبدأ بيها."
          />
        </AppCard>
        </DolabAnimatedSection>}
        {!isCollectionFocusActive && viewMode === 'media' && isMediaShelfEmpty && (
          <AppCard>
            <EmptyState title="رف الميديا فاضي." description="صوّر حاجة، ارفع صورة، أو سجّل صوت… وسيبها هنا لحد ما تقرر تطلعها للسوق." iconName="images-outline" />
            <AppButton label="صوّر حاجة" variant="neutral" onPress={() => { void captureImage(); }} />
            <View style={styles.mediaEmptyActions}>
              <AppButton label="ارفع صور" variant="ghost" onPress={() => { void pickImages(); }} />
              <AppButton label="سجل صوت" variant="ghost" onPress={() => audioRecorderSheetRef.current?.present()} />
            </View>
          </AppCard>
        )}
        {!isCollectionFocusActive && viewMode === 'media' && visibleSavedMedia.length > 0 && (
          <DolabAnimatedSection delay={40}>
            <AppCard>
              <View style={styles.sectionHeader}>
                <AppText weight="bold">محفوظة في دولابك</AppText>
              </View>
              <DolabSavedMediaGrid
                media={visibleSavedMedia}
                onDeleteMedia={(item) =>
                  requestDelete({
                    type: 'media',
                    id: item.id,
                    storagePath: item.storagePath,
                  })}
              />
            </AppCard>
          </DolabAnimatedSection>
        )}

        {!isCollectionFocusActive && viewMode === 'notes' && <DolabAnimatedSection delay={70}>
        <DolabSelfChatPanel
          messages={visibleSelfMessages}
          localDrafts={localDrafts}
          pendingMedia={pendingMedia}
          composerBody={selfComposerBody}
          selectedType={selfComposerType}
          selectedDraftId={selfComposerDraftId}
          linkedMediaIds={selfComposerMediaIds}
          composerError={selfComposerError}
          shareStatusBySourceId={shareDrafts.reduce((acc, draft) => { acc[draft.sourceMessageId] = draft.status; return acc; }, {} as Record<string, 'prepared' | 'sent'>)}
          onChangeBody={(value) => {
            setSelfComposerBody(value);
            if (selfComposerError) {
              setSelfComposerError(null);
            }
          }}
          onSelectType={setSelfComposerType}
          onSelectDraft={setSelfComposerDraftId}
          onToggleMedia={toggleSelfComposerMedia}
          onSave={() => {
            void saveSelfMessage();
          }}
          onShareLater={openShareBridge}
          onDelete={deleteSelfMessage}
          onStartFirstNote={openNotesComposer}
          onRecordVoice={openNotesRecorder}
        />
        </DolabAnimatedSection>}



        {!isCollectionFocusActive && viewMode === 'notes' && visibleShareDrafts.length > 0 && <DolabAnimatedSection delay={120}><AppCard>
          <View style={styles.sectionHeader}>
            <AppText weight="bold">رسائل جاهزة</AppText>
            <AppText muted>مسودات دولاب المجهزة واللي اتبعتت في شات مباشر.</AppText>
          </View>
          <View style={styles.listWrap}>
              {visibleShareDrafts.map((draft) => (
                <DolabPressableCard key={draft.id} style={styles.localDraftCard} onPress={() => {}} accessibilityRole="button" accessibilityLabel="عرض حالة مشاركة الرسالة">
                  <View style={styles.localDraftHeader}>
                    <AppText weight="semibold" numberOfLines={2}>{draft.body}</AppText>
                    <View style={styles.localBadge}>
                      <AppText style={styles.localBadgeText}>{draft.status === 'sent' ? 'اتشاركت' : 'مجهز'}</AppText>
                    </View>
                  </View>
                  <AppText muted style={styles.smallText}>ميديا مرتبطة: {draft.linkedPendingMediaIds.length}</AppText>
                  <AppText muted style={styles.smallText}>{draft.status === 'sent' ? 'اتشاركت في شات مباشر.' : 'لسه مش متبعتة في شات.'}</AppText>
                </DolabPressableCard>
              ))}
            </View>
        </AppCard></DolabAnimatedSection>}
        {!isCollectionFocusActive && viewMode === 'drafts' && isDraftsShelfEmpty && (
          <AppCard>
            <EmptyState title="مفيش مسودات على الرف." description="ابدأ مسودة من صورة، نوت، أو فكرة… وخليها جاهزة تطلع للسوق." iconName="cube-outline" />
            <AppButton label="ابدأ مسودة" variant="neutral" onPress={openDraftStudioForNew} />
            <AppButton label="افتح رف الميديا" variant="ghost" onPress={() => setViewMode('media')} />
          </AppCard>
        )}


        {!isCollectionFocusActive && viewMode === 'ready' && <DolabAnimatedSection delay={170}><AppCard>
          <View style={styles.sectionHeader}>
            <AppText weight="bold">جاهز يطلع للسوق</AppText>
            <AppText muted>تحضيرات جاهزة تقدر تطلع للسوق من إضافة عنصر.</AppText>
          </View>
          {visiblePublishDrafts.length === 0 ? (
            <AppText muted style={styles.smallText}>لسه مفيش عروض محضرة للسوق، حضّر مسودة أولًا.</AppText>
          ) : (
            <View style={styles.listWrap}>
              {visiblePublishDrafts.map((draft) => (
                <DolabPressableCard key={draft.id} style={styles.localDraftCard} onPress={() => {
                      setInlineFeedback('افتح إضافة عنصر وكمّل النشر هناك.');
                      router.push('/(tabs)/add');
                    }} accessibilityRole="button" accessibilityLabel="فتح إضافة عنصر لاستكمال النشر">
                  <View style={styles.localDraftHeader}>
                    <AppText weight="semibold">{draft.title || 'مسودة بدون اسم'}</AppText>
                    <View style={styles.localBadge}>
                      <AppText style={styles.localBadgeText}>
                        {draft.readinessStatus === 'prepared' ? 'مجهز' : draft.readinessStatus === 'ready' ? 'جاهز' : 'ناقص بيانات'}
                      </AppText>
                    </View>
                  </View>
                  <AppText muted style={styles.smallText}>ميديا مرتبطة: {draft.linkedPendingMediaIds.length}</AppText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="فتح إضافة عنصر لاستكمال النشر"
                    onPress={() => {
                      setInlineFeedback('افتح إضافة عنصر وكمّل النشر هناك.');
                      router.push('/(tabs)/add');
                    }}
                    style={styles.actionBtnInline}
                  >
                    <AppText style={styles.actionBtnInlineText}>افتح إضافة عنصر</AppText>
                  </Pressable>
                </DolabPressableCard>
              ))}
            </View>
          )}
        </AppCard></DolabAnimatedSection>}

        {(viewMode === 'drafts' || viewMode === 'ready') && (viewMode === 'ready' || !isDraftsShelfEmpty) && <DolabAnimatedSection delay={220}><AppCard>
          <View style={styles.sectionHeader}>
            <AppText weight="bold">{viewMode === 'ready' ? 'جاهزة للمراجعة' : 'المسودات الحالية'}</AppText>
            <AppText muted>{viewMode === 'ready' ? 'راجعها قبل ما تطلع للسوق.' : 'كمّل التفاصيل أو جهّزها للعرض.'}</AppText>
          </View>
          <View style={styles.listWrap}>
            {visibleLocalDraftCardsFiltered.map((draft) => (
              <DolabPressableCard
                key={draft.id}
                style={styles.localDraftCard}
                onPress={() => openDraftStudioForEdit(draft)}
                accessibilityRole="button"
                accessibilityLabel={`فتح مسودة محلية ${draft.title || 'بدون عنوان'} للتعديل`}
              >
                <View style={styles.localDraftHeader}>
                  <AppText weight="semibold">{draft.title || 'مسودة بدون اسم'}</AppText>
                  <View style={styles.localBadge}>
                    <AppText style={styles.localBadgeText}>
                      {draftReadinessMeta(draft).badge}
                    </AppText>
                  </View>
                </View>
                <AppText muted style={styles.smallText}>
                  {draft.description || draft.exchangeIntent || draftReadinessMeta(draft).hint}
                </AppText>
                <AppText muted style={styles.smallText}>
                  ميديا مرتبطة: {draft.linkedPendingMediaIds.length}
                </AppText>
                <Pressable
                  style={styles.actionBtnInline}
                  onPress={(event) => {
                    event.stopPropagation();
                    openDraftStudioForEdit(draft);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="كمّل المسودة"
                >
                  <AppText style={styles.actionBtnInlineText}>كمّل المسودة</AppText>
                </Pressable>
                <Pressable
                  style={styles.actionBtnInline}
                  onPress={(event) => {
                    event.stopPropagation();
                    openPublishBridge(draft);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="جهّز المسودة للعرض"
                >
                  <AppText style={styles.actionBtnInlineText}>{publishDrafts.some((item) => item.sourceDraftId === draft.id) ? 'طلعها للسوق' : 'جهّز للعرض'}</AppText>
                </Pressable>
                <Pressable
                  style={styles.actionBtnInline}
                  onPress={(event) => {
                    event.stopPropagation();
                    openAssignCollection(draft.id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="إضافة المسودة لمجموعة"
                >
                  <AppText style={styles.actionBtnInlineText}>أضف لمجموعة</AppText>
                </Pressable>
              </DolabPressableCard>
            ))}
            {selectedCollectionId && visibleLocalDraftCardsFiltered.length === 0 ? <AppText muted>المجموعة لسه فاضية.</AppText> : null}

          </View>
        </AppCard></DolabAnimatedSection>}


        {!isCollectionFocusActive && viewMode !== 'all' && !hasVisibleContentForCurrentMode && hasAnyDolabContent && (
          <DolabEmptyFilteredState description={viewMode === 'issues' ? 'مفيش مشاكل حاليًا.' : 'مفيش نتائج بالفلتر ده. جرّب تفتح رف تاني.'} />
        )}

        {!isCollectionFocusActive && viewMode !== 'all' && !hasAnyDolabContent && <AppCard>
          <EmptyState
            title="الدولاب لسه فاضي… أول حاجة هتحوله لمكانك."
            description="صوّر حاجة، احفظ فكرة، أو سيب ملاحظة لنفسك لحد ما تقرر تطلعها للسوق."
            iconName="folder-open-outline"
          />
          <AppButton
            label="ابدأ الإضافة الآن"
            variant="neutral"
            onPress={() => addSheetRef.current?.present()}
          />
        </AppCard>}

        <View style={styles.ctaWrap}>
          <AppButton label="أضف للدولاب" onPress={() => addSheetRef.current?.present()} />
          <AppText muted style={styles.feedbackText}>
            {inlineFeedback ?? 'اختَر طريقة البداية، والباقي قريبًا.'}
          </AppText>
        </View>
      </ScrollView>

      <AppActionSheet
        ref={addSheetRef}
        title="أضف حاجة للدولاب"
        description="ابدأ بصورة، فيديو، ملاحظة، أو مسودة تبادل."
        titleIconName="add-circle-outline"
        snapPoints={['52%']}
        actions={sheetActions}
      />


      <DolabAudioRecorderSheet
        sheetRef={audioRecorderSheetRef}
        onFeedback={setInlineFeedback}
        onSave={(recording) => {
          const pending = createPendingAudioMedia(recording);
          appendMedia([pending]);
          const durationLabel = pending.durationMs ? `${Math.max(1, Math.round(pending.durationMs / 1000))}ث` : 'بدون مدة';
          setSelfMessages((prev) => [
            {
              id: `local-self-message-${Date.now()}`,
              body: `تسجيل صوتي محفوظ في دولابك · ${durationLabel}`,
              messageType: 'voice_placeholder',
              linkedPendingMediaIds: [pending.id],
              createdAt: new Date().toISOString(),
            },
            ...prev,
          ]);
          setInlineFeedback('اتحفظ كتسجيل صوتي في الكلام مع نفسك ورف الميديا.');
          setViewMode('notes');
        }}
      />
      <DolabShelfActionSheet
        sheetRef={shelfActionSheetRef}
        activeShelf={activeShelfForActions}
        onCaptureImage={() => { void captureImage(); }}
        onPickImages={() => { void pickImages(); }}
        onPickVideo={() => { void pickVideo(); }}
        onRecordAudio={() => audioRecorderSheetRef.current?.present()}
        onOpenDraftStudio={openDraftStudioForNew}
        onOpenQuickNote={() => {
          if (activeShelfForActions === 'inbox') {
            inboxQuickNoteSheetRef.current?.present();
            return;
          }
          setViewMode('notes');
          setSelfComposerType('text');
          setInlineFeedback('اكتب نوتك في الكلام مع نفسي.');
        }}
        onCaptureClipboard={() => { void captureClipboard(); }}
        onCaptureDocument={() => { void captureDocument(); }}
        onFeedback={setInlineFeedback}
      />
      <DolabCollectionPickerSheet sheetRef={collectionPickerSheetRef} collections={collections} onSelect={assignTargetToCollection} />

      <DolabShareBridgeSheet
        sheetRef={shareBridgeRef}
        selectedMessage={selectedShareMessage}
        linkedDraft={selectedShareLinkedDraft}
        shareBody={shareBridgeBody}
        targetMode={shareBridgeTargetMode}
        onChangeBody={setShareBridgeBody}
        onSelectTargetMode={setShareBridgeTargetMode}
        onPrepareShare={prepareShareDraft}
        onSendToChat={openConversationPicker}
      />

      <DolabConversationPickerSheet
        sheetRef={conversationPickerRef}
        isSending={isSendingShareToChat}
        refreshKey={conversationPickerRefreshKey}
        onSelectConversation={(conversation) => {
          void sendShareToConversation(conversation);
        }}
      />

      <DolabPublishBridgeSheet
        sheetRef={publishBridgeRef}
        selectedDraft={selectedPublishSourceDraft}
        linkedPendingMedia={selectedPublishLinkedMedia}
        missingFields={selectedPublishBridgeData?.missingFields ?? []}
        onPrepare={preparePublishDraft}
        onRouteToAddItem={() => {
          if (selectedPublishSourceDraft?.remoteDolabItemId) {
            router.push({ pathname: '/(tabs)/add', params: { dolabItemId: selectedPublishSourceDraft.remoteDolabItemId, source: 'dolab' } });
            publishBridgeRef.current?.dismiss();
            return;
          }
          setInlineFeedback('احفظ المسودة سحابيًا الأول عشان تتحول لعرض.');
        }}
      />

      <AppActionSheet
        ref={confirmDeleteRef}
        title="تأكيد الحذف"
        description="الحذف من الدولاب السحابي لا يمكن التراجع عنه حاليًا."
        titleIconName="trash-outline"
        actions={[
          {
            label: 'احذف',
            tone: 'danger',
            onPress: () => {
              void confirmDelete();
            },
          },
          {
            label: 'إلغاء',
            onPress: () => confirmDeleteRef.current?.dismiss(),
          },
        ]}
      />

      <AppBottomSheet
        ref={draftStudioRef}
        title="مسودة عنصر"
        description="حوّل الصور والأفكار اللي في دولابك لمسودة جاهزة للتبادل لاحقًا."
        titleIconName="cube-outline"
        snapPoints={['80%']}
      >
        <ScrollView contentContainerStyle={styles.studioBody}>
          <AppInput
            value={draftForm.title}
            onChangeText={(value) => setDraftForm((prev) => ({ ...prev, title: value }))}
            placeholder="اسم الحاجة"
          />
          <AppInput
            value={draftForm.description}
            onChangeText={(value) => setDraftForm((prev) => ({ ...prev, description: value }))}
            placeholder="وصف سريع"
            multiline
          />
          <AppInput
            value={draftForm.category}
            onChangeText={(value) => setDraftForm((prev) => ({ ...prev, category: value }))}
            placeholder="التصنيف"
          />
          <AppInput
            value={draftForm.condition}
            onChangeText={(value) => setDraftForm((prev) => ({ ...prev, condition: value }))}
            placeholder="الحالة"
          />
          <AppInput
            value={draftForm.exchangeIntent}
            onChangeText={(value) => setDraftForm((prev) => ({ ...prev, exchangeIntent: value }))}
            placeholder="نية التبادل / هتحب تبدلها بإيه؟"
            multiline
          />

          <View style={styles.sectionHeader}>
            <AppText weight="semibold">ربط ميديا محلية</AppText>
            {pendingMedia.length === 0 ? (
              <AppText muted style={styles.smallText}>
                ارفع صور أو فيديوهات الأول عشان تربطها بالمسودة.
              </AppText>
            ) : null}
          </View>

          {pendingMedia.length > 0 ? (
            <DolabPendingMediaStrip
              pendingMedia={pendingMedia}
              mode="selectable"
              selectedMediaIds={draftForm.linkedPendingMediaIds}
              onToggleSelect={toggleMediaLink}
            />
          ) : null}

          <AppButton label="احفظ المسودة محليًا" onPress={() => {
            void saveLocalDraft();
          }} />
        </ScrollView>
      </AppBottomSheet>

      <AppBottomSheet
        ref={inboxQuickNoteSheetRef}
        title="اكتب نص سريع"
        description="سجل حاجة لسه جاية من برّه التطبيق."
        titleIconName="create-outline"
        snapPoints={['45%']}
      >
        <View style={styles.studioBody}>
          <AppInput value={inboxQuickNoteBody} onChangeText={setInboxQuickNoteBody} placeholder="اكتب النص هنا" multiline />
          <AppButton
            label="احفظ في الوارد"
            onPress={() => {
              const didSave = captureManualText(inboxQuickNoteBody);
              if (!didSave) {
                return;
              }
              setInboxQuickNoteBody('');
              inboxQuickNoteSheetRef.current?.dismiss();
            }}
          />
        </View>
      </AppBottomSheet>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  headerTitle: {
    fontSize: 22,
  },
  hero: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.16)',
    padding: spacing.lg,
    overflow: 'hidden',
    gap: spacing.sm,
  },
  heroGlow: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: radii.round,
    backgroundColor: 'rgba(184,98,63,0.22)',
    left: -30,
    top: -20,
  },
  heroTopIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,253,248,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.16)',
  },
  heroBadge: {
    alignSelf: 'flex-start',
    borderRadius: radii.round,
    backgroundColor: 'rgba(255,253,248,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.22)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  heroBadgeText: {
    color: '#7B5230',
    fontSize: 12,
  },
  heroTitle: {
    fontSize: 28,
  },
  heroSubtitle: {
    lineHeight: 23,
  },
  floatingChip: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row-reverse',
    gap: 4,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.84)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radii.round,
  },
  floatingChipSecondary: {
    position: 'absolute',
    bottom: 18,
    left: 14,
    flexDirection: 'row-reverse',
    gap: 4,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.84)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radii.round,
  },
  chipText: {
    fontSize: 12,
  },
  sectionHeader: {
    gap: 3,
    marginBottom: spacing.xs,
  },
  guidanceHead: {
    gap: 4,
    marginBottom: spacing.xs,
  },
  guidanceSteps: {
    gap: spacing.xs,
  },
  guidanceStep: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(184,98,63,0.2)',
  },
  collectionFocusWrap: {
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  listWrap: {
    gap: spacing.xs,
  },
  rowCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.sm,
    backgroundColor: '#FFFDF9',
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  smallText: {
    fontSize: 12,
  },
  actionBtnInline: {
    alignSelf: 'flex-start',
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  actionBtnInlineText: {
    color: colors.primary,
    fontSize: 13,
  },
  mediaCountersRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  mediaActionsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  mediaEmptyActions: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  pendingRow: {
    gap: spacing.sm,
  },
  pendingCard: {
    width: 124,
    height: 124,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: '#FFFDF9',
  },
  pendingCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  selectedOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: radii.round,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingImage: {
    width: '100%',
    height: '100%',
  },
  pendingPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  removeButton: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: radii.round,
  },
  ctaWrap: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  feedbackText: {
    textAlign: 'center',
  },
  cloudStatusText: {
    textAlign: 'center',
    fontSize: 12,
  },
  localDraftCard: {
    borderWidth: 1,
    borderColor: colors.primarySoft,
    borderRadius: radii.lg,
    padding: spacing.sm,
    backgroundColor: '#FFF9F1',
    gap: spacing.xs,
  },
  localDraftHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  localBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.round,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
  },
  localBadgeText: {
    fontSize: 11,
    color: colors.primary,
  },
  studioBody: {
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
});
