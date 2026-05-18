import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase/client';
import { useUnreadBadges } from '@/lib/unread-badges';
import {
  createContextualVoiceMessageSignedUrl,
  fetchContextualThreadById,
  markContextualThreadReadFromMobile,
  sendContextualMessageFromMobile,
  sendContextualVoiceMessageFromMobile,
} from '@/lib/contextual-conversations';

type RealtimeStatus = 'connecting' | 'live' | 'unavailable';

type UiMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string | null;
  messageKind?: 'text' | 'voice';
  mediaStoragePath?: string | null;
  mediaDurationMs?: number | null;
  createdAt: string;
};

type VoiceDraft = {
  uri: string;
  durationMs: number;
  mimeType: string;
  fileName?: string | null;
  sizeBytes?: number | null;
};

const MAX_STORY_VOICE_MS = 45_000;
const formatMs = (durationMs: number) =>
  `${String(Math.floor(Math.max(0, Math.floor(durationMs / 1000)) / 60)).padStart(2, '0')}:${String(Math.max(0, Math.floor(durationMs / 1000)) % 60).padStart(2, '0')}`;

export default function Screen() {
  const { user } = useAuth();
  const router = useRouter();
  const { refreshBadges } = useUnreadBadges();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const conversationId = id?.trim() ?? '';

  const messageIdsRef = useRef<Set<string>>(new Set());
  const autoStopTriggeredRef = useRef(false);

  const [thread, setThread] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState('');
  const [sending, setSending] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceSending, setVoiceSending] = useState(false);

  const voicePlayer = useAudioPlayer(null, { updateInterval: 250 });
  const voicePlayerStatus = useAudioPlayerStatus(voicePlayer);
  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(null);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder, 250);
  const previewPlayer = useAudioPlayer(voiceDraft?.uri ?? null, { updateInterval: 250 });
  const previewPlayerStatus = useAudioPlayerStatus(previewPlayer);

  const load = useCallback(async () => {
    if (!user?.id || !conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchContextualThreadById({ conversationId, currentUserId: user.id });
      if (!result.ok) {
        setThread(null);
        setError(result.reason === 'unauthorized' ? 'غير مسموح لك بهذه المحادثة.' : 'المحادثة غير موجودة.');
      } else {
        setThread(result.thread);
        messageIdsRef.current = new Set(result.thread.messages.map((m) => m.id));
        void markContextualThreadReadFromMobile(conversationId).finally(() => {
          void refreshBadges();
        });
      }
    } catch {
      setError('تعذر تحميل المحادثة حالياً.');
    } finally {
      setLoading(false);
    }
  }, [conversationId, refreshBadges, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!voicePlayerStatus.didJustFinish) return;
    voicePlayer.pause();
    void voicePlayer.seekTo(0).catch(() => undefined);
    setActiveVoiceId(null);
  }, [voicePlayer, voicePlayerStatus.didJustFinish]);

  useEffect(() => {
    if (!previewPlayerStatus.didJustFinish) return;
    previewPlayer.pause();
    void previewPlayer.seekTo(0).catch(() => undefined);
  }, [previewPlayer, previewPlayerStatus.didJustFinish]);

  useEffect(() => {
    if (!user?.id || !conversationId) return;
    const channel = supabase
      .channel(`contextual_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'contextual_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (messageIdsRef.current.has(row.id)) return;

          messageIdsRef.current.add(row.id);
          const nextMessage: UiMessage = {
            id: row.id,
            conversationId: row.conversation_id,
            senderId: row.sender_id,
            body: row.body,
            messageKind: row.message_kind === 'voice' ? 'voice' : 'text',
            mediaStoragePath: row.media_storage_path ?? null,
            mediaDurationMs: row.media_duration_ms ?? null,
            createdAt: row.created_at,
          };

          setThread((prev: any) => (prev ? { ...prev, messages: [...prev.messages, nextMessage] } : prev));

          if (row.sender_id !== user.id) {
            void markContextualThreadReadFromMobile(conversationId).finally(() => {
              void refreshBadges();
            });
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('live');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeStatus('unavailable');
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, refreshBadges, user?.id]);

  const handleSend = useCallback(async () => {
    if (!thread || !user?.id) return;
    setSending(true);
    setError(null);
    const result = await sendContextualMessageFromMobile({
      conversationId: thread.id,
      currentUserId: user.id,
      body: messageBody,
    });
    if (!result.ok) {
      setError(result.message);
    } else {
      setMessageBody('');
      if (!messageIdsRef.current.has(result.message.id)) {
        messageIdsRef.current.add(result.message.id);
        setThread((prev: any) => (prev ? { ...prev, messages: [...prev.messages, result.message] } : prev));
      }
      void markContextualThreadReadFromMobile(thread.id);
    }
    setSending(false);
  }, [messageBody, thread, user?.id]);

  const cancelVoiceComposer = useCallback(async () => {
    try {
      if (recorderState.isRecording) await audioRecorder.stop();
      previewPlayer.pause();
      await previewPlayer.seekTo(0).catch(() => undefined);
      setVoiceDraft(null);
      setVoiceOpen(false);
      autoStopTriggeredRef.current = false;
    } catch {
      setError('تعذر إلغاء التسجيل الصوتي.');
    }
  }, [audioRecorder, previewPlayer, recorderState.isRecording]);

  const finalizeRecording = useCallback(async () => {
    if (!recorderState.isRecording) return;
    if (voiceBusy) return;
    setVoiceBusy(true);
    setError(null);
    try {
      const preStopDuration = recorderState.durationMillis ?? null;
      await audioRecorder.stop();
      const postStatus = await audioRecorder.getStatus();
      const uri = audioRecorder.uri;
      if (!uri) {
        setVoiceDraft(null);
        setVoiceOpen(false);
        setError('تعذر حفظ التسجيل الصوتي. حاول مرة أخرى.');
        return;
      }
      const durationMsRaw = preStopDuration ?? postStatus.durationMillis ?? null;
      if (durationMsRaw == null || !Number.isFinite(durationMsRaw) || durationMsRaw <= 0) {
        setVoiceDraft(null);
        setVoiceOpen(false);
        setError('تعذر قراءة مدة التسجيل الصوتي.');
        return;
      }
      const durationMs = Math.max(1, Math.min(MAX_STORY_VOICE_MS, Math.floor(durationMsRaw)));
      setVoiceDraft({ uri, durationMs, mimeType: 'audio/m4a', fileName: null, sizeBytes: null });
    } catch {
      setError('تعذر إنهاء التسجيل الصوتي.');
    } finally {
      setVoiceBusy(false);
      autoStopTriggeredRef.current = false;
    }
  }, [audioRecorder, recorderState.durationMillis, recorderState.isRecording, voiceBusy]);

  const startVoiceRecording = useCallback(async () => {
    if (voiceBusy || recorderState.isRecording) return;
    setVoiceBusy(true);
    setError(null);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('الرجاء تفعيل إذن الميكروفون لإرسال رسالة صوتية.');
        return;
      }
      voicePlayer.pause();
      await voicePlayer.seekTo(0).catch(() => undefined);
      setActiveVoiceId(null);
      previewPlayer.pause();
      await previewPlayer.seekTo(0).catch(() => undefined);
      setVoiceDraft(null);
      autoStopTriggeredRef.current = false;
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setVoiceOpen(true);
    } catch {
      setError('تعذر بدء التسجيل الصوتي.');
    } finally {
      setVoiceBusy(false);
    }
  }, [audioRecorder, previewPlayer, recorderState.isRecording, voiceBusy, voicePlayer]);

  useEffect(() => {
    if (!recorderState.isRecording) return;
    if (autoStopTriggeredRef.current) return;
    const duration = recorderState.durationMillis ?? 0;
    if (duration < MAX_STORY_VOICE_MS) return;
    autoStopTriggeredRef.current = true;
    void finalizeRecording();
  }, [finalizeRecording, recorderState.durationMillis, recorderState.isRecording]);

  const sendVoiceDraft = useCallback(async () => {
    if (!thread || !user?.id || !voiceDraft || voiceSending) return;
    setVoiceSending(true);
    setError(null);
    const result = await sendContextualVoiceMessageFromMobile({
      conversationId: thread.id,
      currentUserId: user.id,
      localUri: voiceDraft.uri,
      durationMs: voiceDraft.durationMs,
      mimeType: voiceDraft.mimeType,
      fileName: voiceDraft.fileName,
      sizeBytes: voiceDraft.sizeBytes,
    });
    if (!result.ok) {
      setError(result.message);
      setVoiceSending(false);
      return;
    }
    if (!messageIdsRef.current.has(result.message.id)) {
      messageIdsRef.current.add(result.message.id);
      setThread((prev: any) => (prev ? { ...prev, messages: [...prev.messages, result.message] } : prev));
    }
    setVoiceDraft(null);
    setVoiceOpen(false);
    void markContextualThreadReadFromMobile(thread.id).finally(() => {
      void refreshBadges();
    });
    setVoiceSending(false);
  }, [refreshBadges, thread, user?.id, voiceDraft, voiceSending]);

  const recordingLabel = useMemo(() => `جاري التسجيل ${formatMs(recorderState.durationMillis ?? 0)}`,[recorderState.durationMillis]);

  if (!user?.id) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك للوصول للمحادثات." /></AppScreen>;
  if (!conversationId) return <AppScreen><EmptyState title="معرّف غير صالح" description="تعذر تحديد المحادثة المطلوبة." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="جاري التحميل" description="نحمّل المحادثة الآن." /></AppScreen>;
  if (error && !thread) {
    return <AppScreen><View style={styles.group}><EmptyState title="تعذر فتح المحادثة" description={error} /><AppButton label="إعادة المحاولة" onPress={() => void load()} /></View></AppScreen>;
  }

  return (
    <AppScreen>
      <KeyboardAwareScrollView contentContainerStyle={styles.group} bottomOffset={80}>
        <Pressable style={styles.header} onPress={() => router.push(`/profile/${thread.otherParticipant.id}`)}>
          <View style={styles.headerMain}>
            <AppText weight="semibold">{thread.otherParticipant.displayName ?? 'رد على قصة'}</AppText>
            <AppText muted>{realtimeStatus === 'unavailable' ? 'التحديث اللحظي غير متاح مؤقتًا' : 'الرسائل بتتحدث لحظيًا'}</AppText>
          </View>
          {thread.otherParticipant.avatarUrl ? <Image source={{ uri: thread.otherParticipant.avatarUrl }} style={styles.avatar} /> : <View style={styles.avatarFallback}><AppText>ر</AppText></View>}
        </Pressable>

        <View style={styles.card}><AppText weight="semibold">رد على قصة</AppText><AppText muted>هذه المحادثة بدأت من تفاعل داخل عالم تِسوى، وليست رسالة عامة.</AppText></View>

        {thread.messages.length ? thread.messages.map((message: any) => (
          <View key={message.id} style={[styles.row, message.senderId === user.id ? styles.mine : styles.other]}>
            <View style={styles.bubble}>
              {message.messageKind === 'voice' ? (
                <Pressable onPress={async () => {
                  if (activeVoiceId === message.id) { if (voicePlayerStatus.playing) voicePlayer.pause(); else voicePlayer.play(); return; }
                  const signed = await createContextualVoiceMessageSignedUrl(message.mediaStoragePath ?? '');
                  if (!signed) return;
                  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
                  voicePlayer.replace({ uri: signed });
                  voicePlayer.play();
                  setActiveVoiceId(message.id);
                }}><AppText>{activeVoiceId === message.id && voicePlayerStatus.playing ? 'إيقاف الصوت' : 'تشغيل الرسالة الصوتية'}</AppText></Pressable>
              ) : (<AppText>{message.body}</AppText>)}
              <AppText muted>{new Date(message.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</AppText>
            </View>
          </View>
        )) : <EmptyState title="ابدأوا المحادثة" description="اكتبوا أول رسالة بعد الرد على القصة." />}
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ opened: 0, closed: 0 }}>
        <View style={styles.composerWrap}>
          {voiceOpen ? (
            <View style={styles.voicePanel}>
              {recorderState.isRecording ? (
                <>
                  <AppText>{recordingLabel}</AppText>
                  <View style={styles.voiceActions}>
                    <AppButton label="إيقاف" variant="outline" onPress={() => void finalizeRecording()} disabled={voiceBusy} />
                    <AppButton label="إلغاء" variant="ghost" onPress={() => void cancelVoiceComposer()} disabled={voiceBusy} />
                  </View>
                </>
              ) : voiceDraft ? (
                <>
                  <Pressable style={styles.previewPlay} onPress={async () => {
                    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
                    if (previewPlayerStatus.playing) previewPlayer.pause();
                    else previewPlayer.play();
                  }}>
                    <AppText>{previewPlayerStatus.playing ? 'إيقاف المعاينة' : `تشغيل المعاينة ${formatMs(voiceDraft.durationMs)}`}</AppText>
                  </Pressable>
                  <View style={styles.voiceActions}>
                    <AppButton label="إرسال الرسالة الصوتية" onPress={() => void sendVoiceDraft()} disabled={voiceSending || voiceBusy} />
                    <AppButton label="إعادة التسجيل" variant="outline" onPress={() => void startVoiceRecording()} disabled={voiceSending || voiceBusy} />
                    <AppButton label="إلغاء" variant="ghost" onPress={() => void cancelVoiceComposer()} disabled={voiceSending || voiceBusy} />
                  </View>
                </>
              ) : (
                <View style={styles.voiceActions}>
                  <AppButton label="بدء التسجيل" onPress={() => void startVoiceRecording()} disabled={voiceBusy} />
                  <AppButton label="إلغاء" variant="ghost" onPress={() => void cancelVoiceComposer()} disabled={voiceBusy} />
                </View>
              )}
            </View>
          ) : null}

          <View style={styles.composer}>
            <Pressable onPress={() => { setVoiceOpen(true); void startVoiceRecording(); }} disabled={voiceBusy || sending || voiceSending} style={styles.voiceEntry}>
              <AppText style={styles.voiceEntryText}>صوت</AppText>
            </Pressable>
            <Pressable onPress={() => void handleSend()} disabled={!messageBody.trim() || sending} style={styles.send}><AppText style={styles.sendText}>إرسال</AppText></Pressable>
            <TextInput value={messageBody} onChangeText={setMessageBody} placeholder="اكتب رسالة..." placeholderTextColor={colors.textMuted} style={styles.input} textAlign="right" />
          </View>
          {error ? <AppText muted>{error}</AppText> : null}
        </View>
      </KeyboardStickyView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm, paddingBottom: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerMain: { gap: 2, flex: 1 },
  avatar: { width: 42, height: 42, borderRadius: radii.round },
  avatarFallback: { width: 42, height: 42, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface, padding: spacing.sm, gap: 4 },
  row: { width: '100%' },
  mine: { alignItems: 'flex-start' },
  other: { alignItems: 'flex-end' },
  bubble: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.sm },
  composerWrap: { borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.background, padding: spacing.sm, gap: spacing.xs },
  composer: { flexDirection: 'row', gap: spacing.xs },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.surface },
  send: { borderRadius: radii.md, backgroundColor: colors.primary, justifyContent: 'center', paddingHorizontal: spacing.md },
  sendText: { color: colors.background },
  voiceEntry: { borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  voiceEntryText: { color: colors.text },
  voicePanel: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.sm, gap: spacing.xs, backgroundColor: colors.surface },
  voiceActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  previewPlay: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
});
