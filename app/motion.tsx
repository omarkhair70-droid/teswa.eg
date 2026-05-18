import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Image as ExpoImage } from 'expo-image';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { ActiveStorySummary, fetchActiveStoriesForHome } from '@/lib/stories';
import { fetchStoryDiscoveryItems, StoryDiscoveryItem } from '@/lib/story-discovery';
import { fetchMovingItems, MovingItemInterest } from '@/lib/motion-interest';

type MotionFeedEntry =
  | {
      key: string;
      kind: 'moving_item';
      activityAt: string | null;
      item: MovingItemInterest;
    }
  | {
      key: string;
      kind: 'story_item';
      activityAt: string | null;
      item: StoryDiscoveryItem;
    };

const toTimestamp = (dateValue: string | null) => {
  if (!dateValue) return null;
  const ts = Date.parse(dateValue);
  return Number.isNaN(ts) ? null : ts;
};

export default function MotionScreen() {
  const [stories, setStories] = useState<ActiveStorySummary[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [storiesError, setStoriesError] = useState<string | null>(null);

  const [items, setItems] = useState<StoryDiscoveryItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const [movingItems, setMovingItems] = useState<MovingItemInterest[]>([]);
  const [movingLoading, setMovingLoading] = useState(true);
  const [movingError, setMovingError] = useState<string | null>(null);

  const loadStories = useCallback(async () => {
    setStoriesLoading(true);
    setStoriesError(null);
    try {
      const data = await fetchActiveStoriesForHome();
      setStories(data);
    } catch {
      setStoriesError('تعذر تحميل القصص حالياً.');
    } finally {
      setStoriesLoading(false);
    }
  }, []);

  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    setItemsError(null);
    try {
      const data = await fetchStoryDiscoveryItems({ limit: 12 });
      setItems(data);
    } catch {
      setItemsError('تعذر تحميل العناصر ذات الحكاية حالياً.');
    } finally {
      setItemsLoading(false);
    }
  }, []);

  const loadMovingItems = useCallback(async () => {
    setMovingLoading(true);
    setMovingError(null);
    try {
      const data = await fetchMovingItems({ limit: 12 });
      setMovingItems(data);
    } catch {
      setMovingError('تعذر تحميل أبواب الحركة حالياً.');
    } finally {
      setMovingLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStories();
    loadMovingItems();
    loadItems();
  }, [loadItems, loadMovingItems, loadStories]);

  const motionFeedEntries = useMemo<MotionFeedEntry[]>(() => {
    const movingEntries = movingItems.map((item, index) => ({
      key: `moving-${item.id}-${index}`,
      kind: 'moving_item' as const,
      activityAt: item.latestInterestAt,
      item,
      sourceIndex: index,
      sourceRank: 0,
    }));

    const storyEntries = items.map((item, index) => ({
      key: `story-${item.id}-${index}`,
      kind: 'story_item' as const,
      activityAt: item.createdAt,
      item,
      sourceIndex: index,
      sourceRank: 1,
    }));

    return [...movingEntries, ...storyEntries]
      .map((entry, overallIndex) => ({ ...entry, overallIndex }))
      .sort((a, b) => {
        const aTs = toTimestamp(a.activityAt);
        const bTs = toTimestamp(b.activityAt);

        if (aTs !== null && bTs !== null && aTs !== bTs) {
          return bTs - aTs;
        }
        if (aTs !== null && bTs === null) return -1;
        if (aTs === null && bTs !== null) return 1;
        if (a.sourceIndex !== b.sourceIndex) return a.sourceIndex - b.sourceIndex;
        if (a.sourceRank !== b.sourceRank) return a.sourceRank - b.sourceRank;
        return a.overallIndex - b.overallIndex;
      })
      .map(({ key, kind, activityAt, item }) => ({ key, kind, activityAt, item }));
  }, [items, movingItems]);

  const allMotionLoading = movingLoading && itemsLoading;
  const motionEmpty = !movingLoading && !itemsLoading && motionFeedEntries.length === 0;
  const partialFailure = (movingError && !itemsError) || (itemsError && !movingError);

  const renderStoryRail = () => {
    if (storiesLoading) {
      return <AppText muted>جارٍ تحميل القصص...</AppText>;
    }

    if (storiesError) {
      return (
        <View style={styles.stateBox}>
          <AppText style={styles.errorText}>تعذر تحميل القصص حالياً.</AppText>
          <AppButton label="إعادة المحاولة" variant="neutral" onPress={loadStories} />
        </View>
      );
    }

    if (stories.length === 0) {
      return (
        <View style={styles.storyEmptyState}>
          <AppText muted>لا توجد قصص نشطة حالياً.</AppText>
          <AppButton label="أضف قصة" onPress={() => router.push('/story/create')} />
        </View>
      );
    }

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyRailContent}>
        {stories.map((summary) => {
          const displayName = summary.author.displayName?.trim() || (summary.author.username ? `@${summary.author.username}` : 'مستخدم');
          const initial = displayName.charAt(0).toUpperCase();
          const count = summary.stories.length;

          return (
            <Pressable key={summary.author.id} style={styles.storyTile} onPress={() => router.push(`/story/${summary.author.id}`)}>
              {summary.author.avatarUrl ? (
                <ExpoImage source={{ uri: summary.author.avatarUrl }} style={styles.storyAvatar} contentFit="cover" cachePolicy="memory-disk" transition={120} />
              ) : (
                <View style={styles.storyAvatarFallback}><AppText weight="bold">{initial}</AppText></View>
              )}
              <AppText numberOfLines={1} style={styles.storyName}>{displayName}</AppText>
              {count > 1 ? <AppText muted style={styles.storyCount}>{count} قصص</AppText> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    );
  };

  const renderFeedItem = ({ item, index }: { item: MotionFeedEntry; index: number }) => {
    if (item.kind === 'moving_item') {
      const moving = item.item;
      const metadata = [moving.category, moving.condition, moving.location].filter(Boolean).join(' / ');
      const badge = moving.openInterestCount === 1 ? 'وصلها اقتراح' : `وصلها ${moving.openInterestCount} اقتراحات مفتوحة`;

      return (
        <Animated.View entering={FadeInUp.duration(280).delay(index * 35)}>
          <Pressable onPress={() => router.push(`/item/${moving.id}`)} style={styles.feedCard}>
            <View style={styles.feedImageFrame}>
              {moving.imageUrl ? (
                <ExpoImage source={{ uri: moving.imageUrl }} style={styles.feedImage} contentFit="cover" cachePolicy="memory-disk" transition={120} />
              ) : (
                <View style={styles.imagePlaceholder}><AppText muted>بدون صورة</AppText></View>
              )}
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.68)']} style={styles.imageOverlay}>
                <BlurView intensity={18} tint="dark" style={styles.overlayBadge}>
                  <AppText style={styles.overlayBadgeText}>{badge}</AppText>
                </BlurView>
              </LinearGradient>
            </View>
            <View style={styles.feedContent}>
              <AppText style={styles.microLabel}>باب بيتحرك</AppText>
              <AppText weight="semibold" numberOfLines={1}>{moving.title}</AppText>
              {metadata ? <AppText muted numberOfLines={1}>{metadata}</AppText> : null}
              {moving.ownerDisplayName ? <AppText muted numberOfLines={1}>بواسطة {moving.ownerDisplayName}</AppText> : null}
            </View>
          </Pressable>
        </Animated.View>
      );
    }

    const story = item.item;
    const metadata = [story.category, story.city, story.area].filter(Boolean).join(' / ');

    return (
      <Animated.View entering={FadeInUp.duration(280).delay(index * 35)}>
        <Pressable onPress={() => router.push(`/item/${story.id}`)} style={styles.feedCard}>
          {story.imageUrl ? (
            <ExpoImage source={{ uri: story.imageUrl }} style={styles.feedImage} contentFit="cover" cachePolicy="memory-disk" transition={120} />
          ) : (
            <View style={styles.imagePlaceholder}><AppText muted>بدون صورة</AppText></View>
          )}
          <View style={styles.feedContent}>
            <AppText style={styles.microLabel}>حكاية ظاهرة</AppText>
            <View style={styles.storyLabelPill}><AppText style={styles.storyLabelText}>{story.storyLabel}</AppText></View>
            <AppText weight="semibold" numberOfLines={1}>{story.title}</AppText>
            <AppText numberOfLines={3}>{story.storySnippet}</AppText>
            {metadata ? <AppText muted numberOfLines={1}>{metadata}</AppText> : null}
            {story.ownerDisplayName ? <AppText muted numberOfLines={1}>بواسطة {story.ownerDisplayName}</AppText> : null}
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <AppScreen style={styles.screen}>
      <FlashList
        data={motionFeedEntries}
        keyExtractor={(entry) => entry.key}
        estimatedItemSize={320}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={(
          <View style={styles.headerWrap}>
            <LinearGradient colors={[colors.primary, colors.accent, colors.primarySoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <AppText weight="bold" style={styles.heroTitle}>حركة تِسوى</AppText>
              <AppText style={styles.heroBody}>هنا الحاجات ما بتفضلش ساكتة. قصص بتتقال، وأبواب تبادل بدأت تتحرك.</AppText>
              <AppText style={styles.heroMuted}>تابع النبض الحي من الناس والعناصر اللي دخلت مرحلة جديدة.</AppText>
              <View style={styles.metricsRow}>
                {[
                  { label: 'قصص نشطة', value: stories.length },
                  { label: 'أبواب تتحرك', value: movingItems.length },
                  { label: 'حكايات', value: items.length },
                ].map((metric) => (
                  <BlurView key={metric.label} intensity={14} tint="light" style={styles.metricChip}>
                    <AppText weight="bold" style={styles.metricValue}>{metric.value}</AppText>
                    <AppText style={styles.metricLabel}>{metric.label}</AppText>
                  </BlurView>
                ))}
              </View>
            </LinearGradient>

            <View style={styles.storiesBand}>
              <AppText weight="bold">القصص الآن</AppText>
              <AppText muted>الناس اللي بتحرك المشهد في تِسوى دلوقتي.</AppText>
              {renderStoryRail()}
            </View>

            <View style={styles.pulseIntro}>
              <AppText weight="bold">النبض الآن</AppText>
              <AppText muted>حاجات عليها اهتمام، وحاجات أصحابها فتحوا لها باب حكاية.</AppText>
            </View>

            {partialFailure ? (
              <View style={styles.partialWarning}>
                <AppText style={styles.errorText}>تعذر تحميل جزء من الحركة حالياً.</AppText>
                <View style={styles.partialActions}>
                  {movingError ? <AppButton label="إعادة تحميل الأبواب" variant="neutral" onPress={loadMovingItems} /> : null}
                  {itemsError ? <AppButton label="إعادة تحميل الحكايات" variant="neutral" onPress={loadItems} /> : null}
                </View>
              </View>
            ) : null}

            {allMotionLoading ? <AppText muted>جارٍ تجهيز النبض...</AppText> : null}
          </View>
        )}
        ListEmptyComponent={motionEmpty ? (
          <View style={styles.emptyWrap}>
            <EmptyState title="النبض لسه هادي" description="أول ما تبدأ الحكايات والعروض تتحرك، هتشوفها هنا." />
            <AppButton label="استكشف العناصر" variant="neutral" onPress={() => router.push('/(tabs)/discover')} />
          </View>
        ) : null}
        renderItem={renderFeedItem}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  listContent: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  headerWrap: { gap: spacing.md },
  hero: { borderRadius: radii.xl, padding: spacing.lg, gap: spacing.sm, overflow: 'hidden' },
  heroTitle: { fontSize: 28, color: colors.white },
  heroBody: { color: colors.white },
  heroMuted: { color: 'rgba(255,255,255,0.86)' },
  metricsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  metricChip: {
    flex: 1,
    borderRadius: radii.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  metricValue: { color: colors.white, fontSize: 16 },
  metricLabel: { color: colors.white, fontSize: 12 },
  storiesBand: { gap: spacing.xs },
  storyRailContent: { gap: spacing.sm, paddingVertical: spacing.xs, paddingRight: spacing.md },
  storyTile: { width: 88, gap: spacing.xs, alignItems: 'center' },
  storyAvatar: { width: 64, height: 64, borderRadius: radii.round, borderWidth: 1, borderColor: colors.border },
  storyAvatarFallback: {
    width: 64,
    height: 64,
    borderRadius: radii.round,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyName: { textAlign: 'center' },
  storyCount: { fontSize: 12 },
  storyEmptyState: { gap: spacing.sm, paddingVertical: spacing.sm },
  pulseIntro: { gap: spacing.xs, paddingTop: spacing.xs },
  partialWarning: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#B42318',
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  partialActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  errorText: { color: '#B42318' },
  feedCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  feedImageFrame: { position: 'relative' },
  feedImage: { width: '100%', height: 180, backgroundColor: colors.background },
  imageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.sm, paddingTop: spacing.lg },
  overlayBadge: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.md, overflow: 'hidden' },
  overlayBadgeText: { color: colors.white, fontSize: 12 },
  imagePlaceholder: { height: 140, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  feedContent: { padding: spacing.md, gap: spacing.xs },
  microLabel: { color: colors.primary, fontSize: 12 },
  storyLabelPill: {
    alignSelf: 'flex-start',
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  storyLabelText: { color: colors.primary, fontSize: 12 },
  emptyWrap: { gap: spacing.sm, paddingVertical: spacing.lg },
});
