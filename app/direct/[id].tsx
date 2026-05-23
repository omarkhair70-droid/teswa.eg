import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { router, useLocalSearchParams } from 'expo-router';
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
import { acceptDirectMessageRequest, createDirectVoiceMessageSignedUrl, fetchDirectConversation, fetchDirectConversationMessages, ignoreDirectMessageRequest, sendDirectMessage, sendDirectVoiceMessage } from '@/lib/direct-messages';
import { blockUserFromMobile, fetchUserBlockState, unblockUserFromMobile } from '@/lib/user-blocks';

const MAX_VOICE_DURATION_MS = 120_000;
const formatMs = (durationMs: number) => `${String(Math.floor(Math.max(0, Math.floor(durationMs / 1000)) / 60)).padStart(2, '0')}:${String(Math.max(0, Math.floor(durationMs / 1000)) % 60).padStart(2, '0')}`;

type VoiceDraft = { uri: string; durationMs: number; fileName: string | null; sizeBytes: number | null; mimeType: string };

export default function DirectScreen() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const conversationId = Array.isArray(id) ? id[0] ?? '' : id ?? '';
  const [convo, setConvo] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceSending, setVoiceSending] = useState(false);
  const [voicePlaybackLoadingId, setVoicePlaybackLoadingId] = useState<string | null>(null);
  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(null);
  const directActionsSheetRef = useRef<BottomSheetModal>(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder, 250);
  const voicePlayer = useAudioPlayer(null, { updateInterval: 250 });
  const voicePlayerStatus = useAudioPlayerStatus(voicePlayer);

  const mergeById = useCallback((prev: any[], next: any[]) => {
    const map = new Map<string, any>();
    [...prev, ...next].forEach((m) => map.set(m.id, m));
    return Array.from(map.values()).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  }, []);

  const load = useCallback(async (opts?: { background?: boolean }) => {
    if (!conversationId) return;
    const background = !!opts?.background;
    if (!background) setLoading(true);

    const [messageResult, directConvo] = await Promise.all([
      fetchDirectConversationMessages(conversationId),
      fetchDirectConversation(conversationId),
    ]);

    if (messageResult.ok) {
      setMessages((prev) => mergeById(prev, messageResult.messages));
      if (background) setError(null);
    } else {
      setError(background ? 'تعذر تحديث الرسائل حالياً.' : messageResult.message);
    }

    setConvo((prev: any) => directConvo ?? prev);
    if (!directConvo) setInitialLoadFailed((prev) => (background ? prev : true));

    if (!background) {
      setInitialLoadFailed(!directConvo);
      setLoading(false);
    }
  }, [conversationId, mergeById]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const otherUserId = convo?.otherUserId;
    if (!user?.id || !otherUserId) return;
    let active = true;
    void (async () => {
      const state = await fetchUserBlockState(user.id, otherUserId);
      if (!active || !state.ok) return;
      setBlockedByMe(state.state.blockedByMe);
    })();
    return () => { active = false; };
  }, [convo?.otherUserId, user?.id]);

  useEffect(() => {
    if (!voicePlayerStatus.didJustFinish) return;
    voicePlayer.pause();
    void voicePlayer.seekTo(0).catch(() => undefined);
    setActiveVoiceId(null);
  }, [voicePlayer, voicePlayerStatus.didJustFinish]);

  const isReceiverOnRequest = convo?.status === 'requested' && convo?.requestedBy !== user?.id;
  const isRequesterOnRequest = convo?.status === 'requested' && convo?.requestedBy === user?.id;
  const hasRequesterAlreadySent = useMemo(() => isRequesterOnRequest && messages.some((m) => m.senderId === user?.id), [isRequesterOnRequest, messages, user?.id]);

  const composerState = useMemo(() => {
    if (convo?.status === 'ignored') return { disabled: true, note: 'تم تجاهل طلب المراسلة.' };
    if (isReceiverOnRequest) return { disabled: true, note: null as string | null };
    if (isRequesterOnRequest && hasRequesterAlreadySent) return { disabled: true, note: 'رسالتك وصلت. هتكملوا الكلام لما الطلب يتقبل.' };
    return { disabled: false, note: null as string | null };
  }, [convo?.status, hasRequesterAlreadySent, isReceiverOnRequest, isRequesterOnRequest]);

  const statusLabel = convo?.status === 'requested' ? 'طلب مراسلة' : convo?.status === 'accepted' ? 'تم القبول' : convo?.status === 'ignored' ? 'تم التجاهل' : null;

  const startVoiceRecording = useCallback(async () => {
    if (composerState.disabled || recorderState.isRecording || voiceBusy || voiceSending || sending) return;
    setError(null);
    setVoiceBusy(true);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('نحتاج إذن الميكروفون لتسجيل الرسائل الصوتية.');
        return;
      }
      voicePlayer.pause();
      await voicePlayer.seekTo(0).catch(() => undefined);
      setActiveVoiceId(null);
      setVoiceDraft(null);
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch {
      setError('تعذر بدء التسجيل الصوتي. حاول مرة أخرى.');
    } finally {
      setVoiceBusy(false);
    }
  }, [audioRecorder, composerState.disabled, recorderState.isRecording, sending, voiceBusy, voicePlayer, voiceSending]);

  const stopVoiceRecording = useCallback(async () => {
    if (!recorderState.isRecording || voiceBusy) return;
    setVoiceBusy(true);
    try {
      const draftDuration = recorderState.durationMillis ?? 0;
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) return;
      if (draftDuration < 500) { setError('التسجيل قصير جدًا. سجّل رسالة أوضح.'); return; }
      const info = await new File(uri).info();
      setVoiceDraft({ uri, durationMs: Math.min(draftDuration, MAX_VOICE_DURATION_MS), fileName: uri.split('/').pop() ?? null, sizeBytes: typeof info.size === 'number' ? info.size : null, mimeType: 'audio/m4a' });
    } catch {
      setError('تعذر حفظ التسجيل الصوتي. حاول مرة أخرى.');
    } finally {
      setVoiceBusy(false);
    }
  }, [audioRecorder, recorderState.durationMillis, recorderState.isRecording, voiceBusy]);

  const cancelVoiceRecording = useCallback(async () => {
    if (recorderState.isRecording) {
      setVoiceBusy(true);
      try {
        await audioRecorder.stop();
      } catch {}
      finally {
        setVoiceBusy(false);
      }
    }
    setVoiceDraft(null);
  }, [audioRecorder, recorderState.isRecording]);

  useEffect(() => {
    if (!recorderState.isRecording) return;
    if ((recorderState.durationMillis ?? 0) < MAX_VOICE_DURATION_MS) return;
    void stopVoiceRecording();
  }, [recorderState.durationMillis, recorderState.isRecording, stopVoiceRecording]);

  const sendVoiceDraft = useCallback(async () => {
    if (!voiceDraft || !user?.id || composerState.disabled || voiceSending) return;
    setError(null);
    setVoiceSending(true);
    try {
      const res = await sendDirectVoiceMessage({ conversationId, currentUserId: user.id, localUri: voiceDraft.uri, durationMs: voiceDraft.durationMs, mimeType: voiceDraft.mimeType, fileName: voiceDraft.fileName, sizeBytes: voiceDraft.sizeBytes });
      if (!res.ok) { setError(res.message); return; }
      setMessages((prev) => mergeById(prev, [{ id: res.messageId ?? `local-${Date.now()}`, senderId: user.id, body: 'رسالة صوتية', messageType: 'voice', audioStoragePath: res.storagePath ?? null, audioDurationMs: voiceDraft.durationMs, audioMimeType: voiceDraft.mimeType, audioSizeBytes: voiceDraft.sizeBytes, createdAt: res.createdAt ?? new Date().toISOString(), readAt: null }]));
      setVoiceDraft(null);
      void load({ background: true });
    } catch {
      setError('تعذر إرسال الرسالة الصوتية حالياً.');
    } finally {
      setVoiceSending(false);
    }
  }, [composerState.disabled, conversationId, load, mergeById, user?.id, voiceDraft, voiceSending]);

  if (!conversationId) return <AppScreen><EmptyState title="محادثة غير صالحة" description="تعذر فتح المحادثة." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="بنجهز المحادثة..." description="" /></AppScreen>;
  if (!convo && initialLoadFailed) {
    return (
      <AppScreen>
        <View style={styles.retryState}>
          <EmptyState title="تعذر تجهيز المحادثة." description="حاول تفتحها مرة تانية." />
          <AppButton label="إعادة المحاولة" onPress={() => { void load(); }} />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <View style={styles.header}>{/* unchanged header */}
        <Pressable style={styles.headerIdentity} onPress={() => { if (convo?.otherUserId) router.push(`/profile/${convo.otherUserId}`); }} disabled={!convo?.otherUserId}>
          <View style={styles.avatarWrap}>{convo?.otherAvatarUrl ? <Image source={{ uri: convo.otherAvatarUrl }} style={styles.avatar} /> : <Ionicons name="person" size={18} color={colors.textMuted} />}</View>
          <View style={{ flex: 1 }}><AppText weight="semibold">{convo?.otherDisplayName ?? 'رسالة من تِسوى'}</AppText><AppText muted>@{convo?.otherUsername ?? 'teswa'}</AppText></View>
          {statusLabel ? <View style={styles.pill}><AppText muted>{statusLabel}</AppText></View> : null}
        </Pressable>
        <Pressable style={styles.headerMenuBtn} onPress={() => directActionsSheetRef.current?.present()}><Ionicons name="ellipsis-horizontal" size={20} color={colors.text} /></Pressable>
      </View>
      {isReceiverOnRequest ? <AppCard style={styles.requestCard}><View style={styles.requestHead}><AppText weight="semibold">طلب مراسلة</AppText><AppText muted>الشخص ده بعتلك رسالة. اقبل الطلب لو حابب تكملوا الكلام.</AppText></View><View style={styles.requestActions}><AppButton disabled={busy} label="قبول" onPress={async()=>{setBusy(true); try { const r=await acceptDirectMessageRequest(conversationId); setError(r.ok?null:r.message); await load({ background: true }); } catch { setError('تعذر تنفيذ الطلب حالياً.'); } finally { setBusy(false); }}} /><AppButton disabled={busy} label="تجاهل" variant="neutral" onPress={async()=>{setBusy(true); try { const r=await ignoreDirectMessageRequest(conversationId); setError(r.ok?null:r.message); await load({ background: true }); } catch { setError('تعذر تنفيذ الطلب حالياً.'); } finally { setBusy(false); }}} /></View></AppCard> : null}
      {isRequesterOnRequest ? <AppCard style={styles.infoCard}><AppText muted>طلب المراسلة اتبعت. هتكملوا الكلام لما الطرف التاني يقبل.</AppText></AppCard> : null}
      {composerState.note ? <AppText muted style={styles.info}>{composerState.note}</AppText> : null}
      <KeyboardAwareScrollView bottomOffset={96} contentContainerStyle={styles.messagesWrap}>
        {messages.length === 0 ? <EmptyState title="ابدأوا الكلام" description="اكتب أول رسالة وافتح مساحة للتواصل بهدوء." /> : null}
        {messages.map((m) => {
          const mine = m.senderId === user?.id;
          const isVoice = m.messageType === 'voice';
          const isActive = activeVoiceId === m.id;
          const currentDuration = isActive ? Math.round((voicePlayerStatus.currentTime ?? 0) * 1000) : 0;
          const totalDuration = isActive ? Math.round((voicePlayerStatus.duration ?? 0) * 1000) : (m.audioDurationMs ?? 0);
          const progress = totalDuration > 0 ? Math.min(1, currentDuration / totalDuration) : 0;
          return (
            <View key={m.id} style={[styles.bubble, mine ? styles.mine : styles.other]}>
              {isVoice ? <View style={styles.voiceBubble}><Pressable onPress={async () => {
                if (!m.audioStoragePath) return;
                if (isActive) { if (voicePlayerStatus.playing) voicePlayer.pause(); else voicePlayer.play(); return; }
                setVoicePlaybackLoadingId(m.id);
                try {
                  const signed = await createDirectVoiceMessageSignedUrl(m.audioStoragePath);
                  if (!signed) { setError('تعذر تشغيل الرسالة الصوتية حالياً.'); return; }
                  await setAudioModeAsync({
                    playsInSilentMode: true,
                    allowsRecording: false,
                  });
                  voicePlayer.replace(signed);
                  setActiveVoiceId(m.id);
                  voicePlayer.play();
                } catch {
                  setError('تعذر تشغيل الرسالة الصوتية حالياً.');
                } finally {
                  setVoicePlaybackLoadingId(null);
                }
              }}><AppText>{voicePlaybackLoadingId === m.id ? 'جاري التحميل...' : (isActive && voicePlayerStatus.playing ? 'إيقاف' : 'تشغيل')}</AppText></Pressable><View style={styles.voiceTrack}><View style={[styles.voiceFill, { width: `${Math.round(progress * 100)}%` }]} /></View><AppText muted>{formatMs(totalDuration)}</AppText></View> : <AppText>{m.body}</AppText>}
              <AppText muted style={styles.time}>{new Date(m.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</AppText>
            </View>
          );
        })}
      </KeyboardAwareScrollView>
      {recorderState.isRecording ? <AppCard style={styles.voiceDraftCard}><AppText muted>جارٍ التسجيل... {formatMs(recorderState.durationMillis ?? 0)}</AppText><View style={styles.voiceActions}><AppButton label="إيقاف" onPress={() => void stopVoiceRecording()} disabled={voiceBusy} /><AppButton label="إلغاء" variant="neutral" onPress={() => void cancelVoiceRecording()} disabled={voiceBusy} /></View></AppCard> : null}
      {voiceDraft && !recorderState.isRecording ? <AppCard style={styles.voiceDraftCard}><AppText muted>معاينة: {formatMs(voiceDraft.durationMs)}</AppText><View style={styles.voiceActions}><AppButton label={voiceSending ? 'جاري الإرسال...' : 'إرسال الرسالة الصوتية'} onPress={() => void sendVoiceDraft()} disabled={voiceSending || sending || voiceBusy || composerState.disabled} /><AppButton label="إلغاء" variant="neutral" onPress={() => void cancelVoiceRecording()} disabled={voiceSending || voiceBusy} /></View></AppCard> : null}
      <KeyboardStickyView offset={{ opened: 6, closed: 0 }}>
        <View style={styles.composer}><TextInput value={body} onChangeText={setBody} placeholder="اكتب رسالة بسيطة..." placeholderTextColor={colors.textMuted} style={styles.input} editable={!composerState.disabled && !sending && !voiceSending} multiline /><Pressable disabled={composerState.disabled || sending || voiceSending || voiceBusy} style={[styles.send, (composerState.disabled || sending || voiceSending || voiceBusy) && styles.sendDisabled]} onPress={async () => {
          const trimmed = body.trim();
          if (trimmed) {
            setSending(true);
            try {
              const res = await sendDirectMessage(conversationId, trimmed);
              if (!res.ok) { setError(res.message); return; }
              setMessages((prev) => mergeById(prev, [{ id: res.messageId ?? `local-${Date.now()}`, senderId: user?.id, body: trimmed, messageType: 'text', audioStoragePath: null, audioDurationMs: null, audioMimeType: null, audioSizeBytes: null, createdAt: res.createdAt ?? new Date().toISOString(), readAt: null }]));
              setBody('');
              setError(null);
              void load({ background: true });
            } catch { setError('تعذر إرسال الرسالة حالياً.'); } finally { setSending(false); }
            return;
          }
          if (recorderState.isRecording) { await stopVoiceRecording(); return; }
          await startVoiceRecording();
        }}><Ionicons name={body.trim() ? 'send' : (recorderState.isRecording ? 'stop' : 'mic')} size={16} color={colors.background} /></Pressable></View>
      </KeyboardStickyView>
      {error ? <AppCard style={styles.errorCard}><AppText muted>{error}</AppText></AppCard> : null}
      <AppActionSheet ref={directActionsSheetRef} title="خيارات المحادثة" actions={[{ label: 'عرض البروفايل', disabled: !convo?.otherUserId, onPress: () => { directActionsSheetRef.current?.dismiss(); if (convo?.otherUserId) router.push(`/profile/${convo.otherUserId}`); } }, { label: 'الإبلاغ عن المستخدم', tone: 'danger', disabled: !convo?.otherUserId, onPress: () => { directActionsSheetRef.current?.dismiss(); if (convo?.otherUserId) router.push(`/report/user/${convo.otherUserId}`); } }, { label: blockBusy ? 'جاري التنفيذ...' : (blockedByMe ? 'إلغاء الحظر' : 'حظر المستخدم'), tone: 'danger', disabled: blockBusy || !convo?.otherUserId || !user?.id, onPress: () => { directActionsSheetRef.current?.dismiss(); if (!convo?.otherUserId || !user?.id) return; void (async () => { setBlockBusy(true); try { const result = blockedByMe ? await unblockUserFromMobile(user.id, convo.otherUserId) : await blockUserFromMobile(user.id, convo.otherUserId); if (result.ok) { const next = await fetchUserBlockState(user.id, convo.otherUserId); if (next.ok) setBlockedByMe(next.state.blockedByMe); setError(null); } else setError('تعذر تحديث حالة الحظر حالياً.'); } catch { setError('تعذر تحديث حالة الحظر حالياً.'); } finally { setBlockBusy(false); } })(); } }]} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  headerIdentity: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, padding: spacing.xs },
  headerMenuBtn: { width: 36, height: 36, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  avatarWrap: { width: 42, height: 42, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatar: { width: '100%', height: '100%' },
  pill: { backgroundColor: colors.primarySoft, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  requestCard: { margin: spacing.sm, gap: spacing.sm },
  requestHead: { gap: spacing.xs },
  requestActions: { flexDirection: 'row-reverse', gap: spacing.xs },
  retryState: { padding: spacing.md, gap: spacing.sm },
  infoCard: { marginHorizontal: spacing.sm, marginBottom: spacing.xs },
  info: { paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  messagesWrap: { padding: spacing.md, gap: spacing.sm },
  bubble: { maxWidth: '80%', borderRadius: radii.lg, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: 4 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primarySoft },
  other: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  voiceBubble: { gap: 6 },
  voiceTrack: { height: 4, backgroundColor: colors.border, borderRadius: radii.round, overflow: 'hidden' },
  voiceFill: { height: '100%', backgroundColor: colors.primary },
  time: { fontSize: 11 },
  composer: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: spacing.xs, paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, minHeight: 42, maxHeight: 110, borderWidth: 1, borderColor: colors.border, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, textAlign: 'right', color: colors.text },
  send: { width: 38, height: 38, borderRadius: radii.round, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.45 },
  voiceDraftCard: { marginHorizontal: spacing.sm, marginBottom: spacing.xs, gap: spacing.xs },
  voiceActions: { flexDirection: 'row-reverse', gap: spacing.xs },
  errorCard: { marginHorizontal: spacing.sm, marginBottom: spacing.sm },
});
