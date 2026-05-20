import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { ItemCard } from '@/components/marketplace/ItemCard';
import { ItemVideoDiscoveryRail } from '@/components/marketplace/ItemVideoDiscoveryRail';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { fetchHomeDashboardSummary, HomeDashboardSummary } from '@/lib/home-dashboard';
import { fetchMarketplaceItemsPage, MarketplaceItem } from '@/lib/marketplace-items';
import {
  readAnyMarketplaceFirstPageCache,
  readFreshMarketplaceFirstPageCache,
  writeMarketplaceFirstPageCache,
} from '@/lib/offline-marketplace-cache';
import { ActiveStorySummary, fetchActiveStoriesForHome } from '@/lib/stories';
import { fetchRecentItemVideoDiscoveryMoments, ItemVideoDiscoveryMoment } from '@/lib/item-video-discovery';
import { PersonalLivingWorldCard } from '@/components/home/PersonalLivingWorldCard';
import {
  buildPersonalLivingWorldState,
  countActiveStoriesSince,
  countVideoMomentsSince,
  fetchNewMarketplaceItemsCountSince,
  readPersonalLivingWorldLastSeen,
  writePersonalLivingWorldLastSeen,
} from '@/lib/personal-living-world';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type NextActionKind = 'profile' | 'offers' | 'messages' | 'replies' | 'firstItem' | 'calm';

const nextActionVisuals: Record<NextActionKind, { icon: IoniconName; color: string; soft: string }> = {
  profile: { icon: 'person-circle-outline', color: colors.primary, soft: 'rgba(184,98,63,0.13)' },
  offers: { icon: 'swap-horizontal-outline', color: colors.primary, soft: 'rgba(184,98,63,0.13)' },
  messages: { icon: 'chatbubbles-outline', color: colors.accent, soft: 'rgba(62,124,115,0.13)' },
  replies: { icon: 'sparkles-outline', color: colors.accent, soft: 'rgba(62,124,115,0.13)' },
  firstItem: { icon: 'add-circle-outline', color: colors.primary, soft: 'rgba(184,98,63,0.13)' },
  calm: { icon: 'pulse-outline', color: colors.accent, soft: 'rgba(62,124,115,0.13)' },
};

const metricSignals: Array<{ key: 'offers' | 'messages' | 'listings'; label: string; icon: IoniconName; color: string }> = [
  { key: 'offers', label: 'العروض الواردة', icon: 'swap-horizontal-outline', color: colors.primary },
  { key: 'messages', label: 'رسائل وردود', icon: 'chatbubble-ellipses-outline', color: colors.accent },
  { key: 'listings', label: 'عناصر نشطة', icon: 'cube-outline', color: '#8A5A2D' },
];

export default function HomeScreen() {
  const router = useRouter();
  const { user, profileCompleted } = useAuth();
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [itemsCacheNotice, setItemsCacheNotice] = useState<string | null>(null);

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

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    setItemsCacheNotice(null);

    let hasFreshCacheVisible = false;

    const cached = await readFreshMarketplaceFirstPageCache();
    if (cached) {
      hasFreshCacheVisible = true;
      setItems(cached.page.items);
      setLoading(false);
      setItemsCacheNotice('نستعرض آخر عناصر محفوظة بينما نتحقق من الجديد.');
    }

    try {
      const page = await fetchMarketplaceItemsPage({ offset: 0 });
      setItems(page.items);
      setError(null);
      setItemsCacheNotice(null);
      void writeMarketplaceFirstPageCache(page);
    } catch {
      if (hasFreshCacheVisible) {
        setItemsCacheNotice('تعذر التحديث الآن، نعرض آخر نسخة محفوظة.');
      } else {
        const stale = await readAnyMarketplaceFirstPageCache();
        if (stale) {
          setItems(stale.page.items);
          setError(null);
          setItemsCacheNotice('أنت ترى نسخة محفوظة من أحدث العناصر. سنحدّثها عندما يتحسن الاتصال.');
        } else {
          setError('تعذر تحميل العناصر حالياً. حاول مرة أخرى.');
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStories = useCallback(async () => {
    setStoriesLoading(true);
    setStoriesError(null);
    try {
      const result = await fetchActiveStoriesForHome();
      setStories(result);
    } catch {
      setStoriesError('تعذر تحميل القصص حالياً.');
    } finally {
      setStoriesLoading(false);
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!user?.id) {
      setDashboard(null);
      setDashboardLoading(false);
      setDashboardError(null);
      return;
    }

    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const result = await fetchHomeDashboardSummary(user.id);
      setDashboard(result);
    } catch {
      setDashboardError('تعذر تحميل لمحة حسابك حالياً.');
      setDashboard(null);
    } finally {
      setDashboardLoading(false);
    }
  }, [user?.id]);

  const loadVideoMoments = useCallback(async () => {
    setVideoMomentsLoading(true);
    setVideoMomentsError(null);
    try {
      const moments = await fetchRecentItemVideoDiscoveryMoments(6);
      setVideoMoments(moments);
    } catch {
      setVideoMoments([]);
      setVideoMomentsError('تعذر تحميل اللمحات المرئية الآن.');
    } finally {
      setVideoMomentsLoading(false);
    }
  }, []);

  const loadPersonalLivingWorldMarker = useCallback(async () => {
    if (!user?.id) {
      setPersonalWorldLastSeenAtMs(null);
      setPersonalWorldNewItemsCount(null);
      setPersonalWorldLoading(false);
      return;
    }

    setPersonalWorldLoading(true);
    const lastSeen = await readPersonalLivingWorldLastSeen(user.id);
    setPersonalWorldLastSeenAtMs(lastSeen);
    const newItemsCount = await fetchNewMarketplaceItemsCountSince(lastSeen);
    setPersonalWorldNewItemsCount(newItemsCount);
    setPersonalWorldLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadItems();
    loadStories();
    void loadVideoMoments();
    if (user?.id) {
      void loadDashboard();
    }
  }, [loadDashboard, loadItems, loadStories, loadVideoMoments, user?.id]);

  useEffect(() => {
    void loadPersonalLivingWorldMarker();
  }, [loadPersonalLivingWorldMarker]);

  useEffect(() => {
    personalWorldSeenCommittedRef.current = false;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || personalWorldSeenCommittedRef.current) return;
    if (personalWorldLoading || storiesLoading || videoMomentsLoading || dashboardLoading) return;

    personalWorldSeenCommittedRef.current = true;
    void writePersonalLivingWorldLastSeen(user.id);
  }, [dashboardLoading, personalWorldLoading, storiesLoading, user?.id, videoMomentsLoading]);

  useFocusEffect(
    useCallback(() => {
      void loadStories();
      if (user?.id) {
        void loadDashboard();
      }
    }, [loadDashboard, loadStories, user?.id]),
  );

  const myStorySummary = useMemo(() => stories.find((summary) => summary.author.id === user?.id) ?? null, [stories, user?.id]);
  const otherStorySummaries = useMemo(() => stories.filter((summary) => summary.author.id !== user?.id), [stories, user?.id]);
  const totalActiveStories = stories.reduce((total, summary) => total + summary.stories.length, 0);
  const shouldShowVideoMomentsRail = videoMomentsLoading || Boolean(videoMomentsError) || videoMoments.length > 0;
  const newActiveStoriesCount = useMemo(
    () => countActiveStoriesSince(stories, personalWorldLastSeenAtMs),
    [personalWorldLastSeenAtMs, stories],
  );
  const newVideoMomentsCount = useMemo(
    () => countVideoMomentsSince(videoMoments, personalWorldLastSeenAtMs),
    [personalWorldLastSeenAtMs, videoMoments],
  );
  const personalLivingWorldState = useMemo(
    () =>
      buildPersonalLivingWorldState({
        lastSeenAtMs: personalWorldLastSeenAtMs,
        actionableOffersCount: dashboard?.incomingActionableOffersCount ?? 0,
        unreadDealMessagesCount: dashboard?.unreadDealMessagesCount ?? 0,
        unreadContextualMessagesCount: dashboard?.unreadContextualMessagesCount ?? 0,
        newActiveStoriesCount,
        newVideoMomentsCount,
        newMarketplaceItemsCount: personalWorldNewItemsCount,
      }),
    [dashboard, newActiveStoriesCount, newVideoMomentsCount, personalWorldLastSeenAtMs, personalWorldNewItemsCount],
  );

  const nextAction = useMemo(() => {
    if (!dashboard) {
      return null;
    }

    if (!profileCompleted) {
      return {
        title: 'كمّل ملفك',
        description: 'ملفك هو أول انطباع عنك في تِسوى. خلّيه أوضح.',
        buttonLabel: 'تعديل ملفي',
        route: '/profile/edit' as const,
        variant: 'primary' as const,
        kind: 'profile' as const,
      };
    }

    if (dashboard.incomingActionableOffersCount > 0) {
      const count = dashboard.incomingActionableOffersCount;
      return {
        title: 'عندك عروض محتاجة رد',
        description: count === 1 ? 'فيه عرض وارد ينتظر قرارك.' : `فيه ${count} عروض واردة تنتظر قرارك.`,
        buttonLabel: 'افتح الرسائل والعروض',
        route: '/(tabs)/messages' as const,
        variant: 'primary' as const,
        kind: 'offers' as const,
      };
    }

    const unreadDeals = dashboard.unreadDealMessagesCount;
    const unreadReplies = dashboard.unreadContextualMessagesCount;

    if (unreadDeals > 0 && unreadReplies > 0) {
      return {
        title: 'عندك رسائل وردود جديدة',
        description: `فيه ${unreadReplies} ردود قصص و ${unreadDeals} رسائل صفقات لم تقرأها بعد.`,
        buttonLabel: 'افتح الرسائل',
        route: '/(tabs)/messages' as const,
        variant: 'primary' as const,
        kind: 'messages' as const,
      };
    }

    if (unreadReplies > 0) {
      return {
        title: 'عندك ردود قصص جديدة',
        description:
          unreadReplies === 1
            ? 'فيه رد جديد على القصص لم تقرأه بعد.'
            : `فيه ${unreadReplies} ردود قصص لم تقرأها بعد.`,
        buttonLabel: 'افتح الردود',
        route: '/(tabs)/messages' as const,
        variant: 'primary' as const,
        kind: 'replies' as const,
      };
    }

    if (unreadDeals > 0) {
      const count = unreadDeals;
      return {
        title: 'فيه رسائل جديدة في دردشات الصفقات',
        description: count === 1 ? 'رسالة واحدة لم تقرأها بعد.' : `${count} رسائل لم تقرأها بعد.`,
        buttonLabel: 'افتح الدردشات',
        route: '/(tabs)/messages' as const,
        variant: 'primary' as const,
        kind: 'messages' as const,
      };
    }

    if (dashboard.activeListingsCount === 0) {
      return {
        title: 'اعرض أول حاجة',
        description: 'وجود عنصر نشط يفتح باب التبادل ويخلي ملفك يتحرك.',
        buttonLabel: 'اعرض حاجة',
        route: '/(tabs)/add' as const,
        variant: 'primary' as const,
        kind: 'firstItem' as const,
      };
    }

    return {
      title: 'كل شيء هادئ الآن',
      description: 'عندك حضور نشط في تِسوى. شوف الحركة الجديدة حوالينك.',
      buttonLabel: 'ادخل حركة تِسوى',
      route: '/motion' as const,
      variant: 'neutral' as const,
      kind: 'calm' as const,
    };
  }, [dashboard, profileCompleted]);

  return (
    <AppScreen backgroundVariant="alive" style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <LinearGradient
              colors={['#FFFDF8', '#F4DDCC', '#FFF6E8']}
              start={{ x: 0.08, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <View style={[styles.heroOrb, styles.heroOrbPrimary]} />
              <View style={[styles.heroOrb, styles.heroOrbAccent]} />
              <View style={styles.heroIconShell}>
                <Ionicons name="home-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.heroCopy}>
                <AppText weight="bold" style={styles.title}>تِسوى الآن.. عالمك بيتحرّك</AppText>
                <AppText style={styles.heroBody}>من هنا تشوف الحركة اللي حواليك، وتقرر الخطوة الجاية: تعرض حاجة، تفتح حكاية، أو تقرّب من تبادل.</AppText>
                <AppText muted style={styles.heroSupport}>ده بيتك اليومي في تِسوى: نبضك الشخصي + أقرب فرص تتحرك.</AppText>
              </View>
            </LinearGradient>
            <AppCard>
              <View style={styles.loopStrip}>
                <AppText weight="bold">إزاي تِسوى بتتحرك؟</AppText>
                <AppText muted>اكتشف قيمة حولك ← اعرض اللي عندك ← افتح تواصل إنساني ← قرّب من تبادل حقيقي.</AppText>
              </View>
            </AppCard>

            {user ? (
              <AppCard>
                <View style={styles.dashboardSection}>
                  <View style={styles.sectionHeader}>
                    <AppText weight="bold" style={styles.sectionTitle}>يهمك الآن</AppText>
                    <AppText muted>نبضة شخصية تجمع لك أقرب خطوة، من غير ضجيج.</AppText>
                  </View>

                  {dashboardLoading ? (
                    <View style={styles.loadingPanel}>
                      <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
                      <AppText muted>نجهّز لمحتك الآن...</AppText>
                    </View>
                  ) : null}

                  {!dashboardLoading && dashboardError ? (
                    <View style={styles.inlineStateRow}>
                      <AppText style={styles.dashboardErrorText}>{dashboardError}</AppText>
                      <AppButton label="إعادة المحاولة" variant="neutral" onPress={loadDashboard} />
                    </View>
                  ) : null}

                  {!dashboardLoading && !dashboardError && nextAction ? (
                    <LinearGradient
                      colors={['rgba(255,253,248,0.98)', nextActionVisuals[nextAction.kind].soft, 'rgba(255,246,232,0.92)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.nextActionBlock}
                    >
                      <View style={styles.nextActionTopRow}>
                        <View style={[styles.nextActionIcon, { backgroundColor: nextActionVisuals[nextAction.kind].soft }]}>
                          <Ionicons name={nextActionVisuals[nextAction.kind].icon} size={21} color={nextActionVisuals[nextAction.kind].color} />
                        </View>
                        <View style={styles.nextActionCopy}>
                          <AppText weight="bold" style={styles.nextActionTitle}>{nextAction.title}</AppText>
                          <AppText muted>{nextAction.description}</AppText>
                        </View>
                      </View>
                      <AppButton
                        label={nextAction.buttonLabel}
                        variant={nextAction.variant}
                        onPress={() => router.push(nextAction.route)}
                      />
                    </LinearGradient>
                  ) : null}

                  {dashboard ? (
                    <View style={styles.metricsRow}>
                      {metricSignals.map((signal) => {
                        const value =
                          signal.key === 'offers'
                            ? dashboard.incomingActionableOffersCount
                            : signal.key === 'messages'
                              ? dashboard.unreadDealMessagesCount + dashboard.unreadContextualMessagesCount
                              : dashboard.activeListingsCount;

                        return (
                          <View key={signal.key} style={styles.metricCard}>
                            <View style={[styles.metricIcon, { backgroundColor: signal.color === colors.accent ? 'rgba(62,124,115,0.12)' : 'rgba(184,98,63,0.12)' }]}>
                              <Ionicons name={signal.icon} size={16} color={signal.color} />
                            </View>
                            <AppText weight="bold" style={styles.metricValue}>{value}</AppText>
                            <AppText muted style={styles.metricLabel}>{signal.label}</AppText>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              </AppCard>
            ) : null}

            {user ? (
              <PersonalLivingWorldCard
                state={personalLivingWorldState}
                loading={personalWorldLoading}
                onPrimaryAction={() => {
                  if (personalLivingWorldState.primaryActionRoute) {
                    router.push(personalLivingWorldState.primaryActionRoute as any);
                  }
                }}
              />
            ) : null}

            <AppCard>
              <View style={styles.storiesSection}>
                <View style={styles.storiesHeaderRow}>
                  <View style={styles.sectionHeader}>
                    <AppText weight="bold" style={styles.sectionTitle}>حكايات تفتح تواصل</AppText>
                    <AppText muted>كل قصة هنا ممكن تبدأ محادثة وتقرّب فرصة تبادل.</AppText>
                  </View>
                  {!storiesLoading && !storiesError && totalActiveStories > 0 ? (
                    <View style={styles.storyCountBadge}>
                      <Ionicons name="radio-outline" size={13} color={colors.primary} />
                      <AppText weight="semibold" style={styles.storyCountText}>{totalActiveStories} قصة</AppText>
                    </View>
                  ) : <View />}
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storiesRail}>
                  {myStorySummary && user?.id ? (
                    <Pressable style={[styles.storyTile, styles.myStoryTile]} onPress={() => router.push(`/story/${user.id}`)}>
                      <LinearGradient colors={[colors.primary, '#F2B978', colors.accent]} style={styles.storyAvatarRing}>
                        <View style={styles.storyAvatar}>
                          {myStorySummary.author.avatarUrl ? (
                            <ExpoImage source={{ uri: myStorySummary.author.avatarUrl }} style={styles.avatarImage} contentFit="cover" />
                          ) : (
                            <AppText weight="bold" style={styles.fallbackInitial}>
                              {(myStorySummary.author.displayName ?? myStorySummary.author.username ?? 'م').trim().charAt(0).toUpperCase()}
                            </AppText>
                          )}
                        </View>
                      </LinearGradient>
                      <AppText numberOfLines={1} weight="semibold" style={styles.storyLabel}>قصتك</AppText>
                      {myStorySummary.stories.length > 1 ? <AppText weight="semibold" style={styles.myStoryCount}>{myStorySummary.stories.length}</AppText> : null}
                    </Pressable>
                  ) : (
                    <Pressable style={[styles.storyTile, styles.addStoryTile]} onPress={() => router.push('/story/create')}>
                      <LinearGradient colors={['#FFF6E8', colors.primarySoft]} style={styles.storyAvatarRing}>
                        <View style={[styles.storyAvatar, styles.addStoryAvatar]}>
                          <Ionicons name="add" size={26} color={colors.primary} />
                        </View>
                      </LinearGradient>
                      <AppText numberOfLines={1} weight="semibold" style={styles.storyLabel}>قصتك</AppText>
                    </Pressable>
                  )}

                  {otherStorySummaries.map((story) => {
                    const label = story.author.displayName ?? (story.author.username ? `@${story.author.username}` : 'مستخدم');
                    const fallbackInitial = (story.author.displayName ?? story.author.username ?? 'م').trim().charAt(0).toUpperCase();

                    return (
                      <Pressable key={story.author.id} style={styles.storyTile} onPress={() => router.push(`/story/${story.author.id}`)}>
                        <LinearGradient colors={['#F2B978', colors.primarySoft, colors.accent]} style={styles.storyAvatarRing}>
                          <View style={styles.storyAvatar}>
                            {story.author.avatarUrl ? (
                              <ExpoImage source={{ uri: story.author.avatarUrl }} style={styles.avatarImage} contentFit="cover" />
                            ) : (
                              <AppText weight="bold" style={styles.fallbackInitial}>{fallbackInitial}</AppText>
                            )}
                          </View>
                        </LinearGradient>
                        <AppText numberOfLines={1} style={styles.storyLabel}>{label}</AppText>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {storiesLoading ? (
                  <View style={styles.loadingPanel}>
                    <Ionicons name="ellipsis-horizontal-circle-outline" size={18} color={colors.accent} />
                    <AppText muted>نفتح القصص القريبة الآن...</AppText>
                  </View>
                ) : null}
                {!storiesLoading && storiesError ? (
                  <View style={styles.inlineStateRow}>
                    <AppText muted>{storiesError}</AppText>
                    <AppButton label="إعادة المحاولة" variant="neutral" onPress={loadStories} />
                  </View>
                ) : null}
                {!storiesLoading && !storiesError && stories.length === 0 ? (
                  <View style={styles.quietStoryState}>
                    <Ionicons name="moon-outline" size={17} color={colors.textMuted} />
                    <AppText muted>لا توجد قصص نشطة بعد. كن أول نبضة اليوم.</AppText>
                  </View>
                ) : null}
              </View>
            </AppCard>

            {shouldShowVideoMomentsRail ? (
              <AppCard>
                <ItemVideoDiscoveryRail
            onOpenViewer={() => router.push('/motion/viewer')}
            viewerCtaLabel='شوف المشاهد'
                  eyebrow="لمحات مرئية"
                  title="عناصر تقدر تشوفها أقرب"
                  description="فيديوهات قصيرة تساعدك تلمح العنصر قبل ما تفتح تفاصيله."
                  moments={videoMoments}
                  loading={videoMomentsLoading}
                  errorMessage={videoMomentsError}
                  onRetry={loadVideoMoments}
                />
              </AppCard>
            ) : null}

            {itemsCacheNotice ? (
              <AppCard>
                <View style={styles.cacheNoticeRow}>
                  <Ionicons name="cloud-offline-outline" size={18} color={colors.accent} />
                  <AppText muted style={styles.cacheNoticeText}>{itemsCacheNotice}</AppText>
                </View>
              </AppCard>
            ) : null}

            <View style={styles.itemsHeader}>
              <AppText weight="semibold" style={styles.itemsEyebrow}>فرص جديدة</AppText>
              <AppText weight="bold" style={styles.itemsTitle}>عناصر جاهزة تتحرك</AppText>
              <AppText muted>مش مجرد عرض.. دي عناصر ممكن تدخل في عرض وتبديل فعلي.</AppText>
            </View>
          </View>
        }
        renderItem={({ item }) => <ItemCard item={item} />}
        ListEmptyComponent={
          loading ? (
            <EmptyState title="جاري التحميل" description="نلمّ أحدث العناصر المتاحة الآن." />
          ) : error ? (
            <View style={styles.stateBox}>
              <EmptyState title="حدث خطأ" description={error} />
              <AppButton label="إعادة المحاولة" onPress={loadItems} />
            </View>
          ) : (
            <EmptyState title="لا توجد عناصر حالياً" description="الواجهة هادئة الآن، وستظهر العناصر هنا فور توفرها." />
          )
        }
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  loopStrip: { gap: spacing.xs },
  screen: { paddingHorizontal: 0 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  header: { gap: spacing.md, marginBottom: spacing.md },
  heroCard: {
    minHeight: 190,
    gap: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.18)',
    padding: spacing.lg,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  heroOrb: { position: 'absolute', borderRadius: radii.round, opacity: 0.34 },
  heroOrbPrimary: { width: 132, height: 132, right: -34, top: -26, backgroundColor: colors.primarySoft },
  heroOrbAccent: { width: 112, height: 112, left: -28, bottom: -36, backgroundColor: 'rgba(62,124,115,0.18)' },
  heroIconShell: {
    width: 42,
    height: 42,
    borderRadius: radii.round,
    backgroundColor: 'rgba(255,253,248,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: { gap: spacing.sm, maxWidth: '92%' },
  title: { fontSize: 27, lineHeight: 34 },
  heroBody: { fontSize: 16, lineHeight: 24 },
  heroSupport: { lineHeight: 22 },
  sectionHeader: { gap: spacing.xs, flexShrink: 1 },
  sectionTitle: { fontSize: 18 },
  dashboardSection: { gap: spacing.md },
  dashboardErrorText: { color: '#B42318' },
  nextActionBlock: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.16)',
    borderRadius: radii.lg,
    padding: spacing.md,
    overflow: 'hidden',
  },
  nextActionTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  nextActionIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,253,248,0.74)',
  },
  nextActionCopy: { flex: 1, gap: spacing.xs },
  nextActionTitle: { fontSize: 17 },
  metricsRow: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
  },
  metricCard: {
    flex: 1,
    minWidth: 92,
    borderWidth: 1,
    borderColor: 'rgba(221,208,197,0.82)',
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255,253,248,0.82)',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    gap: spacing.xs,
  },
  metricIcon: {
    width: 30,
    height: 30,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
  metricValue: { fontSize: 22, lineHeight: 27 },
  storiesSection: {
    gap: spacing.md,
  },
  storiesHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  storyCountBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.18)',
    backgroundColor: 'rgba(238,216,203,0.42)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  storyCountText: { fontSize: 12, color: colors.primary },
  storiesRail: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingRight: 2,
  },
  storyTile: {
    width: 76,
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.lg,
    paddingVertical: spacing.xs,
  },
  myStoryTile: { backgroundColor: 'rgba(238,216,203,0.24)' },
  addStoryTile: { backgroundColor: 'rgba(255,246,232,0.68)' },
  storyAvatarRing: {
    width: 66,
    height: 66,
    borderRadius: radii.round,
    padding: 3,
    shadowColor: colors.primary,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  storyAvatar: {
    flex: 1,
    borderRadius: radii.round,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  addStoryAvatar: {
    backgroundColor: '#FFF8EC',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  fallbackInitial: {
    color: colors.textMuted,
    fontSize: 20,
  },
  storyLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  myStoryCount: {
    minWidth: 20,
    overflow: 'hidden',
    borderRadius: radii.round,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: -5,
    color: colors.primary,
    backgroundColor: '#FFF6E8',
    fontSize: 10,
    textAlign: 'center',
  },
  inlineStateRow: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(221,208,197,0.8)',
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,253,248,0.7)',
    padding: spacing.md,
  },
  loadingPanel: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,253,248,0.62)',
    padding: spacing.sm,
  },
  quietStoryState: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(249,243,234,0.72)',
    padding: spacing.sm,
  },
  cacheNoticeRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  cacheNoticeText: { flex: 1 },
  itemsHeader: {
    gap: spacing.xs,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  itemsEyebrow: { color: colors.primary, fontSize: 12 },
  itemsTitle: { fontSize: 21 },
  stateBox: { gap: spacing.md },
});
