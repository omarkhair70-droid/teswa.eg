import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { ActivityIndicator, FlatList, Image, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { KeyboardStickyView, useKeyboardState } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
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

import { ChatComposer } from '@/components/messaging/ChatComposer';
import { MessageBubble } from '@/components/messaging/MessageBubble';
import { VoiceMessageBubble } from '@/components/messaging/VoiceMessageBubble';
import { AppActionSheet } from '@/components/sheets/AppActionSheet';
import { AppButton } from '@/components/ui/AppButton';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { TeswaMomentCard } from '@/components/ui/TeswaMomentCard';
import { SwapCeremony } from '@/components/exchange/SwapCeremony';
import { colors } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { trackEvent } from '@/lib/analytics';
import {
  confirmDealCompletedFromMobile,
  createDealVoiceMessageSignedUrl,
  fetchDealRoomById,
  getDealStatusLabel,
  getDealStatusNextStep,
  markDealThreadReadFromMobile,
  sendDealMessageFromMobile,
  sendDealVoiceMessageFromMobile,
  type DealRoomMessage,
  type DealRoomResult,
} from '@/lib/deals';
import { isSwapCeremonyEnabled } from '@/lib/feature-flags';
import { supabase } from '@/lib/supabase/client';
import { showToast } from '@/lib/toast';
import { useUnreadBadges } from '@/lib/unread-badges';
import {
  blockUserFromMobile,
  fetchUserBlockState,
  unblockUserFromMobile,
} from '@/lib/user-blocks';

type LoadedDeal = Extract<DealRoomResult, { ok: true }>['deal'];
type UiDealMessage = DealRoomMessage & { localStatus?: 'sending' | 'failed' };

const MAX_VOICE_DURATION_MS = 120_000;
const SWAP_CEREMONY_ENABLED = isSwapCeremonyEnabled();

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
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function mergeDealMessages(previous: UiDealMessage[], incoming: UiDealMessage[]) {
  const map = new Map<string, UiDealMessage>();
  [...previous, ...incoming].forEach((message) => map.set(message.id, message));
  return Array.from(map.values()).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
}

export default function DealConversationScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { id, moment } = useLocalSearchParams<{ id?: string | string[]; moment?: string }>();
  const dealId = (Array.isArray(id) ? id[0] : id)?.trim() ?? '';
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const { refreshBadges } = useUnreadBadges();

  const listRef = useRef<FlatList<UiDealMessage>>(null);
  const actionsRef = useRef<BottomSheetModal>(null);
  const messageActionsRef = useRef<BottomSheetModal>(null);
  const loadSequenceRef = useRef(0);
  const realtimeReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialScrollDoneRef = useRef(false);
  const isNearBottomRef = useRef(true);

  const [deal, setDeal] = useState<LoadedDeal | null>(null);
  const [messages, setMessages] = useState<UiDealMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<UiDealMessage | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [newMessagesAvailable, setNewMessagesAvailable] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [completionMoment, setCompletionMoment] = useState<'confirmed_waiting' | 'completed' | null>(null);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockedMe, setBlockedMe] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  const [recordingActive, setRecordingActive] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [voiceSending, setVoiceSending] = useState(false);
  const voicePlayer = useAudioPlayer(null, { updateInterval: 200 });
  const voiceStatus = useAudioPlayerStatus(voicePlayer);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [voiceLoadingId, setVoiceLoadingId] = useState<string | null>(null);

  const interactionBlocked = blockedByMe || blockedMe;
  const canSend = !!deal?.canSendMessage && !interactionBlocked;
  const notify = useCallback((title: string) => showToast({ title }), []);

  const presentActions = useCallback((ref: React.RefObject<BottomSheetModal | null>) => {
    Keyboard.dismiss();
    if (sheetTimerRef.current) clearTimeout(sheetTimerRef.current);
    sheetTimerRef.current = setTimeout(() => ref.current?.present(), 170);
  }, []);

  const loadBlockStateFor = useCallback(async (otherUserId: string | null | undefined) => {
    if (!user?.id || !otherUserId) return;
    const result = await fetchUserBlockState(user.id, otherUserId);
    if (!result.ok) return;
    setBlockedByMe(result.state.blockedByMe);
    setBlockedMe(result.state.blockedMe);
  }, [user?.id]);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!dealId || !user?.id) return;
    const sequence = ++loadSequenceRef.current;
    if (!options?.silent) setRefreshing(true);
    try {
      const result = await fetchDealRoomById(dealId, user.id);
      if (sequence !== loadSequenceRef.current) return;
      if (!result.ok) {
        setDeal(null);
        setMessages([]);
        setError(result.reason === 'unauthorized' ? 'غير مسموح لك بعرض هذه الصفقة.' : 'الصفقة غير موجودة.');
        return;
      }
      setDeal(result.deal);
      setMessages((previous) => mergeDealMessages(previous.filter((message) => !!message.localStatus), result.deal.messages));
      setError(null);
      void loadBlockStateFor(result.deal.otherParticipant.id);
      void markDealThreadReadFromMobile(dealId).finally(() => { void refreshBadges(); });
    } catch {
      if (sequence === loadSequenceRef.current) setError('تعذر تحميل بيانات الصفقة.');
    } finally {
      if (!options?.silent) setRefreshing(false);
    }
  }, [dealId, loadBlockStateFor, refreshBadges, user?.id]);

  useEffect(() => {
    if (!dealId || !user?.id) return;
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [dealId, load, user?.id]);

  useEffect(() => {
    if (!dealId || !user?.id) return;
    void trackEvent('deal_room_viewed', { route: '/deal/[id]', entityType: 'deal', entityId: dealId });
  }, [dealId, user?.id]);

  const scheduleReload = useCallback(() => {
    if (realtimeReloadTimerRef.current) clearTimeout(realtimeReloadTimerRef.current);
    realtimeReloadTimerRef.current = setTimeout(() => { void load({ silent: true }); }, 100);
  }, [load]);

  useEffect(() => {
    if (!dealId || !user?.id) return;
    setRealtimeStatus('connecting');
    const channel = supabase
      .channel(`deal-room:${dealId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'deal_messages', filter: `deal_id=eq.${dealId}` }, (payload) => {
        const row = payload.new as any;
        const incoming: UiDealMessage = {
          id: row.id,
          dealId: row.deal_id,
          senderId: row.sender_id,
          body: row.body ?? '',
          messageType: row.message_type === 'voice' ? 'voice' : 'text',
          audioStoragePath: row.audio_storage_path ?? null,
          audioDurationMs: row.audio_duration_ms ?? null,
          audioMimeType: row.audio_mime_type ?? null,
          audioSizeBytes: row.audio_size_bytes ?? null,
          createdAt: row.created_at ?? new Date().toISOString(),
        };
        setMessages((previous) => {
          let base = previous;
          if (incoming.senderId === user.id) {
            const localIndex = base.findIndex((message) => message.localStatus === 'sending' && message.body === incoming.body && message.messageType === incoming.messageType);
            if (localIndex >= 0) base = base.filter((_, index) => index !== localIndex);
          }
          return mergeDealMessages(base, [incoming]);
        });
        if (incoming.senderId !== user.id) {
          void markDealThreadReadFromMobile(dealId).finally(() => { void refreshBadges(); });
        }
        if (isNearBottomRef.current) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
        else setNewMessagesAvailable(true);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'swap_deals', filter: `id=eq.${dealId}` }, scheduleReload)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'deal_confirmations', filter: `deal_id=eq.${dealId}` }, scheduleReload)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setRealtimeStatus('offline');
      });
    return () => { void supabase.removeChannel(channel); };
  }, [dealId, refreshBadges, scheduleReload, user?.id]);

  useEffect(() => () => {
    if (realtimeReloadTimerRef.current) clearTimeout(realtimeReloadTimerRef.current);
    if (sheetTimerRef.current) clearTimeout(sheetTimerRef.current);
  }, []);

  const sendText = useCallback(async () => {
    if (!deal || !user?.id || !canSend || sending) return;
    const text = body.trim();
    if (!text) return;
    const localId = `local-${Date.now()}`;
    const optimistic: UiDealMessage = {
      id: localId,
      dealId: deal.id,
      senderId: user.id,
      body: text,
      messageType: 'text',
      audioStoragePath: null,
      audioDurationMs: null,
      audioMimeType: null,
      audioSizeBytes: null,
      createdAt: new Date().toISOString(),
      localStatus: 'sending',
    };
    setMessages((previous) => [...previous, optimistic]);
    setBody('');
    setSending(true);
    setError(null);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    try {
      const result = await sendDealMessageFromMobile({ dealId: deal.id, currentUserId: user.id, body: text });
      if (!result.ok) throw new Error(result.message);
      setMessages((previous) => mergeDealMessages(previous.filter((message) => message.id !== localId), [result.message]));
      void markDealThreadReadFromMobile(deal.id);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      void trackEvent('deal_message_sent', { route: '/deal/[id]', entityType: 'deal', entityId: deal.id, metadata: { messageType: 'text' } });
    } catch (sendError) {
      setMessages((previous) => previous.map((message) => message.id === localId ? { ...message, localStatus: 'failed' } : message));
      await loadBlockStateFor(deal.otherParticipant.id);
      notify(sendError instanceof Error ? sendError.message : 'تعذر إرسال الرسالة حالياً.');
    } finally {
      setSending(false);
    }
  }, [body, canSend, deal, loadBlockStateFor, notify, sending, user?.id]);

  const startVoice = useCallback(async () => {
    if (!canSend || recordingActive || recordingBusy || voiceSending) return;
    setRecordingBusy(true);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        notify('نحتاج إذن الميكروفون لتسجيل الرسالة الصوتية.');
        return;
      }
      Keyboard.dismiss();
      voicePlayer.pause();
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
  }, [canSend, notify, recorder, recordingActive, recordingBusy, voicePlayer, voiceSending]);

  const cancelVoice = useCallback(async () => {
    if (!recordingActive) return;
    setRecordingBusy(true);
    try { await recorder.stop(); } catch {}
    setRecordingActive(false);
    setRecordingBusy(false);
  }, [recorder, recordingActive]);

  const sendVoice = useCallback(async () => {
    if (!deal || !user?.id || !recordingActive || voiceSending) return;
    setVoiceSending(true);
    setRecordingBusy(true);
    const preStopDuration = recorderState.durationMillis ?? 0;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      const durationMs = Math.min(MAX_VOICE_DURATION_MS, preStopDuration || recorderState.durationMillis || 0);
      setRecordingActive(false);
      if (!uri || durationMs < 500) throw new Error('التسجيل قصير جدًا.');
      let sizeBytes: number | null = null;
      try {
        const info = await new File(uri).info();
        sizeBytes = typeof info.size === 'number' ? info.size : null;
      } catch {}
      const result = await sendDealVoiceMessageFromMobile({
        dealId: deal.id,
        currentUserId: user.id,
        localUri: uri,
        durationMs,
        mimeType: 'audio/m4a',
        fileName: `voice-${Date.now()}.m4a`,
        sizeBytes,
      });
      if (!result.ok) throw new Error(result.message);
      setMessages((previous) => mergeDealMessages(previous, [result.message]));
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      void markDealThreadReadFromMobile(deal.id);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      void trackEvent('deal_message_sent', {
        route: '/deal/[id]',
        entityType: 'deal',
        entityId: deal.id,
        metadata: { messageType: 'voice', voiceDurationBucket: durationMs < 15000 ? 'short' : durationMs < 60000 ? 'medium' : 'long' },
      });
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (voiceError) {
      setRecordingActive(false);
      notify(voiceError instanceof Error ? voiceError.message : 'تعذر إرسال الرسالة الصوتية.');
    } finally {
      setRecordingBusy(false);
      setVoiceSending(false);
    }
  }, [deal, notify, recorder, recorderState.durationMillis, recordingActive, user?.id, voiceSending]);

  useEffect(() => {
    if (!recordingActive || (recorderState.durationMillis ?? 0) < MAX_VOICE_DURATION_MS) return;
    notify('وصلت للحد الأقصى للرسالة الصوتية.');
    void sendVoice();
  }, [notify, recorderState.durationMillis, recordingActive, sendVoice]);

  const toggleVoice = useCallback(async (message: UiDealMessage) => {
    if (!message.audioStoragePath) { notify('تعذر تشغيل الرسالة الصوتية.'); return; }
    if (playingVoiceId === message.id && voiceStatus.playing) {
      voicePlayer.pause();
      return;
    }
    setVoiceLoadingId(message.id);
    try {
      const url = await createDealVoiceMessageSignedUrl(message.audioStoragePath, 6 * 60 * 60);
      if (!url) throw new Error('voice_url_missing');
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      voicePlayer.pause();
      voicePlayer.replace(url);
      try { await voicePlayer.seekTo(0); } catch {}
      voicePlayer.play();
      setPlayingVoiceId(message.id);
    } catch {
      setPlayingVoiceId(null);
      notify('تعذر تشغيل الرسالة الصوتية حالياً.');
    } finally {
      setVoiceLoadingId(null);
    }
  }, [notify, playingVoiceId, voicePlayer, voiceStatus.playing]);

  useEffect(() => {
    if (!playingVoiceId || !voiceStatus.didJustFinish) return;
    setPlayingVoiceId(null);
    try { voicePlayer.pause(); } catch {}
  }, [playingVoiceId, voicePlayer, voiceStatus.didJustFinish]);

  const confirmCompletion = useCallback(async () => {
    if (!deal || !user?.id || confirming) return;
    setConfirming(true);
    setError(null);
    try {
      const result = await confirmDealCompletedFromMobile({ dealId: deal.id, currentUserId: user.id });
      if (!result.ok) throw new Error(result.message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setCompletionMoment(result.completed ? 'completed' : 'confirmed_waiting');
      await load({ silent: true });
    } catch (confirmError) {
      notify(confirmError instanceof Error ? confirmError.message : 'تعذر تأكيد الإتمام حالياً.');
    } finally {
      setConfirming(false);
    }
  }, [confirming, deal, load, notify, user?.id]);

  const onToggleBlock = useCallback(async () => {
    if (!deal?.otherParticipant.id || !user?.id || blockBusy) return;
    setBlockBusy(true);
    try {
      const result = blockedByMe
        ? await unblockUserFromMobile(user.id, deal.otherParticipant.id)
        : await blockUserFromMobile(user.id, deal.otherParticipant.id);
      notify(result.message);
      if (result.ok) await loadBlockStateFor(deal.otherParticipant.id);
    } finally {
      setBlockBusy(false);
    }
  }, [blockBusy, blockedByMe, deal?.otherParticipant.id, loadBlockStateFor, notify, user?.id]);

  const runMessageAction = useCallback(async (action: 'copy' | 'retry') => {
    const message = selectedMessage;
    messageActionsRef.current?.dismiss();
    if (!message) return;
    if (action === 'copy') {
      if (!message.body.trim()) return;
      await Clipboard.setStringAsync(message.body);
      notify('تم نسخ الرسالة.');
      return;
    }
    if (action === 'retry' && message.localStatus === 'failed') {
      setMessages((previous) => previous.filter((item) => item.id !== message.id));
      setBody(message.body);
    }
  }, [notify, selectedMessage]);

  const lastOwnMessageId = useMemo(
    () => [...messages].reverse().find((message) => message.senderId === user?.id && !message.localStatus)?.id ?? null,
    [messages, user?.id],
  );

  if (!user?.id) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل الدخول لمتابعة الصفقة." /></AppScreen>;
  if (!dealId) return <AppScreen><EmptyState title="تعذر عرض الصفقة" description="معرّف الصفقة غير صالح." /></AppScreen>;
  if (loading) return <AppScreen style={styles.fullScreen} backgroundVariant="none"><View style={styles.centerState}><ActivityIndicator color={colors.primary} /><AppText muted>بنجهز دردشة الصفقة...</AppText></View></AppScreen>;
  if (!deal) return <AppScreen><View style={styles.centerState}><EmptyState title="تعذر عرض الصفقة" description={error ?? 'الصفقة غير موجودة.'} /><AppButton label="إعادة المحاولة" onPress={() => { void load(); }} /></View></AppScreen>;

  const listHeader = (
    <View style={styles.listHeader}>
      {moment === 'accepted' && deal.status !== 'cancelled' && SWAP_CEREMONY_ENABLED ? (
        <SwapCeremony
          status="accepted"
          requestedItemTitle={deal.requestedItem?.title}
          offeredItemTitle={deal.offeredItem?.title}
          requestedItemImageUrl={deal.requestedItem?.imageUrl ?? undefined}
          offeredItemImageUrl={deal.offeredItem?.imageUrl ?? undefined}
          onClose={() => router.replace(`/deal/${deal.id}`)}
        />
      ) : null}

      {completionMoment === 'confirmed_waiting' ? (
        <TeswaMomentCard eyebrow="تأكيدك اتسجل" title="مستنيين الطرف التاني" body="تأكيدك اتسجل. مستنيين الطرف التاني." icon="hourglass-outline" tone="waiting" />
      ) : null}

      {completionMoment === 'completed' && deal.status === 'completed' && SWAP_CEREMONY_ENABLED ? (
        <SwapCeremony
          status="completed"
          requestedItemTitle={deal.requestedItem?.title}
          offeredItemTitle={deal.offeredItem?.title}
          requestedItemImageUrl={deal.requestedItem?.imageUrl ?? undefined}
          offeredItemImageUrl={deal.offeredItem?.imageUrl ?? undefined}
          onClose={() => router.push(`/review/deal/${deal.id}`)}
        />
      ) : null}

      <View style={styles.dealCard}>
        <View style={styles.dealCardHeader}>
          <View style={styles.dealCardCopy}>
            <AppText muted style={styles.eyebrow}>الصفقة</AppText>
            <AppText weight="bold">{getDealStatusNextStep(deal.status)}</AppText>
          </View>
          <View style={styles.statusPill}><AppText weight="semibold" style={styles.statusPillText}>{getDealStatusLabel(deal.status)}</AppText></View>
        </View>
        <View style={styles.tradeRow}>
          <View style={styles.tradeSide}>
            {deal.requestedItem?.imageUrl ? <Image source={{ uri: deal.requestedItem.imageUrl }} style={styles.itemImage} /> : <View style={styles.itemFallback}><Ionicons name="image-outline" size={18} color={colors.textMuted} /></View>}
            <View style={styles.itemCopy}><AppText muted style={styles.itemLabel}>المطلوب</AppText><AppText weight="semibold" numberOfLines={1}>{deal.requestedItem?.title ?? 'غير متاح'}</AppText></View>
          </View>
          <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
          <View style={styles.tradeSide}>
            {deal.offeredItem?.imageUrl ? <Image source={{ uri: deal.offeredItem.imageUrl }} style={styles.itemImage} /> : <View style={styles.itemFallback}><Ionicons name="image-outline" size={18} color={colors.textMuted} /></View>}
            <View style={styles.itemCopy}><AppText muted style={styles.itemLabel}>المعروض</AppText><AppText weight="semibold" numberOfLines={1}>{deal.offeredItem?.title ?? 'غير متاح'}</AppText></View>
          </View>
        </View>
      </View>

      {['coordinating', 'completed_pending_confirmation'].includes(deal.status) ? (
        <View style={styles.confirmCard}>
          <View style={styles.confirmTop}>
            <View style={styles.confirmIcon}><Ionicons name="checkmark-done-outline" size={19} color={colors.primary} /></View>
            <View style={styles.confirmCopy}><AppText weight="bold">أكد لما التبديل يتم</AppText><AppText muted style={styles.confirmHint}>الصفقة بتتقفل بعد تأكيد الطرفين.</AppText></View>
          </View>
          <View style={styles.confirmChips}>
            <View style={[styles.confirmChip, deal.iConfirmed && styles.confirmChipDone]}><Ionicons name={deal.iConfirmed ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={deal.iConfirmed ? colors.primary : colors.textMuted} /><AppText muted style={styles.confirmChipText}>{deal.iConfirmed ? 'أنت أكدت' : 'تأكيدك مستني'}</AppText></View>
            <View style={[styles.confirmChip, deal.otherConfirmed && styles.confirmChipDone]}><Ionicons name={deal.otherConfirmed ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={deal.otherConfirmed ? colors.primary : colors.textMuted} /><AppText muted style={styles.confirmChipText}>{deal.otherConfirmed ? 'الطرف التاني أكد' : 'تأكيده مستني'}</AppText></View>
          </View>
          <AppButton label={confirming ? 'جاري التأكيد...' : deal.iConfirmed ? 'تم تسجيل تأكيدك' : 'أكد إن المقايضة تمت'} disabled={!deal.canConfirmCompletion || confirming} onPress={() => { void confirmCompletion(); }} />
        </View>
      ) : null}

      {interactionBlocked ? (
        <View style={styles.notice}><Ionicons name="ban-outline" size={16} color={blockedByMe ? colors.danger : colors.textMuted} /><AppText muted style={styles.noticeText}>{blockedByMe ? 'أنت حاظر المستخدم. ألغِ الحظر لاستكمال دردشة الصفقة.' : 'المراسلة غير متاحة بين الحسابين حاليًا.'}</AppText></View>
      ) : null}

      <View style={styles.threadDivider}><View style={styles.threadLine} /><AppText muted style={styles.threadLabel}>المحادثة</AppText><View style={styles.threadLine} /></View>
    </View>
  );

  return (
    <AppScreen style={styles.fullScreen} backgroundVariant="none">
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" style={styles.headerButton} onPress={() => router.back()}><Ionicons name="chevron-forward" size={22} color={colors.text} /></Pressable>
        <Pressable style={styles.identity} onPress={() => router.push(`/profile/${deal.otherParticipant.id}`)}>
          <View style={styles.avatarWrap}>{deal.otherParticipant.avatarUrl ? <Image source={{ uri: deal.otherParticipant.avatarUrl }} style={styles.avatar} /> : <Ionicons name="person" size={21} color={colors.textMuted} />}</View>
          <View style={styles.identityCopy}>
            <AppText weight="bold" numberOfLines={1}>{deal.otherParticipant.displayName ?? 'مستخدم تِسوى'}</AppText>
            <AppText muted style={styles.liveText}>{realtimeStatus === 'offline' ? 'دردشة الصفقة • جاري إعادة الاتصال' : 'دردشة الصفقة'}</AppText>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="خيارات الصفقة" style={styles.headerButton} onPress={() => presentActions(actionsRef)}><Ionicons name="ellipsis-horizontal" size={21} color={colors.text} /></Pressable>
      </View>

      <View style={styles.listArea}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(message) => message.id}
          ListHeaderComponent={listHeader}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.messagesContent, !messages.length && styles.emptyMessagesContent]}
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
          ListEmptyComponent={<View style={styles.emptyThread}><Ionicons name="chatbubble-ellipses-outline" size={27} color={colors.primary} /><AppText weight="bold">ابدأوا التنسيق</AppText><AppText muted style={styles.emptyText}>اتفقوا على المكان والوقت والتفاصيل هنا.</AppText></View>}
          renderItem={({ item, index }) => {
            const mine = item.senderId === user.id;
            const previous = index > 0 ? messages[index - 1] : null;
            const showDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(item.createdAt).toDateString();
            const activeVoice = item.messageType === 'voice' && playingVoiceId === item.id;
            const status = item.localStatus === 'sending' ? 'جاري الإرسال' : item.localStatus === 'failed' ? 'فشل الإرسال • اضغط مطولًا' : item.id === lastOwnMessageId ? 'تم الإرسال' : null;
            return (
              <View style={styles.messageBlock}>
                {showDay ? <View style={styles.dayWrap}><AppText muted style={styles.dayText}>{formatDay(item.createdAt)}</AppText></View> : null}
                <MessageBubble mine={mine} text={item.messageType === 'voice' ? null : item.body} timeLabel={formatClock(item.createdAt)} statusLabel={status} onLongPress={() => { setSelectedMessage(item); presentActions(messageActionsRef); }}>
                  {item.messageType === 'voice' ? (
                    <VoiceMessageBubble
                      mine={mine}
                      durationMs={item.audioDurationMs ?? (activeVoice ? (voiceStatus.duration ?? 0) * 1000 : 0)}
                      positionMs={activeVoice ? (voiceStatus.currentTime ?? 0) * 1000 : 0}
                      playing={activeVoice && !!voiceStatus.playing}
                      loading={voiceLoadingId === item.id}
                      onPress={() => { void toggleVoice(item); }}
                    />
                  ) : null}
                </MessageBubble>
              </View>
            );
          }}
        />
        {newMessagesAvailable ? <Pressable style={styles.newMessageButton} onPress={() => { setNewMessagesAvailable(false); listRef.current?.scrollToEnd({ animated: true }); }}><Ionicons name="arrow-down" size={15} color={colors.background} /><AppText weight="semibold" style={styles.newMessageText}>رسائل جديدة</AppText></Pressable> : null}
      </View>

      <KeyboardStickyView enabled={keyboardVisible} offset={{ opened: 0, closed: 0 }}>
        <ChatComposer
          value={body}
          onChangeText={setBody}
          onSend={() => { void sendText(); }}
          onPressVoice={canSend ? () => { void startVoice(); } : undefined}
          disabled={!canSend}
          sending={sending}
          maxLength={800}
          voiceDisabled={recordingBusy || sending}
          placeholder={canSend ? 'رسالة عن الصفقة...' : 'المراسلة متوقفة في الحالة الحالية'}
          recording={recordingActive ? { active: true, elapsedLabel: formatDuration(recorderState.durationMillis ?? 0), busy: recordingBusy, sending: voiceSending, onCancel: () => { void cancelVoice(); }, onSend: () => { void sendVoice(); } } : null}
        />
      </KeyboardStickyView>

      {error ? <View style={styles.errorBar}><Ionicons name="alert-circle-outline" size={16} color={colors.danger} /><AppText style={styles.errorText}>{error}</AppText><Pressable onPress={() => { setError(null); void load(); }}><AppText weight="semibold" style={styles.retryText}>حاول تاني</AppText></Pressable></View> : null}

      <AppActionSheet
        ref={actionsRef}
        title="خيارات الصفقة"
        snapPoints={['58%', '78%']}
        actions={[
          { label: 'عرض بروفايل الطرف الآخر', iconName: 'person-outline', onPress: () => { actionsRef.current?.dismiss(); router.push(`/profile/${deal.otherParticipant.id}`); } },
          ...(deal.status === 'completed' && !deal.alreadyRated ? [{ label: 'قيّم التجربة', iconName: 'star-outline' as const, onPress: () => { actionsRef.current?.dismiss(); router.push(`/review/deal/${deal.id}`); } }] : []),
          { label: 'الإبلاغ عن الصفقة', iconName: 'flag-outline', tone: 'danger', onPress: () => { actionsRef.current?.dismiss(); router.push(`/report/deal/${deal.id}`); } },
          { label: blockBusy ? 'جاري التنفيذ...' : blockedByMe ? 'إلغاء الحظر' : 'حظر المستخدم', iconName: 'ban-outline', tone: 'danger', disabled: blockBusy, onPress: () => { actionsRef.current?.dismiss(); void onToggleBlock(); } },
        ]}
      />

      <AppActionSheet
        ref={messageActionsRef}
        title="خيارات الرسالة"
        snapPoints={['42%']}
        actions={[
          { label: 'نسخ النص', iconName: 'copy-outline', disabled: !selectedMessage?.body?.trim() || selectedMessage?.messageType === 'voice', onPress: () => { void runMessageAction('copy'); } },
          ...(selectedMessage?.localStatus === 'failed' ? [{ label: 'إعادة الإرسال', iconName: 'refresh-outline' as const, onPress: () => { void runMessageAction('retry'); } }] : []),
          { label: 'الإبلاغ عن الصفقة', iconName: 'flag-outline', tone: 'danger', onPress: () => { messageActionsRef.current?.dismiss(); router.push(`/report/deal/${deal.id}`); } },
        ]}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  fullScreen: { padding: 0, backgroundColor: colors.background },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  header: { minHeight: 64, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.background },
  headerButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  identity: { flex: 1, minWidth: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  avatarWrap: { width: 42, height: 42, borderRadius: 21, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: '100%', height: '100%' },
  identityCopy: { flex: 1, minWidth: 0, gap: 2, alignItems: 'flex-end' },
  liveText: { fontSize: 11.5 },
  listArea: { flex: 1, position: 'relative' },
  messagesContent: { paddingBottom: 18, gap: 4 },
  emptyMessagesContent: { flexGrow: 1 },
  listHeader: { gap: 10, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 4 },
  dealCard: { gap: 10, padding: 12, borderRadius: 17, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  dealCardHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  dealCardCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  eyebrow: { fontSize: 10.5 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, backgroundColor: colors.primarySoft },
  statusPillText: { color: colors.primary, fontSize: 10.5 },
  tradeRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  tradeSide: { flex: 1, minWidth: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  itemImage: { width: 42, height: 42, borderRadius: 10, backgroundColor: colors.background },
  itemFallback: { width: 42, height: 42, borderRadius: 10, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  itemCopy: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 1 },
  itemLabel: { fontSize: 9.5 },
  confirmCard: { gap: 10, padding: 12, borderRadius: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primarySoft },
  confirmTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
  confirmIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  confirmCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  confirmHint: { fontSize: 11.5 },
  confirmChips: { flexDirection: 'row-reverse', gap: 6 },
  confirmChip: { flex: 1, minHeight: 32, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 7, borderRadius: 12, backgroundColor: colors.background },
  confirmChipDone: { backgroundColor: colors.primarySoft },
  confirmChipText: { fontSize: 10.5 },
  notice: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 13, backgroundColor: colors.surface },
  noticeText: { flex: 1, textAlign: 'right', fontSize: 11.5 },
  threadDivider: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  threadLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  threadLabel: { fontSize: 10.5 },
  messageBlock: { marginBottom: 3 },
  dayWrap: { alignItems: 'center', paddingVertical: 11 },
  dayText: { fontSize: 11, backgroundColor: colors.surface, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  emptyThread: { flex: 1, minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 34 },
  emptyText: { textAlign: 'center' },
  newMessageButton: { position: 'absolute', bottom: 10, alignSelf: 'center', flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.primary },
  newMessageText: { color: colors.background, fontSize: 12 },
  errorBar: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
  errorText: { flex: 1, color: colors.danger, textAlign: 'right', fontSize: 12 },
  retryText: { color: colors.primary, fontSize: 12 },
});
