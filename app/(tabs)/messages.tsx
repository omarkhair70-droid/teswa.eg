import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppButton } from '@/components/ui/AppButton';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { fetchOffersInbox, getOfferStatusLabel, OfferRowSummary } from '@/lib/offers';
import { DealConversation, fetchDealConversationsForUser } from '@/lib/messages';
import { ContextualConversationSummary, fetchContextualConversationSummariesForUser } from '@/lib/contextual-conversations';
import { DirectConversationSummary, fetchMyDirectConversations } from '@/lib/direct-messages';

type TopSection = 'conversations' | 'offers';
type UnifiedRow = { id: string; type: 'direct' | 'deal' | 'story'; title: string; preview: string; at: string | null; route: string; avatarUrl?: string | null; unreadCount: number; requestBadge?: boolean };

function OfferRow({ offer, label }: { offer: OfferRowSummary; label: 'عرض وارد' | 'عرض مرسل' }) {
  return <AppCard style={styles.card}><Pressable onPress={() => router.push(`/offer/${offer.id}`)}><View style={styles.offerRow}><AppText weight="semibold">{label}</AppText><AppText muted>{getOfferStatusLabel(offer.status)}</AppText></View><AppText numberOfLines={1}>{offer.requestedItem?.title ?? 'عنصر غير متاح'} ↔ {offer.offeredItem?.title ?? 'عنصر غير متاح'}</AppText></Pressable></AppCard>;
}

export default function Screen() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<TopSection>('conversations');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<OfferRowSummary[]>([]);
  const [sent, setSent] = useState<OfferRowSummary[]>([]);
  const [dealConversations, setDealConversations] = useState<DealConversation[]>([]);
  const [storyReplies, setStoryReplies] = useState<ContextualConversationSummary[]>([]);
  const [directConversations, setDirectConversations] = useState<DirectConversationSummary[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true); setError(null);
    try {
      const [offersData, convosData, repliesData, directData] = await Promise.all([
        fetchOffersInbox(user.id), fetchDealConversationsForUser(user.id), fetchContextualConversationSummariesForUser(user.id), fetchMyDirectConversations(),
      ]);
      setIncoming(offersData.incomingActionableOffers); setSent(offersData.sentOffers);
      setDealConversations(convosData); setStoryReplies(repliesData); setDirectConversations(directData);
    } catch { setError('تعذر تحميل الرسائل حالياً.'); }
    finally { setLoading(false); }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const unified = useMemo<UnifiedRow[]>(() => {
    const directRows = directConversations.map((c) => ({ id: `direct-${c.conversationId}`, type: 'direct' as const, title: c.otherDisplayName ?? 'رسالة مباشرة', preview: c.lastMessageBody ?? 'ابدأ برسالة من البروفايل.', at: c.lastMessageAt, route: `/direct/${c.conversationId}`, avatarUrl: c.otherAvatarUrl, unreadCount: c.unreadCount, requestBadge: c.requiresAction }));
    const dealRows = dealConversations.map((d) => ({ id: `deal-${d.dealId}`, type: 'deal' as const, title: d.otherParticipant.displayName?.trim() || 'دردشة صفقة', preview: d.latestMessage?.body ?? 'افتح الدردشة للتنسيق.', at: d.lastActivityAt, route: `/deal/${d.dealId}`, avatarUrl: d.otherParticipant.avatarUrl, unreadCount: d.unreadCount }));
    const storyRows = storyReplies.map((s) => ({ id: `story-${s.conversationId}`, type: 'story' as const, title: s.otherParticipant.displayName?.trim() || 'رد قصة', preview: s.latestMessage?.kind === 'voice' ? 'رسالة صوتية' : (s.latestMessage?.body ?? 'افتح الرد.'), at: s.lastActivityAt, route: `/contextual/${s.conversationId}`, avatarUrl: s.otherParticipant.avatarUrl, unreadCount: s.unreadCount }));
    return [...directRows, ...dealRows, ...storyRows].sort((a, b) => (new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime()));
  }, [dealConversations, directConversations, storyReplies]);

  const typeLabel = (type: UnifiedRow['type']) => (type === 'direct' ? 'رسالة' : type === 'deal' ? 'صفقة' : 'رد قصة');

  if (!user?.id) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك لعرض الرسائل." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="جاري التحميل" description="نحضّر صندوق الرسائل." /></AppScreen>;
  if (error) return <AppScreen><View style={styles.group}><EmptyState title="حدث خطأ" description={error} /><AppButton label="إعادة المحاولة" onPress={load} /></View></AppScreen>;

  return (
    <AppScreen scrollable backgroundVariant="soft">
      <View style={styles.group}>
        <View style={styles.hero}><AppText weight="bold" style={styles.title}>الرسائل</AppText><AppText muted>كل محادثاتك في مكان واحد، والعروض بشكل منفصل.</AppText></View>
        <View style={styles.segments}>
          <Pressable style={[styles.segment, selected === 'conversations' && styles.segmentActive]} onPress={() => setSelected('conversations')}><AppText weight="semibold" style={selected === 'conversations' ? styles.segmentActiveText : undefined}>المحادثات</AppText></Pressable>
          <Pressable style={[styles.segment, selected === 'offers' && styles.segmentActive]} onPress={() => setSelected('offers')}><AppText weight="semibold" style={selected === 'offers' ? styles.segmentActiveText : undefined}>العروض</AppText></Pressable>
        </View>

        {selected === 'conversations' ? (
          unified.length ? unified.map((row) => (
            <Pressable key={row.id} onPress={() => router.push(row.route)}>
              <AppCard style={styles.card}><View style={styles.row}><View style={styles.avatarWrap}>{row.avatarUrl ? <Image source={{ uri: row.avatarUrl }} style={styles.avatar} /> : <Ionicons name="person" size={16} color={colors.textMuted} />}</View><View style={styles.main}><AppText weight="semibold" numberOfLines={1}>{row.title}</AppText><AppText muted numberOfLines={1}>{row.preview}</AppText><View style={styles.kind}><AppText muted>{typeLabel(row.type)}</AppText></View></View><View style={styles.meta}>{row.at ? <AppText muted>{new Date(row.at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</AppText> : null}{row.unreadCount > 0 ? <View style={styles.badge}><AppText weight="semibold" style={styles.badgeText}>{row.unreadCount}</AppText></View> : null}{row.requestBadge ? <AppText muted>طلب</AppText> : null}</View></View></AppCard>
            </Pressable>
          )) : <AppCard style={styles.emptyCard}><EmptyState title="مفيش محادثات بعد" description="ابدأ برسالة من أي بروفايل، أو كمل من صفقة مفتوحة." /></AppCard>
        ) : (
          <View style={styles.group}>
            {incoming.length ? incoming.map((offer) => <OfferRow key={offer.id} offer={offer} label="عرض وارد" />) : <AppCard style={styles.emptyCard}><EmptyState title="لا توجد عروض واردة" description="أي عرض جديد هيظهر هنا." /></AppCard>}
            {sent.length ? sent.map((offer) => <OfferRow key={offer.id} offer={offer} label="عرض مرسل" />) : null}
          </View>
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm }, title: { fontSize: 24 },
  hero: { borderRadius: radii.xl, padding: spacing.md, backgroundColor: colors.primarySoft, gap: spacing.xs },
  segments: { flexDirection: 'row-reverse', backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.xs, gap: spacing.xs, borderWidth: 1, borderColor: colors.border },
  segment: { flex: 1, alignItems: 'center', paddingVertical: spacing.xs, borderRadius: radii.md },
  segmentActive: { backgroundColor: colors.primary }, segmentActiveText: { color: colors.background },
  card: { borderWidth: 1, borderColor: colors.border }, emptyCard: { borderStyle: 'dashed', borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  avatarWrap: { width: 42, height: 42, borderRadius: 999, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, avatar: { width: '100%', height: '100%' },
  main: { flex: 1, gap: 4 }, kind: { alignSelf: 'flex-end', backgroundColor: colors.surface, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 2, borderWidth: 1, borderColor: colors.border },
  meta: { alignItems: 'flex-start', minHeight: 40, justifyContent: 'space-between' },
  badge: { minWidth: 20, height: 20, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, paddingHorizontal: 6 }, badgeText: { color: colors.background, fontSize: 12 },
  offerRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: spacing.xs },
});
