import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { AppActionSheet } from '@/components/sheets/AppActionSheet';
import { AppBottomSheet } from '@/components/sheets/AppBottomSheet';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { DolabAudioRecorderSheet } from '@/components/dolab/DolabAudioRecorderSheet';
import { DolabCollectionPickerSheet } from '@/components/dolab/DolabCollectionPickerSheet';
import { DolabConversationPickerSheet } from '@/components/dolab/DolabConversationPickerSheet';
import { DolabInboxSection } from '@/components/dolab/DolabInboxSection';
import { DolabPendingMediaStrip } from '@/components/dolab/DolabPendingMediaStrip';
import { DolabPublishBridgeSheet } from '@/components/dolab/DolabPublishBridgeSheet';
import { DolabSavedMediaGrid } from '@/components/dolab/DolabSavedMediaGrid';
import type { DolabSavedMediaCardModel } from '@/components/dolab/DolabSavedMediaPreviewCard';
import { DolabSelfChatPanel } from '@/components/dolab/DolabSelfChatPanel';
import { DolabShareBridgeSheet } from '@/components/dolab/DolabShareBridgeSheet';
import { DolabVaultHero } from '@/components/dolab/DolabVaultHero';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import type { DolabCollection, DolabCollectionAssignment } from '@/lib/dolab/collections';
import type { DolabDraftItem, DolabDraftItemInput } from '@/lib/dolab/draft-types';
import { copyDolabInboxFileToDurableUri, makePendingMediaDurable } from '@/lib/dolab/durable-media';
import type { DolabInboxItem } from '@/lib/dolab/inbox';
import { createInboxFileItem, createInboxTextItem } from '@/lib/dolab/inbox';
import { createPendingAudioMedia, createPendingMediaFromInboxItem, toPendingMedia } from '@/lib/dolab/local-media';
import {
  type DolabLocalWorkspaceSnapshot,
  readLocalDolabWorkspaceSnapshot,
  writeLocalDolabWorkspaceSnapshot,
} from '@/lib/dolab/local-persistence';
import type { DolabPendingMedia } from '@/lib/dolab/media-types';
import {
  compressDolabMedia,
  maxUploadBytesForType,
  resolveDolabMediaSize,
  shouldCompressDolabMedia,
} from '@/lib/dolab/media-compression';
import { linkDolabNoteToMedia } from '@/lib/dolab/note-media-link';
import { buildPublishDraftFromDolabDraft, type DolabPublishDraft } from '@/lib/dolab/publish-bridge-types';
import type { DolabSelfMessage, DolabSelfMessageType } from '@/lib/dolab/self-chat-types';
import type { DolabShareDraft, DolabShareDraftTargetMode } from '@/lib/dolab/share-bridge-types';
import type { DolabItem, DolabNote } from '@/lib/dolab/types';
import {
  createDolabMediaSignedUrls,
  deleteDolabItem,
  deleteDolabMedia,
  deleteDolabNote,
  fetchDolabLibrarySnapshot,
  markDolabNoteShared,
  saveDolabDraftItem,
  saveDolabSelfNote,
  updateDolabSavedItem,
  uploadAndSaveDolabMedia,
} from '@/lib/dolab';
import { buildDolabShareToChatBody } from '@/lib/dolab/share-to-chat';
import { type DirectConversationSummary, sendDirectMessage } from '@/lib/direct-messages';
import { consumePendingInboundDolabInboxItems } from '@/lib/inbound-shared-media';
import { trackPerformanceMetric } from '@/lib/performance-telemetry';

type DolabSection = 'overview' | 'inbox' | 'drafts' | 'media' | 'notes' | 'saved';
type FeedbackTone = 'info' | 'success' | 'warning' | 'error';
type RemoteState = 'device_only' | 'loading' | 'ready' | 'error';

type Feedback = {
  tone: FeedbackTone;
  message: string;
};

type PersistableWorkspace = Omit<DolabLocalWorkspaceSnapshot, 'version' | 'savedAt'>;

type DeleteTarget = {
  type: 'item' | 'note' | 'media';
  id: string;
  storagePath?: string;
};

const emptyDraftForm: DolabDraftItemInput = {
  title: '',
  description: '',
  category: '',
  condition: '',
  exchangeIntent: '',
  linkedPendingMediaIds: [],
};

const createDefaultCollections = (): DolabCollection[] => {
  const now = new Date().toISOString();
  return [
    { id: 'collection-trade', name: 'للتبديل', createdAt: now, updatedAt: now },
    { id: 'collection-sell-soon', name: 'جاهزة قريبًا', createdAt: now, updatedAt: now },
    { id: 'collection-photo-needed', name: 'محتاجة تصوير', createdAt: now, updatedAt: now },
    { id: 'collection-ideas', name: 'أفكار', createdAt: now, updatedAt: now },
  ];
};

const sectionOptions: Array<{ id: DolabSection; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: 'overview', label: 'نظرة عامة', icon: 'grid-outline' },
  { id: 'inbox', label: 'الوارد', icon: 'download-outline' },
  { id: 'drafts', label: 'المسودات', icon: 'cube-outline' },
  { id: 'media', label: 'الميديا', icon: 'images-outline' },
  { id: 'notes', label: 'ملاحظاتي', icon: 'chatbox-ellipses-outline' },
  { id: 'saved', label: 'السحابة', icon: 'cloud-done-outline' },
];

const includesQuery = (values: Array<string | null | undefined>, query: string) => {
  if (!query) return true;
  return values.some((value) => value?.toLocaleLowerCase().includes(query));
};

const syncLabelForDraft = (draft: DolabDraftItem) => {
  if (draft.syncState === 'error') return { label: 'تعذر المزامنة', tone: 'error' as const };
  if (draft.syncState === 'pending') return { label: 'جاري المزامنة', tone: 'warning' as const };
  if (draft.syncState === 'synced' || draft.remoteDolabItemId) return { label: 'متزامنة', tone: 'success' as const };
  return { label: 'على الجهاز', tone: 'info' as const };
};

const noteTypeLabel = (note: DolabNote) => {
  if (note.note_type === 'voice') return 'تسجيل صوتي';
  if (note.note_type === 'idea') return 'فكرة';
  if (note.note_type === 'checklist') return 'قائمة';
  return 'ملاحظة';
};

export default function DolabWorkspaceScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const draftSheetRef = useRef<BottomSheetModal>(null);
  const quickTextSheetRef = useRef<BottomSheetModal>(null);
  const audioRecorderSheetRef = useRef<BottomSheetModal>(null);
  const collectionPickerSheetRef = useRef<BottomSheetModal>(null);
  const shareBridgeRef = useRef<BottomSheetModal>(null);
  const conversationPickerRef = useRef<BottomSheetModal>(null);
  const publishBridgeRef = useRef<BottomSheetModal>(null);
  const deleteSheetRef = useRef<BottomSheetModal>(null);
  const firstContentStartedAtRef = useRef(Date.now());
  const firstContentMetricSentRef = useRef(false);
  const persistenceWarningShownRef = useRef(false);

  const [activeSection, setActiveSection] = useState<DolabSection>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);

  const [pendingMedia, setPendingMedia] = useState<DolabPendingMedia[]>([]);
  const [localDrafts, setLocalDrafts] = useState<DolabDraftItem[]>([]);
  const [selfMessages, setSelfMessages] = useState<DolabSelfMessage[]>([]);
  const [shareDrafts, setShareDrafts] = useState<DolabShareDraft[]>([]);
  const [publishDrafts, setPublishDrafts] = useState<DolabPublishDraft[]>([]);
  const [collections, setCollections] = useState<DolabCollection[]>(createDefaultCollections);
  const [collectionAssignments, setCollectionAssignments] = useState<DolabCollectionAssignment[]>([]);
  const [inboxItems, setInboxItems] = useState<DolabInboxItem[]>([]);

  const [savedRemote, setSavedRemote] = useState<{ items: DolabItem[]; notes: DolabNote[]; media: any[] }>({ items: [], notes: [], media: [] });
  const [savedMediaSignedUrls, setSavedMediaSignedUrls] = useState<Record<string, string | null>>({});
  const [remoteState, setRemoteState] = useState<RemoteState>('device_only');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  const [draftForm, setDraftForm] = useState<DolabDraftItemInput>(emptyDraftForm);
  const [editingLocalDraftId, setEditingLocalDraftId] = useState<string | null>(null);
  const [editingRemoteItemId, setEditingRemoteItemId] = useState<string | null>(null);
  const [draftSourceInboxId, setDraftSourceInboxId] = useState<string | null>(null);

  const [selfComposerBody, setSelfComposerBody] = useState('');
  const [selfComposerType, setSelfComposerType] = useState<DolabSelfMessageType>('text');
  const [selfComposerDraftId, setSelfComposerDraftId] = useState<string | null>(null);
  const [selfComposerMediaIds, setSelfComposerMediaIds] = useState<string[]>([]);
  const [selfComposerError, setSelfComposerError] = useState<string | null>(null);

  const [quickText, setQuickText] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [collectionAssignDraftId, setCollectionAssignDraftId] = useState<string | null>(null);

  const [shareBridgeMessageId, setShareBridgeMessageId] = useState<string | null>(null);
  const [shareBridgeBody, setShareBridgeBody] = useState('');
  const [shareBridgeTargetMode, setShareBridgeTargetMode] = useState<DolabShareDraftTargetMode>('choose_later');
  const [isSendingShare, setIsSendingShare] = useState(false);
  const [conversationPickerRefreshKey, setConversationPickerRefreshKey] = useState(0);

  const [selectedPublishSourceDraftId, setSelectedPublishSourceDraftId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const notify = useCallback((message: string, tone: FeedbackTone = 'info') => {
    setFeedback({ message, tone });
  }, []);

  const workspaceValue = (): PersistableWorkspace => ({
    pendingMedia,
    localDrafts,
    selfMessages,
    shareDrafts,
    publishDrafts,
    collections,
    collectionAssignments,
    inboxItems,
  });

  const persistWorkspace = (overrides: Partial<PersistableWorkspace> = {}) => {
    const ok = writeLocalDolabWorkspaceSnapshot({ ...workspaceValue(), ...overrides });
    if (!ok && !persistenceWarningShownRef.current) {
      persistenceWarningShownRef.current = true;
      notify('تعذر تثبيت آخر تغيير على الجهاز. جرّب مرة تانية قبل ما تقفل التطبيق.', 'error');
    }
    return ok;
  };

  useEffect(() => {
    const hydrate = async () => {
      const snapshot = readLocalDolabWorkspaceSnapshot();
      const inbound = consumePendingInboundDolabInboxItems();
      const durableInbound = await Promise.all(
        inbound.map(async (item) => {
          if (!item.uri) return item;
          const durable = await copyDolabInboxFileToDurableUri({ uri: item.uri, fileName: item.fileName, mimeType: item.mimeType });
          return { ...item, uri: durable.uri, fileName: durable.fileName ?? item.fileName };
        }),
      );
      const inboxById = new Map<string, DolabInboxItem>();
      for (const item of [...durableInbound, ...snapshot.inboxItems]) inboxById.set(item.id, item);

      setPendingMedia(snapshot.pendingMedia);
      setLocalDrafts(snapshot.localDrafts);
      setSelfMessages(snapshot.selfMessages);
      setShareDrafts(snapshot.shareDrafts);
      setPublishDrafts(snapshot.publishDrafts);
      setCollections(snapshot.collections.length > 0 ? snapshot.collections : createDefaultCollections());
      setCollectionAssignments(snapshot.collectionAssignments);
      setInboxItems(Array.from(inboxById.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setWorkspaceHydrated(true);
      if (durableInbound.length > 0) notify('الوارد الجديد اتحفظ في دولابك على الجهاز.', 'success');
    };

    void hydrate();
  }, [notify]);

  useEffect(() => {
    if (!workspaceHydrated) return;
    persistWorkspace();
  }, [
    workspaceHydrated,
    pendingMedia,
    localDrafts,
    selfMessages,
    shareDrafts,
    publishDrafts,
    collections,
    collectionAssignments,
    inboxItems,
  ]);

  useEffect(() => {
    if (!workspaceHydrated || firstContentMetricSentRef.current) return;
    firstContentMetricSentRef.current = true;
    void trackPerformanceMetric('dolab_first_content_time', Date.now() - firstContentStartedAtRef.current, {
      route: '/dolab',
      cacheHit: pendingMedia.length + localDrafts.length + selfMessages.length + inboxItems.length > 0,
    });
  }, [workspaceHydrated, pendingMedia.length, localDrafts.length, selfMessages.length, inboxItems.length]);

  const refreshRemoteSnapshot = useCallback(async (quiet = false) => {
    if (!user?.id) {
      setRemoteState('device_only');
      if (!quiet) notify('دولابك محفوظ على الجهاز. سجّل الدخول لو عايز النسخة السحابية.', 'info');
      return false;
    }

    setRemoteState('loading');
    const result = await fetchDolabLibrarySnapshot(user.id);
    if (result.error) {
      setRemoteState('error');
      if (!quiet) notify(result.error.message, 'error');
      return false;
    }

    setSavedRemote(result.data);
    const signed = await createDolabMediaSignedUrls(result.data.media);
    setSavedMediaSignedUrls(signed.data);
    setRemoteState('ready');
    setLastSyncAt(new Date().toISOString());
    if (signed.error && !quiet) notify('البيانات اتحدثت، لكن بعض معاينات الميديا مش متاحة دلوقتي.', 'warning');
    return true;
  }, [notify, user?.id]);

  useEffect(() => {
    if (!workspaceHydrated) return;
    if (!user?.id) {
      setRemoteState('device_only');
      return;
    }
    void refreshRemoteSnapshot(true);
  }, [refreshRemoteSnapshot, user?.id, workspaceHydrated]);

  const mappedSavedMedia = useMemo<DolabSavedMediaCardModel[]>(
    () => savedRemote.media.map((media: any) => ({
      id: media.id,
      remoteMediaId: media.id,
      mediaType: media.media_type,
      mediaTypeLabel: media.media_type === 'image' ? 'صورة' : media.media_type === 'video' ? 'فيديو' : 'تسجيل صوتي',
      storagePath: media.storage_path,
      signedUrl: savedMediaSignedUrls[media.id] ?? undefined,
      linkedItemTitle: savedRemote.items.find((item) => item.id === media.dolab_item_id)?.title ?? undefined,
      meta: [
        media.width && media.height ? `${media.width}x${media.height}` : null,
        media.size_bytes ? `${Math.round(media.size_bytes / 1024)}KB` : null,
        media.duration_ms ? `${Math.round(media.duration_ms / 1000)}ث` : null,
      ].filter(Boolean).join(' · ') || 'بدون بيانات إضافية',
      previewStatus: !media.storage_path ? 'unavailable' : savedMediaSignedUrls[media.id] ? 'ready' : 'failed',
    })),
    [savedMediaSignedUrls, savedRemote.items, savedRemote.media],
  );

  const query = searchQuery.trim().toLocaleLowerCase();
  const filteredInbox = useMemo(() => inboxItems.filter((item) => includesQuery([item.title, item.body, item.fileName], query)), [inboxItems, query]);
  const filteredMedia = useMemo(() => pendingMedia.filter((item) => includesQuery([item.fileName, item.mimeType, item.mediaType], query)), [pendingMedia, query]);
  const filteredMessages = useMemo(() => selfMessages.filter((item) => includesQuery([item.body, item.messageType], query)), [selfMessages, query]);
  const filteredSavedItems = useMemo(() => savedRemote.items.filter((item) => includesQuery([item.title, item.description, item.category, item.exchange_intent], query)), [query, savedRemote.items]);
  const filteredSavedNotes = useMemo(() => savedRemote.notes.filter((item) => includesQuery([item.body, item.note_type], query)), [query, savedRemote.notes]);
  const filteredSavedMedia = useMemo(() => mappedSavedMedia.filter((item) => includesQuery([item.linkedItemTitle, item.mediaTypeLabel, item.meta], query)), [mappedSavedMedia, query]);

  const collectionCountById = useMemo(() => collectionAssignments.reduce((acc, assignment) => {
    acc[assignment.collectionId] = (acc[assignment.collectionId] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>), [collectionAssignments]);

  const filteredDrafts = useMemo(() => {
    let drafts = localDrafts.filter((draft) => includesQuery([draft.title, draft.description, draft.category, draft.exchangeIntent], query));
    if (!selectedCollectionId) return drafts;
    const ids = new Set(collectionAssignments.filter((item) => item.collectionId === selectedCollectionId && item.targetType === 'local_draft').map((item) => item.targetId));
    drafts = drafts.filter((draft) => ids.has(draft.id));
    return drafts;
  }, [collectionAssignments, localDrafts, query, selectedCollectionId]);

  const pendingSyncCount = useMemo(() => {
    const drafts = localDrafts.filter((item) => item.syncState !== 'synced' && !item.remoteDolabItemId).length + localDrafts.filter((item) => item.syncState === 'pending' || item.syncState === 'error').length;
    const notes = selfMessages.filter((item) => !item.remoteNoteId || item.syncState === 'pending' || item.syncState === 'error').length;
    const media = pendingMedia.filter((item) => item.uploadStatus !== 'uploaded').length;
    return drafts + notes + media;
  }, [localDrafts, pendingMedia, selfMessages]);

  const issueCount = useMemo(() => (
    localDrafts.filter((item) => item.syncState === 'error').length +
    selfMessages.filter((item) => item.syncState === 'error').length +
    pendingMedia.filter((item) => item.uploadStatus === 'failed' || item.compressionStatus === 'failed').length
  ), [localDrafts, pendingMedia, selfMessages]);

  const shareStatusBySourceId = useMemo(() => shareDrafts.reduce((acc, draft) => {
    acc[draft.sourceMessageId] = draft.status;
    return acc;
  }, {} as Record<string, 'prepared' | 'sent'>), [shareDrafts]);

  const selectedShareMessage = useMemo(() => selfMessages.find((item) => item.id === shareBridgeMessageId) ?? null, [selfMessages, shareBridgeMessageId]);
  const selectedShareLinkedDraft = useMemo(() => localDrafts.find((item) => item.id === selectedShareMessage?.linkedDraftId), [localDrafts, selectedShareMessage?.linkedDraftId]);
  const selectedPublishDraft = useMemo(() => localDrafts.find((item) => item.id === selectedPublishSourceDraftId) ?? null, [localDrafts, selectedPublishSourceDraftId]);
  const selectedPublishMedia = useMemo(() => selectedPublishDraft ? pendingMedia.filter((item) => selectedPublishDraft.linkedPendingMediaIds.includes(item.id)) : [], [pendingMedia, selectedPublishDraft]);
  const selectedPublishData = useMemo(() => selectedPublishDraft ? buildPublishDraftFromDolabDraft(selectedPublishDraft, selectedPublishMedia) : null, [selectedPublishDraft, selectedPublishMedia]);

  const appendMedia = (items: DolabPendingMedia[]) => {
    const next = [...items, ...pendingMedia];
    if (!persistWorkspace({ pendingMedia: next })) return false;
    setPendingMedia(next);
    return true;
  };

  const removePendingMedia = (mediaId: string) => {
    const nextMedia = pendingMedia.filter((item) => item.id !== mediaId);
    const nextDrafts = localDrafts.map((draft) => ({ ...draft, linkedPendingMediaIds: draft.linkedPendingMediaIds.filter((id) => id !== mediaId) }));
    const nextMessages = selfMessages.map((message) => ({ ...message, linkedPendingMediaIds: message.linkedPendingMediaIds.filter((id) => id !== mediaId) }));
    const nextShare = shareDrafts.map((draft) => ({ ...draft, linkedPendingMediaIds: draft.linkedPendingMediaIds.filter((id) => id !== mediaId) }));
    const nextPublish = publishDrafts.map((draft) => ({ ...draft, linkedPendingMediaIds: draft.linkedPendingMediaIds.filter((id) => id !== mediaId) }));
    if (!persistWorkspace({ pendingMedia: nextMedia, localDrafts: nextDrafts, selfMessages: nextMessages, shareDrafts: nextShare, publishDrafts: nextPublish })) return;
    setPendingMedia(nextMedia);
    setLocalDrafts(nextDrafts);
    setSelfMessages(nextMessages);
    setShareDrafts(nextShare);
    setPublishDrafts(nextPublish);
    notify('اتحذفت من نسخة الجهاز.', 'success');
  };

  const captureImage = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      notify('إذن الكاميرا مرفوض. فعّله من إعدادات الجهاز للتصوير.', 'error');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (result.canceled) return;
    const items = await Promise.all(result.assets.map(async (asset) => makePendingMediaDurable(toPendingMedia(asset, 'image'))));
    if (appendMedia(items)) {
      setActiveSection('media');
      notify('الصورة اتحفظت على الجهاز في قسم الميديا.', 'success');
    }
  };

  const pickImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify('محتاجين إذن الصور عشان تضيف صور للدولاب.', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsMultipleSelection: true, selectionLimit: 8 });
    if (result.canceled) return;
    const items = await Promise.all(result.assets.map(async (asset) => makePendingMediaDurable(toPendingMedia(asset, 'image'))));
    if (appendMedia(items)) {
      setActiveSection('media');
      notify(`اتحفظ ${items.length} صورة على الجهاز.`, 'success');
    }
  };

  const pickVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify('محتاجين إذن الصور والفيديو عشان تضيف فيديو.', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: 0.8 });
    if (result.canceled) return;
    const items = await Promise.all(result.assets.map(async (asset) => makePendingMediaDurable(toPendingMedia(asset, 'video'))));
    if (appendMedia(items)) {
      setActiveSection('media');
      notify('الفيديو اتحفظ على الجهاز.', 'success');
    }
  };

  const addInboxItem = (item: DolabInboxItem, message = 'اتحفظ في الوارد على الجهاز.') => {
    const next = [item, ...inboxItems.filter((entry) => entry.id !== item.id)];
    if (!persistWorkspace({ inboxItems: next })) return false;
    setInboxItems(next);
    notify(message, 'success');
    return true;
  };

  const captureClipboard = async () => {
    try {
      const text = (await Clipboard.getStringAsync()).trim();
      if (!text) {
        notify('الحافظة فاضية.', 'info');
        return;
      }
      addInboxItem(createInboxTextItem({ body: text, source: 'clipboard' }));
      setActiveSection('inbox');
    } catch {
      notify('تعذر قراءة الحافظة حاليًا.', 'error');
    }
  };

  const captureDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true, type: '*/*' });
      if (result.canceled || result.assets.length === 0) return;
      const asset = result.assets[0];
      const durable = await copyDolabInboxFileToDurableUri({ uri: asset.uri, fileName: asset.name, mimeType: asset.mimeType ?? undefined });
      if (!durable.wasCopied) {
        notify('تعذر تثبيت الملف داخل مساحة الدولاب. الملف ما اتحفظش.', 'error');
        return;
      }
      addInboxItem(createInboxFileItem({
        source: 'document_picker',
        uri: durable.uri,
        fileName: asset.name,
        mimeType: asset.mimeType ?? undefined,
        sizeBytes: asset.size ?? undefined,
      }), 'الملف اتحفظ في الوارد على الجهاز.');
      setActiveSection('inbox');
    } catch {
      notify('تعذر اختيار أو تثبيت الملف حاليًا.', 'error');
    }
  };

  const saveQuickText = () => {
    const clean = quickText.trim();
    if (!clean) {
      notify('اكتب حاجة الأول.', 'warning');
      return;
    }
    if (addInboxItem(createInboxTextItem({ body: clean, source: 'manual' }))) {
      setQuickText('');
      quickTextSheetRef.current?.dismiss();
      setActiveSection('inbox');
    }
  };

  const convertInboxToMedia = async (item: DolabInboxItem) => {
    const pending = createPendingMediaFromInboxItem(item);
    if (!pending) {
      notify('النوع ده مش ميديا قابلة للتحويل. خليه في الوارد أو حوّله لنوت.', 'warning');
      return;
    }
    const durable = await makePendingMediaDurable(pending);
    const nextMedia = [durable, ...pendingMedia];
    const nextInbox = inboxItems.filter((entry) => entry.id !== item.id);
    if (!persistWorkspace({ pendingMedia: nextMedia, inboxItems: nextInbox })) return;
    setPendingMedia(nextMedia);
    setInboxItems(nextInbox);
    setActiveSection('media');
    notify('اتنقلت للميديا واتحفظت على الجهاز.', 'success');
  };

  const convertInboxToNote = (item: DolabInboxItem) => {
    const body = item.type === 'file' ? `ملف محفوظ: ${item.fileName ?? item.title}` : (item.body ?? item.title);
    const message: DolabSelfMessage = {
      id: `local-self-message-${Date.now()}`,
      body,
      messageType: item.type === 'link' ? 'idea' : 'text',
      linkedPendingMediaIds: [],
      syncState: user?.id ? 'pending' : 'device_only',
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [message, ...selfMessages];
    const nextInbox = inboxItems.filter((entry) => entry.id !== item.id);
    if (!persistWorkspace({ selfMessages: nextMessages, inboxItems: nextInbox })) return;
    setSelfMessages(nextMessages);
    setInboxItems(nextInbox);
    setActiveSection('notes');
    notify('اتحولت لملاحظة واتحفظت على الجهاز.', 'success');
    if (user?.id) void syncSelfMessage(message);
  };

  const resetDraftEditor = () => {
    setEditingLocalDraftId(null);
    setEditingRemoteItemId(null);
    setDraftSourceInboxId(null);
    setDraftForm(emptyDraftForm);
  };

  const openNewDraft = () => {
    resetDraftEditor();
    draftSheetRef.current?.present();
  };

  const openDraftFromInbox = (item: DolabInboxItem) => {
    setEditingLocalDraftId(null);
    setEditingRemoteItemId(null);
    setDraftSourceInboxId(item.id);
    setDraftForm({
      title: item.title === 'رابط محفوظ' ? '' : item.title,
      description: item.body ?? (item.fileName ? `ملف: ${item.fileName}` : ''),
      category: '',
      condition: '',
      exchangeIntent: '',
      linkedPendingMediaIds: [],
    });
    draftSheetRef.current?.present();
  };

  const openLocalDraft = (draft: DolabDraftItem) => {
    setEditingLocalDraftId(draft.id);
    setEditingRemoteItemId(null);
    setDraftSourceInboxId(null);
    setDraftForm({
      title: draft.title,
      description: draft.description,
      category: draft.category ?? '',
      condition: draft.condition ?? '',
      exchangeIntent: draft.exchangeIntent ?? '',
      linkedPendingMediaIds: draft.linkedPendingMediaIds,
    });
    draftSheetRef.current?.present();
  };

  const openRemoteDraft = (item: DolabItem) => {
    setEditingLocalDraftId(null);
    setEditingRemoteItemId(item.id);
    setDraftSourceInboxId(null);
    setDraftForm({
      title: item.title ?? '',
      description: item.description ?? '',
      category: item.category ?? '',
      condition: item.condition ?? '',
      exchangeIntent: item.exchange_intent ?? '',
      linkedPendingMediaIds: [],
    });
    draftSheetRef.current?.present();
  };

  const toggleDraftMedia = (mediaId: string) => {
    setDraftForm((prev) => ({
      ...prev,
      linkedPendingMediaIds: prev.linkedPendingMediaIds.includes(mediaId)
        ? prev.linkedPendingMediaIds.filter((id) => id !== mediaId)
        : [...prev.linkedPendingMediaIds, mediaId],
    }));
  };

  const syncDraft = async (draft: DolabDraftItem): Promise<DolabDraftItem> => {
    if (!user?.id) return { ...draft, syncState: 'device_only', syncError: undefined };
    const pending = { ...draft, syncState: 'pending' as const, syncError: undefined };
    setLocalDrafts((prev) => prev.map((item) => item.id === draft.id ? pending : item));

    const result = draft.remoteDolabItemId
      ? await updateDolabSavedItem(user.id, draft.remoteDolabItemId, draft)
      : await saveDolabDraftItem(user.id, draft);

    if (result.error || !result.data) {
      const failed = { ...draft, syncState: 'error' as const, syncError: result.error?.message ?? 'تعذر المزامنة.' };
      setLocalDrafts((prev) => prev.map((item) => item.id === draft.id ? failed : item));
      persistWorkspace({ localDrafts: localDrafts.map((item) => item.id === draft.id ? failed : item) });
      return failed;
    }

    const synced = { ...draft, remoteDolabItemId: result.data.id, syncState: 'synced' as const, syncError: undefined, updatedAt: new Date().toISOString() };
    setLocalDrafts((prev) => prev.map((item) => item.id === draft.id ? synced : item));
    persistWorkspace({ localDrafts: localDrafts.map((item) => item.id === draft.id ? synced : item) });
    return synced;
  };

  const saveDraft = async () => {
    const title = draftForm.title.trim();
    if (!title) {
      notify('اكتب اسم الحاجة عشان تعرف ترجع للمسودة بعدين.', 'warning');
      return;
    }
    const now = new Date().toISOString();

    if (editingRemoteItemId) {
      if (!user?.id) {
        notify('المسودة دي من السحابة ومحتاجة تسجيل الدخول عشان تتعدل.', 'error');
        return;
      }
      const result = await updateDolabSavedItem(user.id, editingRemoteItemId, {
        title,
        description: draftForm.description.trim(),
        category: draftForm.category.trim() || undefined,
        condition: draftForm.condition.trim() || undefined,
        exchangeIntent: draftForm.exchangeIntent.trim() || undefined,
      });
      if (result.error || !result.data) {
        notify(result.error?.message ?? 'تعذر حفظ التعديل السحابي.', 'error');
        return;
      }
      draftSheetRef.current?.dismiss();
      resetDraftEditor();
      await refreshRemoteSnapshot(true);
      notify('التعديل اتحفظ في السحابة.', 'success');
      return;
    }

    const existing = editingLocalDraftId ? localDrafts.find((item) => item.id === editingLocalDraftId) : null;
    const draft: DolabDraftItem = {
      id: existing?.id ?? `local-draft-${Date.now()}`,
      title,
      description: draftForm.description.trim(),
      category: draftForm.category.trim() || undefined,
      condition: draftForm.condition.trim() || undefined,
      exchangeIntent: draftForm.exchangeIntent.trim() || undefined,
      linkedPendingMediaIds: draftForm.linkedPendingMediaIds,
      remoteDolabItemId: existing?.remoteDolabItemId,
      syncState: user?.id ? 'pending' : 'device_only',
      syncError: undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const nextDrafts = existing
      ? localDrafts.map((item) => item.id === draft.id ? draft : item)
      : [draft, ...localDrafts];
    const nextInbox = draftSourceInboxId ? inboxItems.filter((item) => item.id !== draftSourceInboxId) : inboxItems;
    if (!persistWorkspace({ localDrafts: nextDrafts, inboxItems: nextInbox })) return;
    setLocalDrafts(nextDrafts);
    setInboxItems(nextInbox);
    draftSheetRef.current?.dismiss();
    resetDraftEditor();
    setActiveSection('drafts');

    if (!user?.id) {
      notify('المسودة اتحفظت على الجهاز.', 'success');
      return;
    }

    notify('المسودة اتحفظت على الجهاز. جاري مزامنتها…', 'info');
    const synced = await syncDraft(draft);
    if (synced.syncState === 'synced') {
      await refreshRemoteSnapshot(true);
      notify('المسودة اتحفظت على الجهاز وفي السحابة.', 'success');
    } else {
      notify('المسودة محفوظة على الجهاز، لكن المزامنة فشلت. تقدر تعيد المحاولة.', 'warning');
    }
  };

  const syncSelfMessage = async (message: DolabSelfMessage): Promise<DolabSelfMessage> => {
    if (!user?.id) return { ...message, syncState: 'device_only', syncError: undefined };
    const linkedDraft = localDrafts.find((draft) => draft.id === message.linkedDraftId);
    const result = await saveDolabSelfNote(user.id, {
      body: message.body,
      messageType: message.messageType,
      dolabItemId: linkedDraft?.remoteDolabItemId ?? null,
    });
    if (result.error || !result.data?.id) {
      const failed = { ...message, syncState: 'error' as const, syncError: result.error?.message ?? 'تعذر مزامنة الملاحظة.' };
      setSelfMessages((prev) => prev.map((item) => item.id === message.id ? failed : item));
      return failed;
    }
    const synced = { ...message, remoteNoteId: result.data.id, syncState: 'synced' as const, syncError: undefined };
    setSelfMessages((prev) => prev.map((item) => item.id === message.id ? synced : item));
    const linkedMedia = pendingMedia.find((media) => message.linkedPendingMediaIds.includes(media.id) && media.remoteMediaId);
    if (linkedMedia?.remoteMediaId) void linkDolabNoteToMedia(user.id, result.data.id, linkedMedia.remoteMediaId);
    return synced;
  };

  const saveSelfMessage = async () => {
    const body = selfComposerBody.trim();
    if (!body) {
      setSelfComposerError('اكتب ملاحظة أو فكرة الأول.');
      return;
    }
    const message: DolabSelfMessage = {
      id: `local-self-message-${Date.now()}`,
      body,
      messageType: selfComposerType,
      linkedDraftId: selfComposerDraftId ?? undefined,
      linkedPendingMediaIds: selfComposerMediaIds,
      syncState: user?.id ? 'pending' : 'device_only',
      createdAt: new Date().toISOString(),
    };
    const next = [message, ...selfMessages];
    if (!persistWorkspace({ selfMessages: next })) return;
    setSelfMessages(next);
    setSelfComposerBody('');
    setSelfComposerMediaIds([]);
    setSelfComposerError(null);
    notify('الملاحظة اتحفظت على الجهاز.', 'success');
    if (!user?.id) return;
    const synced = await syncSelfMessage(message);
    if (synced.syncState === 'synced') {
      await refreshRemoteSnapshot(true);
      notify('الملاحظة اتحفظت على الجهاز وفي السحابة.', 'success');
    } else {
      notify('الملاحظة محفوظة على الجهاز، لكن المزامنة فشلت.', 'warning');
    }
  };

  const deleteSelfMessage = async (messageId: string) => {
    const target = selfMessages.find((item) => item.id === messageId);
    if (!target) return;
    if (target.remoteNoteId && user?.id) {
      const result = await deleteDolabNote(user.id, target.remoteNoteId);
      if (result.error) {
        notify(result.error.message, 'error');
        return;
      }
    }
    const nextMessages = selfMessages.filter((item) => item.id !== messageId);
    const nextShare = shareDrafts.filter((item) => item.sourceMessageId !== messageId);
    if (!persistWorkspace({ selfMessages: nextMessages, shareDrafts: nextShare })) return;
    setSelfMessages(nextMessages);
    setShareDrafts(nextShare);
    if (user?.id) await refreshRemoteSnapshot(true);
    notify('الملاحظة اتحذفت.', 'success');
  };

  const toggleSelfComposerMedia = (mediaId: string) => {
    setSelfComposerMediaIds((prev) => prev.includes(mediaId) ? prev.filter((id) => id !== mediaId) : [...prev, mediaId]);
  };

  const findLinkedRemoteDraftId = (mediaId: string, drafts = localDrafts) => {
    const ids = drafts.filter((draft) => draft.linkedPendingMediaIds.includes(mediaId) && draft.remoteDolabItemId).map((draft) => draft.remoteDolabItemId as string);
    const unique = [...new Set(ids)];
    return unique.length === 1 ? unique[0] : null;
  };

  const uploadPendingMediaToCloud = async (draftsForLink = localDrafts) => {
    if (!user?.id) {
      notify('الميديا محفوظة على الجهاز. سجّل الدخول عشان ترفعها للسحابة.', 'info');
      return { success: 0, failed: 0 };
    }
    if (isUploadingMedia) return { success: 0, failed: 0 };
    const toUpload = pendingMedia.filter((item) => item.uploadStatus !== 'uploaded' && item.uploadStatus !== 'uploading' && !item.remoteMediaId);
    if (toUpload.length === 0) {
      notify('مفيش ميديا مستنية رفع.', 'info');
      return { success: 0, failed: 0 };
    }

    setIsUploadingMedia(true);
    let working = [...pendingMedia];
    let success = 0;
    let failed = 0;
    try {
      for (const source of toUpload) {
        const setWorkingItem = (nextItem: DolabPendingMedia) => {
          working = working.map((item) => item.id === source.id ? nextItem : item);
          setPendingMedia(working);
        };
        let candidate: DolabPendingMedia = { ...source, uploadStatus: 'uploading', uploadError: undefined };
        setWorkingItem(candidate);

        const sizeResult = await resolveDolabMediaSize(candidate);
        candidate = sizeResult.data;
        if (shouldCompressDolabMedia(candidate).data) {
          candidate = { ...candidate, compressionStatus: 'compressing', compressionError: undefined };
          setWorkingItem(candidate);
          const compressed = await compressDolabMedia(candidate);
          candidate = compressed.data;
        } else if (!candidate.compressionStatus || candidate.mediaType === 'audio') {
          candidate = { ...candidate, compressionStatus: 'not_needed', compressionError: undefined };
        }

        const size = candidate.compressedSizeBytes ?? candidate.sizeBytes ?? candidate.originalSizeBytes;
        if (typeof size !== 'number') {
          failed += 1;
          setWorkingItem({ ...candidate, uploadStatus: 'failed', uploadError: 'تعذر تحديد حجم الملف، لذلك لم يتم رفعه.' });
          continue;
        }
        if (size > maxUploadBytesForType(candidate.mediaType)) {
          failed += 1;
          setWorkingItem({ ...candidate, uploadStatus: 'failed', uploadError: 'حجم الملف أكبر من الحد المسموح.' });
          continue;
        }

        const result = await uploadAndSaveDolabMedia(user.id, candidate, {
          dolabItemId: findLinkedRemoteDraftId(source.id, draftsForLink),
          sortOrder: 0,
        });
        if (result.error || !result.data) {
          failed += 1;
          setWorkingItem({ ...candidate, uploadStatus: 'failed', uploadError: result.error?.message ?? 'تعذر رفع الملف.' });
          continue;
        }

        success += 1;
        const uploaded = {
          ...candidate,
          uploadStatus: 'uploaded' as const,
          uploadError: undefined,
          remoteMediaId: result.data.media.id,
          storagePath: result.data.storagePath,
        };
        setWorkingItem(uploaded);
        const linkedNotes = selfMessages.filter((message) => message.remoteNoteId && message.linkedPendingMediaIds.includes(source.id));
        for (const note of linkedNotes) {
          if (note.remoteNoteId) void linkDolabNoteToMedia(user.id, note.remoteNoteId, result.data.media.id);
        }
      }

      persistWorkspace({ pendingMedia: working });
      setPendingMedia(working);
      await refreshRemoteSnapshot(true);
      if (failed > 0 && success > 0) notify(`اترفع ${success} ملف، و${failed} محتاج إعادة محاولة.`, 'warning');
      else if (failed > 0) notify('تعذر رفع الميديا. النسخ المحلية ما زالت محفوظة على الجهاز.', 'error');
      else notify('الميديا اتزامنت مع السحابة.', 'success');
      return { success, failed };
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const syncWorkspace = async () => {
    if (!user?.id) {
      notify('دولابك محفوظ على الجهاز. سجّل الدخول عشان تفعل المزامنة.', 'info');
      return;
    }
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      let nextDrafts = [...localDrafts];
      for (const draft of localDrafts) {
        if (draft.syncState === 'synced' && draft.remoteDolabItemId) continue;
        const result = draft.remoteDolabItemId
          ? await updateDolabSavedItem(user.id, draft.remoteDolabItemId, draft)
          : await saveDolabDraftItem(user.id, draft);
        nextDrafts = nextDrafts.map((item) => item.id === draft.id
          ? result.error || !result.data
            ? { ...item, syncState: 'error', syncError: result.error?.message ?? 'تعذر المزامنة.' }
            : { ...item, remoteDolabItemId: result.data.id, syncState: 'synced', syncError: undefined }
          : item);
      }
      setLocalDrafts(nextDrafts);

      let nextMessages = [...selfMessages];
      for (const message of selfMessages) {
        if (message.remoteNoteId && message.syncState !== 'error') continue;
        const linkedDraft = nextDrafts.find((draft) => draft.id === message.linkedDraftId);
        const result = await saveDolabSelfNote(user.id, {
          body: message.body,
          messageType: message.messageType,
          dolabItemId: linkedDraft?.remoteDolabItemId ?? null,
        });
        nextMessages = nextMessages.map((item) => item.id === message.id
          ? result.error || !result.data?.id
            ? { ...item, syncState: 'error', syncError: result.error?.message ?? 'تعذر المزامنة.' }
            : { ...item, remoteNoteId: result.data.id, syncState: 'synced', syncError: undefined }
          : item);
      }
      setSelfMessages(nextMessages);
      persistWorkspace({ localDrafts: nextDrafts, selfMessages: nextMessages });
      await uploadPendingMediaToCloud(nextDrafts);
      await refreshRemoteSnapshot(true);
      const remaining = nextDrafts.filter((item) => item.syncState === 'error').length + nextMessages.filter((item) => item.syncState === 'error').length;
      if (remaining > 0) notify(`المزامنة خلصت، وفي ${remaining} عنصر محتاج إعادة محاولة.`, 'warning');
      else notify('دولابك متزامن.', 'success');
    } finally {
      setIsSyncing(false);
    }
  };

  const createCollection = () => {
    const name = newCollectionName.trim();
    if (!name) return;
    if (collections.some((item) => item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      notify('المجموعة دي موجودة بالفعل.', 'warning');
      return;
    }
    const now = new Date().toISOString();
    const next = [{ id: `collection-${Date.now()}`, name, createdAt: now, updatedAt: now }, ...collections];
    if (!persistWorkspace({ collections: next })) return;
    setCollections(next);
    setNewCollectionName('');
    notify('المجموعة اتحفظت على الجهاز.', 'success');
  };

  const openCollectionPicker = (draftId: string) => {
    setCollectionAssignDraftId(draftId);
    collectionPickerSheetRef.current?.present();
  };

  const assignDraftToCollection = (collectionId: string) => {
    if (!collectionAssignDraftId) return;
    const next = [
      ...collectionAssignments.filter((item) => !(item.targetType === 'local_draft' && item.targetId === collectionAssignDraftId)),
      { collectionId, targetType: 'local_draft' as const, targetId: collectionAssignDraftId, assignedAt: new Date().toISOString() },
    ];
    if (!persistWorkspace({ collectionAssignments: next })) return;
    setCollectionAssignments(next);
    collectionPickerSheetRef.current?.dismiss();
    setCollectionAssignDraftId(null);
    notify('المسودة اتحطت في المجموعة.', 'success');
  };

  const openShareBridge = (messageId: string) => {
    const message = selfMessages.find((item) => item.id === messageId);
    if (!message) return;
    setShareBridgeMessageId(messageId);
    setShareBridgeBody(message.body);
    setShareBridgeTargetMode('choose_later');
    shareBridgeRef.current?.present();
  };

  const prepareShareDraft = () => {
    const source = selfMessages.find((item) => item.id === shareBridgeMessageId);
    if (!source) return;
    const now = new Date().toISOString();
    const draft: DolabShareDraft = {
      id: `local-share-draft-${Date.now()}`,
      sourceMessageId: source.id,
      body: shareBridgeBody.trim() || source.body,
      linkedDraftId: source.linkedDraftId,
      linkedPendingMediaIds: source.linkedPendingMediaIds,
      targetMode: shareBridgeTargetMode,
      createdAt: now,
      preparedAt: now,
      status: 'prepared',
    };
    const next = [draft, ...shareDrafts.filter((item) => item.sourceMessageId !== source.id)];
    if (!persistWorkspace({ shareDrafts: next })) return;
    setShareDrafts(next);
    shareBridgeRef.current?.dismiss();
    notify('المشاركة اتحفظت كتحضير على الجهاز.', 'success');
  };

  const openConversationPicker = () => {
    if (!user?.id) {
      notify('سجّل الدخول عشان تبعت في الشات.', 'error');
      return;
    }
    if (!shareBridgeMessageId) return;
    setConversationPickerRefreshKey((prev) => prev + 1);
    conversationPickerRef.current?.present();
  };

  const sendShareToConversation = async (conversation: DirectConversationSummary) => {
    if (isSendingShare || !conversation.conversationId) return;
    const source = selfMessages.find((item) => item.id === shareBridgeMessageId);
    if (!source) return;
    const linkedDraft = localDrafts.find((item) => item.id === source.linkedDraftId);
    const shareText = shareBridgeBody.trim() || source.body;
    const body = buildDolabShareToChatBody({ shareText, linkedDraft, linkedMediaCount: source.linkedPendingMediaIds.length });
    setIsSendingShare(true);
    try {
      const result = await sendDirectMessage(conversation.conversationId, body);
      if (!result.ok) {
        notify(result.message, 'error');
        return;
      }
      const now = new Date().toISOString();
      const sent: DolabShareDraft = {
        id: `local-share-draft-${Date.now()}`,
        sourceMessageId: source.id,
        body: shareText,
        linkedDraftId: source.linkedDraftId,
        linkedPendingMediaIds: source.linkedPendingMediaIds,
        targetMode: 'direct_chat',
        targetConversationId: conversation.conversationId,
        createdAt: now,
        preparedAt: now,
        sentAt: now,
        status: 'sent',
      };
      const next = [sent, ...shareDrafts.filter((item) => item.sourceMessageId !== source.id)];
      persistWorkspace({ shareDrafts: next });
      setShareDrafts(next);
      if (user?.id && source.remoteNoteId) void markDolabNoteShared(user.id, source.remoteNoteId, conversation.conversationId);
      conversationPickerRef.current?.dismiss();
      shareBridgeRef.current?.dismiss();
      notify('اترسلت في الشات.', 'success');
    } catch {
      notify('تعذر إرسال المشاركة للشات حاليًا.', 'error');
    } finally {
      setIsSendingShare(false);
    }
  };

  const openPublishBridge = (draft: DolabDraftItem) => {
    setSelectedPublishSourceDraftId(draft.id);
    publishBridgeRef.current?.present();
  };

  const preparePublishDraft = () => {
    if (!selectedPublishDraft || !selectedPublishData) return;
    const now = new Date().toISOString();
    const existing = publishDrafts.find((item) => item.sourceDraftId === selectedPublishDraft.id);
    const draft: DolabPublishDraft = {
      ...selectedPublishData,
      id: existing?.id ?? `local-publish-draft-${Date.now()}`,
      readinessStatus: selectedPublishData.missingFields.length === 0 ? 'prepared' : 'incomplete',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const next = [draft, ...publishDrafts.filter((item) => item.sourceDraftId !== selectedPublishDraft.id)];
    if (!persistWorkspace({ publishDrafts: next })) return;
    setPublishDrafts(next);
    publishBridgeRef.current?.dismiss();
    notify('تحضير النشر اتحفظ على الجهاز.', 'success');
  };

  const routeSelectedDraftToAdd = async () => {
    if (!selectedPublishDraft) return;
    let draft = selectedPublishDraft;
    if (!draft.remoteDolabItemId) {
      draft = await syncDraft(draft);
    }
    if (!draft.remoteDolabItemId) {
      notify('المسودة محفوظة على الجهاز، لكن لازم تتزامن قبل فتحها في إضافة عنصر.', 'warning');
      return;
    }
    publishBridgeRef.current?.dismiss();
    router.push({ pathname: '/(tabs)/add', params: { dolabItemId: draft.remoteDolabItemId, source: 'dolab' } });
  };

  const requestDelete = (target: DeleteTarget) => {
    setDeleteTarget(target);
    deleteSheetRef.current?.present();
  };

  const confirmRemoteDelete = async () => {
    if (!user?.id || !deleteTarget) return;
    let errorMessage: string | null = null;
    if (deleteTarget.type === 'note') {
      const result = await deleteDolabNote(user.id, deleteTarget.id);
      errorMessage = result.error?.message ?? null;
    } else if (deleteTarget.type === 'media' && deleteTarget.storagePath) {
      const result = await deleteDolabMedia(user.id, deleteTarget.id, deleteTarget.storagePath);
      errorMessage = result.error?.message ?? null;
    } else if (deleteTarget.type === 'item') {
      const linked = savedRemote.media.filter((media: any) => media.dolab_item_id === deleteTarget.id);
      for (const media of linked) {
        const mediaResult = await deleteDolabMedia(user.id, media.id, media.storage_path);
        if (mediaResult.error) {
          errorMessage = mediaResult.error.message;
          break;
        }
      }
      if (!errorMessage) {
        const itemResult = await deleteDolabItem(user.id, deleteTarget.id);
        errorMessage = itemResult.error?.message ?? null;
      }
    }
    deleteSheetRef.current?.dismiss();
    setDeleteTarget(null);
    if (errorMessage) {
      notify(errorMessage, 'error');
      return;
    }
    await refreshRemoteSnapshot(true);
    notify('اتحذفت من النسخة السحابية.', 'success');
  };

  const renderStatusCard = () => {
    const stateCopy = !user?.id
      ? { title: 'نسخة الجهاز محفوظة', body: 'أي حاجة تضيفها هنا بتفضل على الجهاز. سجّل الدخول للمزامنة السحابية.', icon: 'phone-portrait-outline' as const }
      : remoteState === 'error'
        ? { title: 'السحابة محتاجة إعادة محاولة', body: 'نسخة الجهاز سليمة. اضغط مزامنة لإعادة المحاولة.', icon: 'cloud-offline-outline' as const }
        : remoteState === 'loading' || isSyncing
          ? { title: 'جاري المزامنة', body: 'بنراجع الفرق بين نسخة الجهاز والسحابة من غير ما نمسح المحلي.', icon: 'sync-outline' as const }
          : { title: 'الدولاب متصل بالسحابة', body: pendingSyncCount > 0 ? `${pendingSyncCount} تغيير لسه مستني مزامنة.` : 'مفيش تغييرات معلقة.', icon: 'cloud-done-outline' as const };
    return (
      <AppCard>
        <View style={styles.statusHead}>
          <View style={styles.statusIcon}><Ionicons name={stateCopy.icon} size={20} color={colors.primary} /></View>
          <View style={styles.flexCopy}>
            <AppText weight="bold">{stateCopy.title}</AppText>
            <AppText muted style={styles.smallText}>{stateCopy.body}</AppText>
          </View>
        </View>
        <View style={styles.statRow}>
          <StatPill label="على الجهاز" value={localDrafts.length + pendingMedia.length + selfMessages.length + inboxItems.length} />
          <StatPill label="في السحابة" value={savedRemote.items.length + savedRemote.media.length + savedRemote.notes.length} />
          <StatPill label="تحتاج مراجعة" value={issueCount} warning={issueCount > 0} />
        </View>
        {lastSyncAt ? <AppText muted style={styles.tinyText}>آخر تحديث: {new Date(lastSyncAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</AppText> : null}
        <View style={styles.buttonRow}>
          <AppButton label={isSyncing ? 'جاري المزامنة…' : 'مزامنة الآن'} variant="neutral" disabled={isSyncing} onPress={() => { void syncWorkspace(); }} />
          <AppButton label="تحديث السحابة" variant="ghost" onPress={() => { void refreshRemoteSnapshot(false); }} />
        </View>
      </AppCard>
    );
  };

  const renderOverview = () => (
    <>
      {renderStatusCard()}
      <AppCard>
        <SectionHeading title="ابدأ بحاجة واحدة" description="صورة، فكرة، ملف أو مسودة. كل حاجة ليها مكان واضح وبعدها تقدر تنقلها للخطوة اللي بعدها." />
        <View style={styles.quickGrid}>
          <QuickAction icon="camera-outline" label="صوّر" onPress={() => { void captureImage(); }} />
          <QuickAction icon="images-outline" label="صور" onPress={() => { void pickImages(); }} />
          <QuickAction icon="create-outline" label="نص سريع" onPress={() => quickTextSheetRef.current?.present()} />
          <QuickAction icon="cube-outline" label="مسودة" onPress={openNewDraft} />
          <QuickAction icon="mic-outline" label="تسجيل" onPress={() => audioRecorderSheetRef.current?.present()} />
          <QuickAction icon="document-attach-outline" label="ملف" onPress={() => { void captureDocument(); }} />
        </View>
      </AppCard>
      <View style={styles.overviewGrid}>
        <OverviewTile icon="download-outline" title="الوارد" count={inboxItems.length} hint="الحاجات اللي لسه محتاجة قرار" onPress={() => setActiveSection('inbox')} />
        <OverviewTile icon="cube-outline" title="المسودات" count={localDrafts.length} hint="حاجات بتتجهز للسوق" onPress={() => setActiveSection('drafts')} />
        <OverviewTile icon="images-outline" title="الميديا" count={pendingMedia.length} hint="صور وفيديو وصوت" onPress={() => setActiveSection('media')} />
        <OverviewTile icon="chatbox-ellipses-outline" title="ملاحظاتي" count={selfMessages.length} hint="أفكار ونوتس لنفسك" onPress={() => setActiveSection('notes')} />
      </View>
    </>
  );

  const renderInbox = () => (
    <>
      <AppCard>
        <SectionHeading title="الوارد" description="أي حاجة جاية من برّه أو لسه مش عارف مكانها تدخل هنا الأول. بعدين حوّلها لميديا أو نوت أو مسودة." />
        <View style={styles.buttonRowWrap}>
          <QuickAction icon="clipboard-outline" label="من الحافظة" onPress={() => { void captureClipboard(); }} compact />
          <QuickAction icon="document-attach-outline" label="ملف" onPress={() => { void captureDocument(); }} compact />
          <QuickAction icon="create-outline" label="نص" onPress={() => quickTextSheetRef.current?.present()} compact />
        </View>
      </AppCard>
      {filteredInbox.length === 0 ? (
        <AppCard><EmptyState title="الوارد فاضي" description="ضيف نص أو ملف أو شارك حاجة للدولاب، وهتفضل هنا لحد ما تحدد مكانها." iconName="download-outline" /></AppCard>
      ) : (
        <DolabInboxSection
          items={filteredInbox}
          onConvertToNote={convertInboxToNote}
          onConvertToMedia={(item) => { void convertInboxToMedia(item); }}
          onStartDraft={openDraftFromInbox}
          onDelete={(id) => {
            const next = inboxItems.filter((item) => item.id !== id);
            if (!persistWorkspace({ inboxItems: next })) return;
            setInboxItems(next);
            notify('اتحذفت من الوارد.', 'success');
          }}
        />
      )}
    </>
  );

  const renderDrafts = () => (
    <>
      <AppCard>
        <View style={styles.sectionTopRow}>
          <SectionHeading title="المسودات" description="نسخة عمل واضحة لكل حاجة قبل ما تطلع للسوق." />
          <Pressable style={styles.roundAction} onPress={openNewDraft} accessibilityRole="button" accessibilityLabel="مسودة جديدة"><Ionicons name="add" size={22} color={colors.white} /></Pressable>
        </View>
        <View style={styles.collectionComposer}>
          <AppInput value={newCollectionName} onChangeText={setNewCollectionName} placeholder="مجموعة جديدة" />
          <AppButton label="إضافة مجموعة" variant="ghost" onPress={createCollection} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          <CollectionChip label="الكل" count={localDrafts.length} selected={!selectedCollectionId} onPress={() => setSelectedCollectionId(null)} />
          {collections.map((collection) => (
            <CollectionChip key={collection.id} label={collection.name} count={collectionCountById[collection.id] ?? 0} selected={selectedCollectionId === collection.id} onPress={() => setSelectedCollectionId(collection.id)} />
          ))}
        </ScrollView>
      </AppCard>
      {filteredDrafts.length === 0 ? (
        <AppCard><EmptyState title="مفيش مسودات هنا" description="ابدأ مسودة جديدة أو حوّل حاجة من الوارد لمسودة." iconName="cube-outline" /></AppCard>
      ) : (
        <AppCard>
          <View style={styles.listGap}>
            {filteredDrafts.map((draft) => {
              const sync = syncLabelForDraft(draft);
              const linkedCount = draft.linkedPendingMediaIds.length;
              return (
                <View key={draft.id} style={styles.workspaceRow}>
                  <View style={styles.rowHead}>
                    <View style={styles.flexCopy}>
                      <AppText weight="semibold">{draft.title || 'مسودة بدون اسم'}</AppText>
                      <AppText muted numberOfLines={2} style={styles.smallText}>{draft.description || 'لسه مفيش وصف.'}</AppText>
                    </View>
                    <StateBadge label={sync.label} tone={sync.tone} />
                  </View>
                  <View style={styles.metaRow}>
                    <Meta text={draft.category || 'بدون تصنيف'} />
                    <Meta text={`ميديا ${linkedCount}`} />
                    {draft.exchangeIntent ? <Meta text={draft.exchangeIntent} /> : null}
                  </View>
                  {draft.syncError ? <AppText style={styles.errorText}>{draft.syncError}</AppText> : null}
                  <View style={styles.textActions}>
                    <TextAction label="تعديل" onPress={() => openLocalDraft(draft)} />
                    <TextAction label="مجموعة" onPress={() => openCollectionPicker(draft.id)} />
                    <TextAction label="جهّز للنشر" onPress={() => openPublishBridge(draft)} />
                    {draft.syncState === 'error' || !draft.remoteDolabItemId ? <TextAction label="أعد المزامنة" onPress={() => { void syncDraft(draft).then((next) => notify(next.syncState === 'synced' ? 'المسودة اتزامنت.' : 'المسودة ما زالت محفوظة على الجهاز فقط.', next.syncState === 'synced' ? 'success' : 'warning')); }} /> : null}
                  </View>
                </View>
              );
            })}
          </View>
        </AppCard>
      )}
    </>
  );

  const renderMedia = () => (
    <>
      <AppCard>
        <SectionHeading title="الميديا" description="أي صورة أو فيديو أو تسجيل هنا محفوظ على الجهاز أولًا. حالة كل ملف مكتوبة عليه بوضوح." />
        <View style={styles.buttonRowWrap}>
          <QuickAction icon="camera-outline" label="صوّر" onPress={() => { void captureImage(); }} compact />
          <QuickAction icon="images-outline" label="صور" onPress={() => { void pickImages(); }} compact />
          <QuickAction icon="videocam-outline" label="فيديو" onPress={() => { void pickVideo(); }} compact />
          <QuickAction icon="mic-outline" label="صوت" onPress={() => audioRecorderSheetRef.current?.present()} compact />
        </View>
        <AppButton label={isUploadingMedia ? 'جاري الرفع…' : 'مزامنة الميديا مع السحابة'} variant="neutral" disabled={isUploadingMedia} onPress={() => { void uploadPendingMediaToCloud(); }} />
      </AppCard>
      <AppCard>
        <DolabPendingMediaStrip pendingMedia={filteredMedia} mode="preview" onRemove={removePendingMedia} emptyText="مفيش ميديا على الجهاز لسه." />
      </AppCard>
      {filteredSavedMedia.length > 0 ? (
        <AppCard>
          <SectionHeading title="ميديا محفوظة في السحابة" description="دي النسخ اللي اتأكد رفعها بالفعل." />
          <DolabSavedMediaGrid media={filteredSavedMedia} onDeleteMedia={(item) => requestDelete({ type: 'media', id: item.id, storagePath: item.storagePath })} />
        </AppCard>
      ) : null}
    </>
  );

  const renderNotes = () => (
    <DolabSelfChatPanel
      messages={filteredMessages}
      localDrafts={localDrafts}
      pendingMedia={pendingMedia}
      composerBody={selfComposerBody}
      selectedType={selfComposerType}
      selectedDraftId={selfComposerDraftId}
      linkedMediaIds={selfComposerMediaIds}
      composerError={selfComposerError}
      shareStatusBySourceId={shareStatusBySourceId}
      onChangeBody={setSelfComposerBody}
      onSelectType={setSelfComposerType}
      onSelectDraft={setSelfComposerDraftId}
      onToggleMedia={toggleSelfComposerMedia}
      onSave={() => { void saveSelfMessage(); }}
      onShareLater={openShareBridge}
      onDelete={(id) => { void deleteSelfMessage(id); }}
      onStartFirstNote={() => setSelfComposerType('text')}
      onRecordVoice={() => audioRecorderSheetRef.current?.present()}
    />
  );

  const renderSaved = () => (
    <>
      {renderStatusCard()}
      {!user?.id ? (
        <AppCard><EmptyState title="السحابة محتاجة تسجيل دخول" description="نسخة الجهاز شغالة عادي. سجّل الدخول عشان تشوف النسخ المؤكدة في السحابة." iconName="cloud-outline" /></AppCard>
      ) : filteredSavedItems.length + filteredSavedNotes.length + filteredSavedMedia.length === 0 ? (
        <AppCard><EmptyState title="مفيش نسخة سحابية لسه" description="اضغط مزامنة الآن، وأي حاجة نجحت هتظهر هنا." iconName="cloud-done-outline" /></AppCard>
      ) : (
        <>
          {filteredSavedItems.length > 0 ? (
            <AppCard>
              <SectionHeading title="عناصر محفوظة" description="دي بيانات مؤكدة في Supabase، مش مجرد state على الشاشة." />
              <View style={styles.listGap}>
                {filteredSavedItems.map((item) => (
                  <View key={item.id} style={styles.workspaceRow}>
                    <View style={styles.rowHead}>
                      <View style={styles.flexCopy}>
                        <AppText weight="semibold">{item.title || 'بدون اسم'}</AppText>
                        <AppText muted numberOfLines={2} style={styles.smallText}>{item.description || 'بدون وصف'}</AppText>
                      </View>
                      <StateBadge label={item.status === 'published' ? 'منشورة' : 'محفوظة'} tone="success" />
                    </View>
                    <View style={styles.metaRow}>
                      {item.category ? <Meta text={item.category} /> : null}
                      {item.exchange_intent ? <Meta text={item.exchange_intent} /> : null}
                    </View>
                    <View style={styles.textActions}>
                      {item.status === 'published' && item.published_item_id ? <TextAction label="افتح العرض" onPress={() => router.push(`/item/${item.published_item_id}`)} /> : <TextAction label="كمّل في إضافة عنصر" onPress={() => router.push({ pathname: '/(tabs)/add', params: { dolabItemId: item.id, source: 'dolab' } })} />}
                      <TextAction label="تعديل" onPress={() => openRemoteDraft(item)} />
                      <TextAction label="حذف" danger onPress={() => requestDelete({ type: 'item', id: item.id })} />
                    </View>
                  </View>
                ))}
              </View>
            </AppCard>
          ) : null}
          {filteredSavedNotes.length > 0 ? (
            <AppCard>
              <SectionHeading title="ملاحظات محفوظة" description="النوتس اللي اتأكد حفظها في السحابة." />
              <View style={styles.listGap}>
                {filteredSavedNotes.map((note) => (
                  <View key={note.id} style={styles.workspaceRow}>
                    <View style={styles.rowHead}>
                      <AppText weight="semibold">{noteTypeLabel(note)}</AppText>
                      <StateBadge label="محفوظة" tone="success" />
                    </View>
                    <AppText>{note.body || 'ملاحظة بدون نص'}</AppText>
                    <View style={styles.textActions}><TextAction label="حذف" danger onPress={() => requestDelete({ type: 'note', id: note.id })} /></View>
                  </View>
                ))}
              </View>
            </AppCard>
          ) : null}
          {filteredSavedMedia.length > 0 ? (
            <AppCard>
              <SectionHeading title="ميديا محفوظة" description="الملفات اللي موجودة فعليًا في Storage." />
              <DolabSavedMediaGrid media={filteredSavedMedia} onDeleteMedia={(item) => requestDelete({ type: 'media', id: item.id, storagePath: item.storagePath })} />
            </AppCard>
          ) : null}
        </>
      )}
    </>
  );

  return (
    <AppScreen backgroundVariant="alive" style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="الرجوع">
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </Pressable>
          <View style={styles.flexCopy}>
            <AppText weight="bold" style={styles.headerTitle}>دولاب تِسوى</AppText>
            <AppText muted style={styles.smallText}>مساحة واحدة للحفظ، التنظيم، والتجهيز.</AppText>
          </View>
        </View>

        <DolabVaultHero />

        {feedback ? (
          <View style={[styles.feedback, feedback.tone === 'error' && styles.feedbackError, feedback.tone === 'warning' && styles.feedbackWarning, feedback.tone === 'success' && styles.feedbackSuccess]}>
            <Ionicons name={feedback.tone === 'error' ? 'alert-circle-outline' : feedback.tone === 'warning' ? 'warning-outline' : feedback.tone === 'success' ? 'checkmark-circle-outline' : 'information-circle-outline'} size={18} color={feedback.tone === 'error' ? colors.danger : feedback.tone === 'success' ? colors.success : feedback.tone === 'warning' ? '#9A6418' : colors.primary} />
            <AppText style={styles.feedbackText}>{feedback.message}</AppText>
            <Pressable onPress={() => setFeedback(null)} accessibilityRole="button" accessibilityLabel="إخفاء الرسالة"><Ionicons name="close" size={18} color={colors.textMuted} /></Pressable>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionTabs}>
          {sectionOptions.map((section) => {
            const selected = activeSection === section.id;
            return (
              <Pressable key={section.id} style={[styles.sectionTab, selected && styles.sectionTabSelected]} onPress={() => { setActiveSection(section.id); setSearchQuery(''); }} accessibilityRole="button" accessibilityLabel={`فتح ${section.label}`}>
                <Ionicons name={section.icon} size={16} color={selected ? colors.white : colors.primary} />
                <AppText style={[styles.sectionTabText, selected && styles.sectionTabTextSelected]}>{section.label}</AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {activeSection !== 'overview' ? <AppInput value={searchQuery} onChangeText={setSearchQuery} placeholder="ابحث في القسم..." /> : null}

        {!workspaceHydrated ? <AppCard><AppText muted>بنفتح نسخة دولابك المحفوظة على الجهاز...</AppText></AppCard> : null}
        {workspaceHydrated && activeSection === 'overview' ? renderOverview() : null}
        {workspaceHydrated && activeSection === 'inbox' ? renderInbox() : null}
        {workspaceHydrated && activeSection === 'drafts' ? renderDrafts() : null}
        {workspaceHydrated && activeSection === 'media' ? renderMedia() : null}
        {workspaceHydrated && activeSection === 'notes' ? renderNotes() : null}
        {workspaceHydrated && activeSection === 'saved' ? renderSaved() : null}
      </ScrollView>

      <DolabAudioRecorderSheet
        sheetRef={audioRecorderSheetRef}
        onFeedback={(message) => notify(message, 'error')}
        onSave={(recording) => {
          void (async () => {
            const pending = await makePendingMediaDurable(createPendingAudioMedia(recording));
            const durationLabel = pending.durationMs ? `${Math.max(1, Math.round(pending.durationMs / 1000))}ث` : 'بدون مدة';
            const message: DolabSelfMessage = {
              id: `local-self-message-${Date.now()}`,
              body: `تسجيل صوتي · ${durationLabel}`,
              messageType: 'voice_placeholder',
              linkedPendingMediaIds: [pending.id],
              syncState: user?.id ? 'pending' : 'device_only',
              createdAt: new Date().toISOString(),
            };
            const nextMedia = [pending, ...pendingMedia];
            const nextMessages = [message, ...selfMessages];
            if (!persistWorkspace({ pendingMedia: nextMedia, selfMessages: nextMessages })) return;
            setPendingMedia(nextMedia);
            setSelfMessages(nextMessages);
            setActiveSection('notes');
            notify('التسجيل اتحفظ على الجهاز في الميديا وملاحظاتك.', 'success');
            if (user?.id) {
              const syncedNote = await syncSelfMessage(message);
              const uploadResult = await uploadPendingMediaToCloud(localDrafts);
              if (syncedNote.remoteNoteId && uploadResult.success > 0) await refreshRemoteSnapshot(true);
            }
          })();
        }}
      />

      <DolabCollectionPickerSheet sheetRef={collectionPickerSheetRef} collections={collections} onSelect={assignDraftToCollection} />

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
        isSending={isSendingShare}
        refreshKey={conversationPickerRefreshKey}
        onSelectConversation={(conversation) => { void sendShareToConversation(conversation); }}
      />

      <DolabPublishBridgeSheet
        sheetRef={publishBridgeRef}
        selectedDraft={selectedPublishDraft}
        linkedPendingMedia={selectedPublishMedia}
        missingFields={selectedPublishData?.missingFields ?? []}
        onPrepare={preparePublishDraft}
        onRouteToAddItem={() => { void routeSelectedDraftToAdd(); }}
      />

      <AppActionSheet
        ref={deleteSheetRef}
        title="تأكيد الحذف"
        description="الحذف ده للنسخة السحابية ومش هنعتبره نجح إلا بعد رد السيرفر."
        titleIconName="trash-outline"
        actions={[
          { label: 'احذف', tone: 'danger', onPress: () => { void confirmRemoteDelete(); } },
          { label: 'إلغاء', onPress: () => deleteSheetRef.current?.dismiss() },
        ]}
      />

      <AppBottomSheet
        ref={draftSheetRef}
        title={editingRemoteItemId || editingLocalDraftId ? 'تعديل المسودة' : 'مسودة جديدة'}
        description="بتتحفظ على الجهاز أولًا، وبعدها المزامنة لها حالة واضحة."
        titleIconName="cube-outline"
        snapPoints={['82%']}
      >
        <ScrollView contentContainerStyle={styles.sheetBody}>
          <AppInput value={draftForm.title} onChangeText={(value) => setDraftForm((prev) => ({ ...prev, title: value }))} placeholder="اسم الحاجة" />
          <AppInput value={draftForm.description} onChangeText={(value) => setDraftForm((prev) => ({ ...prev, description: value }))} placeholder="وصف سريع" multiline />
          <AppInput value={draftForm.category} onChangeText={(value) => setDraftForm((prev) => ({ ...prev, category: value }))} placeholder="التصنيف" />
          <AppInput value={draftForm.condition} onChangeText={(value) => setDraftForm((prev) => ({ ...prev, condition: value }))} placeholder="الحالة" />
          <AppInput value={draftForm.exchangeIntent} onChangeText={(value) => setDraftForm((prev) => ({ ...prev, exchangeIntent: value }))} placeholder="تحب تبدلها بإيه؟" multiline />
          {!editingRemoteItemId ? (
            <>
              <SectionHeading title="الميديا المرتبطة" description="اختيارك هنا بيتحفظ مع نسخة العمل، والميديا نفسها لها حالة رفع مستقلة." />
              <DolabPendingMediaStrip pendingMedia={pendingMedia} mode="selectable" selectedMediaIds={draftForm.linkedPendingMediaIds} onToggleSelect={toggleDraftMedia} emptyText="مفيش ميديا على الجهاز لسه." />
            </>
          ) : null}
          <AppButton label="احفظ المسودة" onPress={() => { void saveDraft(); }} />
        </ScrollView>
      </AppBottomSheet>

      <AppBottomSheet
        ref={quickTextSheetRef}
        title="نص سريع"
        description="يتحفظ في الوارد لحد ما تقرر تحوله لنوت أو مسودة."
        titleIconName="create-outline"
        snapPoints={['45%']}
      >
        <View style={styles.sheetBody}>
          <AppInput value={quickText} onChangeText={setQuickText} placeholder="اكتب هنا..." multiline />
          <AppButton label="احفظ في الوارد" onPress={saveQuickText} />
        </View>
      </AppBottomSheet>
    </AppScreen>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return <View style={styles.sectionHeading}><AppText weight="bold">{title}</AppText><AppText muted style={styles.smallText}>{description}</AppText></View>;
}

function QuickAction({ icon, label, onPress, compact = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; compact?: boolean }) {
  return (
    <Pressable style={[styles.quickAction, compact && styles.quickActionCompact]} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.quickActionIcon}><Ionicons name={icon} size={19} color={colors.primary} /></View>
      <AppText weight="semibold" style={styles.quickActionText}>{label}</AppText>
    </Pressable>
  );
}

function OverviewTile({ icon, title, count, hint, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; count: number; hint: string; onPress: () => void }) {
  return (
    <Pressable style={styles.overviewTile} onPress={onPress} accessibilityRole="button" accessibilityLabel={`فتح ${title}`}>
      <View style={styles.tileTop}><View style={styles.tileIcon}><Ionicons name={icon} size={20} color={colors.primary} /></View><AppText weight="bold" style={styles.tileCount}>{count}</AppText></View>
      <AppText weight="semibold">{title}</AppText>
      <AppText muted style={styles.tinyText}>{hint}</AppText>
    </Pressable>
  );
}

function StatPill({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return <View style={[styles.statPill, warning && styles.statPillWarning]}><AppText weight="bold" style={styles.statValue}>{value}</AppText><AppText muted style={styles.tinyText}>{label}</AppText></View>;
}

function StateBadge({ label, tone }: { label: string; tone: 'info' | 'success' | 'warning' | 'error' }) {
  return <View style={[styles.stateBadge, tone === 'success' && styles.stateSuccess, tone === 'warning' && styles.stateWarning, tone === 'error' && styles.stateError]}><AppText style={styles.stateBadgeText}>{label}</AppText></View>;
}

function Meta({ text }: { text: string }) {
  return <View style={styles.metaPill}><AppText muted style={styles.tinyText} numberOfLines={1}>{text}</AppText></View>;
}

function TextAction({ label, onPress, danger = false }: { label: string; onPress: () => void; danger?: boolean }) {
  return <Pressable style={styles.textAction} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}><AppText style={[styles.textActionText, danger && styles.textActionDanger]}>{label}</AppText></Pressable>;
}

function CollectionChip({ label, count, selected, onPress }: { label: string; count: number; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.collectionChip, selected && styles.collectionChipSelected]} onPress={onPress} accessibilityRole="button" accessibilityLabel={`مجموعة ${label}`}>
      <AppText style={[styles.collectionChipText, selected && styles.collectionChipTextSelected]}>{label}</AppText>
      <View style={[styles.collectionCount, selected && styles.collectionCountSelected]}><AppText style={[styles.tinyText, selected && styles.collectionCountTextSelected]}>{count}</AppText></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  backButton: { width: 42, height: 42, borderRadius: radii.round, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  headerTitle: { fontSize: 22 },
  flexCopy: { flex: 1, gap: 2 },
  smallText: { fontSize: 12, lineHeight: 18 },
  tinyText: { fontSize: 11 },
  feedback: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.primarySoft, backgroundColor: '#F8F4EE' },
  feedbackSuccess: { borderColor: '#B9DCC5', backgroundColor: '#F2FBF5' },
  feedbackWarning: { borderColor: '#E8C98F', backgroundColor: '#FFF9EC' },
  feedbackError: { borderColor: '#F1B8B4', backgroundColor: '#FFF4F3' },
  feedbackText: { flex: 1, fontSize: 12 },
  sectionTabs: { gap: spacing.xs, paddingVertical: 2 },
  sectionTab: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.primarySoft, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 8, backgroundColor: '#FFF9F1' },
  sectionTabSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  sectionTabText: { fontSize: 12, color: colors.primary },
  sectionTabTextSelected: { color: colors.white },
  statusHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  statusIcon: { width: 42, height: 42, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  statRow: { flexDirection: 'row-reverse', gap: spacing.xs, marginBottom: spacing.xs },
  statPill: { flex: 1, minWidth: 0, padding: spacing.xs, borderRadius: radii.md, backgroundColor: '#F7F4EF', alignItems: 'center' },
  statPillWarning: { backgroundColor: '#FFF2E2' },
  statValue: { fontSize: 18 },
  buttonRow: { gap: spacing.xs, marginTop: spacing.sm },
  buttonRowWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  sectionHeading: { flex: 1, gap: 3, alignItems: 'flex-end' },
  sectionTopRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm },
  roundAction: { width: 40, height: 40, borderRadius: radii.round, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  quickGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  quickAction: { width: '31%', minWidth: 92, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.sm, alignItems: 'center', gap: 6, backgroundColor: '#FFFEFB' },
  quickActionCompact: { width: 'auto', minWidth: 92, flexGrow: 1 },
  quickActionIcon: { width: 34, height: 34, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  quickActionText: { fontSize: 12 },
  overviewGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  overviewTile: { width: '48.5%', borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, padding: spacing.md, gap: 5, backgroundColor: '#FFFEFB' },
  tileTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  tileIcon: { width: 38, height: 38, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  tileCount: { fontSize: 24 },
  collectionComposer: { gap: spacing.xs, marginTop: spacing.sm },
  chipsRow: { gap: spacing.xs, paddingTop: spacing.sm },
  collectionChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 7, backgroundColor: colors.surface },
  collectionChipSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  collectionChipText: { fontSize: 12 },
  collectionChipTextSelected: { color: colors.white },
  collectionCount: { minWidth: 22, height: 22, borderRadius: radii.round, backgroundColor: '#F0ECE6', alignItems: 'center', justifyContent: 'center' },
  collectionCountSelected: { backgroundColor: 'rgba(255,255,255,0.2)' },
  collectionCountTextSelected: { color: colors.white },
  listGap: { gap: spacing.sm },
  workspaceRow: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.sm, gap: spacing.xs, backgroundColor: '#FFFEFB' },
  rowHead: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm },
  stateBadge: { alignSelf: 'flex-start', borderRadius: radii.round, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#EEF3FF' },
  stateSuccess: { backgroundColor: '#EAF7EE' },
  stateWarning: { backgroundColor: '#FFF2DE' },
  stateError: { backgroundColor: '#FFE9E7' },
  stateBadgeText: { fontSize: 10, color: colors.text },
  metaRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 5 },
  metaPill: { maxWidth: '100%', borderRadius: radii.round, backgroundColor: '#F4F1EC', paddingHorizontal: 8, paddingVertical: 4 },
  textActions: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
  textAction: { paddingHorizontal: 4, paddingVertical: 4 },
  textActionText: { color: colors.primary, fontSize: 12 },
  textActionDanger: { color: colors.danger },
  errorText: { color: colors.danger, fontSize: 11 },
  sheetBody: { gap: spacing.sm, paddingBottom: spacing.xxl },
});
