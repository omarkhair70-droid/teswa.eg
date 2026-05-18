import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { ItemCard } from '@/components/marketplace/ItemCard';
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

  useEffect(() => {
    loadItems();
    loadStories();
    if (user?.id) {
      void loadDashboard();
    }
  }, [loadDashboard, loadItems, loadStories, user?.id]);

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
      };
    }

    if (dashboard.activeListingsCount === 0) {
      return {
        title: 'اعرض أول حاجة',
        description: 'وجود عنصر نشط يفتح باب التبادل ويخلي ملفك يتحرك.',
        buttonLabel: 'اعرض حاجة',
        route: '/(tabs)/add' as const,
        variant: 'primary' as const,
      };
    }

    return {
      title: 'كل شيء هادئ الآن',
      description: 'عندك حضور نشط في تِسوى. شوف الحركة الجديدة حوالينك.',
      buttonLabel: 'ادخل حركة تِسوى',
      route: '/motion' as const,
      variant: 'neutral' as const,
    };
  }, [dashboard, profileCompleted]);

  return (
    <AppScreen style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <AppCard>
              <View style={styles.heroCard}>
                <AppText weight="bold" style={styles.title}>أهلاً بك في تِسوى</AppText>
                <AppText>هنا تبدأ الحكايات، وتتحرك الحاجات، وتفتح المقايضات أبوابها.</AppText>
                <AppText muted>تابع ما يهمك الآن، أو خذ جولة في الجديد.</AppText>
              </View>
            </AppCard>

            {user ? (
              <AppCard>
                <View style={styles.dashboardSection}>
                  <View style={styles.sectionHeader}>
                    <AppText weight="bold">يهمك الآن</AppText>
                    <AppText muted>لمحة سريعة عمّا يحتاج انتباهك داخل تِسوى.</AppText>
                  </View>

                  {dashboardLoading ? <AppText muted>نجهّز لمحتك الآن...</AppText> : null}

                  {!dashboardLoading && dashboardError ? (
                    <View style={styles.inlineStateRow}>
                      <AppText style={styles.dashboardErrorText}>{dashboardError}</AppText>
                      <AppButton label="إعادة المحاولة" variant="neutral" onPress={loadDashboard} />
                    </View>
                  ) : null}

                  {!dashboardLoading && !dashboardError && nextAction ? (
                    <View style={styles.nextActionBlock}>
                      <AppText weight="bold">{nextAction.title}</AppText>
                      <AppText muted>{nextAction.description}</AppText>
                      <AppButton
                        label={nextAction.buttonLabel}
                        variant={nextAction.variant}
                        onPress={() => router.push(nextAction.route)}
                      />
                    </View>
                  ) : null}

                  {dashboard ? (
                    <View style={styles.metricsRow}>
                      <View style={styles.metricChip}>
                        <AppText muted style={styles.metricLabel}>العروض الواردة</AppText>
                        <AppText weight="bold" style={styles.metricValue}>{dashboard.incomingActionableOffersCount}</AppText>
                      </View>
                      <View style={styles.metricChip}>
                        <AppText muted style={styles.metricLabel}>رسائل وردود غير مقروءة</AppText>
                        <AppText weight="bold" style={styles.metricValue}>{dashboard.unreadDealMessagesCount + dashboard.unreadContextualMessagesCount}</AppText>
                      </View>
                      <View style={styles.metricChip}>
                        <AppText muted style={styles.metricLabel}>عناصر نشطة</AppText>
                        <AppText weight="bold" style={styles.metricValue}>{dashboard.activeListingsCount}</AppText>
                      </View>
                    </View>
                  ) : null}
                </View>
              </AppCard>
            ) : null}

            <AppCard>
              <View style={styles.storiesSection}>
                <View style={styles.sectionHeader}>
                  <AppText weight="bold">القصص</AppText>
                  <AppText muted>لقطات قصيرة من عالم تِسوى الآن.</AppText>
                </View>

                <View style={styles.storiesHeaderRow}>
                  {!storiesLoading && !storiesError && totalActiveStories > 0 ? (
                    <AppText muted style={styles.storyCount}>{totalActiveStories} قصة</AppText>
                  ) : <View />}
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storiesRail}>
                  {myStorySummary && user?.id ? (
                    <Pressable style={styles.storyTile} onPress={() => router.push(`/story/${user.id}`)}>
                      <View style={[styles.storyAvatar, styles.myStoryActiveAvatar]}>
                        {myStorySummary.author.avatarUrl ? (
                          <ExpoImage source={{ uri: myStorySummary.author.avatarUrl }} style={styles.avatarImage} contentFit="cover" />
                        ) : (
                          <AppText weight="bold" style={styles.fallbackInitial}>
                            {(myStorySummary.author.displayName ?? myStorySummary.author.username ?? 'م').trim().charAt(0).toUpperCase()}
                          </AppText>
                        )}
                      </View>
                      <AppText numberOfLines={1} style={styles.storyLabel}>قصتك</AppText>
                      {myStorySummary.stories.length > 1 ? <AppText muted style={styles.myStoryCount}>{myStorySummary.stories.length}</AppText> : null}
                    </Pressable>
                  ) : (
                    <Pressable style={styles.storyTile} onPress={() => router.push('/story/create')}>
                      <View style={[styles.storyAvatar, styles.addStoryAvatar]}>
                        <AppText weight="bold" style={styles.addStoryPlus}>+</AppText>
                      </View>
                      <AppText numberOfLines={1} style={styles.storyLabel}>قصتك</AppText>
                    </Pressable>
                  )}

                  {otherStorySummaries.map((story) => {
                    const label = story.author.displayName ?? (story.author.username ? `@${story.author.username}` : 'مستخدم');
                    const fallbackInitial = (story.author.displayName ?? story.author.username ?? 'م').trim().charAt(0).toUpperCase();

                    return (
                      <Pressable key={story.author.id} style={styles.storyTile} onPress={() => router.push(`/story/${story.author.id}`)}>
                        <View style={styles.storyAvatar}>
                          {story.author.avatarUrl ? (
                            <ExpoImage source={{ uri: story.author.avatarUrl }} style={styles.avatarImage} contentFit="cover" />
                          ) : (
                            <AppText weight="bold" style={styles.fallbackInitial}>{fallbackInitial}</AppText>
                          )}
                        </View>
                        <AppText numberOfLines={1} style={styles.storyLabel}>{label}</AppText>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {storiesLoading ? <AppText muted>جارٍ تحميل القصص...</AppText> : null}
                {!storiesLoading && storiesError ? (
                  <View style={styles.inlineStateRow}>
                    <AppText muted>{storiesError}</AppText>
                    <AppButton label="إعادة المحاولة" variant="neutral" onPress={loadStories} />
                  </View>
                ) : null}
                {!storiesLoading && !storiesError && stories.length === 0 ? (
                  <AppText muted>لا توجد قصص نشطة بعد.</AppText>
                ) : null}
              </View>
            </AppCard>

            {itemsCacheNotice ? (
              <AppCard>
                <AppText muted>{itemsCacheNotice}</AppText>
              </AppCard>
            ) : null}

            <View style={styles.itemsHeader}>
              <AppText weight="bold">أحدث العناصر</AppText>
              <AppText muted>حاجات جديدة جاهزة لتبدأ رحلة تبادل.</AppText>
            </View>
          </View>
        }
        renderItem={({ item }) => <ItemCard item={item} />}
        ListEmptyComponent={
          loading ? (
            <EmptyState title="جاري التحميل" description="نقوم بجلب العناصر المتاحة الآن." />
          ) : error ? (
            <View style={styles.stateBox}>
              <EmptyState title="حدث خطأ" description={error} />
              <AppButton label="إعادة المحاولة" onPress={loadItems} />
            </View>
          ) : (
            <EmptyState title="لا توجد عناصر حالياً" description="أضفنا الأساس، وستظهر العناصر هنا فور توفرها." />
          )
        }
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  header: { gap: spacing.md, marginBottom: spacing.md },
  heroCard: { gap: spacing.sm },
  title: { fontSize: 24 },
  sectionHeader: { gap: spacing.xs },
  dashboardSection: { gap: spacing.sm },
  dashboardErrorText: { color: '#B42318' },
  nextActionBlock: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  metricsRow: {
    flexDirection: 'row-reverse',
    gap: spacing.xs,
  },
  metricChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.background,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    gap: spacing.xs,
  },
  metricLabel: { fontSize: 11, textAlign: 'center' },
  metricValue: { fontSize: 18 },
  storiesSection: {
    gap: spacing.sm,
  },
  storiesHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  storyCount: { fontSize: 12 },
  storiesRail: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  storyTile: {
    width: 72,
    alignItems: 'center',
    gap: 6,
  },
  storyAvatar: {
    width: 64,
    height: 64,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  addStoryAvatar: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  myStoryActiveAvatar: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  addStoryPlus: {
    fontSize: 28,
    color: colors.primary,
    lineHeight: 30,
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
    fontSize: 10,
    marginTop: -4,
  },
  inlineStateRow: {
    gap: spacing.sm,
  },
  itemsHeader: {
    gap: spacing.xs,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  stateBox: { gap: spacing.md },
});
