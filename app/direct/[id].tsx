import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { KeyboardStickyView, useKeyboardState } from 'react-native-keyboard-controller';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Image as ExpoImage } from 'expo-image';
import { File } from 'expo-file-system';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';

import { AppActionSheet } from '@/components/sheets/AppActionSheet';
import { ChatAttachmentGallery, type ChatAttachmentGalleryItem } from '@/components/messaging/ChatAttachmentGallery';
import { ChatComposer } from '@/components/messaging/ChatComposer';
import { ChatMediaViewer, type ChatMediaViewerItem } from '@/components/messaging/ChatMediaViewer';
import { DolabShareSheet, type DolabShareItem } from '@/components/messaging/DolabShareSheet';
import { MessageBubble } from '@/components/messaging/MessageBubble';
import { PendingAttachmentStrip, type PendingChatAttachment } from '@/components/messaging/PendingAttachmentStrip';
import { VoiceMessageBubble } from '@/components/messaging/VoiceMessageBubble';
import { AppButton } from '@/components/ui/AppButton';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import {
  acceptDirectMessageRequest,
  fetchDirectConversation,
  fetchDirectConversationMessages,
  ignoreDirectMessageRequest,
  type DirectConversationSummary,
} from '@/lib/direct-messages';
import {
  createNativeDirectAttachmentSignedUrl,
  deleteNativeDirectMessage,
  fetchNativeDirectMessages,
  fetchNativeDirectTypingUsers,
  markNativeDirectConversationRead,
  removeNativeDirectUploads,
  sendNativeDirectMessage,
  setNativeDirectTypingState,
  subscribeToNativeDirectConversation,
  toggleNativeDirectReaction,
  uploadNativeDirectAttachment,
  type NativeDirectAttachment,
  type NativeDirectMessage,
} from '@/lib/chat/supabase-direct-chat';
import { directAttachmentLimits, prepareDirectAttachment } from '@/lib/chat/direct-media-preflight';
import { loadRecentDolabShareables, saveDirectMessageToDolab } from '@/lib/dolab/chat-bridge';
import {
  blockUserFromMobile,
  fetchUserBlockState,
  unblockUserFromMobile,
} from '@/lib/user-blocks';
import { showToast } from '@/lib/toast';

type UiMessage = NativeDirectMessage & {
  localStatus?: 'sending' | 'failed';
  localPreviewAttachments?: PendingChatAttachment[];
};

type SendProgress = { label: string; done: number; total: number } | null;

const PAGE_SIZE = 50;
const MAX_VOICE_DURATION_MS = 120_000;
const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;
const MEDIA_PREVIEW_BODIES = new Set(['صورة', 'فيديو', 'ملف', 'رسالة صوتية']);

function mergeMessages(previous: UiMessage[], next: UiMessage[]) {
  const map = new Map<string, UiMessage>();
  [...previous, ...next].forEach((message) => map.set(message.id, message));
  return Array.from(map.values()).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
}

function legacyToNative(message: any): UiMessage {
  return {
    id: message.id,
    senderId: message.senderId,
    body: message.body ?? '',
    messageType: message.messageType === 'voice' ? 'voice' : 'text',
    createdAt: message.createdAt,
    readAt: message.readAt ?? null,
    replyToMessageId: null,
    replySenderId: null,
    replyBody: null,
    metadata: {},
    deletedAt: null,
    attachments: [],
    reactions: [],
  };
}

function formatClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'اليوم';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'أمس';
  return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });
}

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function attachmentKey(attachment: NativeDirectAttachment) {
  return `${attachment.storageBucket ?? 'direct-chat-media'}:${attachment.storagePath}`;
}

function pendingId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function displayMessageBody(message: UiMessage) {
  const text = message.body?.trim() ?? '';
  if ((message.attachments.length || message.localPreviewAttachments?.length) && MEDIA_PREVIEW_BODIES.has(text)) return '';
  return text;
}

export default function DirectConversationScreen() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const conversationId = (Array.isArray(id) ? id[0] : id)?.trim() ?? '';
  const keyboardVisible = useKeyboardState((state) => state.isVisible);

  const listRef = useRef<FlatList<UiMessage>>(null);
  const messageActionsRef = useRef<BottomSheetModal>(null);
  const conversationActionsRef = useRef<BottomSheetModal>(null);
  const attachmentActionsRef = useRef<BottomSheetModal>(null);
  const dolabShareRef = useRef<BottomSheetModal>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAtRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);

  const [conversation, setConversation] = useState<DirectConversationSummary | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<SendProgress>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingChatAttachment[]>([]);
  const [replyTarget, setReplyTarget] = useState<UiMessage | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<UiMessage | null>(null);
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string | null>>({});
  const [mediaViewer, setMediaViewer] = useState<ChatMediaViewerItem | null>(null);
  const [newMessagesAvailable, setNewMessagesAvailable] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockedMe, setBlockedMe] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [dolabItems, setDolabItems] = useState<DolabShareItem[]>([]);
  const [dolabLoading, setDolabLoading] = useState(false);
  const [dolabError, setDolabError] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  const [recordingActive, setRecordingActive] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [voiceSending, setVoiceSending] = useState(false);
  const player = useAudioPlayer(null, { updateInterval: 200 });
  const playerStatus = useAudioPlayerStatus(player);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [voiceLoadingId, setVoiceLoadingId] = useState<string | null>(null);

  const accepted = conversation?.status === 'accepted';
  const interactionBlocked = blockedByMe || blockedMe;
  const canCompose = !!accepted && !interactionBlocked && !sending;
  const isReceiverOnRequest = conversation?.status === 'requested' && conversation.requestedBy !== user?.id;
  const isRequesterOnRequest = conversation?.status === 'requested' && conversation.requestedBy === user?.id;

  const notify = useCallback((title: string) => showToast({ title }), []);

  const presentAfterKeyboard = useCallback((ref: React.RefObject<BottomSheetModal | null>, delay = 180) => {
    Keyboard.dismiss();
    if (sheetTimerRef.current) clearTimeout(sheetTimerRef.current);
    sheetTimerRef.current = setTimeout(() => ref.current?.present(), delay);
  }, []);

  useEffect(() => () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (sheetTimerRef.current) clearTimeout(sheetTimerRef.current);
    if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
  }, []);

  const loadBlockState = useCallback(async () => {
    if (!user?.id || !conversation?.otherUserId) return;
    const result = await fetchUserBlockState(user.id, conversation.otherUserId);
    if (!result.ok) return;
    setBlockedByMe(result.state.blockedByMe);
    setBlockedMe(result.state.blockedMe);
  }, [conversation?.otherUserId, user?.id]);

  const loadConversation = useCallback(async () => {
    if (!conversationId) return null;
    const next = await fetchDirectConversation(conversationId);
    setConversation(next);
    return next;
  }, [conversationId]);

  const loadLatestMessages = useCallback(async (input?: { silent?: boolean; keepExisting?: boolean }) => {
    if (!conversationId) return;
    if (!input?.silent) setRefreshing(true);
    try {
      const currentConversation = conversation ?? await fetchDirectConversation(conversationId);
      if (currentConversation && !conversation) setConversation(currentConversation);
      if (!currentConversation) {
        setError('المحادثة لم تعد متاحة.');
        return;
      }

      if (currentConversation.status === 'accepted') {
        const result = await fetchNativeDirectMessages(conversationId, { limit: PAGE_SIZE });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setHasMore(result.messages.length >= PAGE_SIZE);
        setMessages((prev) => input?.keepExisting ? mergeMessages(prev, result.messages) : result.messages);
        void markNativeDirectConversationRead(conversationId);
      } else {
        const result = await fetchDirectConversationMessages(conversationId);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setHasMore(false);
        setMessages(result.messages.map(legacyToNative));
      }
      setError(null);
    } finally {
      if (!input?.silent) setRefreshing(false);
    }
  }, [conversation, conversationId]);

  const initialLoad = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const next = await loadConversation();
      if (!next) {
        setError('تعذر فتح المحادثة.');
        return;
      }
      if (next.status === 'accepted') {
        const result = await fetchNativeDirectMessages(conversationId, { limit: PAGE_SIZE });
        if (!result.ok) setError(result.message);
        else {
          setMessages(result.messages);
          setHasMore(result.messages.length >= PAGE_SIZE);
          void markNativeDirectConversationRead(conversationId);
        }
      } else {
        const result = await fetchDirectConversationMessages(conversationId);
        if (!result.ok) setError(result.message);
        else setMessages(result.messages.map(legacyToNative));
      }
    } finally {
      setLoading(false);
    }
  }, [conversationId, loadConversation]);

  useEffect(() => { void initialLoad(); }, [initialLoad]);
  useEffect(() => { void loadBlockState(); }, [loadBlockState]);

  const refreshTyping = useCallback(async () => {
    if (!accepted || !conversationId || !user?.id) return;
    const users = await fetchNativeDirectTypingUsers(conversationId);
    setTypingUsers(users.filter((value) => value !== user.id));
  }, [accepted, conversationId, user?.id]);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
    realtimeRefreshTimerRef.current = setTimeout(() => {
      void loadLatestMessages({ silent: true, keepExisting: true }).then(() => {
        if (isNearBottomRef.current) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
        else setNewMessagesAvailable(true);
      });
    }, 90);
  }, [loadLatestMessages]);

  useEffect(() => {
    if (!conversationId || !user?.id) return;
    setRealtimeStatus('connecting');
    const stop = subscribeToNativeDirectConversation(conversationId, {
      onConversationChanged: () => {
        void loadConversation().then(() => {
          void loadBlockState();
          scheduleRealtimeRefresh();
        });
      },
      onMessagesChanged: scheduleRealtimeRefresh,
      onAttachmentsChanged: scheduleRealtimeRefresh,
      onReactionsChanged: scheduleRealtimeRefresh,
      onTypingChanged: () => { void refreshTyping(); },
      onStatus: (status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setRealtimeStatus('offline');
      },
    });
    if (accepted) void refreshTyping();
    return () => stop();
  }, [accepted, conversationId, loadBlockState, loadConversation, refreshTyping, scheduleRealtimeRefresh, user?.id]);

  useEffect(() => {
    let cancelled = false;
    const unique = new Map<string, NativeDirectAttachment>();
    messages.flatMap((message) => message.attachments).forEach((attachment) => {
      const key = attachmentKey(attachment);
      if (resolvedUrls[key] === undefined) unique.set(key, attachment);
    });
    if (!unique.size) return;
    void Promise.all(Array.from(unique.entries()).map(async ([key, attachment]) => ({
      key,
      url: await createNativeDirectAttachmentSignedUrl(
        attachment.storagePath,
        SIGNED_URL_TTL_SECONDS,
        attachment.storageBucket,
      ),
    }))).then((entries) => {
      if (cancelled) return;
      setResolvedUrls((prev) => {
        const next = { ...prev };
        entries.forEach(({ key, url }) => { next[key] = url; });
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [messages, resolvedUrls]);

  useEffect(() => {
    if (!recordingActive) return;
    if ((recorderState.durationMillis ?? 0) < MAX_VOICE_DURATION_MS) return;
    void stopAndSendVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState.durationMillis, recordingActive]);

  const loadOlder = useCallback(async () => {
    if (!accepted || loadingOlder || !hasMore || !messages.length) return;
    setLoadingOlder(true);
    try {
      const oldest = messages.find((message) => !message.localStatus)?.createdAt ?? messages[0]?.createdAt;
      const result = await fetchNativeDirectMessages(conversationId, { limit: PAGE_SIZE, before: oldest });
      if (!result.ok) {
        notify(result.message);
        return;
      }
      setHasMore(result.messages.length >= PAGE_SIZE);
      setMessages((prev) => mergeMessages(result.messages, prev));
    } finally {
      setLoadingOlder(false);
    }
  }, [accepted, conversationId, hasMore, loadingOlder, messages, notify]);

  const onChangeBody = useCallback((value: string) => {
    setBody(value);
    if (!accepted || interactionBlocked) return;
    const now = Date.now();
    if (now - lastTypingSentAtRef.current > 1200) {
      lastTypingSentAtRef.current = now;
      void setNativeDirectTypingState(conversationId, true);
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => { void setNativeDirectTypingState(conversationId, false); }, 1800);
  }, [accepted, conversationId, interactionBlocked]);

  useEffect(() => () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (accepted) void setNativeDirectTypingState(conversationId, false);
  }, [accepted, conversationId]);

  const appendPendingAttachments = useCallback((incoming: PendingChatAttachment[]) => {
    const existingUris = new Set(pendingAttachments.map((item) => item.uri));
    const unique = incoming.filter((item) => item.uri && !existingUris.has(item.uri));
    const remaining = directAttachmentLimits.maxAttachmentsPerMessage - pendingAttachments.length;
    if (remaining <= 0) {
      notify('يمكن إرسال حتى 5 مرفقات في الرسالة الواحدة.');
      return;
    }
    const acceptedItems = unique.slice(0, remaining);
    setPendingAttachments((prev) => [...prev, ...acceptedItems]);
    if (unique.length > acceptedItems.length) notify('اختارنا أول 5 مرفقات فقط.');
  }, [notify, pendingAttachments]);

  const sendCurrent = useCallback(async () => {
    if (!canCompose || !user?.id) return;
    const trimmed = body.trim();
    const attachmentSnapshot = pendingAttachments.slice(0, directAttachmentLimits.maxAttachmentsPerMessage);
    if (!trimmed && !attachmentSnapshot.length) return;

    const replySnapshot = replyTarget;
    const localId = `local-${Date.now()}`;
    const optimistic: UiMessage = {
      id: localId,
      senderId: user.id,
      body: trimmed,
      messageType: 'text',
      createdAt: new Date().toISOString(),
      readAt: null,
      replyToMessageId: replySnapshot?.id ?? null,
      replySenderId: replySnapshot?.senderId ?? null,
      replyBody: replySnapshot?.body ?? null,
      metadata: {},
      deletedAt: null,
      attachments: [],
      reactions: [],
      localStatus: 'sending',
      localPreviewAttachments: attachmentSnapshot,
    };

    setSending(true);
    setError(null);
    setMessages((prev) => [...prev, optimistic]);
    setBody('');
    setPendingAttachments([]);
    setReplyTarget(null);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

    const uploaded: NativeDirectAttachment[] = [];
    try {
      for (let index = 0; index < attachmentSnapshot.length; index += 1) {
        const local = attachmentSnapshot[index];
        setSendProgress({ label: local.kind === 'video' ? 'بنجهّز الفيديو...' : 'بنجهّز المرفقات...', done: index, total: attachmentSnapshot.length });
        const prepared = await prepareDirectAttachment(local);
        if (!prepared.ok) throw new Error(prepared.message);

        setSendProgress({ label: `بنرفع المرفق ${index + 1} من ${attachmentSnapshot.length}...`, done: index, total: attachmentSnapshot.length });
        const upload = await uploadNativeDirectAttachment({
          conversationId,
          currentUserId: user.id,
          localUri: prepared.attachment.uri,
          kind: prepared.attachment.kind,
          fileName: prepared.attachment.fileName,
          mimeType: prepared.attachment.mimeType,
          sizeBytes: prepared.attachment.sizeBytes,
        });
        if (!upload.ok) throw new Error(upload.message);
        uploaded.push(upload.attachment);
        setSendProgress({ label: 'المرفقات اترفعت، بنرسل الرسالة...', done: index + 1, total: attachmentSnapshot.length });
      }

      const result = await sendNativeDirectMessage({
        conversationId,
        body: trimmed || null,
        replyToMessageId: replySnapshot?.id ?? null,
        attachments: uploaded,
      });
      if (!result.ok) throw new Error(result.message);

      setMessages((prev) => prev.filter((message) => message.id !== localId));
      setSendProgress(null);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      await loadLatestMessages({ silent: true, keepExisting: true });
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (sendError) {
      if (uploaded.length) await removeNativeDirectUploads(uploaded.map((item) => item.storagePath));
      setMessages((prev) => prev.map((item) => item.id === localId ? { ...item, localStatus: 'failed' } : item));
      setSendProgress(null);
      await loadBlockState();
      notify(sendError instanceof Error ? sendError.message : 'تعذر إرسال الرسالة حالياً.');
    } finally {
      setSending(false);
    }
  }, [body, canCompose, conversationId, loadBlockState, loadLatestMessages, notify, pendingAttachments, replyTarget, user?.id]);

  const startVoiceRecording = useCallback(async () => {
    if (!canCompose || recordingActive) return;
    setRecordingBusy(true);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        notify('محتاجين إذن الميكروفون لتسجيل رسالة صوتية.');
        return;
      }
      Keyboard.dismiss();
      player.pause();
      setPlayingVoiceId(null);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecordingActive(true);
    } catch {
      notify('تعذر بدء التسجيل الصوتي.');
    } finally {
      setRecordingBusy(false);
    }
  }, [canCompose, notify, player, recorder, recordingActive]);

  const cancelVoiceRecording = useCallback(async () => {
    if (!recordingActive) return;
    setRecordingBusy(true);
    try { await recorder.stop(); } catch {}
    setRecordingActive(false);
    setRecordingBusy(false);
  }, [recorder, recordingActive]);

  const stopAndSendVoice = useCallback(async () => {
    if (!recordingActive || !user?.id || voiceSending) return;
    setVoiceSending(true);
    setRecordingBusy(true);
    const preStopDuration = recorderState.durationMillis ?? 0;
    let uploadedPath: string | null = null;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      const durationMs = Math.min(MAX_VOICE_DURATION_MS, preStopDuration || recorderState.durationMillis || 0);
      if (!uri || durationMs < 500) throw new Error('التسجيل قصير جدًا.');
      let sizeBytes: number | null = null;
      try {
        const info = await new File(uri).info();
        sizeBytes = typeof info.size === 'number' ? info.size : null;
      } catch {}
      setRecordingActive(false);
      setSendProgress({ label: 'بنرفع الرسالة الصوتية...', done: 0, total: 1 });
      const upload = await uploadNativeDirectAttachment({
        conversationId,
        currentUserId: user.id,
        localUri: uri,
        kind: 'audio',
        fileName: `voice-${Date.now()}.m4a`,
        mimeType: 'audio/m4a',
        sizeBytes,
        durationMs,
      });
      if (!upload.ok) throw new Error(upload.message);
      uploadedPath = upload.attachment.storagePath;
      setSendProgress({ label: 'بنرسل الرسالة الصوتية...', done: 1, total: 1 });
      const result = await sendNativeDirectMessage({
        conversationId,
        body: body.trim() || null,
        replyToMessageId: replyTarget?.id ?? null,
        attachments: [upload.attachment],
      });
      if (!result.ok) throw new Error(result.message);
      setBody('');
      setReplyTarget(null);
      setSendProgress(null);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      await loadLatestMessages({ silent: true, keepExisting: true });
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (voiceError) {
      if (uploadedPath) await removeNativeDirectUploads([uploadedPath]);
      setSendProgress(null);
      setRecordingActive(false);
      notify(voiceError instanceof Error ? voiceError.message : 'تعذر إرسال الرسالة الصوتية.');
    } finally {
      setRecordingBusy(false);
      setVoiceSending(false);
    }
  }, [body, conversationId, loadLatestMessages, notify, recorder, recorderState.durationMillis, recordingActive, replyTarget?.id, user?.id, voiceSending]);

  const toggleVoice = useCallback(async (message: UiMessage, attachment: NativeDirectAttachment) => {
    const idValue = `${message.id}:${attachment.storagePath}`;
    if (playingVoiceId === idValue && playerStatus.playing) {
      player.pause();
      return;
    }
    const key = attachmentKey(attachment);
    let url = resolvedUrls[key];
    setVoiceLoadingId(idValue);
    try {
      if (!url) {
        url = await createNativeDirectAttachmentSignedUrl(attachment.storagePath, SIGNED_URL_TTL_SECONDS, attachment.storageBucket);
        setResolvedUrls((prev) => ({ ...prev, [key]: url ?? null }));
      }
      if (!url) throw new Error('voice_url_missing');
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      player.pause();
      player.replace(url);
      try { await player.seekTo(0); } catch {}
      player.play();
      setPlayingVoiceId(idValue);
    } catch {
      notify('تعذر تشغيل الرسالة الصوتية.');
      setPlayingVoiceId(null);
    } finally {
      setVoiceLoadingId(null);
    }
  }, [notify, player, playerStatus.playing, playingVoiceId, resolvedUrls]);

  useEffect(() => {
    if (!playingVoiceId || !playerStatus.didJustFinish) return;
    setPlayingVoiceId(null);
    try { player.pause(); } catch {}
  }, [player, playerStatus.didJustFinish, playingVoiceId]);

  const pickMedia = useCallback(async () => {
    attachmentActionsRef.current?.dismiss();
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { notify('نحتاج إذن الصور لاختيار الميديا.'); return; }
    const remaining = directAttachmentLimits.maxAttachmentsPerMessage - pendingAttachments.length;
    if (remaining <= 0) { notify('يمكن إرسال حتى 5 مرفقات في الرسالة الواحدة.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.86,
    });
    if (result.canceled) return;
    appendPendingAttachments((result.assets ?? []).filter((asset) => !!asset.uri).map((asset) => ({
      id: pendingId('media'),
      kind: asset.type === 'video' || asset.mimeType?.startsWith('video/') ? 'video' as const : 'image' as const,
      uri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      sizeBytes: asset.fileSize,
    })));
  }, [appendPendingAttachments, notify, pendingAttachments.length]);

  const captureMedia = useCallback(async () => {
    attachmentActionsRef.current?.dismiss();
    if (pendingAttachments.length >= directAttachmentLimits.maxAttachmentsPerMessage) {
      notify('يمكن إرسال حتى 5 مرفقات في الرسالة الواحدة.');
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { notify('نحتاج إذن الكاميرا لالتقاط صورة أو فيديو.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.86, videoMaxDuration: 120 });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    appendPendingAttachments([{
      id: pendingId('camera'),
      kind: asset.type === 'video' || asset.mimeType?.startsWith('video/') ? 'video' : 'image',
      uri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      sizeBytes: asset.fileSize,
    }]);
  }, [appendPendingAttachments, notify, pendingAttachments.length]);

  const pickFiles = useCallback(async () => {
    attachmentActionsRef.current?.dismiss();
    const remaining = directAttachmentLimits.maxAttachmentsPerMessage - pendingAttachments.length;
    if (remaining <= 0) { notify('يمكن إرسال حتى 5 مرفقات في الرسالة الواحدة.'); return; }
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    appendPendingAttachments((result.assets ?? []).slice(0, remaining).filter((asset) => !!asset.uri).map((asset) => ({
      id: pendingId('file'),
      kind: 'file' as const,
      uri: asset.uri,
      fileName: asset.name,
      mimeType: asset.mimeType,
      sizeBytes: asset.size,
    })));
  }, [appendPendingAttachments, notify, pendingAttachments.length]);

  const loadDolabItems = useCallback(async () => {
    setDolabLoading(true);
    setDolabError(null);
    const result = await loadRecentDolabShareables();
    if (result.ok) setDolabItems(result.items as DolabShareItem[]);
    else {
      setDolabItems([]);
      setDolabError(result.message);
    }
    setDolabLoading(false);
  }, []);

  const openDolab = useCallback(() => {
    attachmentActionsRef.current?.dismiss();
    setDolabLoading(true);
    setDolabError(null);
    setTimeout(() => presentAfterKeyboard(dolabShareRef, 40), 90);
    void loadDolabItems();
  }, [loadDolabItems, presentAfterKeyboard]);

  const selectDolabItem = useCallback((item: DolabShareItem) => {
    if (item.kind === 'text') {
      const text = item.body?.trim();
      if (!text) { notify('الملاحظة دي فاضية.'); return; }
      setBody((prev) => prev.trim() ? `${prev}\n${text}`.slice(0, 1200) : text.slice(0, 1200));
      notify('اتضافت للرسالة.');
      return;
    }
    if (!item.uri) { notify('الميديا دي مش متاحة دلوقتي.'); return; }
    appendPendingAttachments([{
      id: pendingId('dolab'),
      kind: item.kind,
      uri: item.uri,
      fileName: item.fileName || item.title,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
    }]);
  }, [appendPendingAttachments, notify]);

  const onToggleBlock = useCallback(async () => {
    if (!user?.id || !conversation?.otherUserId || blockBusy) return;
    setBlockBusy(true);
    try {
      const result = blockedByMe
        ? await unblockUserFromMobile(user.id, conversation.otherUserId)
        : await blockUserFromMobile(user.id, conversation.otherUserId);
      notify(result.message);
      if (result.ok) {
        await loadBlockState();
        await loadConversation();
      }
    } finally {
      setBlockBusy(false);
    }
  }, [blockBusy, blockedByMe, conversation?.otherUserId, loadBlockState, loadConversation, notify, user?.id]);

  const saveMessageToDolab = useCallback(async (message: UiMessage) => {
    const attachments = await Promise.all(message.attachments.map(async (attachment) => {
      const key = attachmentKey(attachment);
      let url = resolvedUrls[key];
      if (!url) {
        url = await createNativeDirectAttachmentSignedUrl(attachment.storagePath, SIGNED_URL_TTL_SECONDS, attachment.storageBucket);
        setResolvedUrls((prev) => ({ ...prev, [key]: url ?? null }));
      }
      return {
        type: attachment.kind,
        title: attachment.fileName ?? undefined,
        name: attachment.fileName ?? undefined,
        imageUrl: attachment.kind === 'image' ? url ?? undefined : undefined,
        assetUrl: attachment.kind !== 'image' ? url ?? undefined : undefined,
        mimeType: attachment.mimeType ?? undefined,
        fileSize: attachment.sizeBytes ?? undefined,
        durationSeconds: attachment.durationMs ? attachment.durationMs / 1000 : undefined,
      };
    }));
    const result = await saveDirectMessageToDolab({
      conversationId,
      messageId: message.id,
      text: displayMessageBody(message),
      attachments,
    });
    if (!result.ok) notify(result.message);
    else if (result.alreadySaved && !result.savedText && !result.savedMediaCount) notify('موجودة بالفعل في دولابك.');
    else notify('اتحفظت في دولابك.');
  }, [conversationId, notify, resolvedUrls]);

  const runMessageAction = useCallback(async (action: 'reply' | 'copy' | 'love' | 'thumbs_up' | 'delete' | 'report' | 'retry' | 'save_dolab') => {
    const message = selectedMessage;
    messageActionsRef.current?.dismiss();
    if (!message) return;
    const mine = message.senderId === user?.id;
    const visibleBody = displayMessageBody(message);
    if (action === 'reply') { setReplyTarget(message); return; }
    if (action === 'copy') {
      if (!visibleBody) { notify('مفيش نص للنسخ.'); return; }
      await Clipboard.setStringAsync(visibleBody);
      notify('تم نسخ الرسالة.');
      return;
    }
    if (action === 'love' || action === 'thumbs_up') {
      if (message.localStatus) return;
      void Haptics.selectionAsync().catch(() => undefined);
      const result = await toggleNativeDirectReaction(message.id, action);
      if (!result.ok) notify('تعذر تحديث التفاعل.');
      await loadLatestMessages({ silent: true, keepExisting: true });
      return;
    }
    if (action === 'save_dolab') {
      if (message.localStatus) return;
      await saveMessageToDolab(message);
      return;
    }
    if (action === 'delete') {
      if (!mine || message.localStatus) return;
      const result = await deleteNativeDirectMessage(message.id);
      notify(result.ok ? 'تم حذف الرسالة.' : result.message);
      if (result.ok) await loadLatestMessages({ silent: true, keepExisting: true });
      return;
    }
    if (action === 'report') {
      if (mine || !conversation?.otherUserId) return;
      router.push({
        pathname: '/report/direct-message/[messageId]',
        params: { messageId: message.id, conversationId, reportedUserId: conversation.otherUserId },
      });
      return;
    }
    if (action === 'retry' && message.localStatus === 'failed') {
      setMessages((prev) => prev.filter((item) => item.id !== message.id));
      setBody(visibleBody);
      setPendingAttachments(message.localPreviewAttachments ?? []);
      setReplyTarget(message.replyToMessageId ? messages.find((item) => item.id === message.replyToMessageId) ?? null : null);
    }
  }, [conversation?.otherUserId, conversationId, loadLatestMessages, messages, notify, saveMessageToDolab, selectedMessage, user?.id]);

  const openGalleryItem = useCallback(async (item: ChatAttachmentGalleryItem) => {
    if (!item.uri) { notify('المرفق لسه بيتجهز.'); return; }
    Keyboard.dismiss();
    if (item.kind === 'image' || item.kind === 'video') {
      setMediaViewer({ kind: item.kind, url: item.uri, title: item.fileName });
      return;
    }
    try { await Linking.openURL(item.uri); } catch { notify('تعذر فتح الملف.'); }
  }, [notify]);

  const lastOwnMessageId = useMemo(
    () => [...messages].reverse().find((message) => message.senderId === user?.id && !message.localStatus)?.id ?? null,
    [messages, user?.id],
  );

  if (!user?.id) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل الدخول لفتح الرسائل." /></AppScreen>;
  if (!conversationId) return <AppScreen><EmptyState title="محادثة غير صالحة" description="تعذر فتح المحادثة." /></AppScreen>;
  if (loading) return <AppScreen style={styles.fullScreen} backgroundVariant="none"><View style={styles.centerState}><ActivityIndicator color={colors.primary} /><AppText muted>بنجهز المحادثة...</AppText></View></AppScreen>;
  if (!conversation) return <AppScreen><View style={styles.centerState}><EmptyState title="تعذر فتح المحادثة" description={error ?? 'المحادثة لم تعد متاحة.'} /><AppButton label="إعادة المحاولة" onPress={() => { void initialLoad(); }} /></View></AppScreen>;

  const typingLabel = typingUsers.length ? `${conversation.otherDisplayName ?? 'الطرف الآخر'} يكتب...` : null;
  const statusLabel = realtimeStatus === 'offline' ? 'جاري إعادة الاتصال...' : 'مراسلة';

  return (
    <AppScreen style={styles.fullScreen} backgroundVariant="none">
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </Pressable>
        <Pressable style={styles.identity} onPress={() => router.push(`/profile/${conversation.otherUserId}`)}>
          <View style={styles.avatarWrap}>
            {conversation.otherAvatarUrl ? <ExpoImage source={{ uri: conversation.otherAvatarUrl }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" /> : <Ionicons name="person" size={21} color={colors.textMuted} />}
          </View>
          <View style={styles.identityCopy}>
            <AppText weight="bold" numberOfLines={1} style={styles.name}>{conversation.otherDisplayName ?? 'مستخدم تِسوى'}</AppText>
            <View style={styles.statusRow}>
              <AppText muted style={styles.headerStatus} numberOfLines={1}>{typingLabel ?? (conversation.status === 'accepted' ? statusLabel : conversation.status === 'requested' ? 'طلب مراسلة' : 'المحادثة متوقفة')}</AppText>
            </View>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="خيارات المحادثة" style={styles.headerButton} onPress={() => presentAfterKeyboard(conversationActionsRef)}>
          <Ionicons name="ellipsis-horizontal" size={21} color={colors.text} />
        </Pressable>
      </View>

      {isReceiverOnRequest ? (
        <View style={styles.requestBanner}>
          <View style={styles.requestCopy}>
            <AppText weight="bold">طلب مراسلة</AppText>
            <AppText muted style={styles.requestText}>اقبل لو حابب تكملوا الكلام. تجاهل الطلب لو مش مناسب.</AppText>
          </View>
          <View style={styles.requestActions}>
            <AppButton label="قبول" onPress={async () => { const result = await acceptDirectMessageRequest(conversationId); notify(result.message); if (result.ok) await initialLoad(); }} />
            <AppButton label="تجاهل" variant="neutral" onPress={async () => { const result = await ignoreDirectMessageRequest(conversationId); notify(result.message); if (result.ok) await initialLoad(); }} />
          </View>
        </View>
      ) : null}
      {isRequesterOnRequest ? <View style={styles.slimBanner}><Ionicons name="time-outline" size={15} color={colors.textMuted} /><AppText muted style={styles.slimBannerText}>رسالتك اتبعت كطلب. تقدر تكمل لما الطرف التاني يقبل.</AppText></View> : null}
      {blockedByMe ? <View style={styles.slimBanner}><Ionicons name="ban-outline" size={15} color={colors.danger} /><AppText muted style={styles.slimBannerText}>أنت حاظر المستخدم. ألغِ الحظر لاستكمال المراسلة.</AppText></View> : null}
      {blockedMe && !blockedByMe ? <View style={styles.slimBanner}><Ionicons name="lock-closed-outline" size={15} color={colors.textMuted} /><AppText muted style={styles.slimBannerText}>المراسلة غير متاحة بين الحسابين حاليًا.</AppText></View> : null}

      <View style={styles.listArea}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(message) => message.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.messagesContent, messages.length === 0 && styles.emptyMessagesContent]}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            const distance = contentSize.height - (contentOffset.y + layoutMeasurement.height);
            isNearBottomRef.current = distance < 150;
            if (distance < 90) setNewMessagesAvailable(false);
          }}
          scrollEventThrottle={80}
          onContentSizeChange={() => {
            if (initialScrollDoneRef.current || !messages.length) return;
            initialScrollDoneRef.current = true;
            requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
          }}
          ListHeaderComponent={hasMore ? (
            <Pressable style={styles.loadOlder} disabled={loadingOlder} onPress={() => { void loadOlder(); }}>
              {loadingOlder ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="chevron-up" size={16} color={colors.primary} />}
              <AppText weight="semibold" style={styles.loadOlderText}>رسائل أقدم</AppText>
            </Pressable>
          ) : <View style={styles.topSpacer} />}
          ListEmptyComponent={<View style={styles.emptyThread}><View style={styles.emptyThreadIcon}><Ionicons name="chatbubble-ellipses-outline" size={25} color={colors.primary} /></View><AppText weight="bold">ابدأوا الكلام</AppText><AppText muted style={styles.emptyThreadText}>رسالة بسيطة كفاية تفتح مساحة للتفاهم.</AppText></View>}
          renderItem={({ item, index }) => {
            const mine = item.senderId === user.id;
            const previous = index > 0 ? messages[index - 1] : null;
            const showDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(item.createdAt).toDateString();
            const loveCount = item.reactions.filter((reaction) => reaction.reaction === 'love').length;
            const likeCount = item.reactions.filter((reaction) => reaction.reaction === 'thumbs_up').length;
            const ownLove = item.reactions.some((reaction) => reaction.userId === user.id && reaction.reaction === 'love');
            const ownLike = item.reactions.some((reaction) => reaction.userId === user.id && reaction.reaction === 'thumbs_up');
            const status = item.localStatus === 'sending' ? 'جاري الإرسال' : item.localStatus === 'failed' ? 'فشل الإرسال • اضغط مطولًا للمحاولة' : item.id === lastOwnMessageId ? (item.readAt ? 'شوهدت' : 'تم الإرسال') : null;
            const remoteGallery: ChatAttachmentGalleryItem[] = item.attachments
              .filter((attachment) => attachment.kind !== 'audio')
              .map((attachment) => ({
                id: attachment.id ?? attachment.storagePath,
                kind: attachment.kind as 'image' | 'video' | 'file',
                uri: resolvedUrls[attachmentKey(attachment)] ?? null,
                fileName: attachment.fileName,
                mimeType: attachment.mimeType,
                sizeBytes: attachment.sizeBytes,
              }));
            const localGallery: ChatAttachmentGalleryItem[] = (item.localPreviewAttachments ?? [])
              .filter((attachment) => attachment.kind !== 'audio')
              .map((attachment) => ({ id: attachment.id, kind: attachment.kind as 'image' | 'video' | 'file', uri: attachment.uri, fileName: attachment.fileName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes }));
            const audioAttachments = item.attachments.filter((attachment) => attachment.kind === 'audio');
            const visibleBody = displayMessageBody(item);
            return (
              <View style={[styles.messageBlock, (loveCount || likeCount) ? styles.messageBlockWithReaction : null]}>
                {showDay ? <View style={styles.dayWrap}><AppText muted style={styles.dayText}>{formatDay(item.createdAt)}</AppText></View> : null}
                <MessageBubble
                  mine={mine}
                  text={visibleBody}
                  timeLabel={formatClock(item.createdAt)}
                  statusLabel={status}
                  deleted={!!item.deletedAt}
                  replyLabel={item.replyToMessageId ? (item.replySenderId === user.id ? 'أنت' : conversation.otherDisplayName ?? 'رسالة') : null}
                  replyText={item.replyBody}
                  reactions={[
                    { key: 'love', label: '❤️', count: loveCount, active: ownLove },
                    { key: 'thumbs_up', label: '👍', count: likeCount, active: ownLike },
                  ]}
                  onLongPress={() => { setSelectedMessage(item); presentAfterKeyboard(messageActionsRef); }}
                >
                  {audioAttachments.map((attachment) => {
                    const voiceId = `${item.id}:${attachment.storagePath}`;
                    const activeVoice = playingVoiceId === voiceId;
                    return (
                      <VoiceMessageBubble
                        key={attachmentKey(attachment)}
                        mine={mine}
                        durationMs={attachment.durationMs ?? (activeVoice ? (playerStatus.duration ?? 0) * 1000 : 0)}
                        positionMs={activeVoice ? (playerStatus.currentTime ?? 0) * 1000 : 0}
                        playing={activeVoice && !!playerStatus.playing}
                        loading={voiceLoadingId === voiceId}
                        onPress={() => { void toggleVoice(item, attachment); }}
                      />
                    );
                  })}
                  {remoteGallery.length ? <ChatAttachmentGallery items={remoteGallery} onPress={(galleryItem) => { void openGalleryItem(galleryItem); }} /> : null}
                  {localGallery.length ? <ChatAttachmentGallery items={localGallery} onPress={(galleryItem) => { void openGalleryItem(galleryItem); }} /> : null}
                </MessageBubble>
              </View>
            );
          }}
          ListFooterComponent={typingLabel ? <View style={styles.typingPill}><View style={styles.typingDots}><View style={styles.typingDot} /><View style={styles.typingDot} /><View style={styles.typingDot} /></View><AppText muted style={styles.typingLabel}>{typingLabel}</AppText></View> : <View style={styles.bottomSpacer} />}
        />
        {newMessagesAvailable ? (
          <Pressable style={styles.newMessagesButton} onPress={() => { setNewMessagesAvailable(false); listRef.current?.scrollToEnd({ animated: true }); }}>
            <Ionicons name="arrow-down" size={15} color={colors.background} />
            <AppText weight="semibold" style={styles.newMessagesText}>رسائل جديدة</AppText>
          </Pressable>
        ) : null}
      </View>

      <KeyboardStickyView enabled={keyboardVisible} offset={{ opened: 0, closed: 0 }}>
        <ChatComposer
          value={body}
          onChangeText={onChangeBody}
          onSend={() => { void sendCurrent(); }}
          onPressAttachment={accepted && !interactionBlocked ? () => presentAfterKeyboard(attachmentActionsRef) : undefined}
          onPressVoice={accepted && !interactionBlocked ? () => { void startVoiceRecording(); } : undefined}
          disabled={!accepted || interactionBlocked}
          sending={sending}
          hasPendingPayload={pendingAttachments.length > 0}
          maxLength={1200}
          voiceDisabled={recordingBusy || sending || pendingAttachments.length > 0}
          attachmentDisabled={sending || recordingActive}
          placeholder={accepted ? (interactionBlocked ? 'المراسلة غير متاحة' : 'رسالة...') : 'المراسلة متاحة بعد قبول الطلب'}
          reply={replyTarget ? { label: `رد على ${replyTarget.senderId === user.id ? 'رسالتك' : conversation.otherDisplayName ?? 'الرسالة'}`, text: displayMessageBody(replyTarget) || 'مرفق', onClear: () => setReplyTarget(null) } : null}
          recording={recordingActive ? { active: true, elapsedLabel: formatDuration(recorderState.durationMillis ?? 0), busy: recordingBusy, sending: voiceSending, onCancel: () => { void cancelVoiceRecording(); }, onSend: () => { void stopAndSendVoice(); } } : null}
          topSlot={<PendingAttachmentStrip items={pendingAttachments} onRemove={(attachmentId) => setPendingAttachments((prev) => prev.filter((item) => item.id !== attachmentId))} progress={sendProgress} />}
        />
      </KeyboardStickyView>

      {error ? <View style={styles.errorToast}><Ionicons name="alert-circle-outline" size={16} color={colors.danger} /><AppText style={styles.errorText}>{error}</AppText><Pressable onPress={() => { setError(null); void loadLatestMessages(); }}><AppText weight="semibold" style={styles.retryText}>حاول تاني</AppText></Pressable></View> : null}

      <ChatMediaViewer item={mediaViewer} onClose={() => setMediaViewer(null)} />

      <AppActionSheet
        ref={attachmentActionsRef}
        title="إضافة للمحادثة"
        description="اختار ميديا، ملف، أو حاجة من دولابك."
        snapPoints={['58%']}
        actions={[
          { label: 'صور وفيديوهات', iconName: 'images-outline', onPress: () => { void pickMedia(); } },
          { label: 'الكاميرا', iconName: 'camera-outline', onPress: () => { void captureMedia(); } },
          { label: 'ملفات', iconName: 'document-outline', onPress: () => { void pickFiles(); } },
          { label: 'من الدولاب', iconName: 'file-tray-stacked-outline', onPress: openDolab },
        ]}
      />

      <DolabShareSheet
        ref={dolabShareRef}
        items={dolabItems}
        loading={dolabLoading}
        error={dolabError}
        onReload={() => { void loadDolabItems(); }}
        onSelect={selectDolabItem}
      />

      <AppActionSheet
        ref={conversationActionsRef}
        title="خيارات المحادثة"
        actions={[
          { label: 'عرض البروفايل', iconName: 'person-outline', onPress: () => { conversationActionsRef.current?.dismiss(); router.push(`/profile/${conversation.otherUserId}`); } },
          { label: 'الإبلاغ عن المستخدم', iconName: 'flag-outline', tone: 'danger', onPress: () => { conversationActionsRef.current?.dismiss(); router.push(`/report/user/${conversation.otherUserId}`); } },
          { label: blockBusy ? 'جاري التنفيذ...' : blockedByMe ? 'إلغاء الحظر' : 'حظر المستخدم', iconName: 'ban-outline', tone: 'danger', disabled: blockBusy, onPress: () => { conversationActionsRef.current?.dismiss(); void onToggleBlock(); } },
        ]}
      />

      <AppActionSheet
        ref={messageActionsRef}
        title="خيارات الرسالة"
        snapPoints={['64%', '82%']}
        actions={[
          { label: 'رد', iconName: 'arrow-undo-outline', onPress: () => { void runMessageAction('reply'); } },
          { label: 'نسخ النص', iconName: 'copy-outline', disabled: !selectedMessage || !displayMessageBody(selectedMessage), onPress: () => { void runMessageAction('copy'); } },
          { label: '❤️ تفاعل', onPress: () => { void runMessageAction('love'); }, disabled: !!selectedMessage?.localStatus },
          { label: '👍 تفاعل', onPress: () => { void runMessageAction('thumbs_up'); }, disabled: !!selectedMessage?.localStatus },
          { label: 'احفظ في الدولاب', iconName: 'file-tray-stacked-outline', disabled: !!selectedMessage?.localStatus, onPress: () => { void runMessageAction('save_dolab'); } },
          ...(selectedMessage?.localStatus === 'failed' ? [{ label: 'إعادة الإرسال', iconName: 'refresh-outline' as const, onPress: () => { void runMessageAction('retry'); } }] : []),
          ...(selectedMessage?.senderId === user.id && !selectedMessage?.localStatus ? [{ label: 'حذف رسالتي', iconName: 'trash-outline' as const, tone: 'danger' as const, onPress: () => { void runMessageAction('delete'); } }] : []),
          ...(selectedMessage?.senderId !== user.id && !selectedMessage?.localStatus ? [{ label: 'الإبلاغ عن الرسالة', iconName: 'flag-outline' as const, tone: 'danger' as const, onPress: () => { void runMessageAction('report'); } }] : []),
        ]}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  fullScreen: { padding: 0, backgroundColor: colors.background },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  header: {
    minHeight: 64,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  headerButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  identity: { flex: 1, minWidth: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  avatarWrap: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatar: { width: '100%', height: '100%' },
  identityCopy: { flex: 1, minWidth: 0, gap: 2, alignItems: 'flex-end' },
  name: { fontSize: 15.5 },
  statusRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  headerStatus: { fontSize: 11.5, textAlign: 'right' },
  requestBanner: { margin: 10, gap: 10, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: colors.primarySoft, backgroundColor: colors.surface },
  requestCopy: { gap: 3 },
  requestText: { fontSize: 12.5, lineHeight: 18, textAlign: 'right' },
  requestActions: { flexDirection: 'row-reverse', gap: 8 },
  slimBanner: { marginHorizontal: 10, marginTop: 8, flexDirection: 'row-reverse', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 13, backgroundColor: colors.surface },
  slimBannerText: { flex: 1, fontSize: 12, textAlign: 'right' },
  listArea: { flex: 1, position: 'relative' },
  messagesContent: { paddingHorizontal: 0, paddingBottom: 18, gap: 4 },
  emptyMessagesContent: { flexGrow: 1, justifyContent: 'center' },
  messageBlock: { gap: 3, marginBottom: 3 },
  messageBlockWithReaction: { marginBottom: 15 },
  dayWrap: { alignItems: 'center', paddingVertical: 12 },
  dayText: { fontSize: 11, backgroundColor: colors.surface, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  loadOlder: { alignSelf: 'center', flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginVertical: 10, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: colors.surface },
  loadOlderText: { color: colors.primary, fontSize: 12 },
  topSpacer: { height: 10 },
  bottomSpacer: { height: 12 },
  emptyThread: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 36 },
  emptyThreadIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyThreadText: { textAlign: 'center', lineHeight: 19 },
  typingPill: { alignSelf: 'flex-start', marginLeft: 12, marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 15, backgroundColor: colors.surface },
  typingDots: { flexDirection: 'row', gap: 3 },
  typingDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.textMuted },
  typingLabel: { fontSize: 11.5 },
  newMessagesButton: { position: 'absolute', bottom: 10, alignSelf: 'center', flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.primary },
  newMessagesText: { color: colors.background, fontSize: 12 },
  errorToast: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, textAlign: 'right' },
  retryText: { color: colors.primary, fontSize: 12 },
});
