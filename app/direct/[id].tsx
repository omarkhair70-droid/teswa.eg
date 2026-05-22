import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useLocalSearchParams } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { radii } from '@/constants/radii';
import { useAuth } from '@/lib/auth';
import { acceptDirectMessageRequest, fetchDirectConversationMessages, fetchMyDirectConversations, ignoreDirectMessageRequest, sendDirectMessage } from '@/lib/direct-messages';

export default function DirectScreen() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const conversationId = Array.isArray(id) ? id[0] ?? '' : id ?? '';
  const [convo, setConvo] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    const [rows, summaries] = await Promise.all([fetchDirectConversationMessages(conversationId), fetchMyDirectConversations()]);
    setMessages(rows);
    setConvo(summaries.find((c) => c.conversationId === conversationId) ?? null);
    setLoading(false);
  }, [conversationId]);
  useEffect(() => { void load(); }, [load]);

  const isReceiverOnRequest = convo?.status === 'requested' && convo?.requestedBy !== user?.id;
  const isRequesterOnRequest = convo?.status === 'requested' && convo?.requestedBy === user?.id;
  const hasRequesterAlreadySent = useMemo(() => isRequesterOnRequest && messages.some((m) => m.senderId === user?.id), [isRequesterOnRequest, messages, user?.id]);

  const composerState = useMemo(() => {
    if (convo?.status === 'ignored') return { disabled: true, note: 'تم تجاهل طلب المراسلة.' };
    if (isReceiverOnRequest) return { disabled: true, note: null as string | null };
    if (isRequesterOnRequest && hasRequesterAlreadySent) return { disabled: true, note: 'هتكملوا الكلام لما الطلب يتقبل.' };
    return { disabled: false, note: null as string | null };
  }, [convo?.status, hasRequesterAlreadySent, isReceiverOnRequest, isRequesterOnRequest]);

  if (!conversationId) return <AppScreen><EmptyState title="محادثة غير صالحة" description="تعذر فتح المحادثة." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="جاري التحميل" description="نحضر المحادثة الآن." /></AppScreen>;

  return (
    <AppScreen>
      <View style={styles.header}>
        <View style={styles.avatarWrap}>{convo?.otherAvatarUrl ? <Image source={{ uri: convo.otherAvatarUrl }} style={styles.avatar} /> : <Ionicons name="person" size={18} color={colors.textMuted} />}</View>
        <View style={{ flex: 1 }}>
          <AppText weight="semibold">{convo?.otherDisplayName ?? 'محادثة مباشرة'}</AppText>
          <AppText muted>@{convo?.otherUsername ?? 'teswa'}</AppText>
        </View>
        {convo?.status === 'requested' ? <View style={styles.pill}><AppText muted>طلب مراسلة</AppText></View> : null}
      </View>

      {isReceiverOnRequest ? <View style={styles.requestBar}><AppText weight="semibold">طلب مراسلة</AppText><View style={styles.requestActions}><Pressable disabled={busy} style={styles.acceptBtn} onPress={async()=>{setBusy(true); const r=await acceptDirectMessageRequest(conversationId); setError(r.ok?null:r.message); await load(); setBusy(false);}}><AppText weight="semibold" style={styles.btnText}>قبول</AppText></Pressable><Pressable disabled={busy} style={styles.ignoreBtn} onPress={async()=>{setBusy(true); const r=await ignoreDirectMessageRequest(conversationId); setError(r.ok?null:r.message); await load(); setBusy(false);}}><AppText muted>تجاهل</AppText></Pressable></View></View> : null}
      {isRequesterOnRequest ? <AppText muted style={styles.info}>طلب المراسلة اتبعت.</AppText> : null}
      {composerState.note ? <AppText muted style={styles.info}>{composerState.note}</AppText> : null}

      <KeyboardAwareScrollView bottomOffset={96} contentContainerStyle={styles.messagesWrap}>
        {messages.map((m) => {
          const mine = m.senderId === user?.id;
          return <View key={m.id} style={[styles.bubble, mine ? styles.mine : styles.other]}><AppText>{m.body}</AppText><AppText muted style={styles.time}>{new Date(m.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</AppText></View>;
        })}
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ opened: 6, closed: 0 }}>
        <View style={styles.composer}><TextInput value={body} onChangeText={setBody} placeholder="اكتب رسالة..." placeholderTextColor={colors.textMuted} style={styles.input} editable={!composerState.disabled && !busy} multiline /><Pressable disabled={composerState.disabled || busy} style={[styles.send, (composerState.disabled || busy) && styles.sendDisabled]} onPress={async()=>{setBusy(true); const res=await sendDirectMessage(conversationId, body); if(!res.ok){setError(res.message);} else {setBody(''); setError(null); await load();} setBusy(false);}}><Ionicons name="send" size={16} color={colors.background} /></Pressable></View>
      </KeyboardStickyView>
      {error ? <AppText muted style={styles.info}>{error}</AppText> : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatarWrap: { width: 42, height: 42, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatar: { width: '100%', height: '100%' },
  pill: { backgroundColor: colors.primarySoft, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  requestBar: { margin: spacing.sm, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.sm, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  requestActions: { flexDirection: 'row-reverse', gap: spacing.xs },
  acceptBtn: { backgroundColor: colors.primary, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  ignoreBtn: { backgroundColor: colors.primarySoft, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  btnText: { color: colors.background },
  info: { paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  messagesWrap: { padding: spacing.md, gap: spacing.sm },
  bubble: { maxWidth: '80%', borderRadius: radii.lg, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: 4 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primarySoft },
  other: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  time: { fontSize: 11 },
  composer: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: spacing.xs, paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, minHeight: 42, maxHeight: 110, borderWidth: 1, borderColor: colors.border, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, textAlign: 'right', color: colors.text },
  send: { width: 38, height: 38, borderRadius: radii.round, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.45 },
});
