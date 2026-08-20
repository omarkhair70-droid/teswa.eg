import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { KeyboardStickyView, useKeyboardState } from 'react-native-keyboard-controller';
import { router, useLocalSearchParams } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { ChatComposer } from '@/components/messaging/ChatComposer';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { sendNativeDirectMessage } from '@/lib/chat/supabase-direct-chat';
import {
  fetchDirectConversation,
  fetchMyDirectConversations,
  startOrGetDirectConversation,
} from '@/lib/direct-messages';
import { fetchPublicProfileById, type PublicProfile } from '@/lib/profiles';
import { showToast } from '@/lib/toast';

function normalizeRouteParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0]?.trim() ?? '' : value?.trim() ?? '';
}

export default function DirectComposeScreen() {
  const { user } = useAuth();
  const { targetUserId: targetParam } = useLocalSearchParams<{ targetUserId?: string | string[] }>();
  const targetUserId = normalizeRouteParam(targetParam);
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !targetUserId) return;
    setLoading(true);
    setError(null);
    try {
      const [rows, targetProfile] = await Promise.all([
        fetchMyDirectConversations(),
        fetchPublicProfileById(targetUserId),
      ]);
      const existing = rows.find((row) => row.otherUserId === targetUserId);
      if (existing) {
        router.replace(`/direct/${existing.conversationId}`);
        return;
      }
      if (!targetProfile) {
        setError('الحساب غير متاح حالياً.');
        return;
      }
      setProfile(targetProfile);
    } catch {
      setError('تعذر تجهيز المراسلة حالياً.');
    } finally {
      setLoading(false);
    }
  }, [targetUserId, user?.id]);

  useEffect(() => { void load(); }, [load]);

  const sendFirstMessage = useCallback(async () => {
    const text = body.trim();
    if (!user?.id || !targetUserId || !text || sending) return;
    setSending(true);
    setError(null);
    try {
      const start = await startOrGetDirectConversation(targetUserId);
      if (!start.ok || !start.conversationId) throw new Error(start.message);

      const current = await fetchDirectConversation(start.conversationId);
      if (current?.status === 'requested' && current.requestedBy !== user.id) {
        showToast({ title: 'عندك طلب مراسلة من الشخص ده.' });
        router.replace(`/direct/${start.conversationId}`);
        return;
      }

      const result = await sendNativeDirectMessage({
        conversationId: start.conversationId,
        body: text,
      });
      if (!result.ok) throw new Error(result.message);

      setBody('');
      showToast({ title: start.status === 'accepted' ? 'تم إرسال الرسالة.' : 'تم إرسال طلب المراسلة.' });
      router.replace(`/direct/${start.conversationId}`);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'تعذر إرسال الرسالة حالياً.');
    } finally {
      setSending(false);
    }
  }, [body, sending, targetUserId, user?.id]);

  if (!user?.id) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل الدخول علشان تبدأ المراسلة." /></AppScreen>;
  if (!targetUserId) return <AppScreen><EmptyState title="تعذر فتح المراسلة" description="الحساب المطلوب غير صالح." /></AppScreen>;
  if (loading) return <AppScreen style={styles.screen} backgroundVariant="none"><View style={styles.center}><ActivityIndicator color={colors.primary} /><AppText muted>بنجهز المراسلة...</AppText></View></AppScreen>;
  if (!profile) return <AppScreen><View style={styles.center}><EmptyState title="تعذر فتح المراسلة" description={error ?? 'الحساب غير متاح.'} /><Pressable onPress={() => { void load(); }}><AppText weight="semibold" style={styles.retry}>حاول تاني</AppText></Pressable></View></AppScreen>;

  const displayName = profile.display_name?.trim() || profile.username?.trim() || 'مستخدم تِسوى';

  return (
    <AppScreen style={styles.screen} backgroundVariant="none">
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.identity}>
          <View style={styles.avatarWrap}>
            {profile.avatar_url ? <ExpoImage source={{ uri: profile.avatar_url }} style={styles.avatar} contentFit="cover" /> : <Ionicons name="person" size={21} color={colors.textMuted} />}
          </View>
          <View style={styles.identityCopy}>
            <AppText weight="bold" numberOfLines={1}>{displayName}</AppText>
            <AppText muted style={styles.subtitle}>أول رسالة هي اللي هتبعت طلب المراسلة</AppText>
          </View>
        </View>
        <View style={styles.headerButton} />
      </View>

      <View style={styles.body}>
        <View style={styles.emptyIcon}><Ionicons name="chatbubble-ellipses-outline" size={27} color={colors.primary} /></View>
        <AppText weight="bold" style={styles.emptyTitle}>ابدأ برسالة</AppText>
        <AppText muted style={styles.emptyText}>فتح الشاشة لوحده مش بيبعت أي طلب. الطلب بيتسجل بس لما تضغط إرسال لأول رسالة.</AppText>
      </View>

      <KeyboardStickyView enabled={keyboardVisible} offset={{ opened: 0, closed: 0 }}>
        <ChatComposer
          value={body}
          onChangeText={setBody}
          onSend={() => { void sendFirstMessage(); }}
          disabled={sending}
          sending={sending}
          maxLength={1200}
          placeholder="اكتب أول رسالة..."
        />
      </KeyboardStickyView>

      {error ? <View style={styles.errorBar}><Ionicons name="alert-circle-outline" size={16} color={colors.danger} /><AppText style={styles.errorText}>{error}</AppText></View> : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 0, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  retry: { color: colors.primary },
  header: { minHeight: 64, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  identity: { flex: 1, minWidth: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  avatarWrap: { width: 42, height: 42, borderRadius: 21, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: '100%', height: '100%' },
  identityCopy: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 2 },
  subtitle: { fontSize: 11.5, textAlign: 'right' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 38 },
  emptyIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  emptyTitle: { fontSize: 18 },
  emptyText: { textAlign: 'center', lineHeight: 20 },
  errorBar: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, textAlign: 'right' },
});
