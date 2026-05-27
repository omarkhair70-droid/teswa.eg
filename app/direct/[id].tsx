import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { AppActionSheet } from '@/components/sheets/AppActionSheet';
import { AppCard } from '@/components/ui/AppCard';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { radii } from '@/constants/radii';
import { useAuth } from '@/lib/auth';
import { acceptDirectMessageRequest, fetchDirectConversation, fetchDirectConversationMessages, ignoreDirectMessageRequest, sendDirectMessage } from '@/lib/direct-messages';
import { fetchStreamChatToken } from '@/lib/chat/stream-token';
import { getStreamDirectChannelConfig } from '@/lib/chat/stream-direct-mapping';
import { blockUserFromMobile, fetchUserBlockState, unblockUserFromMobile } from '@/lib/user-blocks';

const DIRECT_CHAT_PRO_ENABLED = true;
type StreamMessage = { id: string; text: string; createdAt: string; userId: string; userName?: string; reactionCounts?: Record<string, number>; ownReactions?: string[]; quotedMessage?: { id: string; text: string; userName?: string }; attachments?: Array<{ type?: string; title?: string; name?: string; assetUrl?: string; imageUrl?: string; thumbUrl?: string; mimeType?: string; fileSize?: number; durationSeconds?: number }> };
type PendingAttachment = { kind: 'image' | 'video' | 'file'; uri: string; fileName?: string; mimeType?: string; sizeBytes?: number };
type PendingVoice = { uri: string; fileName: string; mimeType: string; durationSeconds?: number };
type DirectConnectionState = 'idle' | 'connecting' | 'ready' | 'unavailable';

const statusMeta = {
  accepted: { label: 'Direct Chat Pro', sub: 'مساحة تفاوض مباشرة' },
  requested: { label: 'طلب مراسلة', sub: 'في انتظار قبول الطلب' },
  ignored: { label: 'تم التجاهل', sub: 'المحادثة غير متاحة' },
  blocked: { label: 'محظور', sub: 'المحادثة غير متاحة' },
} as const;

export default function DirectScreen() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const conversationId = Array.isArray(id) ? id[0] ?? '' : id ?? '';
  const [convo, setConvo] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [streamMessages, setStreamMessages] = useState<StreamMessage[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamConnecting, setStreamConnecting] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  const [directConnectionState, setDirectConnectionState] = useState<DirectConnectionState>('idle');
  const [typingText, setTypingText] = useState<string | null>(null);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [selectedStreamMessage, setSelectedStreamMessage] = useState<StreamMessage | null>(null);
  const [replyTarget, setReplyTarget] = useState<Pick<StreamMessage, 'id' | 'text' | 'userName'> | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [mediaSending, setMediaSending] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [pendingVoice, setPendingVoice] = useState<PendingVoice | null>(null);
  const [voiceRecordingDurationSeconds, setVoiceRecordingDurationSeconds] = useState(0);
  const [voiceSending, setVoiceSending] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const directActionsSheetRef = useRef<BottomSheetModal>(null);
  const messageActionsSheetRef = useRef<BottomSheetModal>(null);
  const attachmentSheetRef = useRef<BottomSheetModal>(null);
  const streamClientRef = useRef<any>(null);
  const streamChannelRef = useRef<any>(null);
  const streamUnsubsRef = useRef<Array<() => void>>([]);
  const typingThrottleRef = useRef<number>(0);
  const recordingStoppedRef = useRef(false);
  const voicePlayer = useAudioPlayer(null, { updateInterval: 250 });
  const voicePlayerStatus = useAudioPlayerStatus(voicePlayer);
  const voiceRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const voiceRecorderState = useAudioRecorderState(voiceRecorder, 250);

  const mergeById = useCallback((prev: any[], next: any[]) => {
    const map = new Map<string, any>();
    [...prev, ...next].forEach((m) => map.set(m.id, m));
    return Array.from(map.values()).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  }, []);
  const load = useCallback(async (opts?: { background?: boolean }) => { if (!conversationId) return; const background = !!opts?.background; if (!background) setLoading(true); const [messageResult, directConvo] = await Promise.all([fetchDirectConversationMessages(conversationId), fetchDirectConversation(conversationId)]); if (messageResult.ok) { setMessages((prev) => mergeById(prev, messageResult.messages)); if (background) setError(null); } else setError(background ? 'تعذر تحديث الرسائل حالياً.' : messageResult.message); setConvo((prev: any) => directConvo ?? prev); if (!directConvo) setInitialLoadFailed((prev) => (background ? prev : true)); if (!background) { setInitialLoadFailed(!directConvo); setLoading(false); } }, [conversationId, mergeById]);
  const hydrateFromChannel = useCallback(() => {
    const channel = streamChannelRef.current;
    if (!channel) return;
    const rawMessages = Array.isArray(channel.state?.messages) ? channel.state.messages : [];
    const mapped: StreamMessage[] = rawMessages.map((msg: any, idx: number): StreamMessage => {
      const safeCreatedAt = typeof msg?.created_at === 'string' ? msg.created_at : new Date().toISOString();
      const safeId = typeof msg?.id === 'string' && msg.id.length > 0 ? msg.id : `fallback-${safeCreatedAt}-${idx}`;
      return {
        id: safeId,
        text: typeof msg?.text === 'string' ? msg.text : '',
        createdAt: safeCreatedAt,
        userId: typeof msg?.user?.id === 'string' ? msg.user.id : '',
        userName: typeof msg?.user?.name === 'string' ? msg.user.name : undefined,
        reactionCounts: msg?.reaction_counts && typeof msg.reaction_counts === 'object' ? msg.reaction_counts : undefined,
        ownReactions: Array.isArray(msg?.own_reactions) ? msg.own_reactions.map((reaction: any) => reaction?.type).filter((type: unknown): type is string => typeof type === 'string') : undefined,
        attachments: Array.isArray(msg?.attachments) ? msg.attachments.map((attachment: any) => ({
          type: typeof attachment?.type === 'string' ? attachment.type : undefined,
          title: typeof attachment?.title === 'string' ? attachment.title : undefined,
          name: typeof attachment?.name === 'string' ? attachment.name : undefined,
          assetUrl: typeof attachment?.asset_url === 'string' ? attachment.asset_url : undefined,
          imageUrl: typeof attachment?.image_url === 'string' ? attachment.image_url : undefined,
          thumbUrl: typeof attachment?.thumb_url === 'string' ? attachment.thumb_url : undefined,
          mimeType: typeof attachment?.mime_type === 'string' ? attachment.mime_type : undefined,
          fileSize: typeof attachment?.file_size === 'number' ? attachment.file_size : undefined,
          durationSeconds: typeof attachment?.duration === 'number' ? attachment.duration : typeof attachment?.duration_seconds === 'number' ? attachment.duration_seconds : typeof attachment?.extraData?.duration === 'number' ? attachment.extraData.duration : undefined,
        })) : undefined,
        quotedMessage: msg?.quoted_message && typeof msg.quoted_message === 'object' ? {
          id: typeof msg.quoted_message?.id === 'string' ? msg.quoted_message.id : '',
          text: typeof msg.quoted_message?.text === 'string' ? msg.quoted_message.text : '',
          userName: typeof msg.quoted_message?.user?.name === 'string' ? msg.quoted_message.user.name : undefined,
        } : undefined,
      };
    }).sort((a: StreamMessage, b: StreamMessage) => +new Date(a.createdAt) - +new Date(b.createdAt));
    setStreamMessages((prev) => mergeById(prev, mapped));
  }, [mergeById]);
  const clearStreamSubs = useCallback(() => {
    streamUnsubsRef.current.forEach((unsub) => {
      try { unsub(); } catch {}
    });
    streamUnsubsRef.current = [];
  }, []);
  const cleanupStream = useCallback(async () => {
    clearStreamSubs();
    setTypingText(null);
    streamChannelRef.current = null;
    setStreamReady(false);
    setDirectConnectionState('idle');
    if (streamClientRef.current) {
      try { await streamClientRef.current.disconnectUser(); } catch {}
      streamClientRef.current = null;
    }
  }, [clearStreamSubs]);
  const connectStream = useCallback(async () => {
    if (!DIRECT_CHAT_PRO_ENABLED || !convo || convo.status !== 'accepted') return;
    setStreamConnecting(true);
    setDirectConnectionState('connecting');
    setStreamError(null);
    try {
      clearStreamSubs();
      const creds = await fetchStreamChatToken();
      if (!creds.ok) throw new Error(creds.message);
      const cfg = getStreamDirectChannelConfig({ conversationId, currentUserId: creds.userId, otherUserId: convo.otherUserId });
      const { StreamChat } = await import('stream-chat');
      const client = StreamChat.getInstance(creds.apiKey);
      await client.connectUser({ id: creds.userId }, creds.token);
      const channel = client.channel(cfg.type, cfg.id, { members: cfg.members });
      await channel.watch();
      streamClientRef.current = client;
      streamChannelRef.current = channel;
      hydrateFromChannel();
      const onMessageChange = () => hydrateFromChannel();
      const onTypingStart = (event: any) => {
        const typistId = event?.user?.id;
        if (!typistId || typistId === user?.id) return;
        const typistName = event?.user?.name || convo?.otherDisplayName;
        setTypingText(typistName ? `${typistName} بيكتب...` : 'بيكتب...');
      };
      const onTypingStop = (event: any) => {
        const typistId = event?.user?.id;
        if (!typistId || typistId === user?.id) return;
        setTypingText(null);
      };
      const subs = [
        channel.on('message.new', onMessageChange),
        channel.on('message.updated', onMessageChange),
        channel.on('message.deleted', onMessageChange),
        channel.on('typing.start', onTypingStart),
        channel.on('typing.stop', onTypingStop),
      ];
      streamUnsubsRef.current = subs.map((s: any) => {
        if (typeof s?.unsubscribe === 'function') return () => s.unsubscribe();
        if (typeof s === 'function') return s;
        // Stream SDK unsubscribe shapes vary between versions; fallback is no-op to avoid crashes.
        return () => {};
      });
      setStreamReady(true);
      setDirectConnectionState('ready');
    } catch {
      setStreamError('الشات الجديد مش متاح دلوقتي. جرّب تاني بعد لحظات.');
      setDirectConnectionState('unavailable');
      await cleanupStream();
      setDirectConnectionState('unavailable');
    } finally { setStreamConnecting(false); }
  }, [cleanupStream, clearStreamSubs, conversationId, convo, hydrateFromChannel, user?.id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const otherUserId = convo?.otherUserId; if (!user?.id || !otherUserId) return; let active = true; void (async () => { const state = await fetchUserBlockState(user.id, otherUserId); if (!active || !state.ok) return; setBlockedByMe(state.state.blockedByMe); })(); return () => { active = false; }; }, [convo?.otherUserId, user?.id]);
  useEffect(() => { if (!convo) return; if (!DIRECT_CHAT_PRO_ENABLED || convo.status !== 'accepted') return; void connectStream(); return () => { void cleanupStream(); }; }, [cleanupStream, connectStream, convo]);

  const isReceiverOnRequest = convo?.status === 'requested' && convo?.requestedBy !== user?.id;
  const isRequesterOnRequest = convo?.status === 'requested' && convo?.requestedBy === user?.id;
  const hasRequesterAlreadySent = useMemo(() => isRequesterOnRequest && messages.some((m) => m.senderId === user?.id), [isRequesterOnRequest, messages, user?.id]);
  const acceptedDirectProActive = DIRECT_CHAT_PRO_ENABLED && convo?.status === 'accepted';
  const usingStreamChat = acceptedDirectProActive && streamReady && !streamError;
  const composerState = useMemo(() => {
    if (convo?.status === 'ignored') return { disabled: true, note: 'تم تجاهل طلب المراسلة.' };
    if (convo?.status === 'blocked') return { disabled: true, note: 'المحادثة غير متاحة حالياً.' };
    if (isReceiverOnRequest) return { disabled: true, note: null as string | null };
    if (isRequesterOnRequest && hasRequesterAlreadySent) return { disabled: true, note: 'رسالتك وصلت. هتكملوا الكلام لما الطلب يتقبل.' };
    return { disabled: false, note: null as string | null };
  }, [convo?.status, hasRequesterAlreadySent, isReceiverOnRequest, isRequesterOnRequest]);
  const status = (convo?.status && statusMeta[convo.status as keyof typeof statusMeta]) || null;
  const composerDisabled = composerState.disabled || sending || mediaSending || voiceSending || (acceptedDirectProActive && (!streamReady || streamConnecting));
  const canOpenAttachments = acceptedDirectProActive && streamReady && !streamError && !!streamChannelRef.current && !composerDisabled;
  const canUseVoice = acceptedDirectProActive && streamReady && !streamError && !!streamChannelRef.current && !composerDisabled && !mediaSending && !voiceSending;
  const formatDuration = useCallback((seconds: number) => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`, []);

  const composerPlaceholder = useMemo(() => {
    if (acceptedDirectProActive) {
      if (directConnectionState === 'connecting' || streamConnecting) return 'بنجهز Direct Chat Pro...';
      if (streamError || !streamReady) return 'الشات الجديد غير متاح الآن';
      return 'اكتب رسالة في Direct Chat Pro...';
    }

    if (composerState.disabled) return 'المحادثة غير متاحة للإرسال الآن';
    return 'اكتب رسالة بسيطة...';
  }, [acceptedDirectProActive, composerState.disabled, directConnectionState, streamConnecting, streamError, streamReady]);
  useEffect(() => { setVoiceRecordingDurationSeconds(Math.floor((voiceRecorderState.durationMillis ?? 0) / 1000)); }, [voiceRecorderState.durationMillis]);
  useEffect(() => {
    if (!voicePlayerStatus.didJustFinish) return;
    voicePlayer.pause();
    void voicePlayer.seekTo(0).catch(() => undefined);
    setPlayingVoiceId(null);
  }, [voicePlayer, voicePlayerStatus.didJustFinish]);
  useEffect(() => () => {
    void (async () => {
      try { if (voiceRecorderState.isRecording && !recordingStoppedRef.current) await voiceRecorder.stop(); } catch {}
      try { await voicePlayer.pause(); } catch {}
      try { await voicePlayer.seekTo(0); } catch {}
    })();
  }, [voicePlayer, voiceRecorder, voiceRecorderState.isRecording]);
  const latestReadAtMs = useMemo(() => {
    const channel = streamChannelRef.current;
    const reads = channel?.state?.read;
    if (!reads || typeof reads !== 'object') return null;
    const values = Object.values(reads) as any[];
    const otherReads = values.filter((r) => r?.user?.id && r.user.id !== user?.id);
    const max = otherReads.reduce((acc, r) => {
      const dt = r?.last_read ? +new Date(r.last_read) : 0;
      return dt > acc ? dt : acc;
    }, 0);
    return max > 0 ? max : null;
  }, [streamMessages, user?.id]);
  const renderBubble = (text: string, isMine: boolean, createdAt: string, userName?: string, key?: string, mineStatus?: string) => (
    <View key={key} style={[styles.bubbleRow, isMine ? styles.bubbleMineRow : styles.bubbleOtherRow]}>
      <View style={[styles.bubble, isMine ? styles.mine : styles.other]}>
        {!isMine && userName ? <AppText muted style={styles.senderHint}>{userName}</AppText> : null}
        <AppText style={styles.bodyText}>{(text ?? '').trim() || '...'}</AppText>
        <AppText muted style={styles.time}>{new Date(createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</AppText>
        {isMine && mineStatus ? <AppText muted style={styles.time}>{mineStatus}</AppText> : null}
      </View>
    </View>
  );
  const runMessageAction = useCallback(async (action: 'copy' | 'reply' | 'love' | 'thumbs_up' | 'report' | 'delete') => {
    const target = selectedStreamMessage;
    const channel = streamChannelRef.current;
    if (!target) return;
    messageActionsSheetRef.current?.dismiss();
    if (action === 'copy') {
      if (!target.text?.trim()) { setActionFeedback('لا يوجد نص للنسخ.'); return; }
      await Clipboard.setStringAsync(target.text);
      setActionFeedback('تم نسخ النص.');
      return;
    }
    if (action === 'reply') {
      setReplyTarget({ id: target.id, text: target.text, userName: target.userName });
      setActionFeedback('تم تفعيل الرد على الرسالة.');
      return;
    }
    if (action === 'report') { setActionFeedback('تم تسجيل البلاغ للمراجعة.'); return; }
    if (!channel) { setActionFeedback('الشات الجديد غير متاح حالياً.'); return; }
    if (action === 'delete') {
      if (target.userId !== user?.id) return;
      if (typeof channel.deleteMessage !== 'function') { setActionFeedback('ميزة الحذف غير متاحة حالياً.'); return; }
      try { await channel.deleteMessage(target.id); hydrateFromChannel(); setActionFeedback('تم حذف الرسالة.'); } catch { setActionFeedback('تعذر حذف الرسالة حالياً.'); }
      return;
    }
    const reactionType = action === 'love' ? 'love' : 'thumbs_up';
    if (typeof channel.sendReaction !== 'function') { setActionFeedback('ميزة التفاعل غير متاحة حالياً.'); return; }
    try { await channel.sendReaction(target.id, { type: reactionType }); hydrateFromChannel(); setActionFeedback('تم إضافة التفاعل.'); } catch { setActionFeedback('تعذر إضافة التفاعل حالياً.'); }
  }, [hydrateFromChannel, selectedStreamMessage, user?.id]);
  const pickImage = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setActionFeedback('تعذر اختيار الصورة.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.8 });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) { setActionFeedback('تعذر اختيار الصورة.'); return; }
      setPendingAttachment({ kind: 'image', uri: asset.uri, fileName: asset.fileName ?? undefined, mimeType: asset.mimeType ?? undefined, sizeBytes: asset.fileSize ?? undefined });
    } catch { setActionFeedback('تعذر اختيار الصورة.'); }
  }, []);
  const pickVideo = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setActionFeedback('تعذر اختيار الفيديو.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsMultipleSelection: false });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) { setActionFeedback('تعذر اختيار الفيديو.'); return; }
      setPendingAttachment({ kind: 'video', uri: asset.uri, fileName: asset.fileName ?? undefined, mimeType: asset.mimeType ?? undefined, sizeBytes: asset.fileSize ?? undefined });
    } catch { setActionFeedback('تعذر اختيار الفيديو.'); }
  }, []);
  const pickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: false });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) { setActionFeedback('تعذر اختيار الملف.'); return; }
      setPendingAttachment({ kind: 'file', uri: asset.uri, fileName: asset.name, mimeType: asset.mimeType ?? undefined, sizeBytes: asset.size ?? undefined });
    } catch { setActionFeedback('تعذر اختيار الملف.'); }
  }, []);
  const sendViaStream = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed && !pendingAttachment) return;
    if (!streamReady || !streamChannelRef.current || streamError) { setStreamError('الشات الجديد مش متاح دلوقتي. جرّب تاني بعد لحظات.'); return; }
    setSending(true);
    if (pendingAttachment) setMediaSending(true);
    try {
      let attachments: any[] | undefined;
      if (pendingAttachment) {
        const channel = streamChannelRef.current;
        if (pendingAttachment.kind === 'image') {
          if (typeof channel.sendImage !== 'function') { setActionFeedback('إرسال الميديا غير متاح حالياً.'); return; }
          const uploaded = await channel.sendImage(pendingAttachment.uri);
          const imageUrl = typeof uploaded?.file === 'string' ? uploaded.file : undefined;
          if (!imageUrl) throw new Error('image upload failed');
          attachments = [{ type: 'image', image_url: imageUrl, title: pendingAttachment.fileName, name: pendingAttachment.fileName, mime_type: pendingAttachment.mimeType, file_size: pendingAttachment.sizeBytes }];
        } else {
          if (typeof channel.sendFile !== 'function') { setActionFeedback('إرسال الميديا غير متاح حالياً.'); return; }
          const uploaded = await channel.sendFile(pendingAttachment.uri, pendingAttachment.fileName, pendingAttachment.mimeType);
          const fileUrl = typeof uploaded?.file === 'string' ? uploaded.file : undefined;
          if (!fileUrl) throw new Error('file upload failed');
          attachments = [{ type: pendingAttachment.kind === 'video' ? 'video' : 'file', asset_url: fileUrl, title: pendingAttachment.fileName, name: pendingAttachment.fileName, mime_type: pendingAttachment.mimeType, file_size: pendingAttachment.sizeBytes }];
        }
      }
      const payload: any = { text: trimmed, ...(attachments ? { attachments } : {}), ...(replyTarget?.id ? { quoted_message_id: replyTarget.id } : {}) };
      try { await streamChannelRef.current.sendMessage(payload); } catch { await streamChannelRef.current.sendMessage({ text: trimmed, ...(attachments ? { attachments } : {}) }); }
      hydrateFromChannel();
      setBody('');
      setPendingAttachment(null);
      setReplyTarget(null);
      setError(null);
    } catch { setActionFeedback('تعذر إرسال الميديا حالياً.'); }
    finally { setMediaSending(false); setSending(false); }
  }, [body, hydrateFromChannel, pendingAttachment, replyTarget?.id, streamError, streamReady]);
  const cancelVoiceRecording = useCallback(async () => {
    try { if (voiceRecorderState.isRecording) { recordingStoppedRef.current = true; await voiceRecorder.stop(); } } catch {}
    setIsRecordingVoice(false);
    setPendingVoice(null);
    setVoiceRecordingDurationSeconds(0);
    setActionFeedback('تم إلغاء التسجيل.');
  }, [voiceRecorder, voiceRecorderState.isRecording]);
  const startVoiceRecording = useCallback(async () => {
    if (!canUseVoice || isRecordingVoice) return;
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) { setActionFeedback('محتاجين إذن الميكروفون لتسجيل رسالة صوتية.'); return; }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      setVoiceRecordingDurationSeconds(0);
      recordingStoppedRef.current = false;
      await voiceRecorder.prepareToRecordAsync();
      voiceRecorder.record();
      setIsRecordingVoice(true);
      setActionFeedback('بدأ التسجيل.');
    } catch { setActionFeedback('تعذر إرسال الرسالة الصوتية حالياً.'); }
  }, [canUseVoice, isRecordingVoice, voiceRecorder]);
  const sendVoiceMessage = useCallback(async () => {
    if (!acceptedDirectProActive || !streamReady || !streamChannelRef.current || streamError) { setStreamError('الشات الجديد مش متاح دلوقتي. جرّب تاني بعد لحظات.'); return; }
    setVoiceSending(true);
    setActionFeedback('جاري إرسال الرسالة الصوتية...');
    try {
      recordingStoppedRef.current = true;
      if (voiceRecorderState.isRecording) await voiceRecorder.stop();
      const uri = voiceRecorder.uri;
      if (!uri) throw new Error('missing voice uri');
      const channel = streamChannelRef.current;
      if (typeof channel.sendFile !== 'function') throw new Error('send file unavailable');
      const fileName = `voice-${Date.now()}.m4a`;
      const mimeType = 'audio/m4a';
      const durationSeconds = Math.max(1, voiceRecordingDurationSeconds || Math.floor((voiceRecorderState.durationMillis ?? 0) / 1000));
      setPendingVoice({ uri, fileName, mimeType, durationSeconds });
      const uploaded = await channel.sendFile(uri, fileName, mimeType);
      const assetUrl = typeof uploaded?.file === 'string' ? uploaded.file : undefined;
      if (!assetUrl || assetUrl.startsWith('file://')) throw new Error('voice upload failed');
      const attachments = [{ type: 'audio', asset_url: assetUrl, title: fileName, name: fileName, mime_type: mimeType, duration: durationSeconds }];
      const trimmed = body.trim();
      const payload: any = { ...(trimmed ? { text: trimmed } : {}), attachments, ...(replyTarget?.id ? { quoted_message_id: replyTarget.id } : {}) };
      try { await channel.sendMessage(payload); } catch { await channel.sendMessage({ ...(trimmed ? { text: trimmed } : {}), attachments }); }
      hydrateFromChannel();
      setIsRecordingVoice(false);
      setPendingVoice(null);
      setVoiceRecordingDurationSeconds(0);
      setBody('');
      setReplyTarget(null);
    } catch { setActionFeedback('تعذر إرسال الرسالة الصوتية حالياً.'); }
    finally { setVoiceSending(false); }
  }, [acceptedDirectProActive, body, hydrateFromChannel, replyTarget?.id, streamError, streamReady, voiceRecorder, voiceRecorderState.durationMillis, voiceRecorderState.isRecording, voiceRecordingDurationSeconds]);
  const togglePlayVoice = useCallback(async (messageId: string, url?: string) => {
    if (!url) { setActionFeedback('تعذر تشغيل الرسالة الصوتية.'); return; }
    try {
      if (playingVoiceId === messageId && voicePlayer.playing) {
        voicePlayer.pause();
        setPlayingVoiceId(null);
        return;
      }
      await voicePlayer.pause();
      await voicePlayer.replace(url);
      voicePlayer.play();
      setPlayingVoiceId(messageId);
    } catch { setActionFeedback('تعذر تشغيل الرسالة الصوتية.'); }
  }, [playingVoiceId, voicePlayer]);
  if (!conversationId) return <AppScreen><EmptyState title="محادثة غير صالحة" description="تعذر فتح المحادثة." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="بنجهز المحادثة..." description="" /></AppScreen>;
  if (!convo && initialLoadFailed) return <AppScreen><View style={styles.retryState}><EmptyState title="تعذر تجهيز المحادثة." description="حاول تفتحها مرة تانية." /><AppButton label="إعادة المحاولة" onPress={() => { void load(); }} /></View></AppScreen>;

  return <AppScreen>
    <View style={styles.header}>
      <Pressable style={styles.headerIdentity} onPress={() => { if (convo?.otherUserId) router.push(`/profile/${convo.otherUserId}`); }} disabled={!convo?.otherUserId}>
        <View style={styles.avatarWrap}>{convo?.otherAvatarUrl ? <Image source={{ uri: convo.otherAvatarUrl }} style={styles.avatar} /> : <Ionicons name="person-circle" size={34} color={colors.textMuted} />}</View>
        <View style={{ flex: 1, gap: 2 }}><AppText weight="semibold">{convo?.otherDisplayName ?? 'رسالة من تِسوى'}</AppText><AppText muted>@{convo?.otherUsername ?? 'teswa'}</AppText>{status ? <AppText muted style={styles.subtleLine}>{status.sub}</AppText> : null}</View>
        {status ? <View style={styles.pill}><AppText muted>{status.label}</AppText></View> : null}
      </Pressable>
      <Pressable style={styles.headerMenuBtn} onPress={() => directActionsSheetRef.current?.present()}><Ionicons name="ellipsis-horizontal" size={20} color={colors.text} /></Pressable>
    </View>

    {acceptedDirectProActive ? <AppCard style={styles.contextStrip}><View style={styles.contextHead}><AppText weight="semibold">غرفة التبادل</AppText><View style={styles.streamBadge}><AppText muted>Stream مباشر</AppText></View></View><AppText muted>اتكلموا، وضّحوا التفاصيل، وجهزوا العرض لما تكونوا متفقين.</AppText></AppCard> : null}

    {isReceiverOnRequest ? <AppCard style={styles.requestCard}><View style={styles.requestHead}><AppText weight="semibold">طلب مراسلة</AppText><AppText muted>الشخص ده بعتلك رسالة. اقبل الطلب لو حابب تكملوا الكلام.</AppText></View><View style={styles.requestActions}><AppButton disabled={busy} label="قبول" onPress={async()=>{setBusy(true); try { const r=await acceptDirectMessageRequest(conversationId); setError(r.ok?null:r.message); await load({ background: true }); } catch { setError('تعذر تنفيذ الطلب حالياً.'); } finally { setBusy(false); }}} /><AppButton disabled={busy} label="تجاهل" variant="neutral" onPress={async()=>{setBusy(true); try { const r=await ignoreDirectMessageRequest(conversationId); setError(r.ok?null:r.message); await load({ background: true }); } catch { setError('تعذر تنفيذ الطلب حالياً.'); } finally { setBusy(false); }}} /></View></AppCard> : null}
    {isRequesterOnRequest ? <AppCard style={styles.infoCard}><AppText muted>طلب المراسلة اتبعت. هتكملوا الكلام لما الطرف التاني يقبل.</AppText></AppCard> : null}
    {convo?.status === 'ignored' ? <AppCard style={styles.infoCard}><AppText muted>تم تجاهل المحادثة حالياً. تقدر تبدأ طلب جديد لاحقًا.</AppText></AppCard> : null}
    {convo?.status === 'blocked' ? <AppCard style={styles.infoCard}><AppText muted>المحادثة غير متاحة بسبب الحظر.</AppText></AppCard> : null}

    <KeyboardAwareScrollView bottomOffset={102} contentContainerStyle={styles.messagesWrap}>
      {streamError ? <AppCard style={styles.errorCard}><AppText muted>{streamError}</AppText><AppButton label="إعادة المحاولة" variant="neutral" onPress={() => { void connectStream(); }} /></AppCard> : null}
      {usingStreamChat ? (
        directConnectionState === 'connecting' && streamMessages.length === 0 ? <EmptyState title="بنجهز Direct Chat Pro..." description="بنفتح مساحة المحادثة الآمنة." /> :
        streamMessages.length === 0 ? <EmptyState title="ابدأوا الاتفاق" description="اسأل سؤال بسيط أو وضّح تفاصيل الحاجة اللي بتتكلموا عليها." /> :
        streamMessages.map((m) => {
          const mine = m.userId === user?.id;
          const read = mine && latestReadAtMs ? (+new Date(m.createdAt) <= latestReadAtMs) : false;
          const mineStatus = mine ? (read ? 'اتقرت' : 'اتبعثت') : undefined;
          return (
            <Pressable key={m.id} onLongPress={() => { setSelectedStreamMessage(m); messageActionsSheetRef.current?.present(); }} delayLongPress={220}>
              <View style={[styles.bubbleRow, mine ? styles.bubbleMineRow : styles.bubbleOtherRow]}>
                <View style={[styles.bubble, mine ? styles.mine : styles.other]}>
                  {!mine && m.userName ? <AppText muted style={styles.senderHint}>{m.userName}</AppText> : null}
                  {m.quotedMessage?.id ? <View style={styles.quotedWrap}><AppText muted style={styles.quotedUser}>{m.quotedMessage.userName || 'رسالة'}</AppText><AppText muted numberOfLines={1}>{m.quotedMessage.text || '...'}</AppText></View> : null}
                  <AppText style={styles.bodyText}>{(m.text ?? '').trim() || ((m.attachments?.length ?? 0) > 0 ? '' : '...')}</AppText>
                  {m.attachments?.map((attachment, idx) => {
                    const isImage = attachment.type === 'image' || !!attachment.imageUrl;
                    const isVideo = attachment.type === 'video';
                    const isAudio = attachment.type === 'audio' || !!attachment.mimeType?.startsWith('audio/') || /\.(m4a|mp3|aac|wav|ogg)$/i.test(`${attachment.assetUrl || attachment.name || ''}`);
                    const label = attachment.title || attachment.name || (isImage ? 'صورة' : isVideo ? 'فيديو' : 'ملف');
                    if (isAudio) {
                      const voiceId = `${m.id}-att-${idx}`;
                      return <Pressable key={voiceId} style={styles.voiceBubble} onPress={() => { void togglePlayVoice(voiceId, attachment.assetUrl); }}><Ionicons name={playingVoiceId === voiceId ? 'pause-circle' : 'play-circle'} size={22} color={colors.primary} /><View style={{ flex: 1, gap: 2 }}><AppText weight="semibold">رسالة صوتية</AppText>{typeof attachment.durationSeconds === 'number' ? <AppText muted>{formatDuration(Math.floor(attachment.durationSeconds))}</AppText> : null}</View></Pressable>;
                    }
                    if (isImage && (attachment.imageUrl || attachment.thumbUrl || attachment.assetUrl)) {
                      return <Pressable key={`${m.id}-att-${idx}`} onPress={() => setActionFeedback('فتح الصورة قريباً')}><Image source={{ uri: attachment.imageUrl || attachment.thumbUrl || attachment.assetUrl }} style={styles.inlineImage} /><AppText muted>{label}</AppText></Pressable>;
                    }
                    return <Pressable key={`${m.id}-att-${idx}`} style={styles.fileCard} onPress={() => setActionFeedback(isVideo ? 'فتح الفيديو قريباً' : 'فتح الملفات قريباً')}><AppText>{isVideo ? '🎬 فيديو' : '📎 ملف'}</AppText><AppText muted>{label}</AppText>{attachment.mimeType ? <AppText muted>{attachment.mimeType}</AppText> : null}</Pressable>;
                  })}
                  <AppText muted style={styles.time}>{new Date(m.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</AppText>
                  {mine && mineStatus ? <AppText muted style={styles.time}>{mineStatus}</AppText> : null}
                  {(m.reactionCounts?.love || m.reactionCounts?.thumbs_up) ? <View style={styles.reactionsRow}>
                    {m.reactionCounts?.love ? <View style={styles.reactionChip}><AppText muted>❤️ {m.reactionCounts.love}</AppText></View> : null}
                    {m.reactionCounts?.thumbs_up ? <View style={styles.reactionChip}><AppText muted>👍 {m.reactionCounts.thumbs_up}</AppText></View> : null}
                  </View> : null}
                </View>
              </View>
            </Pressable>
          );
        })
      ) : (
        messages.length === 0 ? <EmptyState title="ابدأوا الكلام" description="اكتب أول رسالة وافتح مساحة للتواصل بهدوء." /> :
        messages.map((m) => renderBubble(m.body, m.senderId === user?.id, m.createdAt, undefined, m.id))
      )}
    </KeyboardAwareScrollView>

    {isRecordingVoice && acceptedDirectProActive ? <View style={styles.recordingCard}><AppText weight="semibold">جاري التسجيل...</AppText><AppText muted>{formatDuration(voiceRecordingDurationSeconds)}</AppText><View style={styles.recordingActions}><AppButton label="إلغاء" variant="neutral" onPress={() => { void cancelVoiceRecording(); }} /><AppButton label={voiceSending ? 'جاري الإرسال...' : 'إرسال'} disabled={voiceSending} onPress={() => { void sendVoiceMessage(); }} /></View></View> : null}
    {typingText && usingStreamChat ? <AppText muted style={styles.info}>{typingText}</AppText> : null}
    {composerState.note ? <AppText muted style={styles.info}>{composerState.note}</AppText> : null}

    <KeyboardStickyView offset={{ opened: 6, closed: 0 }}>
      <View style={styles.composerWrap}>
        {replyTarget ? <View style={styles.replyCard}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText muted>ردًا على {replyTarget.userName || 'رسالة'}</AppText>
            <AppText numberOfLines={1}>{replyTarget.text || '...'}</AppText>
          </View>
          <Pressable onPress={() => setReplyTarget(null)} style={styles.replyClose}><Ionicons name="close" size={16} color={colors.textMuted} /></Pressable>
        </View> : null}
        <View style={styles.composer}>
          <Pressable style={styles.plus} disabled={!canOpenAttachments} onPress={() => attachmentSheetRef.current?.present()}><Ionicons name="add" size={20} color={colors.textMuted} /></Pressable>
          {acceptedDirectProActive ? <Pressable style={[styles.plus, !canUseVoice && styles.sendDisabled]} disabled={!canUseVoice || isRecordingVoice} onPress={() => { void startVoiceRecording(); }}><Ionicons name="mic" size={18} color={canUseVoice ? colors.primary : colors.textMuted} /></Pressable> : null}
          <TextInput value={body} onChangeText={(value) => { setBody(value); if (acceptedDirectProActive && streamReady && streamChannelRef.current) { const now = Date.now(); if (now - typingThrottleRef.current > 1700) { typingThrottleRef.current = now; try { if (typeof streamChannelRef.current.keystroke === 'function') streamChannelRef.current.keystroke(); } catch {} } } }} placeholder={composerPlaceholder} placeholderTextColor={colors.textMuted} style={styles.input} editable={!composerDisabled} multiline />
          <Pressable disabled={composerDisabled || (!body.trim() && !pendingAttachment)} style={[styles.send, (composerDisabled || (!body.trim() && !pendingAttachment)) && styles.sendDisabled]} onPress={async () => { const trimmed = body.trim(); if (!trimmed && !pendingAttachment) return; if (acceptedDirectProActive) { await sendViaStream(); return; } if (!trimmed) return; setSending(true); try { const res = await sendDirectMessage(conversationId, trimmed); if (!res.ok) { setError(res.message); return; } setMessages((prev) => mergeById(prev, [{ id: res.messageId ?? `local-${Date.now()}`, senderId: user?.id, body: trimmed, messageType: 'text', createdAt: res.createdAt ?? new Date().toISOString(), readAt: null }])); void load({ background: true }); setBody(''); setError(null); } catch { setError('تعذر إرسال الرسالة حالياً.'); } finally { setSending(false); } }}><Ionicons name="paper-plane" size={18} color={colors.background} /></Pressable>
        </View>
        {pendingAttachment ? <View style={styles.pendingCard}>
          {pendingAttachment.kind === 'image' ? <Image source={{ uri: pendingAttachment.uri }} style={styles.pendingImage} /> : null}
          <View style={{ flex: 1, gap: 2 }}>
            <AppText>{pendingAttachment.kind === 'image' ? 'صورة جاهزة للإرسال' : pendingAttachment.kind === 'video' ? 'فيديو جاهز للإرسال' : 'ملف جاهز للإرسال'}</AppText>
            {pendingAttachment.fileName ? <AppText muted numberOfLines={1}>{pendingAttachment.fileName}</AppText> : null}
            {mediaSending ? <AppText muted>جاري إرسال الميديا...</AppText> : null}
          </View>
          <Pressable onPress={() => setPendingAttachment(null)}><Ionicons name="close-circle-outline" size={20} color={colors.textMuted} /></Pressable>
        </View> : null}
        {pendingVoice ? <AppText muted style={styles.comingSoon}>🎙️ {pendingVoice.fileName}</AppText> : null}
      </View>
    </KeyboardStickyView>

    {actionFeedback ? <AppCard style={styles.feedbackCard}><AppText muted>{actionFeedback}</AppText></AppCard> : null}
    {error ? <AppCard style={styles.errorCard}><AppText muted>{error}</AppText></AppCard> : null}
    <AppActionSheet ref={directActionsSheetRef} title="خيارات المحادثة" actions={[{ label: 'عرض البروفايل', disabled: !convo?.otherUserId, onPress: () => { directActionsSheetRef.current?.dismiss(); if (convo?.otherUserId) router.push(`/profile/${convo.otherUserId}`); } }, { label: 'الإبلاغ عن المستخدم', tone: 'danger', disabled: !convo?.otherUserId, onPress: () => { directActionsSheetRef.current?.dismiss(); if (convo?.otherUserId) router.push(`/report/user/${convo.otherUserId}`); } }, { label: blockBusy ? 'جاري التنفيذ...' : (blockedByMe ? 'إلغاء الحظر' : 'حظر المستخدم'), tone: 'danger', disabled: blockBusy || !convo?.otherUserId || !user?.id, onPress: () => { directActionsSheetRef.current?.dismiss(); if (!convo?.otherUserId || !user?.id) return; void (async () => { setBlockBusy(true); try { const result = blockedByMe ? await unblockUserFromMobile(user.id, convo.otherUserId) : await blockUserFromMobile(user.id, convo.otherUserId); if (result.ok) { const next = await fetchUserBlockState(user.id, convo.otherUserId); if (next.ok) setBlockedByMe(next.state.blockedByMe); setError(null); } else setError('تعذر تحديث حالة الحظر حالياً.'); } catch { setError('تعذر تحديث حالة الحظر حالياً.'); } finally { setBlockBusy(false); } })(); } }]} />
    <AppActionSheet ref={messageActionsSheetRef} title="خيارات الرسالة" actions={[{ label: 'نسخ النص', onPress: () => { void runMessageAction('copy'); } }, { label: 'رد على الرسالة', onPress: () => { void runMessageAction('reply'); } }, { label: 'تفاعل ❤️', onPress: () => { void runMessageAction('love'); } }, { label: 'تفاعل 👍', onPress: () => { void runMessageAction('thumbs_up'); } }, { label: 'إبلاغ عن الرسالة', tone: 'danger', onPress: () => { void runMessageAction('report'); } }, { label: 'حذف الرسالة', tone: 'danger', disabled: selectedStreamMessage?.userId !== user?.id, onPress: () => { void runMessageAction('delete'); } }]} />
    <AppActionSheet ref={attachmentSheetRef} title="إرفاق ميديا" actions={[{ label: 'صورة', onPress: () => { attachmentSheetRef.current?.dismiss(); void pickImage(); } }, { label: 'فيديو', onPress: () => { attachmentSheetRef.current?.dismiss(); void pickVideo(); } }, { label: 'ملف', onPress: () => { attachmentSheetRef.current?.dismiss(); void pickFile(); } }, { label: 'إلغاء', onPress: () => { attachmentSheetRef.current?.dismiss(); } }]} />
  </AppScreen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  headerIdentity: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, borderRadius: radii.xl, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  headerMenuBtn: { width: 38, height: 38, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  avatarWrap: { width: 54, height: 54, borderRadius: radii.round, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatar: { width: '100%', height: '100%' },
  subtleLine: { fontSize: 11 },
  pill: { backgroundColor: colors.primarySoft, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  contextStrip: { marginHorizontal: spacing.sm, marginTop: spacing.sm, gap: spacing.xs },
  contextHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  streamBadge: { borderRadius: radii.round, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.xs, paddingVertical: 2 },
  requestCard: { margin: spacing.sm, gap: spacing.sm },
  requestHead: { gap: spacing.xs },
  requestActions: { flexDirection: 'row-reverse', gap: spacing.xs },
  retryState: { padding: spacing.md, gap: spacing.sm },
  infoCard: { marginHorizontal: spacing.sm, marginBottom: spacing.xs },
  info: { paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  messagesWrap: { padding: spacing.md, gap: spacing.xs },
  bubbleRow: { width: '100%' },
  bubble: { maxWidth: '86%', borderRadius: 18, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: 3 },
  bubbleMineRow: { alignItems: 'flex-end' },
  bubbleOtherRow: { alignItems: 'flex-start' },
  mine: { backgroundColor: colors.primarySoft, borderTopRightRadius: 8 },
  other: { backgroundColor: colors.surface, borderTopLeftRadius: 8, borderWidth: 1, borderColor: colors.border },
  bodyText: { textAlign: 'right' },
  senderHint: { fontSize: 11 },
  time: { fontSize: 11 },
  recordingCard: { marginHorizontal: spacing.md, marginBottom: spacing.xs, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: spacing.xs },
  recordingActions: { flexDirection: 'row-reverse', gap: spacing.xs },
  composerWrap: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background, paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm, gap: spacing.xs },
  replyCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radii.lg, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  replyClose: { width: 26, height: 26, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center' },
  composer: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: spacing.xs },
  plus: { width: 40, height: 40, borderRadius: radii.round, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, opacity: 0.75 },
  input: { flex: 1, minHeight: 44, maxHeight: 110, borderWidth: 1, borderColor: colors.border, borderRadius: radii.round, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, textAlign: 'right', color: colors.text, backgroundColor: colors.surface },
  send: { width: 44, height: 44, borderRadius: radii.round, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.45 },
  comingSoon: { fontSize: 11, textAlign: 'right' },
  quotedWrap: { borderRightWidth: 2, borderRightColor: colors.primary, backgroundColor: colors.background, borderRadius: radii.md, paddingHorizontal: spacing.xs, paddingVertical: 4, gap: 2 },
  quotedUser: { fontSize: 11 },
  inlineImage: { width: 160, height: 120, borderRadius: radii.md, marginTop: 6, marginBottom: 3 },
  fileCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: radii.md, padding: spacing.xs, marginTop: 6, gap: 2 },
  voiceBubble: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: radii.md, padding: spacing.xs, marginTop: 6, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  pendingCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.xs, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  pendingImage: { width: 52, height: 52, borderRadius: radii.md },
  reactionsRow: { flexDirection: 'row-reverse', gap: spacing.xs, marginTop: 4 },
  reactionChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: radii.round, paddingHorizontal: spacing.xs, paddingVertical: 2 },
  feedbackCard: { marginHorizontal: spacing.sm, marginBottom: spacing.xs },
  errorCard: { marginHorizontal: spacing.sm, marginBottom: spacing.sm, gap: spacing.xs },
});
