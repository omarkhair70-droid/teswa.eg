import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, Image } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { File } from 'expo-file-system';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { AppScreen } from '@/components/ui/AppScreen';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
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
const formatVoiceDuration = (durationMs: number) => `${String(Math.floor(Math.max(0, Math.floor(durationMs / 1000)) / 60)).padStart(2, '0')}:${String(Math.max(0, Math.floor(durationMs / 1000)) % 60).padStart(2, '0')}`;
const formatResponseRate = (responseRate: number | null) => (responseRate == null || Number.isNaN(responseRate) ? 'غير متاح بعد' : `${Math.round(Math.max(0, Math.min(100, responseRate)))}%`);

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
    const next = audioModeQueueRef.current.catch(() => undefined).then(() => setAudioModeAsync(mode));
    audioModeQueueRef.current = next.catch(() => undefined);
    return next;
  }, []);

  const load = useCallback(async () => { if (!id || !user?.id) return; setLoading(true); setError(null); try { const result = await fetchDealRoomById(id, user.id); if (!result.ok) { setDeal(null); setError(result.reason === 'unauthorized' ? 'غير مسموح لك بعرض هذه الصفقة.' : 'الصفقة غير موجودة.'); } else { setDeal(result.deal); messageIdsRef.current = new Set(result.deal.messages.map((m: any) => m.id)); void markDealThreadReadFromMobile(id).finally(() => { void refreshBadges(); }); } } catch { setError('تعذر تحميل بيانات الصفقة.'); } finally { setLoading(false); } }, [id, user?.id, refreshBadges]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!id || !user?.id) return; const channel = supabase.channel(`deal_messages_${id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'deal_messages', filter: `deal_id=eq.${id}` }, (payload) => { const row = payload.new as any; if (messageIdsRef.current.has(row.id as string)) return; messageIdsRef.current.add(row.id as string); setDeal((prev: any) => prev ? ({ ...prev, messages: [...prev.messages, { id: row.id, dealId: row.deal_id, senderId: row.sender_id, body: row.body, createdAt: row.created_at, messageType: row.message_type === 'voice' ? 'voice' : 'text', audioStoragePath: row.audio_storage_path, audioDurationMs: row.audio_duration_ms, audioMimeType: row.audio_mime_type, audioSizeBytes: row.audio_size_bytes }] }) : prev); if ((row.sender_id as string) !== user.id) { void markDealThreadReadFromMobile(id).finally(() => { void refreshBadges(); }); } }).subscribe((status) => { if (status === 'SUBSCRIBED') setRealtimeStatus('live'); if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setRealtimeStatus('unavailable'); }); return () => { void supabase.removeChannel(channel); }; }, [id, refreshBadges, user?.id]);

  const toggleVoicePlayback = useCallback(async (msg: any) => { if (recorderState.isRecording || voiceBusy) { setVoicePlaybackError({ messageId: msg.id, message: 'أوقف التسجيل أولًا لتشغيل الرسالة الصوتية.' }); return; } if (msg.messageType !== 'voice' || !msg.audioStoragePath) { setVoicePlaybackError({ messageId: msg.id, message: 'تعذر تشغيل الرسالة الصوتية.' }); return; } if (activeVoiceMessageId === msg.id) { if (voicePlaybackError?.messageId === msg.id) setVoicePlaybackError(null); if (voicePlayerStatus.playing) voicePlayer.pause(); else { const currentTime = voicePlayerStatus.currentTime ?? 0; const duration = voicePlayerStatus.duration ?? 0; if (duration > 0 && currentTime >= duration - 0.1) { try { await voicePlayer.seekTo(0); } catch {} } voicePlayer.play(); } return; }
    voicePlayer.pause(); try { await voicePlayer.seekTo(0); } catch {}
    const requestId = ++voicePlaybackRequestRef.current; setVoicePlaybackLoadingId(msg.id); setVoicePlaybackError(null);
    try { const signedUrl = await createDealVoiceMessageSignedUrl(msg.audioStoragePath); if (requestId !== voicePlaybackRequestRef.current || recorderState.isRecording || voiceBusy) return; if (!signedUrl) { setActiveVoiceMessageId(null); setVoicePlaybackError({ messageId: msg.id, message: 'تعذر تجهيز الرسالة الصوتية للتشغيل.' }); setVoicePlaybackLoadingId(null); return; }
      await queueAudioModeChange({ playsInSilentMode: true, allowsRecording: false }); if (requestId !== voicePlaybackRequestRef.current || recorderState.isRecording || voiceBusy) return; setActiveVoiceMessageId(msg.id); if (requestId !== voicePlaybackRequestRef.current || recorderState.isRecording || voiceBusy) return; voicePlayer.replace(signedUrl); if (requestId !== voicePlaybackRequestRef.current || recorderState.isRecording || voiceBusy) return; try { await voicePlayer.seekTo(0); } catch {} if (requestId !== voicePlaybackRequestRef.current || recorderState.isRecording || voiceBusy) return; voicePlayer.play(); setVoicePlaybackLoadingId(null);
    } catch { if (requestId === voicePlaybackRequestRef.current) { setActiveVoiceMessageId(null); setVoicePlaybackError({ messageId: msg.id, message: 'تعذر تشغيل الرسالة الصوتية حالياً.' }); setVoicePlaybackLoadingId(null); } }
  }, [activeVoiceMessageId, queueAudioModeChange, recorderState.isRecording, voiceBusy, voicePlaybackError?.messageId, voicePlayer, voicePlayerStatus.currentTime, voicePlayerStatus.duration, voicePlayerStatus.playing]);

  const sendMessage = useCallback(async () => { if (!deal || !user?.id) return; setError(null); setSending(true); try { const result = await sendDealMessageFromMobile({ dealId: deal.id, currentUserId: user.id, body: messageBody }); if (!result.ok) setError(result.message); else { setMessageBody(''); if (!messageIdsRef.current.has(result.message.id)) { messageIdsRef.current.add(result.message.id); setDeal((prev: any) => prev ? { ...prev, messages: [...prev.messages, result.message] } : prev); } void markDealThreadReadFromMobile(deal.id); } } catch { setError('تعذر إرسال الرسالة حالياً.'); } finally { setSending(false); } }, [deal, messageBody, user?.id]);
  const stopVoiceRecording = useCallback(async () => { if (!recorderState.isRecording || voiceBusy) return; setVoiceBusy(true); const preStopDuration = recorderState.durationMillis ?? 0; try { await audioRecorder.stop(); if (stopAndDiscardRef.current) { setVoiceDraft(null); stopAndDiscardRef.current = false; return; } const uri = audioRecorder.uri; if (!uri) { setError('تعذر حفظ التسجيل الصوتي. حاول مرة أخرى.'); return; } let rawDurationMs = preStopDuration; if (!rawDurationMs) { const status = await audioRecorder.getStatus(); rawDurationMs = status.durationMillis ?? 0; } const safeDurationMs = Math.min(rawDurationMs, MAX_VOICE_DURATION_MS); if (safeDurationMs < 500) { setVoiceDraft(null); setError('التسجيل قصير جدًا. سجّل رسالة أوضح.'); return; } const fileName = uri.split('/').pop() || 'voice-message.m4a'; let sizeBytes: number | null = null; try { const fileInfo = await new File(uri).info(); sizeBytes = typeof fileInfo.size === 'number' ? fileInfo.size : null; } catch { sizeBytes = null; } setVoiceDraft({ uri, durationMs: safeDurationMs, fileName, sizeBytes, mimeType: 'audio/m4a' }); } catch { setError('تعذر حفظ التسجيل الصوتي. حاول مرة أخرى.'); } finally { setVoiceBusy(false); } }, [audioRecorder, recorderState.durationMillis, recorderState.isRecording, voiceBusy]);
  const startVoiceRecording = useCallback(async () => { if (!deal || !user?.id || !deal.canSendMessage || recorderState.isRecording || voiceBusy || voiceSending) return; setError(null); setVoiceMessage(null); setVoiceDraft(null); stopAndDiscardRef.current = false; autoStopTriggeredRef.current = false; setVoiceBusy(true); try { const permission = await AudioModule.requestRecordingPermissionsAsync(); if (!permission.granted) { setError('نحتاج إذن الميكروفون لتسجيل الرسائل الصوتية.'); return; } voicePlaybackRequestRef.current += 1; voicePlayer.pause(); try { await voicePlayer.seekTo(0); } catch {} setActiveVoiceMessageId(null); setVoicePlaybackLoadingId(null); setVoicePlaybackError((prev) => (prev?.messageId ? null : prev)); await queueAudioModeChange({ playsInSilentMode: true, allowsRecording: true }); await audioRecorder.prepareToRecordAsync(); audioRecorder.record(); } catch { setError('تعذر بدء التسجيل الصوتي. حاول مرة أخرى.'); } finally { setVoiceBusy(false); } }, [audioRecorder, deal, queueAudioModeChange, recorderState.isRecording, user?.id, voiceBusy, voicePlayer, voiceSending]);
  const cancelVoiceDraft = useCallback(async () => { if (recorderState.isRecording) { stopAndDiscardRef.current = true; await stopVoiceRecording(); return; } setVoiceDraft(null); setVoiceMessage(null); }, [recorderState.isRecording, stopVoiceRecording]);
  const sendVoiceDraft = useCallback(async () => { if (!deal || !user?.id || !voiceDraft || voiceSending) return; setError(null); setVoiceSending(true); try { const result = await sendDealVoiceMessageFromMobile({ dealId: deal.id, currentUserId: user.id, localUri: voiceDraft.uri, durationMs: voiceDraft.durationMs, mimeType: voiceDraft.mimeType, fileName: voiceDraft.fileName, sizeBytes: voiceDraft.sizeBytes }); if (!result.ok) setError(result.message); else { setVoiceDraft(null); if (!messageIdsRef.current.has(result.message.id)) { messageIdsRef.current.add(result.message.id); setDeal((prev: any) => prev ? { ...prev, messages: [...prev.messages, result.message] } : prev); } void markDealThreadReadFromMobile(deal.id); } } catch { setError('تعذر إرسال الرسالة الصوتية حالياً.'); } finally { setVoiceSending(false); } }, [deal, user?.id, voiceDraft, voiceSending]);

  useEffect(() => { if (!recorderState.isRecording) { autoStopTriggeredRef.current = false; return; } if ((recorderState.durationMillis ?? 0) < MAX_VOICE_DURATION_MS || autoStopTriggeredRef.current) return; autoStopTriggeredRef.current = true; setError('وصلت للحد الأقصى لمدة الرسالة الصوتية.'); void stopVoiceRecording(); }, [recorderState.durationMillis, recorderState.isRecording, stopVoiceRecording]);
  useEffect(() => { if (!activeVoiceMessageId || !voicePlayerStatus.didJustFinish) return; voicePlayer.pause(); void voicePlayer.seekTo(0); setActiveVoiceMessageId(null); }, [activeVoiceMessageId, voicePlayer, voicePlayerStatus.didJustFinish]);
  const confirmCompletion = useCallback(async () => { if (!deal || !user?.id) return; setConfirming(true); setError(null); try { const result = await confirmDealCompletedFromMobile({ dealId: deal.id, currentUserId: user.id }); if (!result.ok) { setError(result.message); return; } void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined); await load(); } catch { setError('تعذر تأكيد الإتمام حالياً.'); } finally { setConfirming(false); } }, [deal, load, user?.id]);
  const realtimeLabel = useMemo(() => (realtimeStatus === 'live' ? 'الرسائل بتتحدث لحظيًا' : 'التحديث اللحظي غير متاح مؤقتًا'), [realtimeStatus]);

  if (!user?.id) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل الدخول لمتابعة الصفقة." /></AppScreen>;
  if (!id) return <AppScreen><EmptyState title="رابط غير صالح" description="تعذر تحديد الصفقة." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="جاري التحميل" description="نحمّل بيانات الصفقة." /></AppScreen>;
  if (error && !deal) return <AppScreen><View style={styles.group}><EmptyState title="تعذر عرض الصفقة" description={error} /><AppButton label="إعادة المحاولة" onPress={load} /></View></AppScreen>;

  const hasTypedMessage = messageBody.trim().length > 0;
  return <AppScreen><View style={styles.screen}>
    <View style={styles.chatHeaderWrap}>
      <Pressable style={styles.chatHeader} onPress={() => router.push(`/profile/${deal.otherParticipant.id}`)}>
        {deal.otherParticipant.avatarUrl ? <Image source={{ uri: deal.otherParticipant.avatarUrl }} style={styles.avatar} /> : <View style={styles.avatarFallback}><AppText weight="bold">{(deal.otherParticipant.displayName?.trim()?.[0] ?? '؟').toUpperCase()}</AppText></View>}
        <View style={styles.chatIdentity}><AppText weight="semibold" style={styles.chatName}>{deal.otherParticipant.displayName ?? 'مستخدم'}</AppText>{deal.otherParticipant.username ? <AppText muted style={styles.chatUsername}>@{deal.otherParticipant.username}</AppText> : null}<AppText muted style={styles.chatTrust}>مقايضات ناجحة: {deal.otherParticipant.successfulSwapsCount ?? 0} • معدل الرد: {formatResponseRate(deal.otherParticipant.responseRate)}</AppText><AppText muted style={styles.chatStatusLine}>{getDealStatusLabel(deal.status)} • {realtimeLabel}</AppText></View>
      </Pressable>
      <AppCard><View style={styles.compactContext}><AppText weight="semibold">{deal.requestedItem?.title ?? 'غير متاح'} ↔ {deal.offeredItem?.title ?? 'غير متاح'}</AppText><AppText muted style={styles.contextHint}>{getDealStatusNextStep(deal.status)}</AppText></View></AppCard>
    </View>

    <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      {!!error ? <AppCard><AppText muted>{error}</AppText></AppCard> : null}
      {!!voiceMessage ? <AppCard><AppText muted>{voiceMessage}</AppText></AppCard> : null}
      <View style={styles.threadSection}><View style={styles.threadTopLine}><AppText weight="semibold">المحادثة</AppText></View>
        {deal.messages.length === 0 ? <View style={styles.emptyThread}><EmptyState title="ابدأوا المحادثة" description="اكتبوا أول رسالة للتنسيق على تفاصيل المقايضة." /></View> : deal.messages.map((msg: any) => { const mine = msg.senderId === user.id; const isActiveVoice = msg.messageType === 'voice' && activeVoiceMessageId === msg.id; const elapsedMs = isActiveVoice ? Math.max(0, Math.round((voicePlayerStatus.currentTime ?? 0) * 1000)) : 0; const statusDurationMs = isActiveVoice && (voicePlayerStatus.duration ?? 0) > 0 ? Math.round((voicePlayerStatus.duration ?? 0) * 1000) : 0; const totalDurationMs = statusDurationMs > 0 ? statusDurationMs : (msg.audioDurationMs ?? 0); const voiceProgress = isActiveVoice && totalDurationMs > 0 ? Math.min(1, Math.max(0, elapsedMs / totalDurationMs)) : 0;
          return <View key={msg.id} style={[styles.messageRow, mine ? styles.myMessageRow : styles.otherMessageRow]}><View style={[styles.bubble, mine ? styles.myBubble : styles.otherBubble]}>{!mine ? <AppText muted style={styles.subtleSender}>{deal.otherParticipant.displayName ?? 'الطرف التاني'}</AppText> : null}{msg.messageType === 'voice' ? <View style={styles.voiceBubble}><View style={styles.voiceBubbleHeader}><AppText weight="semibold" style={styles.voiceTitle}>رسالة صوتية</AppText><AppButton label={voicePlaybackLoadingId === msg.id ? 'جارٍ التحميل...' : (isActiveVoice && voicePlayerStatus.playing ? 'إيقاف' : 'تشغيل')} onPress={() => { void toggleVoicePlayback(msg); }} disabled={voicePlaybackLoadingId === msg.id} variant="neutral" /></View><View style={styles.voiceProgressTrack}><View style={[styles.voiceProgressFill, { width: `${Math.round(voiceProgress * 100)}%` }]} /></View><AppText muted style={styles.metaText}>{isActiveVoice ? `${formatVoiceDuration(elapsedMs)} / ${formatVoiceDuration(totalDurationMs)}` : `المدة: ${formatVoiceDuration(msg.audioDurationMs ?? 0)}`}</AppText>{voicePlaybackError?.messageId === msg.id ? <AppText style={styles.voiceErrorText}>{voicePlaybackError?.message}</AppText> : null}</View> : <AppText style={styles.messageBody}>{msg.body}</AppText>}<AppText muted style={styles.metaText}>{new Date(msg.createdAt).toLocaleString('ar-EG')}</AppText></View></View>; })}
        {!deal.canSendMessage ? <AppText muted>المراسلة متوقفة لأن حالة الصفقة لا تسمح برسائل جديدة.</AppText> : null}
      </View>

      <View style={styles.actionsWrap}>{['coordinating', 'completed_pending_confirmation'].includes(deal.status) ? <AppCard><View style={styles.group}><AppText weight="semibold">تأكيد إتمام المقايضة</AppText><AppText>أنت: {deal.iConfirmed ? 'أكدت' : 'لسه'}</AppText><AppText>الطرف التاني: {deal.otherConfirmed ? 'أكد' : 'لسه'}</AppText><AppText muted>ما تضغطش تأكيد الإتمام غير بعد ما المقايضة تحصل فعلًا.</AppText>{deal.canConfirmCompletion ? <AppButton label={confirming ? 'جاري التأكيد...' : 'أكد إن المقايضة تمت'} onPress={confirmCompletion} disabled={confirming} /> : null}</View></AppCard> : null}
      {deal.status === 'completed' ? <AppCard><View style={styles.group}><AppText weight="semibold">المقايضة تمت بنجاح</AppText><AppText muted>تقدر تقيّم الطرف التاني بعد إتمام المقايضة.</AppText><AppButton label="قيّم التجربة" onPress={() => router.push(`/review/deal/${deal.id}`)} variant="neutral" /></View></AppCard> : null}
      <AppCard><View style={styles.group}><AppText weight="semibold">في مشكلة؟</AppText><AppText muted>لو حصل شيء غير مناسب أثناء التنسيق، ابعت بلاغًا من هنا.</AppText><AppButton label="الإبلاغ عن مشكلة" onPress={() => router.push(`/report/deal/${deal.id}`)} variant="neutral" /></View></AppCard></View>
    </KeyboardAwareScrollView>

    {deal.canSendMessage ? <KeyboardStickyView offset={{ closed: 0, opened: 8 }} style={styles.composerSticky}><View style={styles.composerShell}>
      {recorderState.isRecording ? <View style={styles.inlineRecord}><View style={styles.recordRow}><View style={styles.recordDot} /><AppText weight="semibold">جارٍ التسجيل...</AppText><AppText muted>{formatVoiceDuration(recorderState.durationMillis ?? 0)}</AppText></View><View style={styles.row}><AppButton label="إيقاف" onPress={stopVoiceRecording} disabled={voiceBusy} /><AppButton label="إلغاء" onPress={() => { void cancelVoiceDraft(); }} disabled={voiceBusy} variant="neutral" /></View></View> : null}
      {!recorderState.isRecording && voiceDraft ? <View style={styles.inlineRecord}><AppText weight="semibold">تسجيل صوتي جاهز</AppText><AppText muted>{formatVoiceDuration(voiceDraft.durationMs)} {typeof voiceDraft.sizeBytes === 'number' ? `• ${Math.max(1, Math.round(voiceDraft.sizeBytes / 1024))} ك.ب` : ''}</AppText><View style={styles.row}><AppButton label={voiceSending ? 'جاري الإرسال...' : 'إرسال'} onPress={sendVoiceDraft} disabled={voiceSending || sending || voiceBusy} /><AppButton label="حذف" onPress={() => { void cancelVoiceDraft(); }} disabled={voiceSending || voiceBusy} variant="neutral" /></View></View> : null}
      {!recorderState.isRecording && !voiceDraft ? <View style={styles.composerRow}><View style={styles.inputShell}><TextInput multiline value={messageBody} onChangeText={setMessageBody} maxLength={800} style={styles.input} placeholder="اكتب رسالة للتنسيق" textAlign="right" textAlignVertical="center" /></View><Pressable onPress={hasTypedMessage ? sendMessage : startVoiceRecording} disabled={sending || voiceSending || voiceBusy} style={styles.actionBtn}><Ionicons name={hasTypedMessage ? 'send-outline' : 'mic-outline'} size={22} color={colors.white} /></Pressable></View> : null}
    </View></KeyboardStickyView> : null}
  </View></AppScreen>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, group: { gap: spacing.sm }, row: { flexDirection: 'row', gap: spacing.sm },
  chatHeaderWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm },
  chatHeader: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, flexDirection: 'row-reverse', gap: spacing.sm, alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: radii.round }, avatarFallback: { width: 48, height: 48, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  chatIdentity: { flex: 1, gap: 2 }, chatName: { fontSize: 16, color: colors.text }, chatUsername: { fontSize: 12 }, chatTrust: { fontSize: 12 }, chatStatusLine: { fontSize: 12 },
  compactContext: { gap: 4 }, contextHint: { fontSize: 12 },
  scrollContent: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.lg, gap: spacing.sm },
  threadSection: { flex: 1, gap: spacing.sm, paddingVertical: spacing.sm }, threadTopLine: { gap: 2 }, emptyThread: { paddingVertical: spacing.lg },
  messageRow: { width: '100%' }, myMessageRow: { alignItems: 'flex-end' }, otherMessageRow: { alignItems: 'flex-start' },
  bubble: { maxWidth: '82%', paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.xl, gap: spacing.xs },
  myBubble: { backgroundColor: colors.primarySoft, borderBottomRightRadius: radii.sm }, otherBubble: { backgroundColor: colors.surface, borderBottomLeftRadius: radii.sm, borderWidth: 1, borderColor: colors.border },
  subtleSender: { fontSize: 11 }, messageBody: { lineHeight: 22, fontSize: 15, color: colors.text }, metaText: { fontSize: 11 },
  voiceBubble: { gap: spacing.xs }, voiceBubbleHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }, voiceTitle: { fontSize: 14 },
  voiceProgressTrack: { height: 6, borderRadius: radii.round, backgroundColor: colors.border, overflow: 'hidden' }, voiceProgressFill: { height: '100%', backgroundColor: colors.primary }, voiceErrorText: { fontSize: 11, color: '#B42318' },
  actionsWrap: { marginTop: spacing.md, gap: spacing.sm }, composerSticky: { paddingTop: spacing.xs },
  composerShell: { backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.sm },
  composerRow: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: spacing.sm }, inputShell: { flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radii.round, paddingHorizontal: spacing.sm, minHeight: 46, justifyContent: 'center' },
  input: { color: colors.text, maxHeight: 120, minHeight: 36, fontSize: 15 }, actionBtn: { width: 44, height: 44, borderRadius: radii.round, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  inlineRecord: { backgroundColor: colors.primarySoft, borderRadius: radii.md, padding: spacing.sm, gap: spacing.sm }, recordRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs }, recordDot: { width: 8, height: 8, borderRadius: radii.round, backgroundColor: '#B42318' },
});
