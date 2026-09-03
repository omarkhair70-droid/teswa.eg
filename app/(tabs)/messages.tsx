import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';

import { AppText } from '@/components/ui/AppText';
import { AppScreen } from '@/components/ui/AppScreen';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { fetchOffersInbox, getOfferStatusLabel, type OfferRowSummary } from '@/lib/offers';
import { fetchDealConversationsForUser, type DealConversation } from '@/lib/messages';
import {
  fetchContextualConversationSummariesForUser,
  type ContextualConversationSummary,
} from '@/lib/contextual-conversations';
import {
  fetchMyDirectConversations,
  type DirectConversationSummary,
} from '@/lib/direct-messages';
import { supabase } from '@/lib/supabase/client';
import { useUnreadBadges } from '@/lib/unread-badges';

type InboxMode = 'messages' | 'offers';
type MessageFilter = 'all' | 'unread' | 'requests' | 'direct' | 'deal' | 'story';

type ConversationRow = {
  id: string;
  type: 'direct' | 'deal' | 'story';
  title: string;
  preview: string;
  at: string | null;
  route: string;
  avatarUrl: string | null;
  unreadCount: number;
  isRequest?: boolean;
  swapContext?: string | null;
  sentByMe?: boolean;
};

type OfferListRow = { key: string; offer: OfferRowSummary; direction: 'incoming' | 'sent' };

const FILTERS: Array<{ key: MessageFilter; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'unread', label: 'غير مقروء' },
  { key: 'requests', label: 'الطلبات' },
  { key: 'direct', label: 'مباشر' },
  { key: 'deal', label: 'صفقات' },
  { key: 'story', label: 'قصص' },
];

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('ar-EG');
}

function timeLabel(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'أمس';
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
  return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'numeric', year: '2-digit' });
}

function kindMeta(type: ConversationRow['type']) {
  if (type === 'deal') return { icon: 'swap-horizontal' as const, color: colors.accent, label: 'صفقة' };
  if (type === 'story') return { icon: 'sparkles' as const, color: '#8B5F9A', label: 'قصة' };
  return { icon: 'chatbubble' as const, color: colors.primary, label: 'مباشر' };
}

function ConversationListItem({ row }: { row: ConversationRow }) {
  const unread = row.unreadCount > 0;
  const kind = kindMeta(row.type);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.title}. ${row.preview}${unread ? `. ${row.unreadCount} غير مقروء` : ''}`}
      accessibilityHint="يفتح المحادثة"
      onPress={() => router.push(row.route)}
      style={({ pressed }) => [styles.conversationRow, unread && styles.unreadConversationRow, pressed && styles.pressed]}
    >
      <View style={styles.avatarShell}>
        {row.avatarUrl ? <ExpoImage source={{ uri: row.avatarUrl }} style={styles.avatar} contentFit="cover" transition={120} /> : <View style={styles.avatarFallback}><Ionicons name="person" size={21} color={colors.textMuted} /></View>}
        <View style={[styles.kindBadge, { backgroundColor: kind.color }]}>
          <Ionicons name={kind.icon} size={10} color={colors.background} />
        </View>
      </View>

      <View style={styles.rowMain}>
        <View style={styles.rowTop}>
          <AppText weight={unread ? 'bold' : 'semibold'} numberOfLines={1} style={styles.rowTitle}>{row.title}</AppText>
          <AppText style={[styles.rowTime, unread && styles.unreadTime]}>{timeLabel(row.at)}</AppText>
        </View>
        <View style={styles.previewRow}>
          <AppText muted={!unread} weight={unread ? 'semibold' : 'regular'} numberOfLines={1} style={[styles.preview, unread && styles.unreadPreview]}>
            {row.sentByMe ? 'أنت: ' : ''}{row.preview}
          </AppText>
          {unread ? <View style={styles.unreadDot} /> : null}
        </View>
        {(row.isRequest || row.swapContext) ? (
          <View style={styles.contextRow}>
            {row.isRequest ? <View style={styles.requestPill}><AppText weight="semibold" style={styles.requestPillText}>طلب مراسلة</AppText></View> : null}
            {row.swapContext ? <AppText muted numberOfLines={1} style={styles.swapContext}>{row.swapContext}</AppText> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function OfferListItem({ item }: { item: OfferListRow }) {
  const { offer, direction } = item;
  const incoming = direction === 'incoming';
  const requested = offer.requestedItem?.title ?? 'عنصر غير متاح';
  const offered = offer.offeredItem?.title ?? 'عنصر غير متاح';
  const hasDeal = offer.status === 'accepted' && !!offer.dealId;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/offer/${offer.id}`)}
      style={({ pressed }) => [styles.offerRow, pressed && styles.pressed]}
    >
      <View style={[styles.offerIcon, incoming ? styles.offerIncoming : styles.offerSent]}>
        <Ionicons name={incoming ? 'arrow-down' : 'arrow-up'} size={17} color={incoming ? colors.primary : colors.accent} />
      </View>
      <View style={styles.offerMain}>
        <View style={styles.rowTop}>
          <AppText weight="semibold" numberOfLines={1} style={styles.rowTitle}>{incoming ? 'عرض مستني ردك' : 'عرض أرسلته'}</AppText>
          <AppText muted style={styles.offerStatus}>{getOfferStatusLabel(offer.status)}</AppText>
        </View>
        <AppText numberOfLines={1} style={styles.offerPair}>{requested}  ↔  {offered}</AppText>
      </View>
      {hasDeal ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="فتح دردشة الصفقة"
          hitSlop={7}
          onPress={() => router.push(`/deal/${offer.dealId}`)}
          style={styles.dealShortcut}
        >
          <Ionicons name="chatbubble" size={16} color={colors.accent} />
        </Pressable>
      ) : <Ionicons name="chevron-back" size={17} color={colors.border} />}
    </Pressable>
  );
}

export default function MessagesScreen() {
  const { user } = useAuth();
  const { refreshBadges } = useUnreadBadges();
  const [mode, setMode] = useState<InboxMode>('messages');
  const [filter, setFilter] = useState<MessageFilter>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [direct, setDirect] = useState<DirectConversationSummary[]>([]);
  const [deals, setDeals] = useState<DealConversation[]>([]);
  const [stories, setStories] = useState<ContextualConversationSummary[]>([]);
  const [incomingOffers, setIncomingOffers] = useState<OfferRowSummary[]>([]);
  const [sentOffers, setSentOffers] = useState<OfferRowSummary[]>([]);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!user?.id) return;
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [directRows, dealRows, storyRows, offers] = await Promise.all([
        fetchMyDirectConversations(),
        fetchDealConversationsForUser(user.id),
        fetchContextualConversationSummariesForUser(user.id),
        fetchOffersInbox(user.id),
      ]);
      setDirect(directRows);
      setDeals(dealRows);
      setStories(storyRows);
      setIncomingOffers(offers.incomingActionableOffers);
      setSentOffers(offers.sentOffers);
      void refreshBadges();
    } catch {
      setError('تعذر تحديث الرسائل حالياً.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshBadges, user?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    if (!user?.id) return;
    const scheduleReload = () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(() => { void load(true); }, 280);
    };
    const channel = supabase
      .channel(`messages-inbox:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_conversations' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deal_messages' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contextual_messages' }, scheduleReload)
      .subscribe();
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [load, user?.id]);

  const conversations = useMemo<ConversationRow[]>(() => {
    if (!user?.id) return [];
    const directRows: ConversationRow[] = direct.map((conversation) => ({
      id: `direct:${conversation.conversationId}`,
      type: 'direct',
      title: conversation.otherDisplayName?.trim() || conversation.otherUsername?.trim() || 'رسالة مباشرة',
      preview: conversation.lastMessageBody?.trim() || (conversation.requiresAction ? 'طلب مراسلة جديد' : 'ابدأوا الكلام'),
      at: conversation.lastMessageAt,
      route: `/direct/${conversation.conversationId}`,
      avatarUrl: conversation.otherAvatarUrl,
      unreadCount: conversation.unreadCount,
      isRequest: conversation.requiresAction,
      sentByMe: conversation.lastMessageSenderId === user.id,
    }));
    const dealRows: ConversationRow[] = deals.map((deal) => ({
      id: `deal:${deal.dealId}`,
      type: 'deal',
      title: deal.otherParticipant.displayName?.trim() || 'دردشة صفقة',
      preview: deal.latestMessage?.messageType === 'voice' ? '🎙️ رسالة صوتية' : deal.latestMessage?.body?.trim() || 'نسّقوا تفاصيل التبديل',
      at: deal.lastActivityAt,
      route: `/deal/${deal.dealId}`,
      avatarUrl: deal.otherParticipant.avatarUrl,
      unreadCount: deal.unreadCount,
      swapContext: `${deal.requestedItemTitle} ↔ ${deal.offeredItemTitle}`,
      sentByMe: deal.latestMessage?.senderId === user.id,
    }));
    const storyRows: ConversationRow[] = stories.map((story) => ({
      id: `story:${story.conversationId}`,
      type: 'story',
      title: story.otherParticipant.displayName?.trim() || 'رد على قصة',
      preview: story.latestMessage?.kind === 'voice' ? '🎙️ رسالة صوتية' : story.latestMessage?.body?.trim() || 'رد على القصة',
      at: story.lastActivityAt,
      route: `/contextual/${story.conversationId}`,
      avatarUrl: story.otherParticipant.avatarUrl,
      unreadCount: story.unreadCount,
      sentByMe: story.latestMessage?.senderId === user.id,
    }));
    return [...directRows, ...dealRows, ...storyRows].sort((a, b) => +new Date(b.at ?? 0) - +new Date(a.at ?? 0));
  }, [deals, direct, stories, user?.id]);

  const filtered = useMemo(() => {
    let rows = conversations;
    if (filter === 'unread') rows = rows.filter((row) => row.unreadCount > 0);
    else if (filter === 'requests') rows = rows.filter((row) => row.isRequest);
    else if (filter !== 'all') rows = rows.filter((row) => row.type === filter);
    const query = normalize(search);
    if (!query) return rows;
    return rows.filter((row) => normalize(`${row.title} ${row.preview} ${row.swapContext ?? ''}`).includes(query));
  }, [conversations, filter, search]);

  const offerRows = useMemo<OfferListRow[]>(() => {
    const rows = [
      ...incomingOffers.map((offer) => ({ key: `incoming:${offer.id}`, offer, direction: 'incoming' as const })),
      ...sentOffers.map((offer) => ({ key: `sent:${offer.id}`, offer, direction: 'sent' as const })),
    ];
    const query = normalize(search);
    if (!query) return rows;
    return rows.filter(({ offer }) => normalize(`${offer.requestedItem?.title ?? ''} ${offer.offeredItem?.title ?? ''} ${getOfferStatusLabel(offer.status)}`).includes(query));
  }, [incomingOffers, search, sentOffers]);

  const unreadTotal = conversations.reduce((sum, row) => sum + row.unreadCount, 0);
  const requestsTotal = direct.filter((row) => row.requiresAction).length;
  const incomingTotal = incomingOffers.length;

  if (!user?.id) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل الدخول علشان تشوف رسائلك." /></AppScreen>;

  return (
    <AppScreen style={styles.screen} backgroundVariant="none">
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <AppText weight="bold" style={styles.title}>الرسائل</AppText>
          <AppText muted style={styles.subtitle}>{unreadTotal ? `${unreadTotal} غير مقروء` : 'كل حاجة متتابعة'}</AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="تحديث الرسائل"
          disabled={refreshing}
          onPress={() => { void load(true); }}
          style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
        >
          {refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh" size={19} color={colors.text} />}
        </Pressable>
      </View>

      <View style={styles.modeTabs}>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'messages' }} onPress={() => setMode('messages')} style={[styles.modeTab, mode === 'messages' && styles.modeTabActive]}>
          <AppText weight="semibold" style={[styles.modeLabel, mode === 'messages' && styles.modeLabelActive]}>المحادثات</AppText>
          {unreadTotal > 0 ? <View style={[styles.modeCount, mode === 'messages' && styles.modeCountActive]}><AppText weight="bold" style={[styles.modeCountText, mode === 'messages' && styles.modeCountTextActive]}>{Math.min(99, unreadTotal)}</AppText></View> : null}
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'offers' }} onPress={() => setMode('offers')} style={[styles.modeTab, mode === 'offers' && styles.modeTabActive]}>
          <AppText weight="semibold" style={[styles.modeLabel, mode === 'offers' && styles.modeLabelActive]}>العروض</AppText>
          {incomingTotal > 0 ? <View style={[styles.modeCount, mode === 'offers' && styles.modeCountActive]}><AppText weight="bold" style={[styles.modeCountText, mode === 'offers' && styles.modeCountTextActive]}>{Math.min(99, incomingTotal)}</AppText></View> : null}
        </Pressable>
      </View>

      <View style={styles.searchShell}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={mode === 'messages' ? 'ابحث في الرسائل' : 'ابحث في العروض'}
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          textAlign="right"
          returnKeyType="search"
          accessibilityLabel={mode === 'messages' ? 'البحث في الرسائل' : 'البحث في العروض'}
        />
        {search ? <Pressable onPress={() => setSearch('')} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></Pressable> : null}
      </View>

      {mode === 'messages' ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={styles.filterScroller}>
            {FILTERS.map((item) => {
              const active = item.key === filter;
              const badge = item.key === 'requests' ? requestsTotal : 0;
              return (
                <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setFilter(item.key)} style={[styles.filterChip, active && styles.filterChipActive]}>
                  <AppText weight="semibold" style={[styles.filterLabel, active && styles.filterLabelActive]}>{item.label}</AppText>
                  {badge > 0 ? <View style={styles.filterBadge}><AppText weight="bold" style={styles.filterBadgeText}>{badge}</AppText></View> : null}
                </Pressable>
              );
            })}
          </ScrollView>

          <FlatList
            data={filtered}
            keyExtractor={(row) => row.id}
            renderItem={({ item }) => <ConversationListItem row={item} />}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            initialNumToRender={10}
            windowSize={7}
            contentContainerStyle={[styles.listContent, filtered.length === 0 && styles.emptyList]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(true); }} tintColor={colors.primary} />}
            ListEmptyComponent={loading ? <View style={styles.loadingState}><ActivityIndicator color={colors.primary} /><AppText muted>بنحمّل الرسائل...</AppText></View> : <EmptyState title={search ? 'مفيش نتيجة' : filter === 'all' ? 'لسه مفيش محادثات' : 'مفيش محادثات هنا'} description={search ? 'جرّب اسم أو كلمة مختلفة.' : 'أول محادثة جديدة هتظهر هنا فورًا.'} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </>
      ) : (
        <FlatList
          data={offerRows}
          keyExtractor={(row) => row.key}
          renderItem={({ item }) => <OfferListItem item={item} />}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          initialNumToRender={8}
          windowSize={7}
          contentContainerStyle={[styles.listContent, offerRows.length === 0 && styles.emptyList]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(true); }} tintColor={colors.primary} />}
          ListHeaderComponent={incomingTotal > 0 ? <View style={styles.offerHint}><Ionicons name="sparkles-outline" size={15} color={colors.primary} /><AppText muted style={styles.offerHintText}>ابدأ بالعروض اللي مستنية ردك.</AppText></View> : null}
          ListEmptyComponent={loading ? <View style={styles.loadingState}><ActivityIndicator color={colors.primary} /><AppText muted>بنحمّل العروض...</AppText></View> : <EmptyState title={search ? 'مفيش نتيجة' : 'مفيش عروض حاليًا'} description={search ? 'جرّب كلمة مختلفة.' : 'أي عرض تبادل جديد هتلاقيه هنا.'} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {error ? <View style={styles.errorBar}><Ionicons name="cloud-offline-outline" size={16} color={colors.danger} /><AppText style={styles.errorText}>{error}</AppText><Pressable onPress={() => { void load(true); }}><AppText weight="semibold" style={styles.retry}>حاول تاني</AppText></Pressable></View> : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 0,
    backgroundColor: colors.background,
  },
  header: {
    minHeight: 68,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  headerCopy: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 1,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.35,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
  headerAction: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  modeTabs: {
    marginHorizontal: spacing.lg,
    flexDirection: 'row-reverse',
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeTab: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.lg,
  },
  modeTabActive: {
    backgroundColor: colors.text,
  },
  modeLabel: {
    fontSize: 13,
    color: colors.textMuted,
  },
  modeLabelActive: {
    color: colors.background,
  },
  modeCount: {
    minWidth: 20,
    height: 20,
    borderRadius: radii.round,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  modeCountActive: {
    backgroundColor: 'rgba(249,243,234,0.16)',
  },
  modeCountText: {
    fontSize: 10,
    color: colors.primary,
  },
  modeCountTextActive: {
    color: colors.background,
  },

  searchShell: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    minHeight: 48,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    minHeight: 46,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },

  filterScroller: {
    flexGrow: 0,
    marginTop: spacing.sm,
    paddingTop: 2,
    paddingBottom: spacing.xs,
  },
  filters: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 2,
    gap: spacing.sm,
    flexDirection: 'row-reverse',
  },
  filterChip: {
    minHeight: 36,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    borderRadius: radii.round,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primarySoft,
  },
  filterLabel: {
    fontSize: 11.5,
    color: colors.textMuted,
  },
  filterLabelActive: {
    color: colors.primary,
  },
  filterBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  filterBadgeText: {
    fontSize: 9,
    color: colors.white,
  },

  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  conversationRow: {
    minHeight: 78,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: -spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
  },
  unreadConversationRow: {
    backgroundColor: colors.selectionSoft,
  },
  avatarShell: {
    width: 54,
    height: 54,
    position: 'relative',
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.surface,
  },
  avatarFallback: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kindBadge: {
    position: 'absolute',
    left: -1,
    bottom: -1,
    width: 20,
    height: 20,
    borderRadius: radii.round,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowTitle: {
    flex: 1,
    textAlign: 'right',
    fontSize: 15,
    lineHeight: 21,
  },
  rowTime: {
    fontSize: 10.5,
    lineHeight: 16,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  unreadTime: {
    color: colors.primary,
  },
  previewRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
  },
  preview: {
    flex: 1,
    textAlign: 'right',
    fontSize: 12.5,
    lineHeight: 18,
  },
  unreadPreview: {
    color: colors.text,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: radii.round,
    backgroundColor: colors.primary,
  },
  contextRow: {
    minHeight: 18,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  requestPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
  },
  requestPillText: {
    fontSize: 9.5,
    color: colors.primary,
  },
  swapContext: {
    flex: 1,
    textAlign: 'right',
    fontSize: 10.5,
    lineHeight: 15,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 66,
  },

  offerRow: {
    minHeight: 76,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  offerIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerIncoming: {
    backgroundColor: colors.primarySoft,
  },
  offerSent: {
    backgroundColor: colors.accentSoft,
  },
  offerMain: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  offerStatus: {
    fontSize: 10.5,
  },
  offerPair: {
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'right',
  },
  dealShortcut: {
    width: 38,
    height: 38,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  offerHint: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  offerHintText: {
    flex: 1,
    textAlign: 'right',
    fontSize: 11.5,
  },

  loadingState: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  errorText: {
    flex: 1,
    textAlign: 'right',
    color: colors.danger,
    fontSize: 11.5,
  },
  retry: {
    color: colors.primary,
    fontSize: 11.5,
  },
  pressed: {
    opacity: 0.62,
    transform: [{ scale: 0.995 }],
  },
});
