import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { KeyboardAwareScrollView, KeyboardStickyView, useKeyboardState } from 'react-native-keyboard-controller';
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

const formatMessageTime = (createdAt: string) => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
};

export default function Screen() {
  const { user } = useAuth();
  const router = useRouter();
  const { refreshBadges } = useUnreadBadges();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const conversationId = Array.isArray(id) ? id[0]?.trim() ?? '' : id?.trim() ?? '';
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const loadRequestRef = useRef(0);

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
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchContextualThreadById({ conversationId, currentUserId: user.id });
      if (requestId !== loadRequestRef.current) return;
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
      if (requestId === loadRequestRef.current) setError('تعذر تحميل المحادثة حالياً.');
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
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
    } catch {
      setError('تعذر إلغاء التسجيل الصوتي.');
    } finally {
      previewPlayer.pause();
      await previewPlayer.seekTo(0).catch(() => undefined);
      setVoiceDraft(null);
      setVoiceOpen(false);
      autoStopTriggeredRef.current = false;
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
      const postStopDuration = postStatus.durationMillis ?? 0;
      const durationMsRaw =
        preStopDuration && preStopDuration > 0 ? preStopDuration : postStopDuration;
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
    setVoiceOpen(true);
    setVoiceBusy(true);
    setError(null);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setVoiceOpen(false);
        setVoiceDraft(null);
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
      setVoiceOpen(false);
      setVoiceDraft(null);
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
    try {
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
    } catch {
      setError('تعذر إرسال الرسالة الصوتية الآن. حاول مرة أخرى.');
    } finally {
      setVoiceSending(false);
    }
  }, [refreshBadges, thread, user?.id, voiceDraft, voiceSending]);

  const recordingLabel = useMemo(() => `جاري التسجيل ${formatMs(recorderState.durationMillis ?? 0)}`, [recorderState.durationMillis]);
  const otherName = thread?.otherParticipant?.displayName ?? thread?.otherParticipant?.username ?? 'مستخدم تِسوى';
  const otherInitial = String(otherName).trim()?.[0]?.toUpperCase() || 'ت';
  const realtimeLabel = realtimeStatus === 'unavailable' ? 'جاري إعادة الاتصال...' : 'رد على قصة';

  if (!user?.id) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك للوصول للمحادثات." /></AppScreen>;
  if (!conversationId) return <AppScreen><View style={styles.group}><EmptyState title="تعذر فتح المحادثة" description="معرّف المحادثة غير صالح أو تم حذفها." /><AppButton label="العودة إلى الرسائل" variant="neutral" onPress={() => router.replace('/(tabs)/messages')} /></View></AppScreen>;
  if (loading) return <AppScreen backgroundVariant="alive"><View style={styles.loadingState}><View style={styles.loadingIcon}><Ionicons name="chatbubble-ellipses-outline" size={28} color={colors.primary} /></View><AppText weight="bold">بنفتح المحادثة...</AppText><AppText muted>بنحمّل الرسائل وسياق القصة.</AppText></View></AppScreen>;
  if (error && !thread) {
    return <AppScreen><View style={styles.group}><EmptyState title="تعذر فتح المحادثة" description={error} /><AppButton label="إعادة المحاولة" onPress={() => void load()} /><AppButton label="العودة إلى الرسائل" variant="neutral" onPress={() => router.replace('/(tabs)/messages')} /></View></AppScreen>;
  }

  return (
    <AppScreen backgroundVariant="alive">
      <View style={styles.topHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع للرسائل" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`فتح ملف ${otherName}`}
          onPress={() => router.push(`/profile/${thread.otherParticipant.id}`)}
          style={({ pressed }) => [styles.personHeader, pressed && styles.pressed]}
        >
          <View style={styles.personCopy}>
            <AppText weight="bold" style={styles.personName} numberOfLines={1}>{otherName}</AppText>
            <View style={styles.presenceRow}>
              <AppText muted style={styles.presenceText}>{realtimeLabel}</AppText>
            </View>
          </View>
          {thread.otherParticipant.avatarUrl ? (
            <Image source={{ uri: thread.otherParticipant.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}><AppText weight="bold" style={styles.avatarInitial}>{otherInitial}</AppText></View>
          )}
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.messageContent}
        bottomOffset={96}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contextCard}>
          <View style={styles.contextIcon}><Ionicons name="sparkles-outline" size={20} color={colors.accent} /></View>
          <View style={styles.contextCopy}>
            <AppText muted style={styles.contextEyebrow}>المحادثة بدأت من قصة</AppText>
            <AppText weight="bold" style={styles.contextTitle}>رد على قصة فتح مساحة للكلام</AppText>
            <AppText muted style={styles.contextText}>المحادثة دي مرتبطة بتفاعل بدأ جوه تِسوى، فالسياق موجود من قبل أول رسالة هنا.</AppText>
          </View>
          <View style={styles.contextPill}><Ionicons name="chatbubble-outline" size={13} color={colors.accent} /><AppText style={styles.contextPillText}>قصة</AppText></View>
        </View>

        {thread.messages.length ? (
          <View style={styles.messageList}>
            {thread.messages.map((message: any) => {
              const mine = message.senderId === user.id;
              const isVoice = message.messageKind === 'voice';
              const isPlaying = activeVoiceId === message.id && voicePlayerStatus.playing;
              return (
                <View key={message.id} style={[styles.messageRow, mine ? styles.mineRow : styles.otherRow]}>
                  {!mine ? (
                    thread.otherParticipant.avatarUrl ? <Image source={{ uri: thread.otherParticipant.avatarUrl }} style={styles.messageAvatar} /> : <View style={styles.messageAvatarFallback}><AppText style={styles.messageAvatarInitial}>{otherInitial}</AppText></View>
                  ) : null}

                  <View style={[styles.bubble, mine ? styles.mineBubble : styles.otherBubble]}>
                    {isVoice ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={isPlaying ? 'إيقاف الرسالة الصوتية' : 'تشغيل الرسالة الصوتية'}
                        onPress={async () => {
                          if (activeVoiceId === message.id) {
                            if (voicePlayerStatus.playing) voicePlayer.pause();
                            else voicePlayer.play();
                            return;
                          }
                          previewPlayer.pause();
                          await previewPlayer.seekTo(0).catch(() => undefined);
                          const signed = await createContextualVoiceMessageSignedUrl(message.mediaStoragePath ?? '');
                          if (!signed) {
                            setError('تعذر تشغيل الرسالة الصوتية حالياً. حاول مرة أخرى.');
                            return;
                          }
                          await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
                          voicePlayer.replace({ uri: signed });
                          voicePlayer.play();
                          setActiveVoiceId(message.id);
                        }}
                        style={styles.voiceMessage}
                      >
                        <View style={[styles.voicePlayButton, mine ? styles.voicePlayMine : styles.voicePlayOther]}>
                          <Ionicons name={isPlaying ? 'pause' : 'play'} size={17} color={mine ? colors.primary : colors.white} />
                        </View>
                        <View style={styles.waveform}>
                          {[10, 18, 13, 22, 16, 25, 12, 20, 15, 23].map((height, index) => (
                            <View key={`${message.id}-bar-${index}`} style={[styles.waveBar, { height }, mine ? styles.waveBarMine : styles.waveBarOther]} />
                          ))}
                        </View>
                        <AppText style={[styles.voiceDuration, mine && styles.mineMetaText]}>{formatMs(message.mediaDurationMs ?? 0)}</AppText>
                      </Pressable>
                    ) : (
                      <AppText style={[styles.messageText, mine && styles.mineText]}>{message.body}</AppText>
                    )}
                    <View style={[styles.messageMeta, mine ? styles.mineMeta : styles.otherMeta]}>
                      <AppText muted={!mine} style={[styles.timeText, mine && styles.mineMetaText]}>{formatMessageTime(message.createdAt)}</AppText>
                      {mine ? <Ionicons name="checkmark-done" size={13} color="rgba(255,255,255,0.72)" /> : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyConversation}>
            <View style={styles.emptyConversationIcon}><Ionicons name="chatbubbles-outline" size={28} color={colors.primary} /></View>
            <AppText weight="bold" style={styles.emptyConversationTitle}>كمّلوا الكلام من هنا</AppText>
            <AppText muted style={styles.emptyConversationText}>القصة كانت البداية. ابعت أول رسالة وخلي المحادثة تكمل بشكل طبيعي.</AppText>
          </View>
        )}
      </KeyboardAwareScrollView>

      <KeyboardStickyView enabled={keyboardVisible} offset={{ opened: 6, closed: 0 }}>
        <View style={styles.composerShell}>
          {voiceOpen ? (
            <View style={styles.voiceComposerCard}>
              {recorderState.isRecording ? (
                <View style={styles.recordingState}>
                  <View style={styles.recordingTop}>
                    <View style={styles.recordingPulse}><View style={styles.recordingDot} /></View>
                    <View style={styles.recordingCopy}>
                      <AppText weight="bold" style={styles.recordingTitle}>{recordingLabel}</AppText>
                      <AppText muted style={styles.recordingHint}>الحد الأقصى 00:45 — التسجيل هيقف تلقائيًا.</AppText>
                    </View>
                  </View>
                  <View style={styles.voiceActionRow}>
                    <Pressable accessibilityRole="button" accessibilityLabel="إيقاف التسجيل" disabled={voiceBusy} onPress={() => void finalizeRecording()} style={[styles.voiceActionPrimary, voiceBusy && styles.disabled]}><Ionicons name="stop" size={18} color={colors.white} /><AppText style={styles.voiceActionPrimaryText}>إيقاف</AppText></Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="إلغاء التسجيل" disabled={voiceBusy} onPress={() => void cancelVoiceComposer()} style={[styles.voiceActionNeutral, voiceBusy && styles.disabled]}><Ionicons name="trash-outline" size={17} color={colors.textMuted} /><AppText style={styles.voiceActionNeutralText}>إلغاء</AppText></Pressable>
                  </View>
                </View>
              ) : voiceDraft ? (
                <View style={styles.draftState}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={previewPlayerStatus.playing ? 'إيقاف معاينة التسجيل' : 'تشغيل معاينة التسجيل'}
                    onPress={async () => {
                      voicePlayer.pause();
                      await voicePlayer.seekTo(0).catch(() => undefined);
                      setActiveVoiceId(null);
                      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
                      if (previewPlayerStatus.playing) previewPlayer.pause();
                      else previewPlayer.play();
                    }}
                    style={styles.previewCard}
                  >
                    <View style={styles.previewPlayButton}><Ionicons name={previewPlayerStatus.playing ? 'pause' : 'play'} size={18} color={colors.white} /></View>
                    <View style={styles.previewCopy}><AppText weight="semibold">راجع التسجيل قبل الإرسال</AppText><AppText muted style={styles.previewHint}>المدة {formatMs(voiceDraft.durationMs)}</AppText></View>
                    <Ionicons name="musical-notes-outline" size={23} color={colors.accent} />
                  </Pressable>
                  <View style={styles.voiceActionRow}>
                    <Pressable accessibilityRole="button" accessibilityLabel="إرسال الرسالة الصوتية" disabled={voiceSending || voiceBusy} onPress={() => void sendVoiceDraft()} style={[styles.voiceActionPrimary, (voiceSending || voiceBusy) && styles.disabled]}><Ionicons name="send" size={17} color={colors.white} /><AppText style={styles.voiceActionPrimaryText}>{voiceSending ? 'بنبعت...' : 'إرسال'}</AppText></Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="إعادة التسجيل" disabled={voiceSending || voiceBusy} onPress={() => void startVoiceRecording()} style={[styles.voiceActionNeutral, (voiceSending || voiceBusy) && styles.disabled]}><Ionicons name="refresh-outline" size={17} color={colors.textMuted} /><AppText style={styles.voiceActionNeutralText}>إعادة</AppText></Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="إلغاء الرسالة الصوتية" disabled={voiceSending || voiceBusy} onPress={() => void cancelVoiceComposer()} style={[styles.iconOnlyAction, (voiceSending || voiceBusy) && styles.disabled]}><Ionicons name="close" size={20} color={colors.textMuted} /></Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.readyToRecord}>
                  <View style={styles.readyIcon}><Ionicons name="mic-outline" size={22} color={colors.primary} /></View>
                  <View style={styles.readyCopy}><AppText weight="semibold">رسالة صوتية</AppText><AppText muted style={styles.recordingHint}>سجّل لحد 45 ثانية.</AppText></View>
                  <Pressable accessibilityRole="button" accessibilityLabel="بدء التسجيل" disabled={voiceBusy} onPress={() => void startVoiceRecording()} style={[styles.voiceActionPrimary, voiceBusy && styles.disabled]}><AppText style={styles.voiceActionPrimaryText}>ابدأ</AppText></Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="إلغاء" disabled={voiceBusy} onPress={() => void cancelVoiceComposer()} style={styles.iconOnlyAction}><Ionicons name="close" size={20} color={colors.textMuted} /></Pressable>
                </View>
              )}
            </View>
          ) : null}

          {error ? (
            <View style={styles.inlineError}><Ionicons name="alert-circle-outline" size={18} color={colors.danger} /><AppText style={styles.inlineErrorText}>{error}</AppText></View>
          ) : null}

          <View style={styles.composer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="تسجيل رسالة صوتية"
              onPress={() => { setVoiceOpen(true); void startVoiceRecording(); }}
              disabled={voiceBusy || sending || voiceSending}
              style={[styles.micButton, (voiceBusy || sending || voiceSending) && styles.disabled]}
            >
              <Ionicons name="mic-outline" size={21} color={colors.text} />
            </Pressable>

            <View style={styles.inputShell}>
              <TextInput
                value={messageBody}
                onChangeText={setMessageBody}
                placeholder="اكتب رسالة..."
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                textAlign="right"
                multiline
                maxLength={800}
                accessibilityLabel="نص الرسالة"
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={sending ? 'جاري إرسال الرسالة' : 'إرسال الرسالة'}
              onPress={() => void handleSend()}
              disabled={!messageBody.trim() || sending}
              style={[styles.sendButton, (!messageBody.trim() || sending) && styles.sendButtonDisabled]}
            >
              <Ionicons name={sending ? 'hourglass-outline' : 'arrow-back'} size={20} color={colors.white} />
            </Pressable>
          </View>
        </View>
      </KeyboardStickyView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm, paddingBottom: spacing.lg },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingIcon: { width: 60, height: 60, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  topHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { width: 42, height: 42, borderRadius: radii.round, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  personHeader: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  personCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  personName: { fontSize: 17, textAlign: 'right' },
  presenceRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  presenceText: { fontSize: 10 },
  avatar: { width: 46, height: 46, borderRadius: radii.round },
  avatarFallback: { width: 46, height: 46, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: colors.primary, fontSize: 17 },
  messageContent: { gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xl },
  contextCard: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md, borderRadius: radii.xl, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: '#E9D9C7' },
  contextIcon: { width: 40, height: 40, borderRadius: radii.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  contextCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  contextEyebrow: { fontSize: 10 },
  contextTitle: { fontSize: 15, textAlign: 'right' },
  contextText: { fontSize: 11, lineHeight: 17, textAlign: 'right' },
  contextPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radii.round, backgroundColor: colors.surface },
  contextPillText: { fontSize: 10, color: colors.accent },
  messageList: { gap: spacing.sm },
  messageRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  mineRow: { justifyContent: 'flex-start' },
  otherRow: { justifyContent: 'flex-end', flexDirection: 'row-reverse' },
  messageAvatar: { width: 26, height: 26, borderRadius: radii.round },
  messageAvatarFallback: { width: 26, height: 26, borderRadius: radii.round, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  messageAvatarInitial: { fontSize: 10, color: colors.accent },
  bubble: { maxWidth: '82%', minWidth: 78, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 5 },
  mineBubble: { backgroundColor: colors.primary, borderRadius: radii.lg, borderBottomLeftRadius: 6 },
  otherBubble: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, borderBottomRightRadius: 6 },
  messageText: { fontSize: 14, lineHeight: 21, textAlign: 'right' },
  mineText: { color: colors.white },
  messageMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  mineMeta: { alignSelf: 'flex-start' },
  otherMeta: { alignSelf: 'flex-end' },
  timeText: { fontSize: 9 },
  mineMetaText: { color: 'rgba(255,255,255,0.72)' },
  voiceMessage: { minWidth: 210, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  voicePlayButton: { width: 34, height: 34, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center' },
  voicePlayMine: { backgroundColor: colors.white },
  voicePlayOther: { backgroundColor: colors.primary },
  waveform: { flex: 1, minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 2 },
  waveBar: { width: 3, borderRadius: 2 },
  waveBarMine: { backgroundColor: 'rgba(255,255,255,0.72)' },
  waveBarOther: { backgroundColor: colors.primary },
  voiceDuration: { fontSize: 9, minWidth: 32, textAlign: 'center' },
  emptyConversation: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyConversationIcon: { width: 60, height: 60, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyConversationTitle: { fontSize: 18, textAlign: 'center' },
  emptyConversationText: { textAlign: 'center', lineHeight: 20 },
  composerShell: { gap: spacing.xs, paddingTop: spacing.sm, paddingBottom: spacing.sm, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
  voiceComposerCard: { padding: spacing.md, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  recordingState: { gap: spacing.md },
  recordingTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  recordingPulse: { width: 42, height: 42, borderRadius: radii.round, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center' },
  recordingDot: { width: 13, height: 13, borderRadius: radii.round, backgroundColor: colors.danger },
  recordingCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  recordingTitle: { color: colors.danger },
  recordingHint: { fontSize: 10, textAlign: 'right' },
  voiceActionRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  voiceActionPrimary: { minHeight: 38, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: spacing.md, borderRadius: radii.round, backgroundColor: colors.primary },
  voiceActionPrimaryText: { color: colors.white, fontSize: 11 },
  voiceActionNeutral: { minHeight: 38, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: spacing.md, borderRadius: radii.round, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  voiceActionNeutralText: { fontSize: 11, color: colors.textMuted },
  iconOnlyAction: { width: 38, height: 38, borderRadius: radii.round, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  draftState: { gap: spacing.sm },
  previewCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.accentSoft },
  previewPlayButton: { width: 38, height: 38, borderRadius: radii.round, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  previewCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  previewHint: { fontSize: 10 },
  readyToRecord: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  readyIcon: { width: 40, height: 40, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  readyCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  inlineError: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.dangerSoft },
  inlineErrorText: { flex: 1, color: colors.danger, fontSize: 11, textAlign: 'right' },
  composer: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: spacing.xs },
  micButton: { width: 44, height: 44, borderRadius: radii.round, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  inputShell: { flex: 1, minHeight: 44, maxHeight: 110, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  input: { minHeight: 42, maxHeight: 106, paddingHorizontal: spacing.md, paddingVertical: 9, color: colors.text, fontSize: 14, lineHeight: 20, textAlignVertical: 'center' },
  sendButton: { width: 44, height: 44, borderRadius: radii.round, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { backgroundColor: '#D9C2B5' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
});
