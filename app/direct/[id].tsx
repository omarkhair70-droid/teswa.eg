import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
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
import { ChatComposer } from '@/components/messaging/ChatComposer';
import { MessageBubble } from '@/components/messaging/MessageBubble';
import { VoiceMessageBubble } from '@/components/messaging/VoiceMessageBubble';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
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
import {
  blockUserFromMobile,
  fetchUserBlockState,
  unblockUserFromMobile,
} from '@/lib/user-blocks';
import { showToast } from '@/lib/toast';

type UiMessage = NativeDirectMessage & { localStatus?: 'sending' | 'failed' };
type LocalAttachment = {
  kind: 'image' | 'video' | 'file';
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

type SelectedMedia = { url: string; title?: string | null } | null;

const PAGE_SIZE = 50;
const MAX_VOICE_DURATION_MS = 120_000;

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

export default function DirectConversationScreen() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const conversationId = (Array.isArray(id) ? id[0] : id)?.trim() ?? '';
  const listRef = useRef<FlatList<UiMessage>>(null);
  const messageActionsRef = useRef<BottomSheetModal>(null);
  const conversationActionsRef = useRef<BottomSheetModal>(null);
  const attachmentActionsRef = useRef<BottomSheetModal>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [pendingAttachment, setPendingAttachment] = useState<LocalAttachment | null>(null);
  const [replyTarget, setReplyTarget] = useState<UiMessage | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<UiMessage | null>(null);
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string | null>>({});
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia>(null);
  const [newMessagesAvailable, setNewMessagesAvailable] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);

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
  const canCompose = !!accepted && !blockedByMe && !sending;
  const isReceiverOnRequest = conversation?.status === 'requested' && conversation.requestedBy !== user?.id;
  const isRequesterOnRequest = conversation?.status === 'requested' && conversation.requestedBy === user?.id;

  const notify = useCallback((title: string) => showToast({ title }), []);

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

  useEffect(() => {
    if (!user?.id || !conversation?.otherUserId) return;
    let cancelled = false;
    void fetchUserBlockState(user.id, conversation.otherUserId).then((result) => {
      if (!cancelled && result.ok) setBlockedByMe(result.state.blockedByMe);
    });
    return () => { cancelled = true; };
  }, [conversation?.otherUserId, user?.id]);

  const refreshTyping = useCallback(async () => {
    if (!accepted || !conversationId || !user?.id) return;
    const users = await fetchNativeDirectTypingUsers(conversationId);
    setTypingUsers(users.filter((idValue) => idValue !== user.id));
  }, [accepted, conversationId, user?.id]);

  useEffect(() => {
    if (!accepted || !conversationId) {
      setRealtimeStatus('offline');
      setTypingUsers([]);
      return;
    }
    setRealtimeStatus('connecting');
    const stop = subscribeToNativeDirectConversation(conversationId, {
      onMessagesChanged: () => {
        void loadLatestMessages({ silent: true, keepExisting: true }).then(() => {
          if (isNearBottomRef.current) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
          else setNewMessagesAvailable(true);
        });
      },
      onAttachmentsChanged: () => { void loadLatestMessages({ silent: true, keepExisting: true }); },
      onReactionsChanged: () => { void loadLatestMessages({ silent: true, keepExisting: true }); },
      onTypingChanged: () => { void refreshTyping(); },
      onStatus: (status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setRealtimeStatus('offline');
      },
    });
    void refreshTyping();
    return () => stop();
  }, [accepted, conversationId, loadLatestMessages, refreshTyping]);

  useEffect(() => {
    let cancelled = false;
    const missing = messages.flatMap((message) => message.attachments).filter((attachment) => resolvedUrls[attachmentKey(attachment)] === undefined);
    if (!missing.length) return;
    void Promise.all(missing.map(async (attachment) => {
      const key = attachmentKey(attachment);
      const url = await createNativeDirectAttachmentSignedUrl(
        attachment.storagePath,
        60 * 60,
        attachment.storageBucket,
      );
      return { key, url };
    })).then((entries) => {
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
    if (!accepted) return;
    const now = Date.now();
    if (now - lastTypingSentAtRef.current > 1200) {
      lastTypingSentAtRef.current = now;
      void setNativeDirectTypingState(conversationId, true);
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => { void setNativeDirectTypingState(conversationId, false); }, 1800);
  }, [accepted, conversationId]);

  useEffect(() => () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (accepted) void setNativeDirectTypingState(conversationId, false);
  }, [accepted, conversationId]);

  const sendCurrent = useCallback(async () => {
    if (!canCompose || !user?.id) return;
    const trimmed = body.trim();
    if (!trimmed && !pendingAttachment) return;
    setSending(true);
    setError(null);
    const localId = `local-${Date.now()}`;
    const optimistic: UiMessage | null = !pendingAttachment && trimmed ? {
      id: localId,
      senderId: user.id,
      body: trimmed,
      messageType: 'text',
      createdAt: new Date().toISOString(),
      readAt: null,
      replyToMessageId: replyTarget?.id ?? null,
      replySenderId: replyTarget?.senderId ?? null,
      replyBody: replyTarget?.body ?? null,
      metadata: {},
      deletedAt: null,
      attachments: [],
      reactions: [],
      localStatus: 'sending',
    } : null;
    if (optimistic) {
      setMessages((prev) => [...prev, optimistic]);
      setBody('');
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }

    let uploaded: NativeDirectAttachment | null = null;
    try {
      if (pendingAttachment) {
        const upload = await uploadNativeDirectAttachment({
          conversationId,
          currentUserId: user.id,
          localUri: pendingAttachment.uri,
          kind: pendingAttachment.kind,
          fileName: pendingAttachment.fileName,
          mimeType: pendingAttachment.mimeType,
          sizeBytes: pendingAttachment.sizeBytes,
        });
        if (!upload.ok) throw new Error(upload.message);
        uploaded = upload.attachment;
      }

      const result = await sendNativeDirectMessage({
        conversationId,
        body: trimmed || null,
        replyToMessageId: replyTarget?.id ?? null,
        attachments: uploaded ? [uploaded] : [],
      });
      if (!result.ok) throw new Error(result.message);

      if (optimistic) setMessages((prev) => prev.filter((message) => message.id !== localId));
      setBody('');
      setPendingAttachment(null);
      setReplyTarget(null);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      await loadLatestMessages({ silent: true, keepExisting: true });
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (sendError) {
      if (uploaded) await removeNativeDirectUploads([uploaded.storagePath]);
      const message = sendError instanceof Error ? sendError.message : 'تعذر إرسال الرسالة حالياً.';
      if (optimistic) {
        setMessages((prev) => prev.map((item) => item.id === localId ? { ...item, localStatus: 'failed' } : item));
      }
      notify(message);
    } finally {
      setSending(false);
    }
  }, [body, canCompose, conversationId, loadLatestMessages, notify, pendingAttachment, replyTarget, user?.id]);

  const startVoiceRecording = useCallback(async () => {
    if (!canCompose || recordingActive) return;
    setRecordingBusy(true);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        notify('محتاجين إذن الميكروفون لتسجيل رسالة صوتية.');
        return;
      }
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
      const result = await sendNativeDirectMessage({
        conversationId,
        body: body.trim() || null,
        replyToMessageId: replyTarget?.id ?? null,
        attachments: [upload.attachment],
      });
      if (!result.ok) {
        await removeNativeDirectUploads([upload.attachment.storagePath]);
        throw new Error(result.message);
      }
      setBody('');
      setReplyTarget(null);
      setRecordingActive(false);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      await loadLatestMessages({ silent: true, keepExisting: true });
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (voiceError) {
      notify(voiceError instanceof Error ? voiceError.message : 'تعذر إرسال الرسالة الصوتية.');
      setRecordingActive(false);
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
        url = await createNativeDirectAttachmentSignedUrl(attachment.storagePath, 60 * 60, attachment.storageBucket);
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

  const pickImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { notify('نحتاج إذن الصور لاختيار صورة.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.86 });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setPendingAttachment({ kind: 'image', uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType, sizeBytes: asset.fileSize });
    attachmentActionsRef.current?.dismiss();
  }, [notify]);

  const pickVideo = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { notify('نحتاج إذن الصور لاختيار فيديو.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsMultipleSelection: false });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setPendingAttachment({ kind: 'video', uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType, sizeBytes: asset.fileSize });
    attachmentActionsRef.current?.dismiss();
  }, [notify]);

  const pickFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: false });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setPendingAttachment({ kind: 'file', uri: asset.uri, fileName: asset.name, mimeType: asset.mimeType, sizeBytes: asset.size });
    attachmentActionsRef.current?.dismiss();
  }, []);

  const onToggleBlock = useCallback(async () => {
    if (!user?.id || !conversation?.otherUserId || blockBusy) return;
    setBlockBusy(true);
    try {
      const result = blockedByMe
        ? await unblockUserFromMobile(user.id, conversation.otherUserId)
        : await blockUserFromMobile(user.id, conversation.otherUserId);
      notify(result.message);
      if (result.ok) {
        const state = await fetchUserBlockState(user.id, conversation.otherUserId);
        if (state.ok) setBlockedByMe(state.state.blockedByMe);
        await loadConversation();
      }
    } finally {
      setBlockBusy(false);
    }
  }, [blockBusy, blockedByMe, conversation?.otherUserId, loadConversation, notify, user?.id]);

  const runMessageAction = useCallback(async (action: 'reply' | 'copy' | 'love' | 'thumbs_up' | 'delete' | 'report' | 'retry') => {
    const message = selectedMessage;
    messageActionsRef.current?.dismiss();
    if (!message) return;
    const mine = message.senderId === user?.id;
    if (action === 'reply') { setReplyTarget(message); return; }
    if (action === 'copy') {
      if (!message.body.trim()) { notify('مفيش نص للنسخ.'); return; }
      await Clipboard.setStringAsync(message.body);
      notify('تم نسخ الرسالة.');
      return;
    }
    if (action === 'love' || action === 'thumbs_up') {
      if (message.localStatus) return;
      const result = await toggleNativeDirectReaction(message.id, action);
      if (!result.ok) notify('تعذر تحديث التفاعل.');
      await loadLatestMessages({ silent: true, keepExisting: true });
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
      setBody(message.body);
      setReplyTarget(null);
    }
  }, [conversation?.otherUserId, conversationId, loadLatestMessages, notify, selectedMessage, user?.id]);

  const openAttachment = useCallback(async (attachment: NativeDirectAttachment) => {
    const url = resolvedUrls[attachmentKey(attachment)];
    if (!url) { notify('المرفق لسه بيتجهز.'); return; }
    if (attachment.kind === 'image') {
      setSelectedMedia({ url, title: attachment.fileName });
      return;
    }
    try { await Linking.openURL(url); } catch { notify('تعذر فتح المرفق.'); }
  }, [notify, resolvedUrls]);

  const renderAttachment = useCallback((message: UiMessage, attachment: NativeDirectAttachment) => {
    const url = resolvedUrls[attachmentKey(attachment)];
    if (attachment.kind === 'audio') {
      const voiceId = `${message.id}:${attachment.storagePath}`;
      const active = playingVoiceId === voiceId;
      return (
        <VoiceMessageBubble
          mine={message.senderId === user?.id}
          durationMs={attachment.durationMs ?? (active ? (playerStatus.duration ?? 0) * 1000 : 0)}
          positionMs={active ? (playerStatus.currentTime ?? 0) * 1000 : 0}
          playing={active && !!playerStatus.playing}
          loading={voiceLoadingId === voiceId}
          onPress={() => { void toggleVoice(message, attachment); }}
        />
      );
    }
    if (attachment.kind === 'image' && url) {
      return (
        <Pressable onPress={() => { void openAttachment(attachment); }} style={({ pressed }) => pressed && styles.mediaPressed}>
          <Image source={{ uri: url }} style={styles.inlineImage} />
        </Pressable>
      );
    }
    return (
      <Pressable onPress={() => { void openAttachment(attachment); }} style={({ pressed }) => [styles.fileCard, pressed && styles.mediaPressed]}>
        <View style={styles.fileIcon}>
          <Ionicons name={attachment.kind === 'video' ? 'play' : 'document-text-outline'} size={19} color={colors.primary} />
        </View>
        <View style={styles.fileCopy}>
          <AppText weight="semibold" numberOfLines={1}>{attachment.fileName || (attachment.kind === 'video' ? 'فيديو' : 'ملف')}</AppText>
          <AppText muted style={styles.fileMeta}>{url ? 'اضغط للفتح' : 'جاري تجهيز المرفق...'}</AppText>
        </View>
      </Pressable>
    );
  }, [openAttachment, playerStatus.currentTime, playerStatus.duration, playerStatus.playing, playingVoiceId, resolvedUrls, toggleVoice, user?.id, voiceLoadingId]);

  const lastOwnMessageId = useMemo(() => [...messages].reverse().find((message) => message.senderId === user?.id && !message.localStatus)?.id ?? null, [messages, user?.id]);

  if (!user?.id) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل الدخول لفتح الرسائل." /></AppScreen>;
  if (!conversationId) return <AppScreen><EmptyState title="محادثة غير صالحة" description="تعذر فتح المحادثة." /></AppScreen>;
  if (loading) return <AppScreen style={styles.fullScreen} backgroundVariant="none"><View style={styles.centerState}><ActivityIndicator color={colors.primary} /><AppText muted>بنجهز المحادثة...</AppText></View></AppScreen>;
  if (!conversation) return <AppScreen><View style={styles.centerState}><EmptyState title="تعذر فتح المحادثة" description={error ?? 'المحادثة لم تعد متاحة.'} /><AppButton label="إعادة المحاولة" onPress={() => { void initialLoad(); }} /></View></AppScreen>;

  const typingLabel = typingUsers.length ? `${conversation.otherDisplayName ?? 'الطرف الآخر'} يكتب...` : null;
  const statusLabel = realtimeStatus === 'live' ? 'متصل' : realtimeStatus === 'connecting' ? 'جاري الاتصال' : 'سيُعاد الاتصال تلقائيًا';

  return (
    <AppScreen style={styles.fullScreen} backgroundVariant="none">
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </Pressable>
        <Pressable style={styles.identity} onPress={() => router.push(`/profile/${conversation.otherUserId}`)}>
          <View style={styles.avatarWrap}>
            {conversation.otherAvatarUrl ? <Image source={{ uri: conversation.otherAvatarUrl }} style={styles.avatar} /> : <Ionicons name="person" size={21} color={colors.textMuted} />}
          </View>
          <View style={styles.identityCopy}>
            <AppText weight="bold" numberOfLines={1} style={styles.name}>{conversation.otherDisplayName ?? 'مستخدم تِسوى'}</AppText>
            <View style={styles.statusRow}>
              {accepted ? <View style={[styles.statusDot, realtimeStatus !== 'live' && styles.statusDotMuted]} /> : null}
              <AppText muted style={styles.headerStatus} numberOfLines={1}>{typingLabel ?? (conversation.status === 'accepted' ? statusLabel : conversation.status === 'requested' ? 'طلب مراسلة' : 'المحادثة متوقفة')}</AppText>
            </View>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="خيارات المحادثة" style={styles.headerButton} onPress={() => conversationActionsRef.current?.present()}>
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
      {isRequesterOnRequest ? <View style={styles.slimBanner}><Ionicons name="time-outline" size={15} color={colors.textMuted} /><AppText muted style={styles.slimBannerText}>طلبك اتبعت. تقدر تكمل لما الطرف التاني يقبل.</AppText></View> : null}
      {blockedByMe ? <View style={styles.slimBanner}><Ionicons name="ban-outline" size={15} color={colors.danger} /><AppText muted style={styles.slimBannerText}>أنت حاظر المستخدم. ألغِ الحظر لاستكمال المراسلة.</AppText></View> : null}

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
            const status = item.localStatus === 'sending' ? 'جاري الإرسال' : item.localStatus === 'failed' ? 'فشل الإرسال' : item.id === lastOwnMessageId ? (item.readAt ? 'شوهدت' : 'تم الإرسال') : null;
            return (
              <View style={styles.messageBlock}>
                {showDay ? <View style={styles.dayWrap}><AppText muted style={styles.dayText}>{formatDay(item.createdAt)}</AppText></View> : null}
                <MessageBubble
                  mine={mine}
                  text={item.attachments.length ? item.body : item.body}
                  timeLabel={formatClock(item.createdAt)}
                  statusLabel={status}
                  deleted={!!item.deletedAt}
                  replyLabel={item.replyToMessageId ? (item.replySenderId === user.id ? 'أنت' : conversation.otherDisplayName ?? 'رسالة') : null}
                  replyText={item.replyBody}
                  reactions={[
                    { key: 'love', label: '❤️', count: loveCount, active: ownLove },
                    { key: 'thumbs_up', label: '👍', count: likeCount, active: ownLike },
                  ]}
                  onLongPress={() => { setSelectedMessage(item); messageActionsRef.current?.present(); }}
                >
                  {item.attachments.map((attachment) => <View key={attachmentKey(attachment)}>{renderAttachment(item, attachment)}</View>)}
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

      <KeyboardStickyView offset={{ opened: 4, closed: 0 }}>
        <ChatComposer
          value={body}
          onChangeText={onChangeBody}
          onSend={() => { void sendCurrent(); }}
          onPressAttachment={accepted ? () => attachmentActionsRef.current?.present() : undefined}
          onPressVoice={accepted ? () => { void startVoiceRecording(); } : undefined}
          disabled={!accepted || blockedByMe}
          sending={sending}
          hasPendingPayload={!!pendingAttachment}
          voiceDisabled={recordingBusy || sending}
          attachmentDisabled={sending}
          placeholder={accepted ? 'رسالة...' : 'المراسلة متاحة بعد قبول الطلب'}
          reply={replyTarget ? { label: `رد على ${replyTarget.senderId === user.id ? 'رسالتك' : conversation.otherDisplayName ?? 'الرسالة'}`, text: replyTarget.body || 'رسالة', onClear: () => setReplyTarget(null) } : null}
          recording={recordingActive ? { active: true, elapsedLabel: formatDuration(recorderState.durationMillis ?? 0), busy: recordingBusy, sending: voiceSending, onCancel: () => { void cancelVoiceRecording(); }, onSend: () => { void stopAndSendVoice(); } } : null}
          topSlot={pendingAttachment ? (
            <View style={styles.pendingAttachment}>
              {pendingAttachment.kind === 'image' ? <Image source={{ uri: pendingAttachment.uri }} style={styles.pendingThumb} /> : <View style={styles.pendingFileIcon}><Ionicons name={pendingAttachment.kind === 'video' ? 'videocam-outline' : 'document-outline'} size={20} color={colors.primary} /></View>}
              <View style={styles.pendingCopy}><AppText weight="semibold" numberOfLines={1}>{pendingAttachment.fileName || (pendingAttachment.kind === 'image' ? 'صورة' : pendingAttachment.kind === 'video' ? 'فيديو' : 'ملف')}</AppText><AppText muted style={styles.pendingMeta}>جاهز للإرسال</AppText></View>
              <Pressable hitSlop={8} onPress={() => setPendingAttachment(null)} style={styles.pendingClose}><Ionicons name="close-circle" size={21} color={colors.textMuted} /></Pressable>
            </View>
          ) : null}
        />
      </KeyboardStickyView>

      {error ? <View style={styles.errorToast}><Ionicons name="alert-circle-outline" size={16} color={colors.danger} /><AppText style={styles.errorText}>{error}</AppText><Pressable onPress={() => { setError(null); void loadLatestMessages(); }}><AppText weight="semibold" style={styles.retryText}>حاول تاني</AppText></Pressable></View> : null}

      <Modal visible={!!selectedMedia} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setSelectedMedia(null)}>
        <View style={styles.viewerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedMedia(null)} />
          {selectedMedia ? <Image source={{ uri: selectedMedia.url }} style={styles.viewerImage} resizeMode="contain" /> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="إغلاق الصورة" onPress={() => setSelectedMedia(null)} style={styles.viewerClose}><Ionicons name="close" size={24} color={colors.background} /></Pressable>
        </View>
      </Modal>

      <AppActionSheet
        ref={attachmentActionsRef}
        title="إضافة للمحادثة"
        actions={[
          { label: 'صورة', onPress: () => { void pickImage(); } },
          { label: 'فيديو', onPress: () => { void pickVideo(); } },
          { label: 'ملف', onPress: () => { void pickFile(); } },
        ]}
      />
      <AppActionSheet
        ref={conversationActionsRef}
        title="خيارات المحادثة"
        actions={[
          { label: 'عرض البروفايل', onPress: () => { conversationActionsRef.current?.dismiss(); router.push(`/profile/${conversation.otherUserId}`); } },
          { label: 'الإبلاغ عن المستخدم', tone: 'danger', onPress: () => { conversationActionsRef.current?.dismiss(); router.push(`/report/user/${conversation.otherUserId}`); } },
          { label: blockBusy ? 'جاري التنفيذ...' : blockedByMe ? 'إلغاء الحظر' : 'حظر المستخدم', tone: 'danger', disabled: blockBusy, onPress: () => { conversationActionsRef.current?.dismiss(); void onToggleBlock(); } },
        ]}
      />
      <AppActionSheet
        ref={messageActionsRef}
        title="خيارات الرسالة"
        actions={[
          { label: 'رد', onPress: () => { void runMessageAction('reply'); } },
          { label: 'نسخ النص', disabled: !selectedMessage?.body?.trim(), onPress: () => { void runMessageAction('copy'); } },
          { label: '❤️ تفاعل', disabled: !!selectedMessage?.localStatus, onPress: () => { void runMessageAction('love'); } },
          { label: '👍 تفاعل', disabled: !!selectedMessage?.localStatus, onPress: () => { void runMessageAction('thumbs_up'); } },
          ...(selectedMessage?.localStatus === 'failed' ? [{ label: 'إعادة الإرسال', onPress: () => { void runMessageAction('retry'); } }] : []),
          ...(selectedMessage?.senderId === user.id && !selectedMessage?.localStatus ? [{ label: 'حذف رسالتي', tone: 'danger' as const, onPress: () => { void runMessageAction('delete'); } }] : []),
          ...(selectedMessage?.senderId !== user.id && !selectedMessage?.localStatus ? [{ label: 'الإبلاغ عن الرسالة', tone: 'danger' as const, onPress: () => { void runMessageAction('report'); } }] : []),
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
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  statusDotMuted: { backgroundColor: colors.textMuted },
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
  inlineImage: { width: 230, maxWidth: '100%', height: 200, borderRadius: 14, backgroundColor: colors.background },
  fileCard: { minWidth: 220, maxWidth: 270, flexDirection: 'row-reverse', alignItems: 'center', gap: 9, padding: 9, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.10)' },
  fileIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  fileCopy: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 2 },
  fileMeta: { fontSize: 10.5 },
  mediaPressed: { opacity: 0.68 },
  pendingAttachment: { minHeight: 58, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 8, borderRadius: 14, backgroundColor: colors.surface },
  pendingThumb: { width: 46, height: 46, borderRadius: 10 },
  pendingFileIcon: { width: 46, height: 46, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  pendingCopy: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 2 },
  pendingMeta: { fontSize: 11 },
  pendingClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  errorToast: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, textAlign: 'right' },
  retryText: { color: colors.primary, fontSize: 12 },
  viewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '82%' },
  viewerClose: { position: 'absolute', top: 54, right: 18, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
});
