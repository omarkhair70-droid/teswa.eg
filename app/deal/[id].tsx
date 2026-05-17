import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { File } from 'expo-file-system';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { AppScreen } from '@/components/ui/AppScreen';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import { confirmDealCompletedFromMobile, createDealVoiceMessageSignedUrl, fetchDealRoomById, getDealStatusLabel, getDealStatusNextStep, markDealThreadReadFromMobile, sendDealMessageFromMobile, sendDealVoiceMessageFromMobile } from '@/lib/deals';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase/client';
import { useUnreadBadges } from '@/lib/unread-badges';

type VoiceDraft = {
  uri: string;
  durationMs: number;
  fileName: string | null;
  sizeBytes: number | null;
  mimeType: string;
};

const MAX_VOICE_DURATION_MS = 120_000;

function formatVoiceDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function Screen() {
  const { user } = useAuth();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deal, setDeal] = useState<any>(null);
  const [messageBody, setMessageBody] = useState('');
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'unavailable'>('connecting');
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceSending, setVoiceSending] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [activeVoiceMessageId, setActiveVoiceMessageId] = useState<string | null>(null);
  const [voicePlaybackLoadingId, setVoicePlaybackLoadingId] = useState<string | null>(null);
  const [voicePlaybackError, setVoicePlaybackError] = useState<{ messageId: string; message: string } | null>(null);
  const voicePlaybackRequestRef = useRef(0);
  const audioModeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const messageIdsRef = useRef<Set<string>>(new Set());
  const autoStopTriggeredRef = useRef(false);
  const stopAndDiscardRef = useRef(false);
  const { refreshBadges } = useUnreadBadges();
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder, 250);
  const voicePlayer = useAudioPlayer(null, { updateInterval: 250 });
  const voicePlayerStatus = useAudioPlayerStatus(voicePlayer);
  const queueAudioModeChange = useCallback((mode: { playsInSilentMode: boolean; allowsRecording: boolean }) => {
    const next = audioModeQueueRef.current
      .catch(() => undefined)
      .then(() => setAudioModeAsync(mode));
    audioModeQueueRef.current = next.catch(() => undefined);
    return next;
  }, []);

  const load = useCallback(async () => {
    if (!id || !user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDealRoomById(id, user.id);
      if (!result.ok) {
        setDeal(null);
        setError(result.reason === 'unauthorized' ? 'غير مسموح لك بعرض هذه الصفقة.' : 'الصفقة غير موجودة.');
      } else {
        setDeal(result.deal);
        messageIdsRef.current = new Set(result.deal.messages.map((m: any) => m.id));
        void markDealThreadReadFromMobile(id).finally(() => {
          void refreshBadges();
        });
      }
    } catch (err) {
      if (__DEV__) console.log('[deal-room] load failed', { dealId: id, code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
      setError('تعذر تحميل بيانات الصفقة.');
    } finally {
      setLoading(false);
    }
  }, [id, user?.id, refreshBadges]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!id || !user?.id) return;
    const channel = supabase
      .channel(`deal_messages_${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'deal_messages', filter: `deal_id=eq.${id}` }, (payload) => {
        const row = payload.new as any;
        if (messageIdsRef.current.has(row.id as string)) return;
        messageIdsRef.current.add(row.id as string);
        setDeal((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: [...prev.messages, {
              id: row.id,
              dealId: row.deal_id,
              senderId: row.sender_id,
              body: row.body,
              createdAt: row.created_at,
              messageType: row.message_type === 'voice' ? 'voice' : 'text',
              audioStoragePath: row.audio_storage_path,
              audioDurationMs: row.audio_duration_ms,
              audioMimeType: row.audio_mime_type,
              audioSizeBytes: row.audio_size_bytes,
            }],
          };
        });
        if ((row.sender_id as string) !== user.id) {
          void markDealThreadReadFromMobile(id).finally(() => {
            void refreshBadges();
          });
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('live');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setRealtimeStatus('unavailable');
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, refreshBadges, user?.id]);

  const toggleVoicePlayback = useCallback(async (msg: any) => {
    if (recorderState.isRecording || voiceBusy) {
      setVoicePlaybackError({
        messageId: msg.id,
        message: 'أوقف التسجيل أولًا لتشغيل الرسالة الصوتية.',
      });
      return;
    }

    if (msg.messageType !== 'voice' || !msg.audioStoragePath) {
      setVoicePlaybackError({ messageId: msg.id, message: 'تعذر تشغيل الرسالة الصوتية.' });
      return;
    }

    if (activeVoiceMessageId === msg.id) {
      if (voicePlaybackError?.messageId === msg.id) setVoicePlaybackError(null);
      if (voicePlayerStatus.playing) {
        voicePlayer.pause();
      } else {
        const currentTime = voicePlayerStatus.currentTime ?? 0;
        const duration = voicePlayerStatus.duration ?? 0;
        if (duration > 0 && currentTime >= duration - 0.1) {
          try {
            await voicePlayer.seekTo(0);
          } catch {}
        }
        voicePlayer.play();
      }
      return;
    }

    voicePlayer.pause();
    try {
      await voicePlayer.seekTo(0);
    } catch {}

    const requestId = ++voicePlaybackRequestRef.current;
    setVoicePlaybackLoadingId(msg.id);
    setVoicePlaybackError(null);
    try {
      const signedUrl = await createDealVoiceMessageSignedUrl(msg.audioStoragePath);
      if (requestId !== voicePlaybackRequestRef.current || recorderState.isRecording || voiceBusy) return;
      if (!signedUrl) {
        if (requestId === voicePlaybackRequestRef.current) {
          setActiveVoiceMessageId(null);
          setVoicePlaybackError({ messageId: msg.id, message: 'تعذر تجهيز الرسالة الصوتية للتشغيل.' });
          setVoicePlaybackLoadingId(null);
        }
        return;
      }

      await queueAudioModeChange({
        playsInSilentMode: true,
        allowsRecording: false,
      });
      if (requestId !== voicePlaybackRequestRef.current || recorderState.isRecording || voiceBusy) return;

      setActiveVoiceMessageId(msg.id);
      voicePlayer.replace(signedUrl);
      if (requestId !== voicePlaybackRequestRef.current || recorderState.isRecording || voiceBusy) return;
      try {
        await voicePlayer.seekTo(0);
      } catch {}
      if (requestId !== voicePlaybackRequestRef.current || recorderState.isRecording || voiceBusy) return;
      voicePlayer.play();
      if (requestId === voicePlaybackRequestRef.current) setVoicePlaybackLoadingId(null);
    } catch (err) {
      if (__DEV__) console.log('[deal-room] voice playback failed', { messageId: msg.id, message: (err as { message?: string })?.message });
      if (requestId === voicePlaybackRequestRef.current) {
        setActiveVoiceMessageId(null);
        setVoicePlaybackError({ messageId: msg.id, message: 'تعذر تشغيل الرسالة الصوتية حالياً.' });
        setVoicePlaybackLoadingId(null);
      }
    }
  }, [activeVoiceMessageId, queueAudioModeChange, recorderState.isRecording, voiceBusy, voicePlaybackError?.messageId, voicePlayer, voicePlayerStatus.currentTime, voicePlayerStatus.duration, voicePlayerStatus.playing]);

  const sendMessage = useCallback(async () => {
    if (!deal || !user?.id) return;
    setError(null);
    setSending(true);
    try {
      const result = await sendDealMessageFromMobile({ dealId: deal.id, currentUserId: user.id, body: messageBody });
      if (!result.ok) {
        setError(result.message);
      } else {
        setMessageBody('');
        if (!messageIdsRef.current.has(result.message.id)) {
          messageIdsRef.current.add(result.message.id);
          setDeal((prev: any) => prev ? { ...prev, messages: [...prev.messages, result.message] } : prev);
        }
        void markDealThreadReadFromMobile(deal.id);
      }
    } catch (err) {
      if (__DEV__) console.log('[deal-room] send message failed', { dealId: deal.id, code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
      setError('تعذر إرسال الرسالة حالياً.');
    } finally {
      setSending(false);
    }
  }, [deal, messageBody, user?.id]);

  const stopVoiceRecording = useCallback(async () => {
    if (!recorderState.isRecording || voiceBusy) return;
    setVoiceBusy(true);
    const preStopDuration = recorderState.durationMillis ?? 0;
    try {
      await audioRecorder.stop();
      if (stopAndDiscardRef.current) {
        setVoiceDraft(null);
        stopAndDiscardRef.current = false;
        return;
      }
      const uri = audioRecorder.uri;
      if (!uri) {
        setError('تعذر حفظ التسجيل الصوتي. حاول مرة أخرى.');
        return;
      }

      let rawDurationMs = preStopDuration;
      if (!rawDurationMs) {
        const status = await audioRecorder.getStatus();
        rawDurationMs = status.durationMillis ?? 0;
      }

      const safeDurationMs = Math.min(rawDurationMs, MAX_VOICE_DURATION_MS);

      if (safeDurationMs < 500) {
        setVoiceDraft(null);
        setError('التسجيل قصير جدًا. سجّل رسالة أوضح.');
        return;
      }

      const fileName = uri.split('/').pop() || 'voice-message.m4a';
      let sizeBytes: number | null = null;
      try {
        const fileInfo = await new File(uri).info();
        sizeBytes = typeof fileInfo.size === 'number' ? fileInfo.size : null;
      } catch {
        sizeBytes = null;
      }

      setVoiceDraft({
        uri,
        durationMs: safeDurationMs,
        fileName,
        sizeBytes,
        mimeType: 'audio/m4a',
      });
    } catch (err) {
      if (__DEV__) console.log('[deal-room] stop voice failed', { dealId: deal?.id, message: (err as { message?: string })?.message });
      setError('تعذر حفظ التسجيل الصوتي. حاول مرة أخرى.');
    } finally {
      setVoiceBusy(false);
    }
  }, [audioRecorder, deal?.id, recorderState.durationMillis, recorderState.isRecording, voiceBusy]);

  const startVoiceRecording = useCallback(async () => {
    if (!deal || !user?.id || !deal.canSendMessage || recorderState.isRecording || voiceBusy || voiceSending) return;
    setError(null);
    setVoiceMessage(null);
    setVoiceDraft(null);
    stopAndDiscardRef.current = false;
    autoStopTriggeredRef.current = false;
    setVoiceBusy(true);

    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('نحتاج إذن الميكروفون لتسجيل الرسائل الصوتية.');
        return;
      }

      voicePlaybackRequestRef.current += 1;
      voicePlayer.pause();
      try {
        await voicePlayer.seekTo(0);
      } catch {}
      setActiveVoiceMessageId(null);
      setVoicePlaybackLoadingId(null);
      setVoicePlaybackError((prev) => (prev?.messageId ? null : prev));

      await queueAudioModeChange({
        playsInSilentMode: true,
        allowsRecording: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (err) {
      if (__DEV__) console.log('[deal-room] start voice failed', { dealId: deal.id, message: (err as { message?: string })?.message });
      setError('تعذر بدء التسجيل الصوتي. حاول مرة أخرى.');
    } finally {
      setVoiceBusy(false);
    }
  }, [audioRecorder, deal, queueAudioModeChange, recorderState.isRecording, user?.id, voiceBusy, voicePlayer, voiceSending]);

  const cancelVoiceDraft = useCallback(async () => {
    if (recorderState.isRecording) {
      stopAndDiscardRef.current = true;
      await stopVoiceRecording();
      return;
    }
    setVoiceDraft(null);
    setVoiceMessage(null);
  }, [recorderState.isRecording, stopVoiceRecording]);

  const sendVoiceDraft = useCallback(async () => {
    if (!deal || !user?.id || !voiceDraft || voiceSending) return;
    setError(null);
    setVoiceSending(true);
    try {
      const result = await sendDealVoiceMessageFromMobile({
        dealId: deal.id,
        currentUserId: user.id,
        localUri: voiceDraft.uri,
        durationMs: voiceDraft.durationMs,
        mimeType: voiceDraft.mimeType,
        fileName: voiceDraft.fileName,
        sizeBytes: voiceDraft.sizeBytes,
      });

      if (!result.ok) {
        setError(result.message);
      } else {
        setVoiceDraft(null);
        if (!messageIdsRef.current.has(result.message.id)) {
          messageIdsRef.current.add(result.message.id);
          setDeal((prev: any) => prev ? { ...prev, messages: [...prev.messages, result.message] } : prev);
        }
        void markDealThreadReadFromMobile(deal.id);
      }
    } catch (err) {
      if (__DEV__) console.log('[deal-room] send voice failed', { dealId: deal.id, message: (err as { message?: string })?.message });
      setError('تعذر إرسال الرسالة الصوتية حالياً.');
    } finally {
      setVoiceSending(false);
    }
  }, [deal, user?.id, voiceDraft, voiceSending]);

  useEffect(() => {
    if (!recorderState.isRecording) {
      autoStopTriggeredRef.current = false;
      return;
    }
    if ((recorderState.durationMillis ?? 0) < MAX_VOICE_DURATION_MS || autoStopTriggeredRef.current) return;
    autoStopTriggeredRef.current = true;
    setError('وصلت للحد الأقصى لمدة الرسالة الصوتية.');
    void stopVoiceRecording();
  }, [recorderState.durationMillis, recorderState.isRecording, stopVoiceRecording]);

  useEffect(() => {
    if (!activeVoiceMessageId || !voicePlayerStatus.didJustFinish) return;
    voicePlayer.pause();
    void voicePlayer.seekTo(0);
    setActiveVoiceMessageId(null);
  }, [activeVoiceMessageId, voicePlayer, voicePlayerStatus.didJustFinish]);

  const confirmCompletion = useCallback(async () => {
    if (!deal || !user?.id) return;
    setConfirming(true);
    setError(null);
    try {
      const result = await confirmDealCompletedFromMobile({ dealId: deal.id, currentUserId: user.id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      await load();
    } catch (err) {
      if (__DEV__) console.log('[deal-room] confirm completion failed', { dealId: deal.id, code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
      setError('تعذر تأكيد الإتمام حالياً.');
    } finally {
      setConfirming(false);
    }
  }, [deal, load, user?.id]);

  const realtimeLabel = useMemo(() => (realtimeStatus === 'live' ? 'الرسائل بتتحدث لحظيًا' : 'التحديث اللحظي غير متاح مؤقتًا'), [realtimeStatus]);

  if (!user?.id) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل الدخول لمتابعة الصفقة." /></AppScreen>;
  if (!id) return <AppScreen><EmptyState title="رابط غير صالح" description="تعذر تحديد الصفقة." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="جاري التحميل" description="نحمّل بيانات الصفقة." /></AppScreen>;
  if (error && !deal) return <AppScreen><View style={styles.group}><EmptyState title="تعذر عرض الصفقة" description={error} /><AppButton label="إعادة المحاولة" onPress={load} /></View></AppScreen>;

  return <AppScreen><View style={styles.screen}>
    <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.group}>
        {!!error ? <AppCard><AppText muted>{error}</AppText></AppCard> : null}
        {!!voiceMessage ? <AppCard><AppText muted>{voiceMessage}</AppText></AppCard> : null}
        <AppCard><View style={styles.group}><AppText weight="bold" style={styles.title}>غرفة الصفقة</AppText><AppText muted>{getDealStatusLabel(deal.status)}</AppText><AppText muted>{getDealStatusNextStep(deal.status)}</AppText></View></AppCard>

        <AppCard><View style={styles.group}><AppText weight="semibold">ملخص التبادل</AppText><AppText>المطلوب: {deal.requestedItem?.title ?? 'غير متاح'}</AppText><AppText>المعروض: {deal.offeredItem?.title ?? 'غير متاح'}</AppText></View></AppCard>

        <AppCard><View style={styles.group}><AppText weight="semibold">الأطراف</AppText><AppText>أنت: {(deal.viewerRole === 'requester' ? deal.requester : deal.offerer).displayName ?? 'مستخدم'}</AppText><AppText>الطرف التاني: {deal.otherParticipant.displayName ?? 'مستخدم'}</AppText></View></AppCard>

        <AppCard><View style={[styles.group, styles.threadCard]}><View style={styles.threadHeader}><AppText weight="semibold">الرسائل</AppText><AppText muted style={styles.threadRealtime}>{realtimeLabel}</AppText></View>
          {deal.messages.length === 0 ? <View style={styles.emptyThread}><EmptyState title="لسه مفيش رسائل" description="ابدأوا التنسيق من هنا." /></View> : deal.messages.map((msg: any) => {
            const mine = msg.senderId === user.id;
            const isActiveVoice = msg.messageType === 'voice' && activeVoiceMessageId === msg.id;
            const elapsedMs = isActiveVoice ? Math.max(0, Math.round((voicePlayerStatus.currentTime ?? 0) * 1000)) : 0;
            const statusDurationMs = isActiveVoice && (voicePlayerStatus.duration ?? 0) > 0 ? Math.round((voicePlayerStatus.duration ?? 0) * 1000) : 0;
            const totalDurationMs = statusDurationMs > 0 ? statusDurationMs : (msg.audioDurationMs ?? 0);
            const voiceProgress = isActiveVoice && totalDurationMs > 0 ? Math.min(1, Math.max(0, elapsedMs / totalDurationMs)) : 0;

            return <View key={msg.id} style={[styles.messageRow, mine ? styles.myMessageRow : styles.otherMessageRow]}><View style={[styles.bubble, mine ? styles.myBubble : styles.otherBubble]}><AppText weight="semibold" style={styles.senderLabel}>{mine ? 'أنت' : deal.otherParticipant.displayName ?? 'الطرف التاني'}</AppText>{msg.messageType === 'voice' ? <View style={styles.voiceBubble}><View style={styles.voiceBubbleHeader}><AppText style={styles.messageBody}>رسالة صوتية</AppText><AppButton label={voicePlaybackLoadingId === msg.id ? 'جارٍ التحميل...' : (isActiveVoice && voicePlayerStatus.playing ? 'إيقاف' : 'تشغيل')} onPress={() => { void toggleVoicePlayback(msg); }} disabled={voicePlaybackLoadingId === msg.id} variant="neutral" /></View><View style={styles.voiceProgressTrack}><View style={[styles.voiceProgressFill, { width: `${Math.round(voiceProgress * 100)}%` }]} /></View><AppText muted style={styles.metaText}>{isActiveVoice ? `${formatVoiceDuration(elapsedMs)} / ${formatVoiceDuration(totalDurationMs)}` : `المدة: ${formatVoiceDuration(msg.audioDurationMs ?? 0)}`}</AppText>{voicePlaybackError?.messageId === msg.id ? <AppText muted style={styles.metaText}>{voicePlaybackError?.message}</AppText> : null}</View> : <AppText style={styles.messageBody}>{msg.body}</AppText>}<AppText muted style={styles.metaText}>{new Date(msg.createdAt).toLocaleString('ar-EG')}</AppText></View></View>;
          })}
          {!deal.canSendMessage ? <AppText muted>المراسلة متوقفة لأن حالة الصفقة لا تسمح برسائل جديدة.</AppText> : null}
        </View></AppCard>

        {['coordinating', 'completed_pending_confirmation'].includes(deal.status) ? <AppCard><View style={styles.group}><AppText weight="semibold">تأكيد إتمام المقايضة</AppText><AppText>أنت: {deal.iConfirmed ? 'أكدت' : 'لسه'}</AppText><AppText>الطرف التاني: {deal.otherConfirmed ? 'أكد' : 'لسه'}</AppText><AppText muted>ما تضغطش تأكيد الإتمام غير بعد ما المقايضة تحصل فعلًا.</AppText>{deal.canConfirmCompletion ? <AppButton label={confirming ? 'جاري التأكيد...' : 'أكد إن المقايضة تمت'} onPress={confirmCompletion} disabled={confirming} /> : null}</View></AppCard> : null}

        {deal.status === 'completed' ? <AppCard><View style={styles.group}><AppText weight="semibold">المقايضة تمت بنجاح</AppText><AppText muted>تقدر تقيّم الطرف التاني بعد إتمام المقايضة.</AppText><AppButton label="قيّم التجربة" onPress={() => router.push(`/review/deal/${deal.id}`)} variant="neutral" /></View></AppCard> : null}

        <AppCard><View style={styles.group}><AppText weight="semibold">في مشكلة؟</AppText><AppText muted>لو حصل شيء غير مناسب أثناء التنسيق، ابعت بلاغًا من هنا.</AppText><AppButton label="الإبلاغ عن مشكلة" onPress={() => router.push(`/report/deal/${deal.id}`)} variant="neutral" /></View></AppCard>
      </View>
    </KeyboardAwareScrollView>

    {deal.canSendMessage ? <KeyboardStickyView offset={{ closed: 0, opened: 8 }} style={styles.composerSticky}><View style={styles.composerCard}><AppCard><View style={styles.group}><TextInput multiline value={messageBody} onChangeText={setMessageBody} maxLength={800} style={styles.input} placeholder="اكتب رسالة للتنسيق" textAlign="right" /><View style={styles.composerMeta}><AppText muted>{messageBody.length}/800</AppText><AppButton label={sending ? 'جاري الإرسال...' : 'إرسال'} onPress={sendMessage} disabled={sending || voiceSending} /></View>{!recorderState.isRecording && !voiceDraft ? <View style={styles.voiceComposer}><AppButton label="تسجيل رسالة صوتية" onPress={startVoiceRecording} disabled={voiceBusy || voiceSending || sending} variant="neutral" /><AppText muted>يمكنك إرسال رسالة صوتية حتى دقيقتين.</AppText></View> : null}{recorderState.isRecording ? <View style={styles.group}><AppText weight="semibold">جارٍ التسجيل...</AppText><AppText>الوقت: {formatVoiceDuration(recorderState.durationMillis ?? 0)}</AppText><View style={styles.row}><AppButton label="إيقاف التسجيل" onPress={stopVoiceRecording} disabled={voiceBusy} /><AppButton label="إلغاء" onPress={() => { void cancelVoiceDraft(); }} disabled={voiceBusy} variant="neutral" /></View></View> : null}{!recorderState.isRecording && voiceDraft ? <View style={styles.group}><AppText weight="semibold">تسجيل صوتي جاهز</AppText><AppText muted>المدة: {formatVoiceDuration(voiceDraft.durationMs)}</AppText>{typeof voiceDraft.sizeBytes === 'number' ? <AppText muted>الحجم: {Math.max(1, Math.round(voiceDraft.sizeBytes / 1024))} ك.ب</AppText> : null}<View style={styles.row}><AppButton label={voiceSending ? 'جاري إرسال التسجيل...' : 'إرسال التسجيل'} onPress={sendVoiceDraft} disabled={voiceSending || sending || voiceBusy} /><AppButton label="حذف التسجيل" onPress={() => { void cancelVoiceDraft(); }} disabled={voiceSending || voiceBusy} variant="neutral" /></View></View> : null}</View></AppCard></View></KeyboardStickyView> : null}
  </View></AppScreen>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, scrollContent: { paddingBottom: spacing.lg }, group: { gap: spacing.sm }, row: { flexDirection: 'row', gap: spacing.sm }, title: { fontSize: 24 }, threadCard: { paddingVertical: spacing.md }, threadHeader: { gap: 2 }, threadRealtime: { fontSize: 12 }, emptyThread: { paddingVertical: spacing.md }, messageRow: { width: '100%' }, myMessageRow: { alignItems: 'flex-end' }, otherMessageRow: { alignItems: 'flex-start' }, bubble: { width: 'auto', maxWidth: '82%', paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: 16, gap: spacing.xs }, myBubble: { backgroundColor: '#e7f7ee', borderBottomRightRadius: 8 }, otherBubble: { backgroundColor: '#f2f2f2', borderBottomLeftRadius: 8 }, senderLabel: { fontSize: 12, opacity: 0.75 }, messageBody: { lineHeight: 22, fontSize: 15 }, metaText: { fontSize: 11, opacity: 0.75 }, input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, minHeight: 90, maxHeight: 160, padding: 12, textAlignVertical: 'top' }, composerSticky: { paddingTop: spacing.xs }, composerCard: { borderTopLeftRadius: 18, borderTopRightRadius: 18 }, composerMeta: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }, voiceComposer: { gap: spacing.xs }, voiceBubble: { gap: spacing.xs }, voiceBubbleHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }, voiceProgressTrack: { height: 6, borderRadius: 999, backgroundColor: '#d9d9d9', overflow: 'hidden' }, voiceProgressFill: { height: '100%', backgroundColor: '#18a058' } });
