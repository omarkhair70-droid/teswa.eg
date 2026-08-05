import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
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
import {
  ContextualConversationSummary,
  fetchContextualConversationSummariesForUser,
} from '@/lib/contextual-conversations';
import {
  DirectConversationSummary,
  fetchMyDirectConversations,
} from '@/lib/direct-messages';
import { useUnreadBadges } from '@/lib/unread-badges';

type TopSection = 'conversations' | 'offers';
type ConversationFilter = 'all' | 'direct' | 'deal' | 'story' | 'requests' | 'unread';
type UnifiedRow = {
  id: string;
  type: 'direct' | 'deal' | 'story';
  title: string;
  preview: string;
  at: string | null;
  route: string;
  avatarUrl?: string | null;
  unreadCount: number;
  requestBadge?: boolean;
  swapContext?: string | null;
};

const FILTERS: { key: ConversationFilter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'unread', label: 'غير مقروء' },
  { key: 'requests', label: 'طلبات' },
  { key: 'direct', label: 'مباشر' },
  { key: 'deal', label: 'صفقات' },
  { key: 'story', label: 'قصص' },
];

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase('ar-EG');
}

function formatConversationTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'أمس';

  return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
}

function getConversationKind(type: UnifiedRow['type']) {
  if (type === 'direct') {
    return { label: 'مباشر', icon: 'chatbubble-ellipses-outline' as const, color: colors.primary };
  }
  if (type === 'deal') {
    return { label: 'صفقة', icon: 'swap-horizontal-outline' as const, color: colors.accent };
  }
  return { label: 'قصة', icon: 'sparkles-outline' as const, color: '#8B5F9A' };
}

function OfferRow({ offer, direction }: { offer: OfferRowSummary; direction: 'incoming' | 'sent' }) {
  const incoming = direction === 'incoming';
  const hasDealChat = offer.status === 'accepted' && !!offer.dealId;
  const requestedTitle = offer.requestedItem?.title ?? 'عنصر غير متاح';
  const offeredTitle = offer.offeredItem?.title ?? 'عنصر غير متاح';

  return (
    <View style={styles.offerRowCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${incoming ? 'عرض وارد' : 'عرض مرسل'}: ${requestedTitle} مقابل ${offeredTitle}`}
        onPress={() => router.push(`/offer/${offer.id}`)}
        style={({ pressed }) => [styles.offerPressable, pressed && styles.pressed]}
      >
        <View style={styles.offerTopRow}>
          <View style={[styles.directionIcon, incoming ? styles.incomingIcon : styles.sentIcon]}>
            <Ionicons
              name={incoming ? 'arrow-down-outline' : 'arrow-up-outline'}
              size={16}
              color={incoming ? colors.primary : colors.accent}
            />
          </View>
          <View style={styles.offerHeadingCopy}>
            <AppText weight="semibold">{incoming ? 'عرض مستني ردك' : 'عرض أرسلته'}</AppText>
            <AppText muted style={styles.offerStatus}>{getOfferStatusLabel(offer.status)}</AppText>
          </View>
          <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
        </View>

        <View style={styles.swapLine}>
          <AppText numberOfLines={1} style={styles.swapItem}>{requestedTitle}</AppText>
          <View style={styles.swapGlyph}>
            <Ionicons name="swap-horizontal" size={15} color={colors.primary} />
          </View>
          <AppText numberOfLines={1} style={styles.swapItem}>{offeredTitle}</AppText>
        </View>
      </Pressable>

      {hasDealChat ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="فتح دردشة الصفقة"
          style={({ pressed }) => [styles.dealChatButton, pressed && styles.pressed]}
          onPress={() => router.push(`/deal/${offer.dealId}`)}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.accent} />
          <AppText weight="semibold" style={styles.dealChatLabel}>افتح دردشة الصفقة</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function ConversationRow({ row }: { row: UnifiedRow }) {
  const kind = getConversationKind(row.type);
  const hasUnread = row.unreadCount > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.title}. ${row.preview}${hasUnread ? `. ${row.unreadCount} رسائل غير مقروءة` : ''}`}
      onPress={() => router.push(row.route)}
      style={({ pressed }) => [styles.conversationCard, hasUnread && styles.unreadConversation, pressed && styles.pressed]}
    >
      {hasUnread ? <View style={styles.unreadRail} /> : null}

      <View style={styles.avatarWrap}>
        {row.avatarUrl ? (
          <Image source={{ uri: row.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Ionicons name="person-outline" size={21} color={colors.textMuted} />
          </View>
        )}
        <View style={[styles.kindDot, { backgroundColor: kind.color }]}>
          <Ionicons name={kind.icon} size={10} color={colors.white} />
        </View>
      </View>

      <View style={styles.conversationMain}>
        <View style={styles.conversationHeader}>
          <AppText weight={hasUnread ? 'bold' : 'semibold'} numberOfLines={1} style={styles.conversationTitle}>
            {row.title}
          </AppText>
          <AppText muted style={styles.timeText}>{formatConversationTime(row.at)}</AppText>
        </View>

        <AppText
          muted={!hasUnread}
          numberOfLines={1}
          style={[styles.preview, hasUnread && styles.unreadPreview]}
        >
          {row.preview}
        </AppText>

        <View style={styles.conversationFooter}>
          <View style={styles.contextCluster}>
            <View style={styles.kindLabel}>
              <View style={[styles.kindLabelDot, { backgroundColor: kind.color }]} />
              <AppText muted style={styles.kindLabelText}>{kind.label}</AppText>
            </View>
            {row.swapContext ? (
              <AppText muted numberOfLines={1} style={styles.swapContext}>{row.swapContext}</AppText>
            ) : null}
            {row.requestBadge ? (
              <View style={styles.requestBadge}>
                <Ionicons name="hand-left-outline" size={11} color={colors.primary} />
                <AppText weight="semibold" style={styles.requestBadgeText}>طلب مراسلة</AppText>
              </View>
            ) : null}
          </View>

          {hasUnread ? (
            <View style={styles.unreadBadge}>
              <AppText weight="bold" style={styles.unreadBadgeText}>
                {row.unreadCount > 99 ? '99+' : row.unreadCount}
              </AppText>
            </View>
          ) : (
            <Ionicons name="chevron-back" size={16} color={colors.border} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function Screen() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<TopSection>('conversations');
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<OfferRowSummary[]>([]);
  const [sent, setSent] = useState<OfferRowSummary[]>([]);
  const [dealConversations, setDealConversations] = useState<DealConversation[]>([]);
  const [storyReplies, setStoryReplies] = useState<ContextualConversationSummary[]>([]);
  const [directConversations, setDirectConversations] = useState<DirectConversationSummary[]>([]);
  const { refreshBadges } = useUnreadBadges();

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!user?.id) return;
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [offersData, convosData, repliesData, directData] = await Promise.all([
        fetchOffersInbox(user.id),
        fetchDealConversationsForUser(user.id),
        fetchContextualConversationSummariesForUser(user.id),
        fetchMyDirectConversations(),
      ]);
      setIncoming(offersData.incomingActionableOffers);
      setSent(offersData.sentOffers);
      setDealConversations(convosData);
      setStoryReplies(repliesData);
      setDirectConversations(directData);
      void refreshBadges();
    } catch {
      setError('تعذر تحميل الرسائل حالياً. جرّب مرة تانية.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshBadges, user?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const unified = useMemo<UnifiedRow[]>(() => {
    const directRows = directConversations.map((conversation) => ({
      id: `direct-${conversation.conversationId}`,
      type: 'direct' as const,
      title: conversation.otherDisplayName ?? 'رسالة مباشرة',
      preview: conversation.lastMessageBody ?? 'ابدأ برسالة من البروفايل.',
      at: conversation.lastMessageAt,
      route: `/direct/${conversation.conversationId}`,
      avatarUrl: conversation.otherAvatarUrl,
      unreadCount: conversation.unreadCount,
      requestBadge: conversation.requiresAction,
      swapContext: null,
    }));
    const dealRows = dealConversations.map((deal) => ({
      id: `deal-${deal.dealId}`,
      type: 'deal' as const,
      title: deal.otherParticipant.displayName?.trim() || 'دردشة صفقة',
      preview: deal.latestMessage?.messageType === 'voice'
        ? 'رسالة صوتية'
        : (deal.latestMessage?.body ?? 'افتح الدردشة للتنسيق.'),
      at: deal.lastActivityAt,
      route: `/deal/${deal.dealId}`,
      avatarUrl: deal.otherParticipant.avatarUrl,
      unreadCount: deal.unreadCount,
      swapContext: `${deal.requestedItemTitle} ↔ ${deal.offeredItemTitle}`,
    }));
    const storyRows = storyReplies.map((story) => ({
      id: `story-${story.conversationId}`,
      type: 'story' as const,
      title: story.otherParticipant.displayName?.trim() || 'رد قصة',
      preview: story.latestMessage?.kind === 'voice'
        ? 'رسالة صوتية'
        : (story.latestMessage?.body ?? 'افتح الرد.'),
      at: story.lastActivityAt,
      route: `/contextual/${story.conversationId}`,
      avatarUrl: story.otherParticipant.avatarUrl,
      unreadCount: story.unreadCount,
      swapContext: null,
    }));

    return [...directRows, ...dealRows, ...storyRows].sort(
      (a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime(),
    );
  }, [dealConversations, directConversations, storyReplies]);

  const unreadTotal = useMemo(
    () => unified.reduce((sum, row) => sum + row.unreadCount, 0),
    [unified],
  );
  const requestsTotal = useMemo(
    () => directConversations.filter((row) => row.requiresAction).length,
    [directConversations],
  );
  const offersTotal = incoming.length + sent.length;

  const filteredConversations = useMemo(() => {
    let rows = unified;
    if (conversationFilter === 'unread') rows = rows.filter((row) => row.unreadCount > 0);
    else if (conversationFilter === 'requests') rows = rows.filter((row) => !!row.requestBadge);
    else if (conversationFilter !== 'all') rows = rows.filter((row) => row.type === conversationFilter);

    const query = normalizeSearch(searchQuery);
    if (!query) return rows;
    return rows.filter((row) => normalizeSearch(`${row.title} ${row.preview} ${row.swapContext ?? ''}`).includes(query));
  }, [conversationFilter, searchQuery, unified]);

  const filteredOffers = useMemo(() => {
    const query = normalizeSearch(searchQuery);
    if (!query) return { incoming, sent };
    const matches = (offer: OfferRowSummary) => normalizeSearch(
      `${offer.requestedItem?.title ?? ''} ${offer.offeredItem?.title ?? ''} ${getOfferStatusLabel(offer.status)}`,
    ).includes(query);
    return { incoming: incoming.filter(matches), sent: sent.filter(matches) };
  }, [incoming, searchQuery, sent]);

  if (!user?.id) {
    return (
      <AppScreen>
        <View style={styles.centerState}>
          <EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك علشان تشوف رسائلك وعروضك." />
        </View>
      </AppScreen>
    );
  }

  if (loading) {
    return (
      <AppScreen backgroundVariant="soft">
        <View style={styles.loadingState}>
          <View style={styles.loadingIcon}>
            <Ionicons name="chatbubbles-outline" size={25} color={colors.primary} />
          </View>
          <ActivityIndicator color={colors.primary} />
          <AppText weight="semibold">بنجمّع محادثاتك</AppText>
          <AppText muted style={styles.centerCopy}>المباشر والصفقات وردود القصص في مكان واحد.</AppText>
        </View>
      </AppScreen>
    );
  }

  if (error && unified.length === 0 && offersTotal === 0) {
    return (
      <AppScreen>
        <View style={styles.centerState}>
          <EmptyState title="الرسائل مش ظاهرة دلوقتي" description={error} />
          <AppButton label="إعادة المحاولة" onPress={() => void load()} />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen scrollable backgroundVariant="soft">
      <View style={styles.page}>
        <AppFadeIn>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <View style={styles.eyebrowRow}>
                <View style={styles.liveDot} />
                <AppText muted style={styles.eyebrow}>تواصل تِسوى</AppText>
              </View>
              <AppText weight="bold" style={styles.title}>رسائلك</AppText>
              <AppText muted style={styles.subtitle}>كل محادثة وعرض، من غير زحمة.</AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="تحديث الرسائل"
              disabled={refreshing}
              onPress={() => void load('refresh')}
              style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="refresh-outline" size={20} color={colors.primary} />
              )}
            </Pressable>
          </View>
        </AppFadeIn>

        <AppFadeIn delay={35}>
          <View style={styles.signalStrip}>
            <View style={styles.signalItem}>
              <AppText weight="bold" style={styles.signalValue}>{unreadTotal}</AppText>
              <AppText muted style={styles.signalLabel}>غير مقروء</AppText>
            </View>
            <View style={styles.signalDivider} />
            <View style={styles.signalItem}>
              <AppText weight="bold" style={styles.signalValue}>{requestsTotal}</AppText>
              <AppText muted style={styles.signalLabel}>طلبات</AppText>
            </View>
            <View style={styles.signalDivider} />
            <View style={styles.signalItem}>
              <AppText weight="bold" style={styles.signalValue}>{offersTotal}</AppText>
              <AppText muted style={styles.signalLabel}>عروض</AppText>
            </View>
          </View>
        </AppFadeIn>

        <AppFadeIn delay={55}>
          <View style={styles.searchShell}>
            <Ionicons name="search-outline" size={19} color={colors.textMuted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={selected === 'conversations' ? 'دور باسم شخص أو رسالة' : 'دور في العروض والعناصر'}
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              textAlign="right"
              returnKeyType="search"
              accessibilityLabel="بحث داخل مركز الرسائل"
            />
            {searchQuery ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="مسح البحث"
                hitSlop={8}
                onPress={() => setSearchQuery('')}
                style={styles.clearSearch}
              >
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </AppFadeIn>

        <AppFadeIn delay={75}>
          <View style={styles.segments}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: selected === 'conversations' }}
              style={[styles.segment, selected === 'conversations' && styles.segmentActive]}
              onPress={() => setSelected('conversations')}
            >
              <Ionicons
                name={selected === 'conversations' ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
                size={17}
                color={selected === 'conversations' ? colors.white : colors.textMuted}
              />
              <AppText weight="semibold" style={selected === 'conversations' ? styles.segmentActiveText : styles.segmentText}>
                المحادثات
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: selected === 'offers' }}
              style={[styles.segment, selected === 'offers' && styles.segmentActive]}
              onPress={() => setSelected('offers')}
            >
              <Ionicons
                name={selected === 'offers' ? 'swap-horizontal' : 'swap-horizontal-outline'}
                size={17}
                color={selected === 'offers' ? colors.white : colors.textMuted}
              />
              <AppText weight="semibold" style={selected === 'offers' ? styles.segmentActiveText : styles.segmentText}>
                العروض
              </AppText>
              {incoming.length > 0 ? (
                <View style={styles.segmentCount}>
                  <AppText weight="bold" style={styles.segmentCountText}>{incoming.length}</AppText>
                </View>
              ) : null}
            </Pressable>
          </View>
        </AppFadeIn>

        {error ? (
          <View style={styles.inlineError}>
            <Ionicons name="cloud-offline-outline" size={17} color={colors.danger} />
            <AppText style={styles.inlineErrorText}>{error}</AppText>
            <Pressable onPress={() => void load('refresh')} hitSlop={8}>
              <AppText weight="semibold" style={styles.retryText}>حاول تاني</AppText>
            </Pressable>
          </View>
        ) : null}

        {selected === 'conversations' ? (
          <View style={styles.section}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterContent}
              style={styles.filterScroller}
            >
              {FILTERS.map((filter) => {
                const active = conversationFilter === filter.key;
                return (
                  <Pressable
                    key={filter.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setConversationFilter(filter.key)}
                  >
                    <AppText weight="semibold" style={active ? styles.filterChipActiveText : styles.filterChipText}>
                      {filter.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.sectionHeading}>
              <View>
                <AppText weight="bold" style={styles.sectionTitle}>
                  {conversationFilter === 'all' ? 'آخر المحادثات' : 'النتائج'}
                </AppText>
                <AppText muted style={styles.sectionMeta}>{filteredConversations.length} محادثة</AppText>
              </View>
              {unreadTotal > 0 ? (
                <View style={styles.attentionPill}>
                  <Ionicons name="ellipse" size={8} color={colors.primary} />
                  <AppText weight="semibold" style={styles.attentionText}>فيه جديد</AppText>
                </View>
              ) : null}
            </View>

            <View style={styles.conversationList}>
              {filteredConversations.length ? (
                filteredConversations.map((row) => <ConversationRow key={row.id} row={row} />)
              ) : (
                <AppCard style={styles.emptyCard}>
                  <EmptyState
                    title={searchQuery ? 'مفيش نتيجة بالبحث ده' : unified.length ? 'مفيش محادثات في النوع ده' : 'لسه مفيش محادثات'}
                    description={searchQuery ? 'جرّب اسم مختلف أو امسح البحث.' : 'ابدأ من بروفايل أو عنصر، وأول رسالة هتظهر هنا.'}
                  />
                </AppCard>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <View>
                <AppText weight="bold" style={styles.sectionTitle}>العروض والصفقات</AppText>
                <AppText muted style={styles.sectionMeta}>تابع القرار والخطوة الجاية</AppText>
              </View>
              <View style={styles.offerLegend}>
                <Ionicons name="shield-checkmark-outline" size={15} color={colors.accent} />
                <AppText muted style={styles.offerLegendText}>الحالة محفوظة</AppText>
              </View>
            </View>

            <View style={styles.offerGroup}>
              <View style={styles.offerGroupHeader}>
                <View style={styles.offerGroupIcon}>
                  <Ionicons name="arrow-down-outline" size={17} color={colors.primary} />
                </View>
                <View style={styles.offerGroupCopy}>
                  <AppText weight="bold">مستنيين ردك</AppText>
                  <AppText muted style={styles.offerGroupMeta}>{filteredOffers.incoming.length} عروض واردة</AppText>
                </View>
              </View>
              {filteredOffers.incoming.length ? (
                filteredOffers.incoming.map((offer) => <OfferRow key={offer.id} offer={offer} direction="incoming" />)
              ) : (
                <View style={styles.compactEmpty}>
                  <Ionicons name="mail-open-outline" size={22} color={colors.textMuted} />
                  <AppText weight="semibold">{searchQuery ? 'مفيش عرض وارد مطابق' : 'مفيش عروض واردة حاليًا'}</AppText>
                  <AppText muted style={styles.centerCopy}>أول فرصة تبادل جديدة هتظهر هنا.</AppText>
                </View>
              )}
            </View>

            <View style={styles.offerGroup}>
              <View style={styles.offerGroupHeader}>
                <View style={[styles.offerGroupIcon, styles.offerGroupIconAccent]}>
                  <Ionicons name="arrow-up-outline" size={17} color={colors.accent} />
                </View>
                <View style={styles.offerGroupCopy}>
                  <AppText weight="bold">عروضك المرسلة</AppText>
                  <AppText muted style={styles.offerGroupMeta}>{filteredOffers.sent.length} عروض</AppText>
                </View>
              </View>
              {filteredOffers.sent.length ? (
                filteredOffers.sent.map((offer) => <OfferRow key={offer.id} offer={offer} direction="sent" />)
              ) : (
                <View style={styles.compactEmpty}>
                  <Ionicons name="swap-horizontal-outline" size={22} color={colors.textMuted} />
                  <AppText weight="semibold">{searchQuery ? 'مفيش عرض مرسل مطابق' : 'لسه ما بدأتش عرض'}</AppText>
                  <AppText muted style={styles.centerCopy}>ابدأ من صفحة أي عنصر مناسب ليك.</AppText>
                </View>
              )}
            </View>
          </View>
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.lg },
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  headerCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  eyebrowRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  liveDot: { width: 7, height: 7, borderRadius: radii.round, backgroundColor: colors.accent },
  eyebrow: { fontSize: 12 },
  title: { fontSize: 29, lineHeight: 36, textAlign: 'right' },
  subtitle: { textAlign: 'right' },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: radii.round,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  signalStrip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  signalItem: { flex: 1, alignItems: 'center', gap: 1 },
  signalValue: { fontSize: 20, color: colors.text },
  signalLabel: { fontSize: 11 },
  signalDivider: { width: 1, height: 26, backgroundColor: colors.border },
  searchShell: {
    minHeight: 50,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: spacing.sm },
  clearSearch: { alignItems: 'center', justifyContent: 'center' },
  segments: {
    flexDirection: 'row-reverse',
    gap: spacing.xs,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.lg,
    padding: spacing.xs,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.md,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { color: colors.textMuted },
  segmentActiveText: { color: colors.white },
  segmentCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: radii.round,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentCountText: { color: colors.primary, fontSize: 11 },
  inlineError: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.dangerSoft,
  },
  inlineErrorText: { flex: 1, color: colors.danger, textAlign: 'right', fontSize: 13 },
  retryText: { color: colors.danger, fontSize: 13 },
  section: { gap: spacing.md },
  filterScroller: { marginHorizontal: -spacing.lg },
  filterContent: { flexDirection: 'row-reverse', gap: spacing.xs, paddingHorizontal: spacing.lg },
  filterChip: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.round,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: { backgroundColor: colors.text, borderColor: colors.text },
  filterChipText: { color: colors.textMuted, fontSize: 13 },
  filterChipActiveText: { color: colors.white, fontSize: 13 },
  sectionHeading: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  sectionTitle: { fontSize: 18, textAlign: 'right' },
  sectionMeta: { fontSize: 12, textAlign: 'right', marginTop: 2 },
  attentionPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.round,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  attentionText: { color: colors.primary, fontSize: 11 },
  conversationList: { gap: spacing.sm },
  conversationCard: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 98,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  unreadConversation: { borderColor: '#D8B39F', backgroundColor: '#FFF9F4' },
  unreadRail: { position: 'absolute', top: 14, bottom: 14, right: 0, width: 3, borderRadius: radii.round, backgroundColor: colors.primary },
  avatarWrap: { width: 48, height: 48, position: 'relative' },
  avatar: { width: 48, height: 48, borderRadius: radii.round, backgroundColor: colors.primarySoft },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: radii.round,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindDot: {
    position: 'absolute',
    left: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: radii.round,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conversationMain: { flex: 1, gap: 4 },
  conversationHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  conversationTitle: { flex: 1, textAlign: 'right' },
  timeText: { fontSize: 11 },
  preview: { textAlign: 'right', fontSize: 13 },
  unreadPreview: { color: colors.text },
  conversationFooter: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  contextCluster: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, minWidth: 0 },
  kindLabel: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  kindLabelDot: { width: 5, height: 5, borderRadius: radii.round },
  kindLabelText: { fontSize: 10 },
  swapContext: { flex: 1, fontSize: 10, textAlign: 'right' },
  requestBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    borderRadius: radii.round,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  requestBadgeText: { color: colors.primary, fontSize: 9 },
  unreadBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: radii.round,
    paddingHorizontal: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: { color: colors.white, fontSize: 11 },
  emptyCard: { borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border },
  offerLegend: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  offerLegendText: { fontSize: 11 },
  offerGroup: {
    gap: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,253,248,0.82)',
    padding: spacing.md,
  },
  offerGroupHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  offerGroupIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerGroupIconAccent: { backgroundColor: colors.accentSoft },
  offerGroupCopy: { flex: 1, alignItems: 'flex-end' },
  offerGroupMeta: { fontSize: 11 },
  offerRowCard: { borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  offerPressable: { padding: spacing.md, gap: spacing.md },
  offerTopRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  directionIcon: { width: 32, height: 32, borderRadius: radii.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  incomingIcon: { backgroundColor: colors.primarySoft },
  sentIcon: { backgroundColor: colors.accentSoft },
  offerHeadingCopy: { flex: 1, alignItems: 'flex-end' },
  offerStatus: { fontSize: 11 },
  swapLine: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  swapItem: { flex: 1, textAlign: 'center', fontSize: 13 },
  swapGlyph: { width: 28, height: 28, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  dealChatButton: {
    minHeight: 40,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.accentSoft,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  dealChatLabel: { color: colors.accent, fontSize: 12 },
  compactEmpty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  centerCopy: { textAlign: 'center', fontSize: 13, lineHeight: 20 },
  centerState: { flex: 1, justifyContent: 'center', gap: spacing.md },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingIcon: { width: 54, height: 54, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
});
