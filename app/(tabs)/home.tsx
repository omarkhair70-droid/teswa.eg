import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, InteractionManager, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { ItemCard } from '@/components/marketplace/ItemCard';
import { AppFadeIn } from '@/components/motion/AppFadeIn';
import { ItemVideoDiscoveryRail } from '@/components/marketplace/ItemVideoDiscoveryRail';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { fetchHomeDashboardSummary, HomeDashboardSummary } from '@/lib/home-dashboard';
import { ActiveStorySummary, fetchActiveStoriesForHome } from '@/lib/stories';
import { fetchRecentItemVideoDiscoveryMoments, ItemVideoDiscoveryMoment } from '@/lib/item-video-discovery';
import { PersonalLivingWorldCard } from '@/components/home/PersonalLivingWorldCard';
import { HomeLivingWorldHero } from '@/components/home/HomeLivingWorldHero';
import { HomeHubDrawer } from '@/components/home/HomeHubDrawer';
import {
  buildPersonalLivingWorldState,
  countActiveStoriesSince,
  countVideoMomentsSince,
  fetchNewMarketplaceItemsCountSince,
  readPersonalLivingWorldLastSeen,
  writePersonalLivingWorldLastSeen,
} from '@/lib/personal-living-world';
import { useUnreadBadges } from '@/lib/unread-badges';
import { trackEvent } from '@/lib/analytics';
import { trackPerformanceMetric } from '@/lib/performance-telemetry';
import { useHomeFeedQuery } from '@/lib/query/use-home-feed-query';
import { prefetchImagesMemoryDisk } from '@/lib/media/media-performance';
import type { MarketplaceItem } from '@/lib/marketplace-items';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type NextActionKind = 'profile' | 'offers' | 'messages' | 'replies' | 'firstItem' | 'calm';

const nextActionVisuals: Record<NextActionKind, { icon: IoniconName; color: string; soft: string }> = {
  profile: { icon: 'person-circle-outline', color: colors.primary, soft: colors.primarySoft },
  offers: { icon: 'swap-horizontal-outline', color: colors.primary, soft: colors.primarySoft },
  messages: { icon: 'chatbubbles-outline', color: colors.accent, soft: colors.accentSoft },
  replies: { icon: 'sparkles-outline', color: colors.accent, soft: colors.accentSoft },
  firstItem: { icon: 'add-circle-outline', color: colors.primary, soft: colors.primarySoft },
  calm: { icon: 'pulse-outline', color: colors.accent, soft: colors.accentSoft },
};

const metricSignals: { key: 'offers' | 'messages' | 'listings'; label: string; icon: IoniconName; color: string }[] = [
  { key: 'offers', label: 'العروض الواردة', icon: 'swap-horizontal-outline', color: colors.primary },
  { key: 'messages', label: 'رسائل وردود', icon: 'chatbubble-ellipses-outline', color: colors.accent },
  { key: 'listings', label: 'عناصر نشطة', icon: 'cube-outline', color: colors.primary },
];

function HomeFeedLoadingState() {
  return (
    <View style={styles.feedLoadingStack} accessibilityLabel="جاري تحميل أحدث العناصر">
      {[0, 1, 2].map((item) => (
        <View key={item} style={styles.feedSkeletonCard}>
          <View style={styles.feedSkeletonImage} />
          <View style={styles.feedSkeletonCopy}>
            <View style={styles.feedSkeletonTitle} />
            <View style={styles.feedSkeletonLine} />
            <View style={styles.feedSkeletonMeta} />
          </View>
        </View>
      ))}
    </View>
  );
}

function HomeFeedEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <View style={styles.feedStateCard}>
      <View style={styles.feedStateIcon}><Ionicons name="cube-outline" size={20} color={colors.primary} /></View>
      <View style={styles.feedStateCopy}>
        <AppText weight="semibold">الواجهة هادئة دلوقتي</AppText>
        <AppText muted>أول ما عناصر جديدة توصل، هتظهر هنا. تقدر تبدأ أنت وتعرض حاجة للتبادل.</AppText>
      </View>
      <AppButton label="اعرض حاجة" variant="neutral" onPress={onCreate} />
    </View>
  );
}

function HomeFeedErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.feedStateCard}>
      <View style={styles.feedStateIcon}><Ionicons name="refresh-circle-outline" size={22} color={colors.primary} /></View>
      <View style={styles.feedStateCopy}>
        <AppText weight="semibold">تعذر تحديث العناصر</AppText>
        <AppText muted>{message}</AppText>
      </View>
      <AppButton label="إعادة المحاولة" onPress={onRetry} />
    </View>
  );
}

function HomeSectionHeading({ eyebrow, title, description, actionLabel, onAction }: { eyebrow: string; title: string; description: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.homeSectionHeading}>
      <View style={styles.homeSectionCopy}>
        <AppText weight="semibold" style={styles.homeSectionEyebrow}>{eyebrow}</AppText>
        <AppText weight="bold" style={styles.homeSectionTitle}>{title}</AppText>
        <AppText muted style={styles.homeSectionDescription}>{description}</AppText>
      </View>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={spacing.sm} style={styles.homeSectionAction}>
          <AppText weight="semibold" style={styles.homeSectionActionText}>{actionLabel}</AppText>
          <Ionicons name="arrow-back-outline" size={14} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, profileCompleted } = useAuth();
  const userId = user?.id ?? null;
  const { notificationsUnreadCount, refreshBadges } = useUnreadBadges();
  const [stories, setStories] = useState<ActiveStorySummary[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [storiesError, setStoriesError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<HomeDashboardSummary | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [videoMoments, setVideoMoments] = useState<ItemVideoDiscoveryMoment[]>([]);
  const [videoMomentsLoading, setVideoMomentsLoading] = useState(true);
  const [videoMomentsError, setVideoMomentsError] = useState<string | null>(null);
  const [personalWorldLastSeenAtMs, setPersonalWorldLastSeenAtMs] = useState<number | null>(null);
  const [personalWorldNewItemsCount, setPersonalWorldNewItemsCount] = useState<number | null>(null);
  const [personalWorldLoading, setPersonalWorldLoading] = useState(false);
  const personalWorldSeenCommittedRef = useRef(false);
  const skipFirstFocusRefreshRef = useRef(true);
  const homeContentStartedAtRef = useRef<number | null>(null);
  const homeFirstContentMetricSentRef = useRef(false);
  const [homeHubVisible, setHomeHubVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const homeFeedQuery = useHomeFeedQuery(userId);
  const refetchHomeFeed = homeFeedQuery.refetch;

  const loadStories = useCallback(async () => {
    setStoriesLoading(true);
    setStoriesError(null);
    try { setStories(await fetchActiveStoriesForHome()); }
    catch { setStoriesError('تعذر تحميل القصص حالياً.'); }
    finally { setStoriesLoading(false); }
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!userId) {
      setDashboard(null);
      setDashboardLoading(false);
      setDashboardError(null);
      return;
    }
    setDashboardLoading(true);
    setDashboardError(null);
    try { setDashboard(await fetchHomeDashboardSummary(userId)); }
    catch {
      setDashboardError('تعذر تحميل لمحة حسابك حالياً.');
      setDashboard(null);
    } finally { setDashboardLoading(false); }
  }, [userId]);

  const loadVideoMoments = useCallback(async () => {
    setVideoMomentsLoading(true);
    setVideoMomentsError(null);
    try { setVideoMoments(await fetchRecentItemVideoDiscoveryMoments(6)); }
    catch {
      setVideoMoments([]);
      setVideoMomentsError('تعذر تحميل اللمحات المرئية الآن.');
    } finally { setVideoMomentsLoading(false); }
  }, []);

  const loadPersonalLivingWorldMarker = useCallback(async () => {
    if (!userId) {
      setPersonalWorldLastSeenAtMs(null);
      setPersonalWorldNewItemsCount(null);
      setPersonalWorldLoading(false);
      return;
    }
    setPersonalWorldLoading(true);
    const lastSeen = await readPersonalLivingWorldLastSeen(userId);
    setPersonalWorldLastSeenAtMs(lastSeen);
    setPersonalWorldNewItemsCount(await fetchNewMarketplaceItemsCountSince(lastSeen));
    setPersonalWorldLoading(false);
  }, [userId]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const refreshTasks: Promise<unknown>[] = [loadStories(), loadVideoMoments(), loadPersonalLivingWorldMarker(), refetchHomeFeed(), refreshBadges()];
    if (userId) refreshTasks.push(loadDashboard());
    try { await Promise.allSettled(refreshTasks); }
    finally { setRefreshing(false); }
  }, [loadDashboard, loadPersonalLivingWorldMarker, loadStories, loadVideoMoments, refetchHomeFeed, refreshBadges, userId]);

  useEffect(() => { homeContentStartedAtRef.current = Date.now(); }, []);

  useEffect(() => {
    const interactionTask = InteractionManager.runAfterInteractions(() => {
      void loadStories();
      void loadVideoMoments();
      if (userId) void loadDashboard();
      void loadPersonalLivingWorldMarker();
    });
    if (userId) {
      const delayedBadgeRefresh = setTimeout(() => { void refreshBadges(); }, 1500);
      return () => { interactionTask.cancel(); clearTimeout(delayedBadgeRefresh); };
    }
    return () => { interactionTask.cancel(); };
  }, [loadDashboard, loadPersonalLivingWorldMarker, loadStories, loadVideoMoments, refreshBadges, userId]);

  useEffect(() => { if (userId) void trackEvent('home_viewed', { route: '/(tabs)/home' }); }, [userId]);

  useEffect(() => {
    if (homeFirstContentMetricSentRef.current || !homeFeedQuery.data?.items || homeContentStartedAtRef.current === null) return;
    homeFirstContentMetricSentRef.current = true;
    void trackPerformanceMetric('home_first_content_time', Date.now() - homeContentStartedAtRef.current, { route: '/(tabs)/home', cacheHit: homeFeedQuery.data.source !== 'network' });
  }, [homeFeedQuery.data?.items, homeFeedQuery.data?.source]);

  useEffect(() => {
    const candidateUrls = (homeFeedQuery.data?.items ?? []).slice(0, 5).map((entry) => entry.imageUrl).filter(Boolean);
    if (candidateUrls.length) void prefetchImagesMemoryDisk(candidateUrls);
  }, [homeFeedQuery.data?.items]);

  useEffect(() => {
    personalWorldSeenCommittedRef.current = false;
    skipFirstFocusRefreshRef.current = true;
  }, [userId]);

  useEffect(() => {
    if (!userId || personalWorldSeenCommittedRef.current) return;
    if (personalWorldLoading || storiesLoading || videoMomentsLoading || dashboardLoading) return;
    personalWorldSeenCommittedRef.current = true;
    void writePersonalLivingWorldLastSeen(userId);
  }, [dashboardLoading, personalWorldLoading, storiesLoading, userId, videoMomentsLoading]);

  useFocusEffect(useCallback(() => {
    if (skipFirstFocusRefreshRef.current) {
      skipFirstFocusRefreshRef.current = false;
      return;
    }
    void loadStories();
    if (userId) void loadDashboard();
  }, [loadDashboard, loadStories, userId]));

  const myStorySummary = useMemo(() => stories.find((summary) => summary.author.id === userId) ?? null, [stories, userId]);
  const otherStorySummaries = useMemo(() => stories.filter((summary) => summary.author.id !== userId), [stories, userId]);
  const totalActiveStories = stories.reduce((total, summary) => total + summary.stories.length, 0);
  const shouldShowVideoMomentsRail = Boolean(videoMomentsError) || videoMoments.length >= 2;
  const newActiveStoriesCount = useMemo(() => countActiveStoriesSince(stories, personalWorldLastSeenAtMs), [personalWorldLastSeenAtMs, stories]);
  const newVideoMomentsCount = useMemo(() => countVideoMomentsSince(videoMoments, personalWorldLastSeenAtMs), [personalWorldLastSeenAtMs, videoMoments]);
  const personalLivingWorldState = useMemo(() => buildPersonalLivingWorldState({
    lastSeenAtMs: personalWorldLastSeenAtMs,
    actionableOffersCount: dashboard?.incomingActionableOffersCount ?? 0,
    unreadDealMessagesCount: dashboard?.unreadDealMessagesCount ?? 0,
    unreadContextualMessagesCount: dashboard?.unreadContextualMessagesCount ?? 0,
    newActiveStoriesCount,
    newVideoMomentsCount,
    newMarketplaceItemsCount: personalWorldNewItemsCount,
  }), [dashboard, newActiveStoriesCount, newVideoMomentsCount, personalWorldLastSeenAtMs, personalWorldNewItemsCount]);
  const shouldShowPersonalWorld = Boolean(userId && !personalWorldLoading && personalLivingWorldState.tone === 'alive');

  const nextAction = useMemo(() => {
    if (!dashboard) return null;
    if (!profileCompleted) return { title: 'كمّل ملفك', description: 'ملفك هو أول انطباع عنك في تِسوى. خلّيه أوضح.', buttonLabel: 'تعديل ملفي', route: '/profile/edit' as const, variant: 'primary' as const, kind: 'profile' as const };
    if (dashboard.incomingActionableOffersCount > 0) {
      const count = dashboard.incomingActionableOffersCount;
      return { title: 'عندك عروض محتاجة رد', description: count === 1 ? 'فيه عرض وارد ينتظر قرارك.' : `فيه ${count} عروض واردة تنتظر قرارك.`, buttonLabel: 'افتح الرسائل والعروض', route: '/(tabs)/messages' as const, variant: 'primary' as const, kind: 'offers' as const };
    }
    const unreadDeals = dashboard.unreadDealMessagesCount;
    const unreadReplies = dashboard.unreadContextualMessagesCount;
    if (unreadDeals > 0 && unreadReplies > 0) return { title: 'عندك رسائل وردود جديدة', description: `فيه ${unreadReplies} ردود قصص و ${unreadDeals} رسائل صفقات لم تقرأها بعد.`, buttonLabel: 'افتح الرسائل', route: '/(tabs)/messages' as const, variant: 'primary' as const, kind: 'messages' as const };
    if (unreadReplies > 0) return { title: 'عندك ردود قصص جديدة', description: unreadReplies === 1 ? 'فيه رد جديد على القصص لم تقرأه بعد.' : `فيه ${unreadReplies} ردود قصص لم تقرأها بعد.`, buttonLabel: 'افتح الردود', route: '/(tabs)/messages' as const, variant: 'primary' as const, kind: 'replies' as const };
    if (unreadDeals > 0) return { title: 'فيه رسائل جديدة في دردشات الصفقات', description: unreadDeals === 1 ? 'رسالة واحدة لم تقرأها بعد.' : `${unreadDeals} رسائل لم تقرأها بعد.`, buttonLabel: 'افتح الدردشات', route: '/(tabs)/messages' as const, variant: 'primary' as const, kind: 'messages' as const };
    if (dashboard.activeListingsCount === 0) return { title: 'اعرض أول حاجة', description: 'وجود عنصر نشط يفتح باب التبادل ويخلي ملفك يتحرك.', buttonLabel: 'اعرض حاجة', route: '/(tabs)/add' as const, variant: 'primary' as const, kind: 'firstItem' as const };
    return { title: 'كل شيء هادئ الآن', description: 'عندك حضور نشط في تِسوى. شوف الحركة الجديدة حوالينك.', buttonLabel: 'ادخل حركة تِسوى', route: '/motion' as const, variant: 'neutral' as const, kind: 'calm' as const };
  }, [dashboard, profileCompleted]);

  const keyExtractor = useCallback((item: { id: string }) => item.id, []);
  const renderItem = useCallback(({ item }: { item: MarketplaceItem }) => <ItemCard item={item} />, []);
  const notificationsLabel = notificationsUnreadCount > 0 ? `الإشعارات (${notificationsUnreadCount > 99 ? '99+' : notificationsUnreadCount})` : 'الإشعارات';

  return (
    <>
      <AppScreen backgroundVariant="alive" style={styles.screen}>
        <FlatList
          data={homeFeedQuery.data?.items ?? []}
          keyExtractor={keyExtractor}
          removeClippedSubviews
          initialNumToRender={4}
          maxToRenderPerBatch={5}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          contentContainerStyle={styles.content}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          ListHeaderComponent={
            <View style={styles.header}>
              <AppFadeIn delay={0} duration={200} fromY={8}>
                <HomeLivingWorldHero unreadCount={notificationsUnreadCount} onOpenNotifications={() => router.push('/notifications')} onOpenHub={() => setHomeHubVisible(true)} onStartSwap={() => router.push('/(tabs)/add')} onDiscover={() => router.push('/(tabs)/discover')} />
              </AppFadeIn>

              {user ? (
                <AppFadeIn delay={40} duration={210} fromY={8}>
                  <AppCard padding="md" style={styles.todayCard}>
                    <View style={styles.dashboardSection}>
                      <View style={styles.todayHeaderRow}>
                        <View style={styles.todayTitleCopy}><AppText weight="semibold" style={styles.homeSectionEyebrow}>يهمك الآن</AppText><AppText muted style={styles.todayDescription}>أقرب خطوة مفيدة لحسابك.</AppText></View>
                        <View style={styles.liveBadge}><View style={styles.liveBadgeDot} /><AppText weight="semibold" style={styles.liveBadgeText}>مباشر</AppText></View>
                      </View>
                      {dashboardLoading ? <View style={styles.loadingPanel}><Ionicons name="sparkles-outline" size={18} color={colors.primary} /><AppText muted>نجهّز لمحتك الآن...</AppText></View> : null}
                      {!dashboardLoading && dashboardError ? <View style={styles.inlineStateRow}><AppText style={styles.dashboardErrorText}>{dashboardError}</AppText><AppButton label="إعادة المحاولة" variant="neutral" onPress={loadDashboard} /></View> : null}
                      {!dashboardLoading && !dashboardError && nextAction ? (
                        <LinearGradient colors={[colors.surface, nextActionVisuals[nextAction.kind].soft, colors.primarySoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.nextActionBlock}>
                          <View style={styles.nextActionTopRow}>
                            <View style={[styles.nextActionIcon, { backgroundColor: nextActionVisuals[nextAction.kind].soft }]}><Ionicons name={nextActionVisuals[nextAction.kind].icon} size={21} color={nextActionVisuals[nextAction.kind].color} /></View>
                            <View style={styles.nextActionCopy}><AppText weight="bold" style={styles.nextActionTitle}>{nextAction.title}</AppText><AppText muted style={styles.supportMutedText}>{nextAction.description}</AppText></View>
                          </View>
                          <AppButton label={nextAction.buttonLabel} variant={nextAction.kind === 'firstItem' ? 'neutral' : nextAction.variant} onPress={() => router.push(nextAction.route)} iconName="arrow-back-outline" size="sm" fullWidth />
                        </LinearGradient>
                      ) : null}
                      {dashboard ? (
                        <View style={styles.metricsRow}>
                          {metricSignals.map((signal) => {
                            const value = signal.key === 'offers' ? dashboard.incomingActionableOffersCount : signal.key === 'messages' ? dashboard.unreadDealMessagesCount + dashboard.unreadContextualMessagesCount : dashboard.activeListingsCount;
                            return <View key={signal.key} style={styles.metricCard}><View style={[styles.metricIcon, { backgroundColor: signal.key === 'messages' ? colors.accentSoft : colors.primarySoft }]}><Ionicons name={signal.icon} size={16} color={signal.color} /></View><AppText weight="bold" style={styles.metricValue}>{value}</AppText><AppText muted style={styles.metricLabel}>{signal.label}</AppText></View>;
                          })}
                        </View>
                      ) : null}
                    </View>
                  </AppCard>
                </AppFadeIn>
              ) : null}

              {shouldShowPersonalWorld ? (
                <AppFadeIn delay={80} duration={220} fromY={8} style={styles.sectionGroup}>
                  <HomeSectionHeading eyebrow="من آخر مرة" title="في جديد ليك" description="الحركة الجديدة المرتبطة بحسابك منذ زيارتك السابقة." />
                  <PersonalLivingWorldCard state={personalLivingWorldState} loading={personalWorldLoading} onPrimaryAction={() => { if (personalLivingWorldState.primaryActionRoute) router.push(personalLivingWorldState.primaryActionRoute as any); }} />
                </AppFadeIn>
              ) : null}

              <AppFadeIn delay={120} duration={220} fromY={8}>
                <AppCard padding="md" style={styles.storiesCard}>
                  <View style={styles.storiesSection}>
                    <View style={styles.storiesHeaderRow}>
                      <HomeSectionHeading eyebrow="حكايات قريبة" title="القصص" description="لقطات حقيقية من عالم تِسوى الآن." actionLabel="أضف قصة" onAction={() => router.push('/story/create')} />
                      {!storiesLoading && !storiesError && totalActiveStories > 0 ? <View style={styles.storyCountBadge}><Ionicons name="radio-outline" size={13} color={colors.primary} /><AppText weight="semibold" style={styles.storyCountText}>{totalActiveStories} قصة</AppText></View> : <View />}
                    </View>
                    {!storiesLoading && !storiesError && stories.length > 0 ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storiesRail}>
                        {myStorySummary && userId ? (
                          <Pressable style={[styles.storyTile, styles.myStoryTile]} onPress={() => router.push(`/story/${userId}`)}>
                            <LinearGradient colors={[colors.primary, '#F2B978', colors.accent]} style={styles.storyAvatarRing}>
                              <View style={styles.storyAvatar}>{myStorySummary.author.avatarUrl ? <ExpoImage source={{ uri: myStorySummary.author.avatarUrl }} style={styles.avatarImage} contentFit="cover" /> : <AppText weight="bold" style={styles.fallbackInitial}>{(myStorySummary.author.displayName ?? myStorySummary.author.username ?? 'م').trim().charAt(0).toUpperCase()}</AppText>}</View>
                            </LinearGradient>
                            <AppText numberOfLines={1} weight="semibold" style={styles.storyLabel}>قصتك</AppText>
                            {myStorySummary.stories.length > 1 ? <AppText weight="semibold" style={styles.myStoryCount}>{myStorySummary.stories.length}</AppText> : null}
                          </Pressable>
                        ) : (
                          <Pressable style={[styles.storyTile, styles.addStoryTile]} onPress={() => router.push('/story/create')}>
                            <LinearGradient colors={[colors.surface, colors.primarySoft]} style={styles.storyAvatarRing}><View style={[styles.storyAvatar, styles.addStoryAvatar]}><Ionicons name="add" size={24} color={colors.primary} /></View></LinearGradient>
                            <AppText numberOfLines={1} weight="semibold" style={styles.storyLabel}>قصتك</AppText>
                          </Pressable>
                        )}
                        {otherStorySummaries.map((story) => {
                          const label = story.author.displayName ?? (story.author.username ? `@${story.author.username}` : 'مستخدم');
                          const fallbackInitial = (story.author.displayName ?? story.author.username ?? 'م').trim().charAt(0).toUpperCase();
                          return <Pressable key={story.author.id} style={styles.storyTile} onPress={() => router.push(`/story/${story.author.id}`)}><LinearGradient colors={['#F2B978', colors.primarySoft, colors.accent]} style={styles.storyAvatarRing}><View style={styles.storyAvatar}>{story.author.avatarUrl ? <ExpoImage source={{ uri: story.author.avatarUrl }} style={styles.avatarImage} contentFit="cover" /> : <AppText weight="bold" style={styles.fallbackInitial}>{fallbackInitial}</AppText>}</View></LinearGradient><AppText numberOfLines={1} style={styles.storyLabel}>{label}</AppText></Pressable>;
                        })}
                      </ScrollView>
                    ) : null}
                    {storiesLoading ? <View style={styles.loadingPanel}><Ionicons name="ellipsis-horizontal-circle-outline" size={18} color={colors.accent} /><AppText muted>نفتح القصص القريبة الآن...</AppText></View> : null}
                    {!storiesLoading && storiesError ? <View style={styles.inlineStateRow}><AppText muted>{storiesError}</AppText><AppButton label="إعادة المحاولة" variant="neutral" onPress={loadStories} /></View> : null}
                    {!storiesLoading && !storiesError && stories.length === 0 ? <View style={styles.quietStoryState}><Ionicons name="moon-outline" size={17} color={colors.textMuted} /><AppText muted style={[styles.supportMutedText, styles.quietStoryText]}>لا توجد قصص نشطة الآن. تقدر تبدأ أول قصة من الزر بالأعلى.</AppText></View> : null}
                  </View>
                </AppCard>
              </AppFadeIn>

              {shouldShowVideoMomentsRail ? <AppFadeIn delay={120} duration={220} fromY={8}><AppCard padding="md" style={styles.videoCard}><ItemVideoDiscoveryRail onOpenViewer={() => router.push('/motion/viewer')} viewerCtaLabel="شوف المشاهد" eyebrow="لمحات مرئية" title="عناصر تقدر تشوفها أقرب" description="فيديوهات قصيرة تساعدك تلمح العنصر قبل ما تفتح تفاصيله." moments={videoMoments} loading={videoMomentsLoading} errorMessage={videoMomentsError} onRetry={loadVideoMoments} /></AppCard></AppFadeIn> : null}

              {homeFeedQuery.data?.notice ? <AppCard variant="outlined" padding="md" style={styles.cacheNoticeCard}><View style={styles.cacheNoticeRow}><View style={styles.cacheNoticeIcon}><Ionicons name="cloud-offline-outline" size={17} color={colors.accent} /></View><AppText muted style={styles.cacheNoticeText}>{homeFeedQuery.data.notice}</AppText></View></AppCard> : null}

              <HomeSectionHeading eyebrow="ظهر حديثًا" title="أحدث العناصر" description="حاجات وصلت للتو، جاهزة تفتح رحلة تبادل جديدة." actionLabel="شوف الكل" onAction={() => router.push('/(tabs)/discover')} />
            </View>
          }
          renderItem={renderItem}
          ListEmptyComponent={homeFeedQuery.isLoading ? <HomeFeedLoadingState /> : homeFeedQuery.error ? <HomeFeedErrorState message={homeFeedQuery.error.message} onRetry={() => void homeFeedQuery.refetch()} /> : <HomeFeedEmptyState onCreate={() => router.push('/(tabs)/add')} />}
        />
      </AppScreen>
      <HomeHubDrawer visible={homeHubVisible} onClose={() => setHomeHubVisible(false)} actions={[
        { label: 'الرسائل', description: 'افتح محادثاتك وردود القصص والصفقات.', iconName: 'chatbubbles-outline', onPress: () => { setHomeHubVisible(false); router.push('/(tabs)/messages'); } },
        { label: notificationsLabel, description: 'تابع الجديد والتنبيهات المهمة.', iconName: 'notifications-outline', onPress: () => { setHomeHubVisible(false); router.push('/notifications'); } },
        { label: 'أضف عنصر', description: 'اعرض حاجة جديدة وابدأ فرصة تبادل.', iconName: 'add-circle-outline', tone: 'primary', onPress: () => { setHomeHubVisible(false); router.push('/(tabs)/add'); } },
        { label: 'أضف قصة', description: 'شارك لقطة سريعة من عالمك.', iconName: 'camera-outline', onPress: () => { setHomeHubVisible(false); router.push('/story/create'); } },
        { label: 'استكشف', description: 'شوف عناصر وناس وحركة جديدة حولك.', iconName: 'compass-outline', onPress: () => { setHomeHubVisible(false); router.push('/(tabs)/discover'); } },
        { label: 'دولابي', description: 'ادخل مساحتك الخاصة للمسودات والميديا والأفكار.', iconName: 'archive-outline', onPress: () => { setHomeHubVisible(false); router.push('/dolab'); } },
        { label: 'ملفي', description: 'راجع حضورك ومعلوماتك في تِسوى.', iconName: 'person-circle-outline', onPress: () => { setHomeHubVisible(false); if (userId) { router.push(`/profile/${userId}`); return; } router.push('/(auth)/login'); } },
      ]} />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  header: { gap: 14, marginBottom: spacing.md },
  sectionGroup: { gap: 10 },
  homeSectionHeading: { flex: 1, flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.xs },
  homeSectionCopy: { flex: 1, minWidth: 0, gap: 3 },
  homeSectionEyebrow: { color: colors.primary, fontSize: 11 },
  homeSectionTitle: { fontSize: 19, lineHeight: 25 },
  homeSectionDescription: { fontSize: 12, lineHeight: 18 },
  homeSectionAction: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, paddingVertical: spacing.xs },
  homeSectionActionText: { color: colors.primary, fontSize: 12 },
  supportMutedText: { color: colors.textMuted },
  todayCard: { borderColor: colors.border, backgroundColor: colors.surface },
  todayHeaderRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  todayTitleCopy: { flex: 1, gap: 2 },
  todayDescription: { fontSize: 11, lineHeight: 17 },
  liveBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 6, backgroundColor: colors.accentSoft },
  liveBadgeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  liveBadgeText: { color: colors.accent, fontSize: 11 },
  dashboardSection: { gap: 10 },
  dashboardErrorText: { color: colors.danger },
  nextActionBlock: { gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 10, overflow: 'hidden' },
  nextActionTopRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm },
  nextActionIcon: { width: 38, height: 38, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  nextActionCopy: { flex: 1, gap: spacing.xs, paddingTop: 2 },
  nextActionTitle: { fontSize: 17, lineHeight: 23 },
  metricsRow: { flexDirection: 'row-reverse', gap: 6 },
  metricCard: { flex: 1, minHeight: 76, minWidth: 86, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface, paddingVertical: 8, paddingHorizontal: spacing.xs, alignItems: 'center', gap: 2 },
  metricIcon: { width: 26, height: 26, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { fontSize: 10, textAlign: 'center', lineHeight: 14 },
  metricValue: { fontSize: 18, lineHeight: 21 },
  storiesCard: { borderColor: colors.border, backgroundColor: colors.surface },
  storiesSection: { gap: 10 },
  storiesHeaderRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  storyCountBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, borderRadius: radii.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  storyCountText: { fontSize: 12, color: colors.primary },
  storiesRail: { gap: spacing.sm, paddingVertical: spacing.xs, paddingRight: 2 },
  storyTile: { width: 64, alignItems: 'center', gap: 6, borderRadius: radii.lg, paddingVertical: spacing.xs },
  myStoryTile: { backgroundColor: colors.primarySoft },
  addStoryTile: { backgroundColor: colors.surface },
  storyAvatarRing: { width: 54, height: 54, borderRadius: radii.round, padding: 3, shadowColor: colors.primary, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  storyAvatar: { flex: 1, borderRadius: radii.round, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  addStoryAvatar: { backgroundColor: colors.surface },
  avatarImage: { width: '100%', height: '100%' },
  fallbackInitial: { color: colors.textMuted, fontSize: 18 },
  storyLabel: { fontSize: 11, textAlign: 'center' },
  myStoryCount: { minWidth: 20, overflow: 'hidden', borderRadius: radii.round, paddingHorizontal: 6, paddingVertical: 2, marginTop: -5, color: colors.primary, backgroundColor: colors.primarySoft, fontSize: 10, textAlign: 'center' },
  inlineStateRow: { gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface, padding: spacing.sm },
  loadingPanel: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surface, padding: spacing.sm },
  quietStoryState: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.neutralSoft, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  quietStoryText: { flex: 1, fontSize: 12, lineHeight: 18 },
  videoCard: { borderColor: colors.border, backgroundColor: colors.surface },
  cacheNoticeCard: { borderColor: colors.border, backgroundColor: colors.accentSoft },
  cacheNoticeRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  cacheNoticeIcon: { width: 34, height: 34, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  cacheNoticeText: { flex: 1, fontSize: 13, lineHeight: 20 },
  feedStateCard: { gap: spacing.md, padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  feedStateIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  feedStateCopy: { gap: 2 },
  feedLoadingStack: { gap: spacing.md },
  feedSkeletonCard: { overflow: 'hidden', borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  feedSkeletonImage: { height: 176, backgroundColor: colors.primarySoft },
  feedSkeletonCopy: { gap: spacing.sm, padding: spacing.md },
  feedSkeletonTitle: { width: '68%', height: 18, borderRadius: radii.sm, backgroundColor: colors.primarySoft },
  feedSkeletonLine: { width: '92%', height: 12, borderRadius: radii.sm, backgroundColor: colors.neutralSoft },
  feedSkeletonMeta: { width: '38%', height: 12, borderRadius: radii.sm, backgroundColor: colors.accentSoft },
});
