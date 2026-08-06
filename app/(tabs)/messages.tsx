import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppFadeIn } from '@/components/motion/AppFadeIn';
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
import {
  formatConversationListTime,
  mergeDirectConversationStreamActivity,
  subscribeToDirectInboxStreamUpdates,
} from '@/lib/chat/direct-inbox-stream';
import { useUnreadBadges } from '@/lib/unread-badges';

type TopSection = 'conversations' | 'offers';
type ConversationFilter = 'all' | 'direct' | 'deal' | 'story' | 'requests';
type UnifiedRow = { id: string; type: 'direct' | 'deal' | 'story'; title: string; preview: string; at: string | null; route: string; avatarUrl?: string | null; unreadCount: number; requestBadge?: boolean; swapContext?: string | null };

function OfferRow({ offer, label }: { offer: OfferRowSummary; label: 'عرض وارد' | 'عرض مرسل' }) {
  const hasDealChat = offer.status === 'accepted' && !!offer.dealId;
  return (
    <AppCard style={styles.offerCard}>
      <Pressable onPress={() => router.push(`/offer/${offer.id}`)}>
        <View style={styles.offerRow}><AppText weight="semibold">{label}</AppText><AppText muted>{getOfferStatusLabel(offer.status)}</AppText></View>
        <AppText numberOfLines={1}>{offer.requestedItem?.title ?? 'عنصر غير متاح'} ↔ {offer.offeredItem?.title ?? 'عنصر غير متاح'}</AppText>
      </Pressable>
      {hasDealChat ? <Pressable style={styles.openChatCta} onPress={() => router.push(`/deal/${offer.dealId}`)}><AppText muted>افتح الدردشة</AppText></Pressable> : null}
    </AppCard>
  );
}

export default function Screen() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<TopSection>('conversations');
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<OfferRowSummary[]>([]);
  const [sent, setSent] = useState<OfferRowSummary[]>([]);
  const [dealConversations, setDealConversations] = useState<DealConversation[]>([]);
  const [storyReplies, setStoryReplies] = useState<ContextualConversationSummary[]>([]);
  const [directConversations, setDirectConversations] = useState<DirectConversationSummary[]>([]);
  const { refreshBadges } = useUnreadBadges();

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true); setError(null);
    try {
      const [offersData, convosData, repliesData, directData] = await Promise.all([
        fetchOffersInbox(user.id), fetchDealConversationsForUser(user.id), fetchContextualConversationSummariesForUser(user.id), fetchMyDirectConversations(),
      ]);
      const hydratedDirectData =
        await mergeDirectConversationStreamActivity(
          directData,
          user.id,
        );
      setIncoming(offersData.incomingActionableOffers); setSent(offersData.sentOffers);
      setDealConversations(convosData); setStoryReplies(repliesData); setDirectConversations(hydratedDirectData);
      void refreshBadges();
    } catch { setError('تعذر تحميل الرسائل حالياً.'); }
    finally { setLoading(false); }
  }, [refreshBadges, user?.id]);
  const refreshDirectInbox = useCallback(async () => {
    if (!user?.id) return;

    const directData = await fetchMyDirectConversations();

    const hydratedDirectData =
      await mergeDirectConversationStreamActivity(
        directData,
        user.id,
      );

    setDirectConversations(hydratedDirectData);
    void refreshBadges();
  }, [refreshBadges, user?.id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useFocusEffect(
    useCallback(() => {
      let active = true;
      let unsubscribe: (() => void) | null = null;

      void subscribeToDirectInboxStreamUpdates(() => {
        if (active) {
          void refreshDirectInbox();
        }
      }).then((cleanup) => {
        if (active) {
          unsubscribe = cleanup;
        } else {
          cleanup();
        }
      });

      return () => {
        active = false;
        unsubscribe?.();
      };
    }, [refreshDirectInbox]),
  );
  const unified = useMemo<UnifiedRow[]>(() => {
    const directRows = directConversations.map((c) => ({ id: `direct-${c.conversationId}`, type: 'direct' as const, title: c.otherDisplayName ?? 'رسالة مباشرة', preview: c.lastMessageBody ?? 'ابدأ برسالة من البروفايل.', at: c.lastMessageAt, route: `/direct/${c.conversationId}`, avatarUrl: c.otherAvatarUrl, unreadCount: c.unreadCount, requestBadge: c.requiresAction, swapContext: null }));
    const dealRows = dealConversations.map((d) => ({ id: `deal-${d.dealId}`, type: 'deal' as const, title: d.otherParticipant.displayName?.trim() || 'دردشة صفقة', preview: d.latestMessage?.messageType === 'voice' ? 'رسالة صوتية' : (d.latestMessage?.body ?? 'افتح الدردشة للتنسيق.'), at: d.lastActivityAt, route: `/deal/${d.dealId}`, avatarUrl: d.otherParticipant.avatarUrl, unreadCount: d.unreadCount, swapContext: `${d.requestedItemTitle} ↔ ${d.offeredItemTitle}` }));
    const storyRows = storyReplies.map((s) => ({ id: `story-${s.conversationId}`, type: 'story' as const, title: s.otherParticipant.displayName?.trim() || 'رد قصة', preview: s.latestMessage?.kind === 'voice' ? 'رسالة صوتية' : (s.latestMessage?.body ?? 'افتح الرد.'), at: s.lastActivityAt, route: `/contextual/${s.conversationId}`, avatarUrl: s.otherParticipant.avatarUrl, unreadCount: s.unreadCount, swapContext: null }));
    return [...directRows, ...dealRows, ...storyRows].sort((a, b) => (new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime()));
  }, [dealConversations, directConversations, storyReplies]);

  const unreadTotal = useMemo(() => unified.reduce((sum, row) => sum + row.unreadCount, 0), [unified]);
  const requestsTotal = useMemo(() => directConversations.filter((row) => row.requiresAction).length, [directConversations]);
  const offersTotal = incoming.length + sent.length;

  const filteredConversations = useMemo(() => {
    if (conversationFilter === 'all') return unified;
    if (conversationFilter === 'requests') return unified.filter((row) => !!row.requestBadge);
    return unified.filter((row) => row.type === conversationFilter);
  }, [conversationFilter, unified]);

  const typeChip = (type: UnifiedRow['type']) => {
    if (type === 'direct') return { label: 'مباشر', icon: 'chatbubble-outline' as const };
    if (type === 'deal') return { label: 'صفقات', icon: 'swap-horizontal-outline' as const };
    return { label: 'قصص', icon: 'sparkles-outline' as const };
  };

  if (!user?.id) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك لعرض مركز الرسائل." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="جاري التحميل" description="نحضّر مركز الرسائل لك الآن." /></AppScreen>;
  if (error) return <AppScreen><View style={styles.group}><EmptyState title="حدث خطأ" description={error} /><AppButton label="إعادة المحاولة" onPress={load} /></View></AppScreen>;

  return (
    <AppScreen scrollable backgroundVariant="soft">
      <View style={styles.group}>
        <AppFadeIn>
          <AppCard style={styles.hero}>
            <View style={styles.heroOrb}><Ionicons name="chatbubbles-outline" size={20} color={colors.primary} /></View>
            <AppText weight="bold" style={styles.title}>مركز الرسائل</AppText>
            <AppText muted>كل حديثك في تِسوى — مباشر وواضح.</AppText>
          </AppCard>
        </AppFadeIn>

        <AppFadeIn delay={40}>
          <View style={styles.summaryGrid}>
            <AppCard style={styles.summaryCard}><AppText muted>غير مقروء</AppText><AppText weight="bold" style={styles.summaryValue}>{unreadTotal}</AppText></AppCard>
            <AppCard style={styles.summaryCard}><AppText muted>طلبات</AppText><AppText weight="bold" style={styles.summaryValue}>{requestsTotal}</AppText></AppCard>
            <AppCard style={styles.summaryCard}><AppText muted>عروض</AppText><AppText weight="bold" style={styles.summaryValue}>{offersTotal}</AppText></AppCard>
          </View>
        </AppFadeIn>

        <AppFadeIn delay={70}>
          <View style={styles.segments}>
            <Pressable style={[styles.segment, selected === 'conversations' && styles.segmentActive]} onPress={() => setSelected('conversations')}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={selected === 'conversations' ? colors.background : colors.textMuted} />
              <AppText weight="semibold" style={selected === 'conversations' ? styles.segmentActiveText : undefined}>المحادثات</AppText>
            </Pressable>
            <Pressable style={[styles.segment, selected === 'offers' && styles.segmentActive]} onPress={() => setSelected('offers')}>
              <Ionicons name="swap-horizontal-outline" size={16} color={selected === 'offers' ? colors.background : colors.textMuted} />
              <AppText weight="semibold" style={selected === 'offers' ? styles.segmentActiveText : undefined}>العروض</AppText>
            </Pressable>
          </View>
        </AppFadeIn>

        {selected === 'conversations' ? (
          <View style={styles.group}>
            <View style={styles.filterRow}>
              {[
                { key: 'all', label: 'الكل' },
                { key: 'direct', label: 'مباشر' },
                { key: 'deal', label: 'صفقات' },
                { key: 'story', label: 'قصص' },
                { key: 'requests', label: 'طلبات' },
              ].map((filter) => (
                <Pressable key={filter.key} style={[styles.filterChip, conversationFilter === filter.key && styles.filterChipActive]} onPress={() => setConversationFilter(filter.key as ConversationFilter)}>
                  <AppText style={conversationFilter === filter.key ? styles.filterChipActiveText : styles.filterChipText} weight="semibold">{filter.label}</AppText>
                </Pressable>
              ))}
            </View>

            {filteredConversations.length ? filteredConversations.map((row) => {
              const chip = typeChip(row.type);
              const formattedTime = formatConversationListTime(row.at);
              return (
                                <Pressable
                  key={row.id}
                  onPress={() => router.push(row.route)}
                >
                  <AppCard style={styles.card}>
                    <View style={styles.row}>
                      <View style={styles.avatarWrap}>
                        {row.avatarUrl ? (
                          <Image
                            source={{ uri: row.avatarUrl }}
                            style={styles.avatar}
                          />
                        ) : (
                          <Ionicons
                            name="person"
                            size={16}
                            color={colors.textMuted}
                          />
                        )}
                      </View>

                      <View style={styles.main}>
                        <View style={styles.headerRow}>
                          <AppText
                            weight="semibold"
                            numberOfLines={1}
                            style={styles.rowTitle}
                          >
                            {row.title}
                          </AppText>

                          <View style={styles.kind}>
                            <Ionicons
                              name={chip.icon}
                              size={12}
                              color={colors.textMuted}
                            />
                            <AppText muted style={styles.kindText}>
                              {chip.label}
                            </AppText>
                          </View>
                        </View>

                        <AppText muted numberOfLines={1}>
                          {row.preview}
                        </AppText>

                        {row.swapContext ? (
                          <AppText
                            muted
                            numberOfLines={1}
                            style={styles.swapContext}
                          >
                            {row.swapContext}
                          </AppText>
                        ) : null}

                        {row.requestBadge ? (
                          <View style={styles.requestBadge}>
                            <AppText style={styles.requestBadgeText}>
                              طلب مراسلة
                            </AppText>
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.meta}>
                        {formattedTime ? (
                          <AppText muted>{formattedTime}</AppText>
                        ) : null}

                        {row.unreadCount > 0 ? (
                          <View style={styles.badge}>
                            <AppText
                              weight="semibold"
                              style={styles.badgeText}
                            >
                              {row.unreadCount}
                            </AppText>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </AppCard>
                </Pressable>
              );
            }) : <AppCard style={styles.emptyCard}><EmptyState title={unified.length ? 'مفيش نتائج في النوع ده' : 'لسه مفيش محادثات'} description="ابدأ من بروفايل أو صفقة، وأول رسالة تفتح باب التبادل." /></AppCard>}
          </View>
        ) : (
          <View style={styles.group}>
            <AppCard style={styles.offerSection}><View style={styles.offerSectionHeader}><Ionicons name="arrow-down-circle-outline" size={18} color={colors.primary} /><AppText weight="semibold">عروض تنتظر ردك</AppText></View>{incoming.length ? incoming.map((offer) => <OfferRow key={offer.id} offer={offer} label="عرض وارد" />) : <AppCard style={styles.emptyCard}><EmptyState title="لسه مفيش عروض واردة" description="أول فرصة تبادل جديدة هتظهر هنا." /></AppCard>}</AppCard>
            <AppCard style={styles.offerSection}><View style={styles.offerSectionHeader}><Ionicons name="arrow-up-circle-outline" size={18} color={colors.primary} /><AppText weight="semibold">عروضك المرسلة</AppText></View>{sent.length ? sent.map((offer) => <OfferRow key={offer.id} offer={offer} label="عرض مرسل" />) : <AppCard style={styles.emptyCard}><EmptyState title="لسه ما بدأتش عروض" description="ابدأ بعرض بسيط من صفحة أي عنصر، ويمكن منها تبدأ صفقة حلوة." /></AppCard>}</AppCard>
          </View>
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.md }, title: { fontSize: 24 },
  hero: { borderRadius: radii.xl, padding: spacing.md, backgroundColor: colors.primarySoft, gap: spacing.xs, borderWidth: 1, borderColor: colors.border },
  heroOrb: { width: 38, height: 38, borderRadius: 999, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  summaryGrid: { flexDirection: 'row-reverse', gap: spacing.sm },
  summaryCard: { flex: 1, borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: 2, paddingVertical: spacing.sm },
  summaryValue: { fontSize: 20 },
  segments: { flexDirection: 'row-reverse', backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.xs, gap: spacing.xs, borderWidth: 1, borderColor: colors.border },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm, borderRadius: radii.md, gap: 4, borderWidth: 1, borderColor: 'transparent' },
  segmentActive: { backgroundColor: colors.primary, borderColor: colors.primary }, segmentActiveText: { color: colors.background },
  filterRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  filterChip: { borderRadius: radii.round, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: 6, backgroundColor: colors.surface },
  filterChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  filterChipText: { color: colors.textMuted }, filterChipActiveText: { color: colors.primary },
  card: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md },
  emptyCard: { borderStyle: 'dashed', borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  avatarWrap: { width: 44, height: 44, borderRadius: 999, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, avatar: { width: '100%', height: '100%' },
  main: { flex: 1, gap: 4 }, headerRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs }, rowTitle: { flex: 1, textAlign: 'right' },
  kind: { flexDirection: 'row-reverse', alignItems: 'center', alignSelf: 'flex-end', gap: 4, backgroundColor: colors.surface, borderRadius: radii.round, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border },
  kindText: { fontSize: 11 }, swapContext: { fontSize: 12 },
  requestBadge: { alignSelf: 'flex-end', backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  requestBadgeText: { color: colors.primary, fontSize: 11, fontWeight: '600' },
  meta: { alignItems: 'flex-start', minHeight: 40, justifyContent: 'space-between' },
  badge: { minWidth: 24, height: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, paddingHorizontal: 7 }, badgeText: { color: colors.background, fontSize: 12 },
  offerSection: { gap: spacing.xs, borderWidth: 1, borderColor: colors.border },
  offerSectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  offerCard: { borderWidth: 1, borderColor: colors.border },
  offerRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: spacing.xs },
  openChatCta: { marginTop: spacing.xs, alignSelf: 'flex-end', borderWidth: 1, borderColor: colors.border, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 4 },
});
