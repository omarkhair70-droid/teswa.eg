import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { Pressable, StyleSheet, TextInput, View, Image } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { File } from "expo-file-system";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import { AppScreen } from "@/components/ui/AppScreen";
import { AppActionSheet } from "@/components/sheets/AppActionSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { TeswaMomentCard } from "@/components/ui/TeswaMomentCard";
import { SwapCeremony } from "@/components/exchange/SwapCeremony";
import { colors } from "@/constants/colors";
import { radii } from "@/constants/radii";
import { spacing } from "@/constants/spacing";
import {
  confirmDealCompletedFromMobile,
  createDealVoiceMessageSignedUrl,
  fetchDealRoomById,
  getDealStatusLabel,
  markDealThreadReadFromMobile,
  sendDealMessageFromMobile,
  sendDealVoiceMessageFromMobile,
} from "@/lib/deals";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase/client";
import { useUnreadBadges } from "@/lib/unread-badges";
import { trackEvent } from '@/lib/analytics';
import {
  blockUserFromMobile,
  fetchUserBlockState,
  unblockUserFromMobile,
} from '@/lib/user-blocks';
import { isSwapCeremonyEnabled } from '@/lib/feature-flags';

type VoiceDraft = {
  uri: string;
  durationMs: number;
  fileName: string | null;
  sizeBytes: number | null;
  mimeType: string;
};
const MAX_VOICE_DURATION_MS = 120_000;
const SWAP_CEREMONY_ENABLED = isSwapCeremonyEnabled();
const formatVoiceDuration = (durationMs: number) =>
  `${String(Math.floor(Math.max(0, Math.floor(durationMs / 1000)) / 60)).padStart(2, "0")}:${String(Math.max(0, Math.floor(durationMs / 1000)) % 60).padStart(2, "0")}`;
const formatResponseRate = (responseRate: number | null) =>
  responseRate == null || Number.isNaN(responseRate)
    ? "غير متاح بعد"
    : `${Math.round(Math.max(0, Math.min(100, responseRate)))}%`;

export default function Screen() {
  const { user } = useAuth();
  const router = useRouter();
  const { id, moment } = useLocalSearchParams<{ id?: string | string[]; moment?: string }>();
  const dealId = Array.isArray(id) ? id[0]?.trim() ?? "" : id?.trim() ?? "";
  const loadRequestRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deal, setDeal] = useState<any>(null);
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [completionMoment, setCompletionMoment] = useState<"confirmed_waiting" | "completed" | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<
    "connecting" | "live" | "unavailable"
  >("connecting");
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceSending, setVoiceSending] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [activeVoiceMessageId, setActiveVoiceMessageId] = useState<
    string | null
  >(null);
  const [voicePlaybackLoadingId, setVoicePlaybackLoadingId] = useState<
    string | null
  >(null);
  const [voicePlaybackError, setVoicePlaybackError] = useState<{
    messageId: string;
    message: string;
  } | null>(null);
  const voicePlaybackRequestRef = useRef(0);
  const dealActionsSheetRef = useRef<BottomSheetModal>(null);
  const audioModeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const messageIdsRef = useRef<Set<string>>(new Set());
  const autoStopTriggeredRef = useRef(false);
  const stopAndDiscardRef = useRef(false);
  const { refreshBadges } = useUnreadBadges();
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder, 250);
  const voicePlayer = useAudioPlayer(null, { updateInterval: 250 });
  const voicePlayerStatus = useAudioPlayerStatus(voicePlayer);
  const queueAudioModeChange = useCallback(
    (mode: { playsInSilentMode: boolean; allowsRecording: boolean }) => {
      const next = audioModeQueueRef.current
        .catch(() => undefined)
        .then(() => setAudioModeAsync(mode));
      audioModeQueueRef.current = next.catch(() => undefined);
      return next;
    },
    [],
  );

  const load = useCallback(async () => {
    if (!dealId || !user?.id) return;
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDealRoomById(dealId, user.id);
      if (requestId !== loadRequestRef.current) return;
      if (!result.ok) {
        setDeal(null);
        setError(
          result.reason === "unauthorized"
            ? "غير مسموح لك بعرض هذه الصفقة."
            : "الصفقة غير موجودة.",
        );
      } else {
        setDeal(result.deal);
        messageIdsRef.current = new Set(
          result.deal.messages.map((m: any) => m.id),
        );
        void markDealThreadReadFromMobile(dealId).finally(() => {
          void refreshBadges();
        });
      }
    } catch {
      if (requestId === loadRequestRef.current) setError("تعذر تحميل بيانات الصفقة.");
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [dealId, user?.id, refreshBadges]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!dealId || !user?.id) return;
    void trackEvent('deal_room_viewed', { route: '/deal/[id]', entityType: 'deal', entityId: dealId });
  }, [dealId, user?.id]);
  useEffect(() => {
    if (!dealId || !user?.id) return;
    const channel = supabase
      .channel(`deal_messages_${dealId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "deal_messages",
          filter: `deal_id=eq.${dealId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (messageIdsRef.current.has(row.id as string)) return;
          messageIdsRef.current.add(row.id as string);
          setDeal((prev: any) =>
            prev
              ? {
                  ...prev,
                  messages: [
                    ...prev.messages,
                    {
                      id: row.id,
                      dealId: row.deal_id,
                      senderId: row.sender_id,
                      body: row.body,
                      messageType:
                        row.message_type === "voice" ? "voice" : "text",
                      audioStoragePath: row.audio_storage_path,
                      audioDurationMs: row.audio_duration_ms,
                      audioMimeType: row.audio_mime_type,
                      audioSizeBytes: row.audio_size_bytes,
                    },
                  ],
                }
              : prev,
          );
          if ((row.sender_id as string) !== user.id) {
            void markDealThreadReadFromMobile(dealId).finally(() => {
              void refreshBadges();
            });
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeStatus("live");
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        )
          setRealtimeStatus("unavailable");
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [dealId, refreshBadges, user?.id]);

  const toggleVoicePlayback = useCallback(
    async (msg: any) => {
      if (recorderState.isRecording || voiceBusy) {
        setVoicePlaybackError({
          messageId: msg.id,
          message: "أوقف التسجيل أولًا لتشغيل الرسالة الصوتية.",
        });
        return;
      }
      if (msg.messageType !== "voice" || !msg.audioStoragePath) {
        setVoicePlaybackError({
          messageId: msg.id,
          message: "تعذر تشغيل الرسالة الصوتية.",
        });
        return;
      }
      if (activeVoiceMessageId === msg.id) {
        if (voicePlaybackError?.messageId === msg.id)
          setVoicePlaybackError(null);
        if (voicePlayerStatus.playing) voicePlayer.pause();
        else {
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
        const signedUrl = await createDealVoiceMessageSignedUrl(
          msg.audioStoragePath,
        );
        if (
          requestId !== voicePlaybackRequestRef.current ||
          recorderState.isRecording ||
          voiceBusy
        )
          return;
        if (!signedUrl) {
          setActiveVoiceMessageId(null);
          setVoicePlaybackError({
            messageId: msg.id,
            message: "تعذر تجهيز الرسالة الصوتية للتشغيل.",
          });
          setVoicePlaybackLoadingId(null);
          return;
        }
        await queueAudioModeChange({
          playsInSilentMode: true,
          allowsRecording: false,
        });
        if (
          requestId !== voicePlaybackRequestRef.current ||
          recorderState.isRecording ||
          voiceBusy
        )
          return;
        setActiveVoiceMessageId(msg.id);
        if (
          requestId !== voicePlaybackRequestRef.current ||
          recorderState.isRecording ||
          voiceBusy
        )
          return;
        voicePlayer.replace(signedUrl);
        if (
          requestId !== voicePlaybackRequestRef.current ||
          recorderState.isRecording ||
          voiceBusy
        )
          return;
        try {
          await voicePlayer.seekTo(0);
        } catch {}
        if (
          requestId !== voicePlaybackRequestRef.current ||
          recorderState.isRecording ||
          voiceBusy
        )
          return;
        voicePlayer.play();
        setVoicePlaybackLoadingId(null);
      } catch {
        if (requestId === voicePlaybackRequestRef.current) {
          setActiveVoiceMessageId(null);
          setVoicePlaybackError({
            messageId: msg.id,
            message: "تعذر تشغيل الرسالة الصوتية حالياً.",
          });
          setVoicePlaybackLoadingId(null);
        }
      }
    },
    [
      activeVoiceMessageId,
      queueAudioModeChange,
      recorderState.isRecording,
      voiceBusy,
      voicePlaybackError?.messageId,
      voicePlayer,
      voicePlayerStatus.currentTime,
      voicePlayerStatus.duration,
      voicePlayerStatus.playing,
    ],
  );


  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id || !deal?.otherParticipant?.id) return;
      const state = await fetchUserBlockState(user.id, deal.otherParticipant.id);
      if (cancelled) return;
      if (state.ok) {
        setBlockedByMe(state.state.blockedByMe);
      } else {
        setBlockError(state.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deal?.otherParticipant?.id, user?.id]);

  const onToggleBlock = useCallback(async () => {
    if (!user?.id || !deal?.otherParticipant?.id || blockBusy) return;
    setBlockBusy(true);
    setBlockError(null);
    try {
      const result = blockedByMe
        ? await unblockUserFromMobile(user.id, deal.otherParticipant.id)
        : await blockUserFromMobile(user.id, deal.otherParticipant.id);
      if (!result.ok) {
        setBlockError(result.message);
        return;
      }
      const refreshed = await fetchUserBlockState(user.id, deal.otherParticipant.id);
      if (refreshed.ok) {
        setBlockedByMe(refreshed.state.blockedByMe);
      } else {
        setBlockError(refreshed.message);
      }
    } catch {
      setBlockError("تعذر تحديث حالة الحظر حالياً.");
    } finally {
      setBlockBusy(false);
    }
  }, [blockBusy, blockedByMe, deal?.otherParticipant?.id, user?.id]);

  const sendMessage = useCallback(async () => {
    if (!deal || !user?.id) return;
    setError(null);
    setSending(true);
    try {
      const result = await sendDealMessageFromMobile({
        dealId: deal.id,
        currentUserId: user.id,
        body: messageBody,
      });
      if (!result.ok) setError(result.message);
      else {
        setMessageBody("");
        if (!messageIdsRef.current.has(result.message.id)) {
          messageIdsRef.current.add(result.message.id);
          setDeal((prev: any) =>
            prev
              ? { ...prev, messages: [...prev.messages, result.message] }
              : prev,
          );
        }
        void markDealThreadReadFromMobile(deal.id);
        void trackEvent('deal_message_sent', {
          route: '/deal/[id]',
          entityType: 'deal',
          entityId: deal.id,
          metadata: { messageType: 'text' },
        });
      }
    } catch {
      setError("تعذر إرسال الرسالة حالياً.");
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
        setError("تعذر حفظ التسجيل الصوتي. حاول مرة أخرى.");
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
        setError("التسجيل قصير جدًا. سجّل رسالة أوضح.");
        return;
      }
      const fileName = uri.split("/").pop() || "voice-message.m4a";
      let sizeBytes: number | null = null;
      try {
        const fileInfo = await new File(uri).info();
        sizeBytes = typeof fileInfo.size === "number" ? fileInfo.size : null;
      } catch {
        sizeBytes = null;
      }
      setVoiceDraft({
        uri,
        durationMs: safeDurationMs,
        fileName,
        sizeBytes,
        mimeType: "audio/m4a",
      });
    } catch {
      setError("تعذر حفظ التسجيل الصوتي. حاول مرة أخرى.");
    } finally {
      setVoiceBusy(false);
    }
  }, [
    audioRecorder,
    recorderState.durationMillis,
    recorderState.isRecording,
    voiceBusy,
  ]);
  const startVoiceRecording = useCallback(async () => {
    if (
      !deal ||
      !user?.id ||
      !deal.canSendMessage ||
      recorderState.isRecording ||
      voiceBusy ||
      voiceSending
    )
      return;
    setError(null);
    setVoiceMessage(null);
    setVoiceDraft(null);
    stopAndDiscardRef.current = false;
    autoStopTriggeredRef.current = false;
    setVoiceBusy(true);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError("نحتاج إذن الميكروفون لتسجيل الرسائل الصوتية.");
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
    } catch {
      setError("تعذر بدء التسجيل الصوتي. حاول مرة أخرى.");
    } finally {
      setVoiceBusy(false);
    }
  }, [
    audioRecorder,
    deal,
    queueAudioModeChange,
    recorderState.isRecording,
    user?.id,
    voiceBusy,
    voicePlayer,
    voiceSending,
  ]);
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
      if (!result.ok) setError(result.message);
      else {
        setVoiceDraft(null);
        if (!messageIdsRef.current.has(result.message.id)) {
          messageIdsRef.current.add(result.message.id);
          setDeal((prev: any) =>
            prev
              ? { ...prev, messages: [...prev.messages, result.message] }
              : prev,
          );
        }
        void markDealThreadReadFromMobile(deal.id);
        void trackEvent('deal_message_sent', {
          route: '/deal/[id]',
          entityType: 'deal',
          entityId: deal.id,
          metadata: {
            messageType: 'voice',
            voiceDurationBucket: voiceDraft.durationMs < 15000 ? 'short' : voiceDraft.durationMs < 60000 ? 'medium' : 'long',
          },
        });
      }
    } catch {
      setError("تعذر إرسال الرسالة الصوتية حالياً.");
    } finally {
      setVoiceSending(false);
    }
  }, [deal, user?.id, voiceDraft, voiceSending]);

  useEffect(() => {
    if (!recorderState.isRecording) {
      autoStopTriggeredRef.current = false;
      return;
    }
    if (
      (recorderState.durationMillis ?? 0) < MAX_VOICE_DURATION_MS ||
      autoStopTriggeredRef.current
    )
      return;
    autoStopTriggeredRef.current = true;
    setError("وصلت للحد الأقصى لمدة الرسالة الصوتية.");
    void stopVoiceRecording();
  }, [
    recorderState.durationMillis,
    recorderState.isRecording,
    stopVoiceRecording,
  ]);
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
      const result = await confirmDealCompletedFromMobile({
        dealId: deal.id,
        currentUserId: user.id,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
      setCompletionMoment(result.completed ? "completed" : "confirmed_waiting");
      await load();
    } catch {
      setError("تعذر تأكيد الإتمام حالياً.");
    } finally {
      setConfirming(false);
    }
  }, [deal, load, user?.id]);
  const realtimeLabel = useMemo(
    () =>
      realtimeStatus === "live"
        ? "الرسائل بتتحدث لحظيًا"
        : "التحديث اللحظي غير متاح مؤقتًا",
    [realtimeStatus],
  );

  if (!user?.id)
    return (
      <AppScreen>
        <EmptyState
          title="تسجيل الدخول مطلوب"
          description="سجّل الدخول لمتابعة الصفقة."
        />
      </AppScreen>
    );
  if (!dealId)
    return (
      <AppScreen>
        <View style={styles.group}>
          <EmptyState title="تعذر عرض الصفقة" description="معرّف الصفقة غير صالح أو المحادثة محذوفة." />
          <AppButton label="العودة إلى الرسائل" variant="neutral" onPress={() => router.replace('/(tabs)/messages')} />
        </View>
      </AppScreen>
    );
  if (loading)
    return (
      <AppScreen>
        <EmptyState title="جاري التحميل" description="نحمّل بيانات الصفقة." />
      </AppScreen>
    );
  if (error && !deal)
    return (
      <AppScreen>
        <View style={styles.group}>
          <EmptyState title="تعذر عرض الصفقة" description={error} />
          <AppButton label="إعادة المحاولة" onPress={load} />
          <AppButton label="العودة إلى الرسائل" variant="neutral" onPress={() => router.replace('/(tabs)/messages')} />
        </View>
      </AppScreen>
    );

  const hasTypedMessage = messageBody.trim().length > 0;
  return (
    <AppScreen>
      <View style={styles.screen}>
        <View style={styles.dealHeaderWrap}>
          <View style={styles.dealHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="رجوع"
              style={styles.headerIconButton}
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-forward" size={20} color={colors.text} />
            </Pressable>
            <Pressable
              style={styles.headerIdentity}
              onPress={() => router.push(`/profile/${deal.otherParticipant.id}`)}
            >
              {deal.otherParticipant.avatarUrl ? (
                <Image source={{ uri: deal.otherParticipant.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <AppText weight="bold">{(deal.otherParticipant.displayName?.trim()?.[0] ?? "؟").toUpperCase()}</AppText>
                </View>
              )}
              <View style={styles.chatIdentity}>
                <AppText weight="bold" style={styles.chatName} numberOfLines={1}>{deal.otherParticipant.displayName ?? "مستخدم"}</AppText>
                <View style={styles.identityMetaRow}>
                  {deal.otherParticipant.username ? <AppText muted style={styles.chatUsername}>@{deal.otherParticipant.username}</AppText> : null}
                  <View style={styles.identityMetaDot} />
                  <AppText muted style={styles.chatTrust}>{deal.otherParticipant.successfulSwapsCount ?? 0} مقايضات • {formatResponseRate(deal.otherParticipant.responseRate)} رد</AppText>
                </View>
                <View style={styles.liveStatusRow}>
                  <View style={[styles.liveDot, realtimeStatus !== "live" && styles.liveDotMuted]} />
                  <AppText muted style={styles.chatStatusLine}>{realtimeLabel}</AppText>
                </View>
              </View>
            </Pressable>
            <Pressable
              style={styles.headerIconButton}
              onPress={() => dealActionsSheetRef.current?.present()}
              accessibilityRole="button"
              accessibilityLabel="فتح إجراءات الصفقة"
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.dealContextCard}>
            <View style={styles.dealContextHeader}>
              <View style={styles.dealContextCopy}>
                <AppText muted style={styles.contextEyebrow}>الصفقة</AppText>
                <AppText weight="bold" style={styles.contextHeading}>تنسيق التبديل</AppText>
              </View>
              <View style={styles.dealStatusPill}><AppText style={styles.dealStatusText}>{getDealStatusLabel(deal.status)}</AppText></View>
            </View>
            <View style={styles.tradePairRow}>
              <View style={styles.tradeMiniCard}>
                {deal.requestedItem?.imageUrl ? <Image source={{ uri: deal.requestedItem.imageUrl }} style={styles.tradeMiniImage} /> : <View style={[styles.tradeMiniImage, styles.tradeMiniPlaceholder]}><Ionicons name="image-outline" size={16} color={colors.textMuted} /></View>}
                <View style={styles.tradeMiniCopy}><AppText muted style={styles.tradeMiniLabel}>المطلوب</AppText><AppText weight="semibold" numberOfLines={1}>{deal.requestedItem?.title ?? "غير متاح"}</AppText></View>
              </View>
              <View style={styles.tradeArrow}><Ionicons name="swap-horizontal" size={18} color={colors.primary} /></View>
              <View style={[styles.tradeMiniCard, styles.tradeMiniCardAccent]}>
                {deal.offeredItem?.imageUrl ? <Image source={{ uri: deal.offeredItem.imageUrl }} style={styles.tradeMiniImage} /> : <View style={[styles.tradeMiniImage, styles.tradeMiniPlaceholder]}><Ionicons name="image-outline" size={16} color={colors.textMuted} /></View>}
                <View style={styles.tradeMiniCopy}><AppText muted style={styles.tradeMiniLabel}>المعروض</AppText><AppText weight="semibold" numberOfLines={1}>{deal.offeredItem?.title ?? "غير متاح"}</AppText></View>
              </View>
            </View>
          </View>
        </View>

        <KeyboardAwareScrollView
          bottomOffset={24}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {!!error ? <View style={[styles.inlineNotice, styles.errorNotice]}><Ionicons name="alert-circle-outline" size={17} color="#B42318" /><AppText style={styles.noticeErrorText}>{error}</AppText></View> : null}
          {!!voiceMessage ? <View style={styles.inlineNotice}><Ionicons name="information-circle-outline" size={17} color={colors.primary} /><AppText muted style={styles.noticeText}>{voiceMessage}</AppText></View> : null}
          {moment === "accepted" && deal.status !== "cancelled" && SWAP_CEREMONY_ENABLED ? (
            <SwapCeremony
              status="accepted"
              requestedItemTitle={deal.requestedItem?.title}
              offeredItemTitle={deal.offeredItem?.title}
              requestedItemImageUrl={deal.requestedItem?.imageUrl ?? undefined}
              offeredItemImageUrl={deal.offeredItem?.imageUrl ?? undefined}
              onClose={() => router.replace(`/deal/${deal.id}`)}
            />
          ) : null}
          {completionMoment === "confirmed_waiting" ? (
            <TeswaMomentCard
              eyebrow="تأكيدك اتسجل"
              title="مستنيين الطرف التاني"
              body="تأكيدك اتسجل. مستنيين الطرف التاني."
              icon="hourglass-outline"
              tone="waiting"
            />
          ) : null}
          {completionMoment === "completed" && deal.status === "completed" ? (
            <View style={styles.groupGap}>
              {SWAP_CEREMONY_ENABLED ? <SwapCeremony
                status="completed"
                requestedItemTitle={deal.requestedItem?.title}
                offeredItemTitle={deal.offeredItem?.title}
                requestedItemImageUrl={deal.requestedItem?.imageUrl ?? undefined}
                offeredItemImageUrl={deal.offeredItem?.imageUrl ?? undefined}
                onClose={() => router.push(`/review/deal/${deal.id}`)}
              /> : null}
              <AppButton label="كمل المحادثة" onPress={() => setCompletionMoment(null)} />
            </View>
          ) : null}
          {["coordinating", "completed_pending_confirmation"].includes(deal.status) ? (
            <View style={styles.completionPanel}>
              <View style={styles.completionHeader}>
                <View style={styles.completionIcon}><Ionicons name="checkmark-done-outline" size={20} color={colors.primary} /></View>
                <View style={styles.completionCopy}>
                  <AppText muted style={styles.contextEyebrow}>خطوة الصفقة</AppText>
                  <AppText weight="bold" style={styles.completionTitle}>أكدوا لما التبديل يتم</AppText>
                  <AppText muted style={styles.completionHint}>الإتمام بيتقفل لما الطرفين يأكدوا إن المقايضة حصلت فعلًا.</AppText>
                </View>
              </View>
              <View style={styles.confirmationRow}>
                <View style={[styles.confirmationChip, deal.iConfirmed && styles.confirmationChipDone]}><Ionicons name={deal.iConfirmed ? "checkmark-circle" : "ellipse-outline"} size={15} color={deal.iConfirmed ? colors.primary : colors.textMuted} /><AppText muted>{deal.iConfirmed ? "أنت أكدت" : "تأكيدك مستني"}</AppText></View>
                <View style={[styles.confirmationChip, deal.otherConfirmed && styles.confirmationChipDone]}><Ionicons name={deal.otherConfirmed ? "checkmark-circle" : "ellipse-outline"} size={15} color={deal.otherConfirmed ? colors.primary : colors.textMuted} /><AppText muted>{deal.otherConfirmed ? "الطرف التاني أكد" : "تأكيده مستني"}</AppText></View>
              </View>
              <AppButton
                label={confirming ? "جاري التأكيد..." : deal.iConfirmed ? "تم تسجيل تأكيدك" : "أكد إن المقايضة تمت"}
                onPress={() => { void confirmCompletion(); }}
                disabled={!deal.canConfirmCompletion || confirming}
              />
            </View>
          ) : null}
          {blockError ? (
            <AppCard style={styles.blockErrorCard}>
              <AppText muted>{blockError}</AppText>
            </AppCard>
          ) : null}
          <View style={styles.threadSection}>
            <View style={styles.threadTopLine}>
              <View style={styles.threadHeadingCopy}><AppText muted style={styles.contextEyebrow}>تنسيق الصفقة</AppText><AppText weight="bold" style={styles.threadHeading}>المحادثة</AppText></View>
              <View style={styles.threadLivePill}><View style={[styles.liveDot, realtimeStatus !== "live" && styles.liveDotMuted]} /><AppText muted style={styles.threadLiveText}>{realtimeStatus === "live" ? "مباشر" : "غير متصل"}</AppText></View>
            </View>
            {deal.messages.length === 0 ? (
              <View style={styles.emptyThread}>
                <EmptyState
                  title="ابدأوا المحادثة"
                  description="اكتبوا أول رسالة للتنسيق على تفاصيل المقايضة."
                />
              </View>
            ) : (
              deal.messages.map((msg: any) => {
                const mine = msg.senderId === user.id;
                const isActiveVoice =
                  msg.messageType === "voice" &&
                  activeVoiceMessageId === msg.id;
                const elapsedMs = isActiveVoice
                  ? Math.max(
                      0,
                      Math.round((voicePlayerStatus.currentTime ?? 0) * 1000),
                    )
                  : 0;
                const statusDurationMs =
                  isActiveVoice && (voicePlayerStatus.duration ?? 0) > 0
                    ? Math.round((voicePlayerStatus.duration ?? 0) * 1000)
                    : 0;
                const totalDurationMs =
                  statusDurationMs > 0
                    ? statusDurationMs
                    : (msg.audioDurationMs ?? 0);
                const voiceProgress =
                  isActiveVoice && totalDurationMs > 0
                    ? Math.min(1, Math.max(0, elapsedMs / totalDurationMs))
                    : 0;
                return (
                  <View
                    key={msg.id}
                    style={[
                      styles.messageRow,
                      mine ? styles.myMessageRow : styles.otherMessageRow,
                    ]}
                  >
                    <View
                      style={[
                        styles.bubble,
                        mine ? styles.myBubble : styles.otherBubble,
                      ]}
                    >
                      {!mine ? (
                        <AppText muted style={styles.subtleSender}>
                          {deal.otherParticipant.displayName ?? "الطرف التاني"}
                        </AppText>
                      ) : null}
                      {msg.messageType === "voice" ? (
                        <View style={styles.voiceBubble}>
                          <View style={styles.voiceBubbleHeader}>
                            <AppText
                              weight="semibold"
                              style={styles.voiceTitle}
                            >
                              رسالة صوتية
                            </AppText>
                            <AppButton
                              label={
                                voicePlaybackLoadingId === msg.id
                                  ? "جارٍ التحميل..."
                                  : isActiveVoice && voicePlayerStatus.playing
                                    ? "إيقاف"
                                    : "تشغيل"
                              }
                              onPress={() => {
                                void toggleVoicePlayback(msg);
                              }}
                              disabled={voicePlaybackLoadingId === msg.id}
                              variant="neutral"
                            />
                          </View>
                          <View style={styles.voiceProgressTrack}>
                            <View
                              style={[
                                styles.voiceProgressFill,
                                {
                                  width: `${Math.round(voiceProgress * 100)}%`,
                                },
                              ]}
                            />
                          </View>
                          <AppText muted style={styles.metaText}>
                            {isActiveVoice
                              ? `${formatVoiceDuration(elapsedMs)} / ${formatVoiceDuration(totalDurationMs)}`
                              : `المدة: ${formatVoiceDuration(msg.audioDurationMs ?? 0)}`}
                          </AppText>
                          {voicePlaybackError?.messageId === msg.id ? (
                            <AppText style={styles.voiceErrorText}>
                              {voicePlaybackError?.message}
                            </AppText>
                          ) : null}
                        </View>
                      ) : (
                        <AppText style={styles.messageBody}>{msg.body}</AppText>
                      )}
                      <AppText muted style={styles.metaText}>
                        {new Date(msg.createdAt).toLocaleString("ar-EG")}
                      </AppText>
                    </View>
                  </View>
                );
              })
            )}
            {!deal.canSendMessage ? (
              <AppText muted>
                المراسلة متوقفة لأن حالة الصفقة لا تسمح برسائل جديدة.
              </AppText>
            ) : null}
          </View>

        </KeyboardAwareScrollView>
        <AppActionSheet
          ref={dealActionsSheetRef}
          title="خيارات الصفقة"
          description="إدارة المحادثة والصفقة بأمان."
          actions={[
            {
              label: "عرض بروفايل الطرف الآخر",
              onPress: () => {
                dealActionsSheetRef.current?.dismiss();
                router.push(`/profile/${deal.otherParticipant.id}`);
              },
            },
            ...(deal.status === "completed" && !deal.alreadyRated
              ? [
                  {
                    label: "قيّم التجربة",
                    onPress: () => {
                      dealActionsSheetRef.current?.dismiss();
                      router.push(`/review/deal/${deal.id}`);
                    },
                  },
                ]
              : []),
            {
              label: "الإبلاغ عن الصفقة",
              tone: "danger",
              onPress: () => {
                dealActionsSheetRef.current?.dismiss();
                router.push(`/report/deal/${deal.id}`);
              },
            },
            {
              label: blockBusy ? "جاري التنفيذ..." : blockedByMe ? "إلغاء الحظر" : "حظر المستخدم",
              tone: "danger",
              disabled: blockBusy,
              onPress: () => {
                dealActionsSheetRef.current?.dismiss();
                void onToggleBlock();
              },
            },
          ]}
        />

        {deal.canSendMessage ? (
          <KeyboardStickyView
            offset={{ closed: 0, opened: 8 }}
            style={styles.composerSticky}
          >
            <View style={styles.composerShell}>
              {recorderState.isRecording ? (
                <View style={styles.inlineRecord}>
                  <View style={styles.recordRow}>
                    <View style={styles.recordDot} />
                    <AppText weight="semibold">جارٍ التسجيل...</AppText>
                    <AppText muted>
                      {formatVoiceDuration(recorderState.durationMillis ?? 0)}
                    </AppText>
                  </View>
                  <View style={styles.row}>
                    <AppButton
                      label="إيقاف"
                      onPress={stopVoiceRecording}
                      disabled={voiceBusy}
                    />
                    <AppButton
                      label="إلغاء"
                      onPress={() => {
                        void cancelVoiceDraft();
                      }}
                      disabled={voiceBusy}
                      variant="neutral"
                    />
                  </View>
                </View>
              ) : null}
              {!recorderState.isRecording && voiceDraft ? (
                <View style={styles.inlineRecord}>
                  <AppText weight="semibold">تسجيل صوتي جاهز</AppText>
                  <AppText muted>
                    {formatVoiceDuration(voiceDraft.durationMs)}{" "}
                    {typeof voiceDraft.sizeBytes === "number"
                      ? `• ${Math.max(1, Math.round(voiceDraft.sizeBytes / 1024))} ك.ب`
                      : ""}
                  </AppText>
                  <View style={styles.row}>
                    <AppButton
                      label={voiceSending ? "جاري الإرسال..." : "إرسال"}
                      onPress={sendVoiceDraft}
                      disabled={voiceSending || sending || voiceBusy}
                    />
                    <AppButton
                      label="حذف"
                      onPress={() => {
                        void cancelVoiceDraft();
                      }}
                      disabled={voiceSending || voiceBusy}
                      variant="neutral"
                    />
                  </View>
                </View>
              ) : null}
              {!recorderState.isRecording && !voiceDraft ? (
                <View style={styles.composerRow}>
                  <View style={styles.inputShell}>
                    <TextInput
                      multiline
                      value={messageBody}
                      onChangeText={setMessageBody}
                      maxLength={800}
                      style={styles.input}
                      placeholder="اكتب رسالة للتنسيق"
                      textAlign="right"
                      textAlignVertical="center"
                    />
                  </View>
                  <Pressable
                    onPress={
                      hasTypedMessage ? sendMessage : startVoiceRecording
                    }
                    disabled={sending || voiceSending || voiceBusy}
                    style={styles.actionBtn}
                  >
                    <Ionicons
                      name={hasTypedMessage ? "send-outline" : "mic-outline"}
                      size={22}
                      color={colors.white}
                    />
                  </Pressable>
                </View>
              ) : null}
            </View>
          </KeyboardStickyView>
        ) : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  group: { gap: spacing.sm },
  groupGap: { gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm },
  dealHeaderWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm },
  dealHeader: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  headerIconButton: { width: 40, height: 40, borderRadius: radii.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  headerIdentity: { flex: 1, minHeight: 52, flexDirection: "row-reverse", gap: spacing.sm, alignItems: "center" },
  avatar: { width: 44, height: 44, borderRadius: radii.round },
  avatarFallback: { width: 44, height: 44, borderRadius: radii.round, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: '#D9B8A3', alignItems: "center", justifyContent: "center" },
  chatIdentity: { flex: 1, gap: 2, alignItems: "flex-end" },
  chatName: { fontSize: 16, color: colors.text },
  chatUsername: { fontSize: 11 },
  chatTrust: { fontSize: 10 },
  identityMetaRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  identityMetaDot: { width: 3, height: 3, borderRadius: radii.round, backgroundColor: colors.border },
  liveStatusRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: radii.round, backgroundColor: colors.accent },
  liveDotMuted: { backgroundColor: colors.textMuted },
  chatStatusLine: { fontSize: 10 },
  dealContextCard: { borderWidth: 1, borderColor: '#D9B8A3', backgroundColor: '#F7E8DD', borderRadius: radii.xl, padding: spacing.sm, gap: spacing.sm },
  dealContextHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  dealContextCopy: { flex: 1, alignItems: "flex-end", gap: 1 },
  contextEyebrow: { fontSize: 10 },
  contextHeading: { fontSize: 17 },
  dealStatusPill: { borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 5, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  dealStatusText: { color: colors.primary, fontSize: 10 },
  tradePairRow: { flexDirection: "row-reverse", alignItems: "center", gap: 7 },
  tradeMiniCard: { flex: 1, minWidth: 0, flexDirection: "row-reverse", alignItems: "center", gap: 7, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 7 },
  tradeMiniCardAccent: { borderColor: '#C7DDD7', backgroundColor: colors.accentSoft },
  tradeMiniImage: { width: 42, height: 42, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  tradeMiniPlaceholder: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" },
  tradeMiniCopy: { flex: 1, minWidth: 0, gap: 1, alignItems: "flex-end" },
  tradeMiniLabel: { fontSize: 9 },
  tradeArrow: { width: 30, height: 30, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  threadSection: { flex: 1, gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.sm },
  threadTopLine: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  threadHeadingCopy: { flex: 1, alignItems: "flex-end", gap: 1 },
  threadHeading: { fontSize: 17 },
  threadLivePill: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radii.round, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  threadLiveText: { fontSize: 9 },
  emptyThread: { paddingVertical: spacing.lg },
  messageRow: { width: "100%" },
  myMessageRow: { alignItems: "flex-end" },
  otherMessageRow: { alignItems: "flex-start" },
  bubble: { maxWidth: "82%", paddingVertical: 9, paddingHorizontal: 12, borderRadius: 20, gap: 4, borderWidth: 1 },
  myBubble: { backgroundColor: '#F1DDCF', borderColor: '#D9B8A3', borderTopRightRadius: 7 },
  otherBubble: { backgroundColor: colors.surface, borderColor: colors.border, borderTopLeftRadius: 7 },
  subtleSender: { fontSize: 10 },
  messageBody: { lineHeight: 21, fontSize: 15, color: colors.text, textAlign: "right" },
  metaText: { fontSize: 10 },
  voiceBubble: { gap: spacing.xs },
  completionPanel: { gap: spacing.sm, borderWidth: 1, borderColor: '#C7DDD7', backgroundColor: colors.accentSoft, borderRadius: radii.xl, padding: spacing.md },
  completionHeader: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  completionIcon: { width: 44, height: 44, borderRadius: radii.round, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  completionCopy: { flex: 1, gap: 3, alignItems: "flex-end" },
  completionTitle: { fontSize: 18 },
  completionHint: { textAlign: "right", lineHeight: 19 },
  confirmationRow: { flexDirection: "row-reverse", gap: spacing.xs, flexWrap: "wrap" },
  confirmationChip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  confirmationChipDone: { borderColor: '#C7DDD7', backgroundColor: colors.background },
  inlineNotice: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.sm },
  errorNotice: { borderColor: '#F0C7C1', backgroundColor: '#FFF2F0' },
  noticeText: { flex: 1, textAlign: "right" },
  noticeErrorText: { flex: 1, color: '#B42318', textAlign: "right" },
  blockErrorCard: { gap: spacing.xs },
  voiceBubbleHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  voiceTitle: { fontSize: 14 },
  voiceProgressTrack: {
    height: 6,
    borderRadius: radii.round,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  voiceProgressFill: { height: "100%", backgroundColor: colors.primary },
  voiceErrorText: { fontSize: 11, color: "#B42318" },
  composerSticky: { paddingTop: spacing.xs },
  composerShell: { backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingTop: 8, paddingBottom: spacing.sm, gap: spacing.xs },
  composerRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  inputShell: { flex: 1, backgroundColor: '#FBF7F2', borderWidth: 1, borderColor: colors.border, borderRadius: radii.round, paddingHorizontal: spacing.md, minHeight: 46, justifyContent: "center" },
  input: { color: colors.text, maxHeight: 120, minHeight: 36, fontSize: 15 },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineRecord: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  recordRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.xs,
  },
  recordDot: {
    width: 8,
    height: 8,
    borderRadius: radii.round,
    backgroundColor: "#B42318",
  },
});
