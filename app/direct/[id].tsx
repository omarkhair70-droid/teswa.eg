import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { acceptDirectMessageRequest, fetchDirectConversation, fetchDirectConversationMessages, ignoreDirectMessageRequest, sendDirectMessage } from '@/lib/direct-messages';
import { fetchStreamChatToken } from '@/lib/chat/stream-token';
import { getStreamDirectChannelConfig } from '@/lib/chat/stream-direct-mapping';
import { blockUserFromMobile, fetchUserBlockState, unblockUserFromMobile } from '@/lib/user-blocks';

const DIRECT_CHAT_PRO_ENABLED = true;

type StreamMessage = { id: string; text: string; createdAt: string; userId: string; userName?: string };

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
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const directActionsSheetRef = useRef<BottomSheetModal>(null);
  const streamClientRef = useRef<any>(null);
  const streamChannelRef = useRef<any>(null);

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

  const hydrateFromChannel = useCallback(() => {
    const channel = streamChannelRef.current;
    if (!channel) return;
    const mapped = (channel.state.messages ?? []).map((msg: any) => ({
      id: msg.id,
      text: msg.text ?? '',
      createdAt: msg.created_at ?? new Date().toISOString(),
      userId: msg.user?.id ?? '',
      userName: msg.user?.name,
    }));
    setStreamMessages(mapped);
  }, []);

  const cleanupStream = useCallback(async () => {
    streamChannelRef.current = null;
    setStreamReady(false);
    if (streamClientRef.current) {
      try { await streamClientRef.current.disconnectUser(); } catch {}
      streamClientRef.current = null;
    }
  }, []);

  const connectStream = useCallback(async () => {
    if (!DIRECT_CHAT_PRO_ENABLED || !convo || convo.status !== 'accepted') return;
    setStreamConnecting(true);
    setStreamError(null);
    try {
      const creds = await fetchStreamChatToken();
      if (!creds.ok) throw new Error(creds.message);
      const cfg = getStreamDirectChannelConfig({ conversationId, currentUserId: creds.userId, otherUserId: convo.otherUserId });
      const streamExpo = await import('stream-chat-expo');
      const client = streamExpo.StreamChat.getInstance(creds.apiKey);
      await client.connectUser({ id: creds.userId }, creds.token);
      const channel = client.channel(cfg.type, cfg.id, { members: cfg.members });
      await channel.watch();
      streamClientRef.current = client;
      streamChannelRef.current = channel;
      hydrateFromChannel();
      channel.on('message.new', () => hydrateFromChannel());
      channel.on('message.updated', () => hydrateFromChannel());
      channel.on('message.deleted', () => hydrateFromChannel());
      setStreamReady(true);
    } catch {
      setStreamError('الشات الجديد مش متاح دلوقتي. جرّب تاني بعد لحظات.');
      await cleanupStream();
    } finally {
      setStreamConnecting(false);
    }
  }, [cleanupStream, conversationId, convo, hydrateFromChannel]);

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
    if (!convo) return;
    if (!DIRECT_CHAT_PRO_ENABLED || convo.status !== 'accepted') return;
    void connectStream();
    return () => { void cleanupStream(); };
  }, [cleanupStream, connectStream, convo]);

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

  const statusLabel = convo?.status === 'requested' ? 'طلب مراسلة' : convo?.status === 'accepted' ? 'Direct Chat Pro' : convo?.status === 'ignored' ? 'تم التجاهل' : convo?.status === 'blocked' ? 'محظور' : null;
  const composerDisabled = composerState.disabled || sending || (acceptedDirectProActive && (!streamReady || streamConnecting));

  if (!conversationId) return <AppScreen><EmptyState title="محادثة غير صالحة" description="تعذر فتح المحادثة." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="بنجهز المحادثة..." description="" /></AppScreen>;
  if (!convo && initialLoadFailed) return <AppScreen><View style={styles.retryState}><EmptyState title="تعذر تجهيز المحادثة." description="حاول تفتحها مرة تانية." /><AppButton label="إعادة المحاولة" onPress={() => { void load(); }} /></View></AppScreen>;

  return <AppScreen>
    <View style={styles.header}>
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
    {convo?.status === 'accepted' && DIRECT_CHAT_PRO_ENABLED ? <AppText muted style={styles.info}>الرسائل الصوتية راجعة قريبًا في Direct Chat Pro.</AppText> : null}
    {streamError ? <AppCard style={styles.errorCard}><AppText muted>{streamError}</AppText><AppButton label="إعادة محاولة الشات الجديد" variant="neutral" onPress={() => { void connectStream(); }} /></AppCard> : null}

    <KeyboardAwareScrollView bottomOffset={96} contentContainerStyle={styles.messagesWrap}>
      {usingStreamChat ? (
        streamConnecting && streamMessages.length === 0 ? <EmptyState title="جارٍ تجهيز Direct Chat Pro..." description="" /> :
        streamMessages.length === 0 ? <EmptyState title="مفيش رسائل لسه" description="ابدأوا الكلام الآن." /> :
        streamMessages.map((m) => <View key={m.id} style={[styles.bubble, m.userId === user?.id ? styles.mine : styles.other]}><AppText>{m.text}</AppText>{m.userId !== user?.id && m.userName ? <AppText muted style={styles.senderHint}>{m.userName}</AppText> : null}<AppText muted style={styles.time}>{new Date(m.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</AppText></View>)
      ) : (
        messages.length === 0 ? <EmptyState title="ابدأوا الكلام" description="اكتب أول رسالة وافتح مساحة للتواصل بهدوء." /> :
        messages.map((m) => <View key={m.id} style={[styles.bubble, m.senderId === user?.id ? styles.mine : styles.other]}><AppText>{m.body}</AppText><AppText muted style={styles.time}>{new Date(m.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</AppText></View>)
      )}
    </KeyboardAwareScrollView>

    <KeyboardStickyView offset={{ opened: 6, closed: 0 }}>
      <View style={styles.composer}><TextInput value={body} onChangeText={setBody} placeholder={usingStreamChat ? 'اكتب رسالة في Direct Chat Pro...' : 'اكتب رسالة بسيطة...'} placeholderTextColor={colors.textMuted} style={styles.input} editable={!composerDisabled} multiline /><Pressable disabled={composerDisabled} style={[styles.send, composerDisabled && styles.sendDisabled]} onPress={async () => {
        const trimmed = body.trim(); if (!trimmed) return;
        setSending(true);
        try {
          if (acceptedDirectProActive) {
            if (!streamReady || !streamChannelRef.current || streamError) {
              setStreamError('الشات الجديد مش متاح دلوقتي. جرّب تاني بعد لحظات.');
              return;
            }
            await streamChannelRef.current.sendMessage({ text: trimmed });
            hydrateFromChannel();
          } else {
            const res = await sendDirectMessage(conversationId, trimmed);
            if (!res.ok) { setError(res.message); return; }
            setMessages((prev) => mergeById(prev, [{ id: res.messageId ?? `local-${Date.now()}`, senderId: user?.id, body: trimmed, messageType: 'text', createdAt: res.createdAt ?? new Date().toISOString(), readAt: null }]));
            void load({ background: true });
          }
          setBody('');
          setError(null);
        } catch {
          setError('تعذر إرسال الرسالة حالياً.');
        } finally { setSending(false); }
      }}><Ionicons name="send" size={16} color={colors.background} /></Pressable></View>
    </KeyboardStickyView>

    {error ? <AppCard style={styles.errorCard}><AppText muted>{error}</AppText></AppCard> : null}
    <AppActionSheet ref={directActionsSheetRef} title="خيارات المحادثة" actions={[{ label: 'عرض البروفايل', disabled: !convo?.otherUserId, onPress: () => { directActionsSheetRef.current?.dismiss(); if (convo?.otherUserId) router.push(`/profile/${convo.otherUserId}`); } }, { label: 'الإبلاغ عن المستخدم', tone: 'danger', disabled: !convo?.otherUserId, onPress: () => { directActionsSheetRef.current?.dismiss(); if (convo?.otherUserId) router.push(`/report/user/${convo.otherUserId}`); } }, { label: blockBusy ? 'جاري التنفيذ...' : (blockedByMe ? 'إلغاء الحظر' : 'حظر المستخدم'), tone: 'danger', disabled: blockBusy || !convo?.otherUserId || !user?.id, onPress: () => { directActionsSheetRef.current?.dismiss(); if (!convo?.otherUserId || !user?.id) return; void (async () => { setBlockBusy(true); try { const result = blockedByMe ? await unblockUserFromMobile(user.id, convo.otherUserId) : await blockUserFromMobile(user.id, convo.otherUserId); if (result.ok) { const next = await fetchUserBlockState(user.id, convo.otherUserId); if (next.ok) setBlockedByMe(next.state.blockedByMe); setError(null); } else setError('تعذر تحديث حالة الحظر حالياً.'); } catch { setError('تعذر تحديث حالة الحظر حالياً.'); } finally { setBlockBusy(false); } })(); } }]} />
  </AppScreen>;
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
  senderHint: { fontSize: 11 },
  time: { fontSize: 11 },
  composer: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: spacing.xs, paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, minHeight: 42, maxHeight: 110, borderWidth: 1, borderColor: colors.border, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, textAlign: 'right', color: colors.text },
  send: { width: 38, height: 38, borderRadius: radii.round, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.45 },
  errorCard: { marginHorizontal: spacing.sm, marginBottom: spacing.sm, gap: spacing.xs },
});
