import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import Animated, { Easing, FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
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
import { readAnyMotionPublicFeedCache, readFreshMotionPublicFeedCache, writeMotionPublicFeedCache } from '@/lib/offline-motion-cache';
import { MotionPulseCanvas } from '@/components/motion/MotionPulseCanvas';
import { MotionEmptyAnimation } from '@/components/motion/MotionEmptyAnimation';
import { resolveCurrentDiscoveryLocation } from '@/lib/discovery-location';
import { CityPulseSection } from '@/components/motion/CityPulseSection';
import { CityPulseLocation, CityPulseSnapshot, fetchCityPulseSnapshot } from '@/lib/city-pulse';
import { fetchMotionVideoDrops, MotionVideoDrop } from '@/lib/motion-video-drops';
import { MotionVideoDropsSection } from '@/components/motion/MotionVideoDropsSection';
import { MotionLiveSignals } from '@/components/motion/MotionLiveSignals';
import { buildMotionVideoPresence } from '@/lib/motion-video-presence';
import { buildMotionLiveSignals } from '@/lib/motion-live-signals';
import {
  deleteCityPulseLocationCache,
  deleteCityPulseSnapshotCache,
  readAnyCityPulseSnapshotCache,
  readCityPulseLocationCache,
  readFreshCityPulseSnapshotCache,
  writeCityPulseLocationCache,
  writeCityPulseSnapshotCache,
} from '@/lib/offline-city-pulse-cache';

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

type RankedMotionFeedEntry = MotionFeedEntry & {
  sourceIndex: number;
  sourceRank: 0 | 1;
  overallIndex: number;
};

const toTimestamp = (dateValue: string | null) => {
  if (!dateValue) return null;
  const ts = Date.parse(dateValue);
  return Number.isNaN(ts) ? null : ts;
};

function MotionStoryPulseTile({ summary, onPress }: { summary: ActiveStorySummary; onPress: () => void }) {
  const pulse = useSharedValue(0);
  const displayName = summary.author.displayName?.trim() || (summary.author.username ? `@${summary.author.username}` : 'مستخدم');
  const initial = displayName.charAt(0).toUpperCase();
  const count = summary.stories.length;

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [pulse]);

  const pulseRingStyle = useAnimatedStyle(() => ({
    opacity: 0.36 + pulse.value * 0.2,
    transform: [{ scale: 1 + pulse.value * 0.035 }],
  }));

  return (
    <Pressable style={styles.storyTile} onPress={onPress}>
      <LinearGradient
        colors={['rgba(255,253,248,0.96)', 'rgba(238,216,203,0.58)', 'rgba(255,253,248,0.9)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.storyTileSurface}
      >
        <View style={styles.storyAvatarStage}>
          <Animated.View style={[styles.storyPulseHalo, pulseRingStyle]} />
          <LinearGradient
            colors={[colors.primary, '#D99563', colors.accent]}
            start={{ x: 0.08, y: 0.06 }}
            end={{ x: 0.95, y: 0.98 }}
            style={styles.storyRing}
          >
            <View style={styles.storyAvatarInnerFrame}>
              {summary.author.avatarUrl ? (
                <ExpoImage source={{ uri: summary.author.avatarUrl }} style={styles.storyAvatar} contentFit="cover" cachePolicy="memory-disk" transition={120} />
              ) : (
                <View style={styles.storyAvatarFallback}><AppText weight="bold" style={styles.storyInitial}>{initial}</AppText></View>
              )}
            </View>
          </LinearGradient>
          <View style={styles.storyLiveDot} />
          {count > 1 ? (
            <View style={styles.storyCountBadge}>
              <AppText weight="bold" style={styles.storyCountText}>{count}</AppText>
            </View>
          ) : null}
        </View>
        <AppText numberOfLines={1} weight="semibold" style={styles.storyName}>{displayName}</AppText>
        <View style={styles.storyPresencePill}>
          <View style={styles.storyPresenceSpark} />
          <AppText style={styles.storyPresenceText}>نشطة</AppText>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

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
  const [motionCacheNotice, setMotionCacheNotice] = useState<string | null>(null);
  const [cityPulseLocation, setCityPulseLocation] = useState<CityPulseLocation | null>(null);
  const [cityPulseSnapshot, setCityPulseSnapshot] = useState<CityPulseSnapshot | null>(null);
  const [cityPulseLocationLoading, setCityPulseLocationLoading] = useState(false);
  const [cityPulseLoading, setCityPulseLoading] = useState(false);
  const [cityPulseError, setCityPulseError] = useState<string | null>(null);
  const [cityPulseCacheNotice, setCityPulseCacheNotice] = useState<string | null>(null);
  const cityPulseSnapshotRef = useRef<CityPulseSnapshot | null>(null);
  const cityPulseLoadGenerationRef = useRef(0);
  const [cityPulseBootstrapped, setCityPulseBootstrapped] = useState(false);
  const [videoDrops, setVideoDrops] = useState<MotionVideoDrop[]>([]);
  const [videoDropsLoading, setVideoDropsLoading] = useState(true);
  const [videoDropsError, setVideoDropsError] = useState<string | null>(null);

  const videoPresence = useMemo(
    () => buildMotionVideoPresence(videoDrops),
    [videoDrops],
  );

  const liveSignals = useMemo(
    () => buildMotionLiveSignals({
      storiesCount: stories.length,
      movingCount: movingItems.length,
      storyItemsCount: items.length,
      videoDropsCount: videoDrops.length,
    }),
    [stories.length, movingItems.length, items.length, videoDrops.length],
  );

  useEffect(() => {
    cityPulseSnapshotRef.current = cityPulseSnapshot;
  }, [cityPulseSnapshot]);

  const areCityPulseLocationsMatching = useCallback((left: CityPulseLocation, right: CityPulseLocation) => {
    const normalizeTerms = (terms: string[]) => terms.map((term) => term.trim().toLowerCase()).join('|');
    return left.label === right.label && normalizeTerms(left.matchTerms) === normalizeTerms(right.matchTerms);
  }, []);

  type LoadCityPulseOptions = {
    fromBootstrap?: boolean;
    preserveExistingSnapshotOnFailure?: boolean;
  };

  const loadCityPulseForLocation = useCallback(async (location: CityPulseLocation, options?: LoadCityPulseOptions) => {
    const loadGeneration = ++cityPulseLoadGenerationRef.current;
    setCityPulseLoading(true);
    setCityPulseError(null);
    if (!options?.fromBootstrap) {
      setCityPulseCacheNotice(null);
    }

    try {
      const snapshot = await fetchCityPulseSnapshot({ location });
      if (loadGeneration !== cityPulseLoadGenerationRef.current) {
        return;
      }
      setCityPulseSnapshot(snapshot);
      setCityPulseCacheNotice(null);
      void writeCityPulseSnapshotCache(snapshot);
    } catch {
      if (loadGeneration !== cityPulseLoadGenerationRef.current) {
        return;
      }
      if (cityPulseSnapshotRef.current && options?.preserveExistingSnapshotOnFailure !== false) {
        setCityPulseError(null);
        setCityPulseCacheNotice('تعذر تحديث نبض مدينتك الآن، نعرض آخر نسخة محفوظة.');
      } else {
        const stale = await readAnyCityPulseSnapshotCache();
        const staleMatchesLocation = stale
          ? areCityPulseLocationsMatching(stale.snapshot.location, location)
          : false;

        if (stale && staleMatchesLocation) {
          setCityPulseSnapshot(stale.snapshot);
          setCityPulseError(null);
          setCityPulseCacheNotice('أنت ترى نبضًا محفوظًا لمدينتك. سنحدّثه عندما يتحسن الاتصال.');
        } else {
          setCityPulseError('تعذر تحميل نبض مدينتك الآن. حاول مرة أخرى.');
        }
      }
    } finally {
      setCityPulseLoading(false);
    }
  }, [areCityPulseLocationsMatching]);

  const activateCityPulse = useCallback(async () => {
    setCityPulseLocationLoading(true);
    setCityPulseError(null);
    try {
      const result = await resolveCurrentDiscoveryLocation();
      if (!result.ok) {
        setCityPulseError(result.message);
        setCityPulseLocation(null);
        setCityPulseSnapshot(null);
        return;
      }
      const location = { label: result.label, matchTerms: result.matchTerms };
      setCityPulseLocation(location);
      void writeCityPulseLocationCache(location);
      setCityPulseLocationLoading(false);
      await loadCityPulseForLocation(location);
    } finally {
      setCityPulseLocationLoading(false);
    }
  }, [loadCityPulseForLocation]);

  const refreshCityPulse = useCallback(async () => {
    if (!cityPulseLocation) return;
    await loadCityPulseForLocation(cityPulseLocation);
  }, [cityPulseLocation, loadCityPulseForLocation]);

  const retryCityPulse = useCallback(async () => {
    if (cityPulseLocation) {
      await loadCityPulseForLocation(cityPulseLocation);
      return;
    }
    await activateCityPulse();
  }, [activateCityPulse, cityPulseLocation, loadCityPulseForLocation]);

  const hideCityPulse = useCallback(() => {
    cityPulseLoadGenerationRef.current += 1;
    setCityPulseLocation(null);
    setCityPulseSnapshot(null);
    setCityPulseError(null);
    setCityPulseLocationLoading(false);
    setCityPulseLoading(false);
    setCityPulseCacheNotice(null);
    void deleteCityPulseLocationCache();
    void deleteCityPulseSnapshotCache();
  }, []);


  useEffect(() => {
    let alive = true;

    const bootstrapCityPulse = async () => {
      try {
        const cachedLocation = await readCityPulseLocationCache();
        if (!cachedLocation) {
          return;
        }

        if (!alive) return;
        setCityPulseLocation(cachedLocation.location);

        const freshSnapshot = await readFreshCityPulseSnapshotCache();
        const hasMatchingFreshSnapshot = freshSnapshot
          ? areCityPulseLocationsMatching(freshSnapshot.snapshot.location, cachedLocation.location)
          : false;

        if (alive && freshSnapshot && hasMatchingFreshSnapshot) {
          setCityPulseSnapshot(freshSnapshot.snapshot);
          setCityPulseCacheNotice('نستعرض آخر نبض محفوظ لمدينتك بينما نتحقق من الجديد.');
        }

        await loadCityPulseForLocation(cachedLocation.location, { fromBootstrap: true });
      } finally {
        if (alive) {
          setCityPulseBootstrapped(true);
        }
      }
    };

    void bootstrapCityPulse();

    return () => {
      alive = false;
    };
  }, [areCityPulseLocationsMatching, loadCityPulseForLocation]);

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

  const loadMotionPublicFeed = useCallback(async () => {
    setMovingLoading(true);
    setItemsLoading(true);
    setMovingError(null);
    setItemsError(null);
    setMotionCacheNotice(null);

    const cached = await readFreshMotionPublicFeedCache();
    const hadFreshCache = Boolean(cached);

    if (cached) {
      setMovingItems(cached.payload.movingItems);
      setItems(cached.payload.storyItems);
      setMovingLoading(false);
      setItemsLoading(false);
      setMotionCacheNotice('نستعرض نبضًا محفوظًا بينما نتحقق من الحركة الجديدة.');
    }

    const [movingResult, storyItemsResult] = await Promise.allSettled([
      fetchMovingItems({ limit: 12 }),
      fetchStoryDiscoveryItems({ limit: 12 }),
    ]);

    if (movingResult.status === 'fulfilled') {
      setMovingItems(movingResult.value);
      setMovingError(null);
    } else {
      setMovingError('تعذر تحميل أبواب الحركة حالياً.');
    }

    if (storyItemsResult.status === 'fulfilled') {
      setItems(storyItemsResult.value);
      setItemsError(null);
    } else {
      setItemsError('تعذر تحميل العناصر ذات الحكاية حالياً.');
    }

    const bothSucceeded = movingResult.status === 'fulfilled' && storyItemsResult.status === 'fulfilled';

    if (bothSucceeded) {
      setMotionCacheNotice(null);
      await writeMotionPublicFeedCache({
        movingItems: movingResult.value,
        storyItems: storyItemsResult.value,
      });
    } else if (hadFreshCache) {
      setMotionCacheNotice('تعذر تحديث جزء من النبض الآن، نعرض آخر نسخة محفوظة.');
    } else {
      const stale = await readAnyMotionPublicFeedCache();
      if (stale) {
        if (movingResult.status === 'rejected') {
          setMovingItems(stale.payload.movingItems);
        }
        if (storyItemsResult.status === 'rejected') {
          setItems(stale.payload.storyItems);
        }
        setMotionCacheNotice('أنت ترى جزءًا محفوظًا من حركة تِسوى. سنحدّثه عندما يتحسن الاتصال.');
      }
    }

    setMovingLoading(false);
    setItemsLoading(false);
  }, []);

  const loadMotionVideoDrops = useCallback(async () => {
    setVideoDropsLoading(true);
    setVideoDropsError(null);
    try {
      const drops = await fetchMotionVideoDrops({ limit: 8 });
      setVideoDrops(drops);
    } catch {
      setVideoDropsError('تعذر تحميل لقطات الفيديو الآن.');
    } finally {
      setVideoDropsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStories();
    loadMotionPublicFeed();
    loadMotionVideoDrops();
  }, [loadMotionPublicFeed, loadMotionVideoDrops, loadStories]);

  const motionFeedEntries = useMemo<MotionFeedEntry[]>(() => {
    const movingEntries: RankedMotionFeedEntry[] = movingItems.map((item, index) => ({
      key: `moving-${item.id}-${index}`,
      kind: 'moving_item',
      activityAt: item.latestInterestAt,
      item,
      sourceIndex: index,
      sourceRank: 0,
      overallIndex: 0,
    }));

    const storyEntries: RankedMotionFeedEntry[] = items.map((item, index) => ({
      key: `story-${item.id}-${index}`,
      kind: 'story_item',
      activityAt: item.createdAt,
      item,
      sourceIndex: index,
      sourceRank: 1,
      overallIndex: 0,
    }));

    const rankedEntries: RankedMotionFeedEntry[] = [...movingEntries, ...storyEntries].map((entry, overallIndex) => ({
      ...entry,
      overallIndex,
    }));

    rankedEntries.sort((a, b) => {
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
    });

    return rankedEntries.map((entry): MotionFeedEntry => {
      if (entry.kind === 'moving_item') {
        return {
          key: entry.key,
          kind: 'moving_item',
          activityAt: entry.activityAt,
          item: entry.item,
        };
      }

      return {
        key: entry.key,
        kind: 'story_item',
        activityAt: entry.activityAt,
        item: entry.item,
      };
    });
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
        {stories.map((summary) => (
          <MotionStoryPulseTile
            key={summary.author.id}
            summary={summary}
            onPress={() => router.push(`/story/${summary.author.id}`)}
          />
        ))}
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
          <View style={styles.feedCard}>
            <Pressable onPress={() => router.push(`/item/${moving.id}`)}>
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
          </View>
        </Animated.View>
      );
    }

    const story = item.item;
    const metadata = [story.category, story.city, story.area].filter(Boolean).join(' / ');

    return (
      <Animated.View entering={FadeInUp.duration(280).delay(index * 35)}>
        <View style={styles.feedCard}>
          <Pressable onPress={() => router.push(`/item/${story.id}`)}>
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
        </View>
      </Animated.View>
    );
  };

  return (
    <AppScreen backgroundVariant="alive" style={styles.screen}>
      <FlashList
        data={motionFeedEntries}
        keyExtractor={(entry) => entry.key}
        contentContainerStyle={styles.listContent}
        getItemType={(entry) => entry.kind}
        ListHeaderComponent={(
          <View style={styles.headerWrap}>
            <LinearGradient colors={[colors.primary, colors.accent, colors.primarySoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <MotionPulseCanvas storiesCount={stories.length} movingCount={movingItems.length} storyItemsCount={items.length} videoDropsCount={videoDrops.length} />
              <View style={styles.heroContent}>
                <AppText weight="bold" style={styles.heroTitle}>حركة تِسوى</AppText>
                <AppText style={styles.heroBody}>هنا الحاجات ما بتفضلش ساكتة. قصص بتتقال، وأبواب تبادل بدأت تتحرك.</AppText>
                <AppText style={styles.heroMuted}>تابع النبض الحي من الناس والعناصر اللي دخلت مرحلة جديدة.</AppText>
                <MotionLiveSignals state={liveSignals} />
                {videoPresence.hasDrops && videoPresence.heroSummary ? (
                  <View style={styles.heroVideoPresence}>
                    <AppText style={styles.heroVideoPresenceTitle}>الفيديو حاضر في النبض</AppText>
                    <AppText style={styles.heroVideoPresenceBody}>{videoPresence.heroSummary}</AppText>
                  </View>
                ) : null}
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
              </View>
            </LinearGradient>

            <View style={styles.storiesBand}>
              <CityPulseSection
                location={cityPulseLocation}
                snapshot={cityPulseSnapshot}
                loadingLocation={cityPulseLocationLoading}
                loadingPulse={cityPulseLoading}
                error={cityPulseError}
                bootstrapping={!cityPulseBootstrapped}
                cacheNotice={cityPulseCacheNotice}
                onActivate={activateCityPulse}
                onRefresh={refreshCityPulse}
                onHide={hideCityPulse}
                onRetry={retryCityPulse}
              />
            </View>

            <View style={styles.storiesBand}>
              <AppText weight="bold">القصص الآن</AppText>
              <AppText muted>الناس اللي بتحرك المشهد في تِسوى دلوقتي.</AppText>
              {renderStoryRail()}
            </View>

            <View style={styles.storiesBand}>
              <MotionVideoDropsSection
                drops={videoDrops}
                loading={videoDropsLoading}
                error={videoDropsError}
                onRetry={loadMotionVideoDrops}
              />
            </View>

            <View style={styles.pulseIntro}>
              <AppText weight="bold">النبض الآن</AppText>
              <AppText muted>حاجات عليها اهتمام، وحاجات أصحابها فتحوا لها باب حكاية.</AppText>
              {videoPresence.hasDrops && videoPresence.pulseSummary ? (
                <AppText muted>{videoPresence.pulseSummary}</AppText>
              ) : null}
            </View>

            {motionCacheNotice ? (
              <View style={styles.cacheNotice}>
                <AppText muted>{motionCacheNotice}</AppText>
              </View>
            ) : null}

            {partialFailure ? (
              <View style={styles.partialWarning}>
                <AppText style={styles.errorText}>تعذر تحميل جزء من الحركة حالياً.</AppText>
                <View style={styles.partialActions}>
                  {movingError ? <AppButton label="إعادة تحميل الأبواب" variant="neutral" onPress={loadMotionPublicFeed} /> : null}
                  {itemsError ? <AppButton label="إعادة تحميل الحكايات" variant="neutral" onPress={loadMotionPublicFeed} /> : null}
                </View>
              </View>
            ) : null}

            {allMotionLoading ? <AppText muted>جارٍ تجهيز النبض...</AppText> : null}
          </View>
        )}
        ListEmptyComponent={motionEmpty ? (
          <View style={styles.emptyWrap}>
            <MotionEmptyAnimation />
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
  listContent: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xl },
  headerWrap: { gap: spacing.md },
  hero: { borderRadius: radii.xl, padding: spacing.lg, gap: spacing.sm, overflow: 'hidden', position: 'relative' },
  heroContent: { gap: spacing.sm, zIndex: 2 },
  heroTitle: { fontSize: 28, color: colors.white },
  heroBody: { color: colors.white },
  heroMuted: { color: 'rgba(255,255,255,0.86)' },
  heroVideoPresence: {
    alignSelf: 'flex-start',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  heroVideoPresenceTitle: { color: colors.white, fontSize: 12 },
  heroVideoPresenceBody: { color: 'rgba(255,255,255,0.92)', fontSize: 13 },
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
  storyRailContent: { gap: spacing.md, paddingVertical: spacing.sm, paddingRight: spacing.md },
  storyTile: { width: 118 },
  storyTileSurface: {
    minHeight: 150,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.2)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  storyAvatarStage: { width: 82, height: 82, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  storyPulseHalo: {
    position: 'absolute',
    width: 78,
    height: 78,
    borderRadius: radii.round,
    backgroundColor: 'rgba(217,149,99,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.24)',
  },
  storyRing: {
    width: 72,
    height: 72,
    borderRadius: radii.round,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.68)',
  },
  storyAvatarInnerFrame: {
    flex: 1,
    borderRadius: radii.round,
    padding: 2,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  storyAvatar: { width: '100%', height: '100%', borderRadius: radii.round, backgroundColor: colors.primarySoft },
  storyAvatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: radii.round,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyInitial: { color: colors.primary, fontSize: 22 },
  storyLiveDot: {
    position: 'absolute',
    right: 10,
    bottom: 11,
    width: 14,
    height: 14,
    borderRadius: radii.round,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  storyCountBadge: {
    position: 'absolute',
    left: 2,
    top: 8,
    minWidth: 26,
    height: 24,
    borderRadius: radii.round,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  storyCountText: { color: colors.white, fontSize: 12 },
  storyName: { textAlign: 'center', width: '100%', color: colors.text },
  storyPresencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.round,
    backgroundColor: 'rgba(62,124,115,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(62,124,115,0.18)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginTop: spacing.xs,
  },
  storyPresenceSpark: { width: 5, height: 5, borderRadius: radii.round, backgroundColor: colors.accent },
  storyPresenceText: { color: colors.accent, fontSize: 11 },
  stateBox: { gap: spacing.sm },
  storyEmptyState: { gap: spacing.sm, paddingVertical: spacing.sm },
  pulseIntro: { gap: spacing.xs, paddingTop: spacing.xs },
  cacheNotice: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
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
