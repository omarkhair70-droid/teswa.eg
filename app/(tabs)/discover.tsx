import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, InteractionManager, Pressable, StyleSheet, View, type ListRenderItemInfo } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppBottomSheet } from '@/components/sheets/AppBottomSheet';
import { AppFadeIn } from '@/components/motion/AppFadeIn';
import { ItemCard } from '@/components/marketplace/ItemCard';
import { ItemVideoDiscoveryRail } from '@/components/marketplace/ItemVideoDiscoveryRail';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { radii } from '@/constants/radii';
import { fetchMarketplaceItemsPage, fetchNearbyMarketplaceItemsPage, MarketplaceItem } from '@/lib/marketplace-items';
import { fetchStoryDiscoveryItems, StoryDiscoveryItem } from '@/lib/story-discovery';
import { resolveCurrentDiscoveryLocation } from '@/lib/discovery-location';
import { useAuth } from '@/lib/auth';
import {
  readAnyMarketplaceFirstPageCache,
  readFreshMarketplaceFirstPageCache,
  writeMarketplaceFirstPageCache,
} from '@/lib/offline-marketplace-cache';
import { fetchRecentItemVideoDiscoveryMoments, ItemVideoDiscoveryMoment } from '@/lib/item-video-discovery';
import { buildDiscoverIntelligenceState, buildDiscoverSpotlightItems } from '@/lib/discover-intelligence';
import { DiscoverIntelligencePanel } from '@/components/discover/DiscoverIntelligencePanel';
import { DiscoverStoryHighlightsRail } from '@/components/discover/DiscoverStoryHighlightsRail';
import { DiscoverSpotlightRail } from '@/components/discover/DiscoverSpotlightRail';
import { DiscoverWorldHeader } from '@/components/discover/DiscoverWorldHeader';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

function DiscoverItemsLoadingState() {
  return (
    <View style={styles.loadingList} accessibilityLabel="جارٍ تحميل عناصر الاكتشاف">
      {[0, 1].map((index) => (
        <View key={index} style={styles.loadingCard}>
          <View style={styles.loadingImage} />
          <View style={styles.loadingCardCopy}>
            <View style={[styles.loadingLine, styles.loadingLineTitle]} />
            <View style={styles.loadingPillsRow}>
              <View style={styles.loadingPill} />
              <View style={[styles.loadingPill, styles.loadingPillShort]} />
            </View>
            <View style={[styles.loadingLine, styles.loadingLineOwner]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const conditionLabels: Record<string, string> = {
  almost_new: 'شبه جديد',
  good_used: 'مستعمل بحالة جيدة',
  minor_issues: 'به ملاحظات بسيطة',
  needs_repair: 'يحتاج إصلاح',
};

function getConditionLabel(condition: string): string {
  return conditionLabels[condition] ?? condition.replaceAll('_', ' ');
}

export default function DiscoverScreen() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [itemsCacheNotice, setItemsCacheNotice] = useState<string | null>(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [activeNearbyLocation, setActiveNearbyLocation] = useState<{ label: string; latitude: number; longitude: number } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<string | null>(null);
  const [videoMoments, setVideoMoments] = useState<ItemVideoDiscoveryMoment[]>([]);
  const [storyHighlights, setStoryHighlights] = useState<StoryDiscoveryItem[]>([]);
  const filterSheetRef = useRef<BottomSheetModal>(null);
  const listRef = useRef<FlatList<MarketplaceItem>>(null);
  const itemsRequestGenerationRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const loadingMoreGenerationRef = useRef(0);

  const loadItems = useCallback(async () => {
    const requestGeneration = itemsRequestGenerationRef.current + 1;
    itemsRequestGenerationRef.current = requestGeneration;
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setRefreshing(false);
    setNearbyLoading(false);
    setLoading(true);
    setError(null);
    setLoadMoreError(null);
    setItemsCacheNotice(null);

    let hasFreshCacheVisible = false;
    const cached = await readFreshMarketplaceFirstPageCache();
    if (requestGeneration !== itemsRequestGenerationRef.current) return;

    if (cached) {
      hasFreshCacheVisible = true;
      setItems(cached.page.items);
      setHasMore(cached.page.hasMore);
      setLoading(false);
      setItemsCacheNotice('نستعرض نتائج محفوظة بينما نتحقق من الجديد.');
    }

    try {
      const page = await fetchMarketplaceItemsPage({ offset: 0, viewerId: userId });
      if (requestGeneration !== itemsRequestGenerationRef.current) return;
      setItems(page.items);
      setHasMore(page.hasMore);
      setError(null);
      setItemsCacheNotice(null);
      void writeMarketplaceFirstPageCache(page);
    } catch {
      if (requestGeneration !== itemsRequestGenerationRef.current) return;
      if (hasFreshCacheVisible) {
        setItemsCacheNotice('تعذر تحديث التصفح الآن، نعرض آخر نسخة محفوظة.');
      } else {
        const stale = await readAnyMarketplaceFirstPageCache();
        if (requestGeneration !== itemsRequestGenerationRef.current) return;
        if (stale) {
          setItems(stale.page.items);
          setHasMore(stale.page.hasMore);
          setError(null);
          setItemsCacheNotice('أنت ترى نسخة محفوظة من التصفح. سنحدّثها عندما يتحسن الاتصال.');
        } else {
          setError('تعذر تحميل قائمة التصفح. حاول لاحقاً.');
        }
      }
    } finally {
      if (requestGeneration === itemsRequestGenerationRef.current) setLoading(false);
    }
  }, [userId]);

  const loadVideoMoments = useCallback(async () => {
    try {
      const moments = await fetchRecentItemVideoDiscoveryMoments(8);
      setVideoMoments(moments);
    } catch {
      setVideoMoments([]);
    }
  }, []);

  const loadStoryHighlights = useCallback(async () => {
    try {
      const highlights = await fetchStoryDiscoveryItems({ limit: 8 });
      setStoryHighlights(highlights);
    } catch {
      setStoryHighlights([]);
    }
  }, []);

  const refreshItems = useCallback(async () => {
    if (refreshing) return;

    const requestGeneration = itemsRequestGenerationRef.current + 1;
    itemsRequestGenerationRef.current = requestGeneration;
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setNearbyLoading(false);
    setRefreshing(true);
    setLoadMoreError(null);

    try {
      const page = activeNearbyLocation
        ? await fetchNearbyMarketplaceItemsPage({
            latitude: activeNearbyLocation.latitude,
            longitude: activeNearbyLocation.longitude,
            radiusKm: 3,
            offset: 0,
            viewerId: userId,
          })
        : await fetchMarketplaceItemsPage({ offset: 0, viewerId: userId });
      if (requestGeneration !== itemsRequestGenerationRef.current) return;
      setItems(page.items);
      setHasMore(page.hasMore);
      setError(null);
      if (!activeNearbyLocation) void writeMarketplaceFirstPageCache(page);
      void loadVideoMoments();
      void loadStoryHighlights();
    } catch {
      // Keep existing items visible on refresh failure.
    } finally {
      if (requestGeneration === itemsRequestGenerationRef.current) setRefreshing(false);
    }
  }, [activeNearbyLocation, loadStoryHighlights, loadVideoMoments, refreshing, userId]);

  const loadMoreItems = useCallback(async () => {
    if (loading || refreshing || loadingMoreRef.current || !hasMore || error) return;

    const requestGeneration = itemsRequestGenerationRef.current;
    loadingMoreGenerationRef.current = requestGeneration;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);

    try {
      const page = activeNearbyLocation
        ? await fetchNearbyMarketplaceItemsPage({
            latitude: activeNearbyLocation.latitude,
            longitude: activeNearbyLocation.longitude,
            radiusKm: 3,
            offset: items.length,
            viewerId: userId,
          })
        : await fetchMarketplaceItemsPage({ offset: items.length, viewerId: userId });
      if (requestGeneration !== itemsRequestGenerationRef.current) return;
      setItems((currentItems) => {
        const uniqueById = new Map([...currentItems, ...page.items].map((item) => [item.id, item]));
        return Array.from(uniqueById.values());
      });
      setHasMore(page.hasMore);
    } catch {
      if (requestGeneration === itemsRequestGenerationRef.current) {
        setLoadMoreError('تعذر تحميل المزيد. حاول مرة أخرى.');
      }
    } finally {
      if (loadingMoreGenerationRef.current === requestGeneration) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [activeNearbyLocation, error, hasMore, items.length, loading, refreshing, userId]);

  const handleUseMyLocation = useCallback(async () => {
    const requestGeneration = itemsRequestGenerationRef.current + 1;
    itemsRequestGenerationRef.current = requestGeneration;
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setRefreshing(false);
    setNearbyLoading(true);
    setNearbyError(null);

    try {
      const result = await resolveCurrentDiscoveryLocation();
      if (requestGeneration !== itemsRequestGenerationRef.current) return;
      if (result.ok) {
        try {
          const page = await fetchNearbyMarketplaceItemsPage({
            latitude: result.latitude,
            longitude: result.longitude,
            radiusKm: 3,
            offset: 0,
            viewerId: userId,
          });
          if (requestGeneration !== itemsRequestGenerationRef.current) return;
          setItems(page.items);
          setHasMore(page.hasMore);
          setError(null);
          setLoadMoreError(null);
          setActiveNearbyLocation({ label: result.label, latitude: result.latitude, longitude: result.longitude });
        } catch {
          if (requestGeneration !== itemsRequestGenerationRef.current) return;
          setActiveNearbyLocation(null);
          setNearbyError('تعذر تحميل العناصر القريبة الآن. حاول مرة أخرى.');
        }
        return;
      }

      setActiveNearbyLocation(null);
      setNearbyError(result.message);
    } finally {
      if (requestGeneration === itemsRequestGenerationRef.current) setNearbyLoading(false);
    }
  }, [userId]);

  const clearNearbyFilter = useCallback(() => {
    setActiveNearbyLocation(null);
    setNearbyError(null);
    void loadItems();
  }, [loadItems]);

  const clearAllFilters = useCallback(() => {
    const shouldReloadDirectory = Boolean(activeNearbyLocation);
    setQuery('');
    setActiveNearbyLocation(null);
    setNearbyError(null);
    setSelectedCategory(null);
    setSelectedCondition(null);
    if (shouldReloadDirectory) void loadItems();
  }, [activeNearbyLocation, loadItems]);

  const openFilterSheet = useCallback(() => {
    filterSheetRef.current?.present();
  }, []);

  const closeFilterSheet = useCallback(() => {
    filterSheetRef.current?.dismiss();
  }, []);

  const clearFiltersAndClose = useCallback(() => {
    clearAllFilters();
    closeFilterSheet();
  }, [clearAllFilters, closeFilterSheet]);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void loadItems();
      void loadVideoMoments();
      void loadStoryHighlights();
    });

    return () => task.cancel();
  }, [loadItems, loadStoryHighlights, loadVideoMoments]);

  const availableCategories = useMemo(() => {
    const uniqueByLowercase = new Map<string, string>();
    for (const item of items) {
      const clean = item.category?.trim();
      if (!clean) continue;
      const key = clean.toLocaleLowerCase();
      if (!uniqueByLowercase.has(key)) uniqueByLowercase.set(key, clean);
    }
    return Array.from(uniqueByLowercase.values()).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [items]);

  const availableConditions = useMemo(() => {
    const uniqueByLowercase = new Map<string, string>();
    for (const item of items) {
      const clean = item.condition?.trim();
      if (!clean) continue;
      const key = clean.toLocaleLowerCase();
      if (!uniqueByLowercase.has(key)) uniqueByLowercase.set(key, clean);
    }
    return Array.from(uniqueByLowercase.values()).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [items]);

  const hasActiveFilters = Boolean(query.trim() || activeNearbyLocation || selectedCategory || selectedCondition);
  const hasActiveSearchOrFacetFilter = Boolean(query.trim() || selectedCategory || selectedCondition);
  const activeFiltersCount = [Boolean(query.trim()), Boolean(activeNearbyLocation), Boolean(selectedCategory), Boolean(selectedCondition)].filter(Boolean).length;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const queryFiltered = normalized
      ? items.filter((item) => {
          const haystack = [item.title, item.category, item.location].filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(normalized);
        })
      : items;
    const categoryFiltered = selectedCategory
      ? queryFiltered.filter((item) => item.category?.trim().toLocaleLowerCase() === selectedCategory.toLocaleLowerCase())
      : queryFiltered;
    return selectedCondition
      ? categoryFiltered.filter((item) => item.condition?.trim().toLocaleLowerCase() === selectedCondition.toLocaleLowerCase())
      : categoryFiltered;
  }, [items, query, selectedCategory, selectedCondition]);

  const discoverIntelligenceState = buildDiscoverIntelligenceState({
    visibleItemsCount: filtered.length,
    loadedItemsCount: items.length,
    videoMomentsCount: videoMoments.length,
    storyHighlightsCount: storyHighlights.length,
    activeFiltersCount,
    nearbyLabel: activeNearbyLocation?.label ?? null,
  });
  const spotlightItems = useMemo(() => (items.length >= 8 ? buildDiscoverSpotlightItems(items, 6) : []), [items]);
  const editorialMode = hasActiveFilters
    ? null
    : storyHighlights.length >= 3
      ? 'stories'
      : videoMoments.length >= 2
        ? 'video'
        : spotlightItems.length >= 4
          ? 'spotlight'
          : null;
  const shouldShowIntelligence = activeFiltersCount > 0 || editorialMode !== null;
  const isFilteredEmptyWithMore = hasActiveFilters && filtered.length === 0 && hasMore;
  const lastVisibleIndex = filtered.length - 1;
  const editorialInsertIndex = Math.min(2, lastVisibleIndex);

  const renderListFooter = useCallback(() => {
    if (loadingMore) {
      return (
        <View style={styles.footerBox}>
          <ActivityIndicator size="small" color={colors.primary} />
          <AppText muted style={styles.footerText}>بنفتح لك عناصر أكثر...</AppText>
        </View>
      );
    }

    if (loadMoreError) {
      return (
        <View style={styles.footerErrorBox}>
          <View style={styles.footerErrorCopy}>
            <Ionicons name="alert-circle-outline" size={17} color={colors.primary} />
            <AppText muted style={styles.footerText}>تعذر تحميل المزيد، والعناصر الحالية ما زالت محفوظة.</AppText>
          </View>
          <AppButton label="حاول مرة أخرى" variant="neutral" size="sm" onPress={loadMoreItems} />
        </View>
      );
    }

    if (!hasMore && items.length > 0) {
      return (
        <View style={styles.footerBox}>
          <Ionicons name="checkmark-circle-outline" size={17} color={colors.accent} />
          <AppText muted style={styles.footerText}>شفت كل العناصر في المشهد الحالي.</AppText>
        </View>
      );
    }

    return null;
  }, [hasMore, items.length, loadMoreError, loadMoreItems, loadingMore]);

  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<MarketplaceItem>) => {
    const showEditorial = index === editorialInsertIndex && editorialMode !== null;

    return (
      <View>
        <ItemCard item={item} />
        {showEditorial && editorialMode === 'spotlight' ? (
          <AppFadeIn delay={40} duration={220} fromY={8} style={styles.editorialModule}>
            <AppCard padding="md" style={styles.editorialCard}>
              <DiscoverSpotlightRail items={spotlightItems} />
            </AppCard>
          </AppFadeIn>
        ) : null}
        {showEditorial && editorialMode === 'stories' ? (
          <AppFadeIn delay={40} duration={220} fromY={8} style={styles.editorialModule}>
            <AppCard padding="md" style={styles.editorialCard}>
              <DiscoverStoryHighlightsRail
                items={storyHighlights}
              />
            </AppCard>
          </AppFadeIn>
        ) : null}
        {showEditorial && editorialMode === 'video' ? (
          <AppFadeIn delay={40} duration={220} fromY={8} style={styles.editorialModule}>
            <AppCard padding="md" style={styles.editorialCard}>
              <ItemVideoDiscoveryRail
                onOpenViewer={() => router.push('/motion/viewer')}
                viewerCtaLabel="افتح المشاهد"
                eyebrow="اكتشاف مرئي"
                title="شوف العنصر من زاوية أقرب"
                description="لمحات قصيرة تساعدك تفهم الشكل الحقيقي قبل التفاصيل."
                moments={videoMoments}
              />
            </AppCard>
          </AppFadeIn>
        ) : null}
      </View>
    );
  }, [
    editorialInsertIndex,
    editorialMode,
    spotlightItems,
    storyHighlights,
    videoMoments,
  ]);

  return (
    <AppScreen backgroundVariant="alive" style={styles.screen}>
      <FlatList
        renderScrollComponent={(props) => (
          <KeyboardAwareScrollView
            {...props}
            bottomOffset={spacing.lg}
          />
        )}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ref={listRef}
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshing={refreshing}
        onRefresh={refreshItems}
        onEndReached={isFilteredEmptyWithMore ? undefined : loadMoreItems}
        onEndReachedThreshold={0.35}
        ListHeaderComponent={
          <View style={styles.header}>
            <AppFadeIn delay={0} duration={200} fromY={8}>
              <DiscoverWorldHeader
                onOpenPeople={() => router.push('/people')}
                onOpenMotion={() => router.push('/motion')}
                onBrowseItems={() => listRef.current?.scrollToOffset({ offset: 330, animated: true })}
              />
            </AppFadeIn>

            <AppFadeIn delay={40} duration={210} fromY={8}>
              <AppCard padding="md" style={styles.searchCard}>
                <View style={styles.sectionHeadingRow}>
                  <View style={styles.sectionHeadingCopy}>
                    <AppText weight="semibold" style={styles.eyebrow}>دوّر بطريقتك</AppText>
                    <AppText weight="bold" style={styles.searchTitle}>إيه اللي في بالك؟</AppText>
                    <AppText muted style={styles.searchDescription}>اكتب كلمة، أو قرّب النتائج بالموقع والفلاتر.</AppText>
                  </View>
                  <View style={styles.searchIconShell}>
                    <Ionicons name="search-outline" size={19} color={colors.primary} />
                  </View>
                </View>

                <AppInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="ابحث بالاسم أو الفئة أو المدينة"
                  returnKeyType="search"
                  accessibilityLabel="البحث في عناصر تِسوى"
                />

                <View style={styles.controlRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`ضبط الفلاتر${activeFiltersCount > 0 ? `، ${activeFiltersCount} مفعلة` : ''}`}
                    onPress={openFilterSheet}
                    style={({ pressed }) => [styles.controlButton, pressed && styles.controlButtonPressed]}
                  >
                    <Ionicons name="options-outline" size={17} color={colors.primary} />
                    <AppText weight="semibold" style={styles.controlButtonText}>الفلاتر</AppText>
                    {activeFiltersCount > 0 ? (
                      <View style={styles.filterCountBadge}>
                        <AppText weight="bold" style={styles.filterCountText}>{activeFiltersCount}</AppText>
                      </View>
                    ) : null}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={activeNearbyLocation ? 'إلغاء عرض العناصر القريبة' : 'اعرض العناصر الأقرب لي'}
                    onPress={activeNearbyLocation ? clearNearbyFilter : handleUseMyLocation}
                    disabled={nearbyLoading}
                    style={({ pressed }) => [
                      styles.controlButton,
                      activeNearbyLocation && styles.controlButtonActive,
                      pressed && styles.controlButtonPressed,
                      nearbyLoading && styles.controlButtonDisabled,
                    ]}
                  >
                    {nearbyLoading ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <Ionicons name={activeNearbyLocation ? 'location' : 'navigate-outline'} size={17} color={activeNearbyLocation ? colors.white : colors.accent} />
                    )}
                    <AppText weight="semibold" style={[styles.controlButtonText, activeNearbyLocation && styles.controlButtonTextActive]}>
                      {nearbyLoading ? 'بنحدد موقعك' : activeNearbyLocation ? 'قريب مني' : 'الأقرب لي'}
                    </AppText>
                  </Pressable>
                </View>

                {activeNearbyLocation ? (
                  <View style={styles.locationBanner}>
                    <View style={styles.locationBannerCopy}>
                      <Ionicons name="location-outline" size={15} color={colors.accent} />
                      <AppText numberOfLines={2} style={styles.locationBannerText}>داخل 3 كم تقريبًا من {activeNearbyLocation.label}</AppText>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel="إلغاء الموقع القريب" onPress={clearNearbyFilter} style={styles.bannerCloseButton}>
                      <Ionicons name="close" size={15} color={colors.accent} />
                    </Pressable>
                  </View>
                ) : null}

                {nearbyError ? (
                  <View style={styles.inlineError}>
                    <Ionicons name="alert-circle-outline" size={15} color={colors.primary} />
                    <AppText muted style={styles.inlineErrorText}>{nearbyError}</AppText>
                  </View>
                ) : null}

                {query.trim() || selectedCategory || selectedCondition ? (
                  <View style={styles.activeChipsRow}>
                    {query.trim() ? (
                      <Pressable accessibilityRole="button" accessibilityLabel="مسح كلمة البحث" onPress={() => setQuery('')} style={styles.activeChip}>
                        <Ionicons name="search-outline" size={12} color={colors.primary} />
                        <AppText numberOfLines={1} style={styles.activeChipText}>{query.trim()}</AppText>
                        <Ionicons name="close" size={12} color={colors.primary} />
                      </Pressable>
                    ) : null}
                    {selectedCategory ? (
                      <Pressable accessibilityRole="button" accessibilityLabel="مسح فلتر الفئة" onPress={() => setSelectedCategory(null)} style={styles.activeChip}>
                        <Ionicons name="pricetag-outline" size={12} color={colors.primary} />
                        <AppText numberOfLines={1} style={styles.activeChipText}>{selectedCategory}</AppText>
                        <Ionicons name="close" size={12} color={colors.primary} />
                      </Pressable>
                    ) : null}
                    {selectedCondition ? (
                      <Pressable accessibilityRole="button" accessibilityLabel="مسح فلتر الحالة" onPress={() => setSelectedCondition(null)} style={styles.activeChip}>
                        <Ionicons name="sparkles-outline" size={12} color={colors.primary} />
                        <AppText numberOfLines={1} style={styles.activeChipText}>{getConditionLabel(selectedCondition)}</AppText>
                        <Ionicons name="close" size={12} color={colors.primary} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </AppCard>
            </AppFadeIn>

            {itemsCacheNotice ? (
              <AppCard variant="outlined" padding="md" style={styles.noticeCard}>
                <View style={styles.noticeRow}>
                  <View style={styles.noticeIcon}>
                    <Ionicons name="cloud-offline-outline" size={16} color={colors.primary} />
                  </View>
                  <AppText muted style={styles.noticeText}>{itemsCacheNotice}</AppText>
                </View>
              </AppCard>
            ) : null}

            {!loading && !error && shouldShowIntelligence ? <DiscoverIntelligencePanel state={discoverIntelligenceState} /> : null}

            <View style={styles.resultsHeading}>
              <View style={styles.resultsHeadingCopy}>
                <AppText weight="semibold" style={styles.eyebrow}>عناصر جاهزة للتبديل</AppText>
                <AppText weight="bold" style={styles.resultsTitle}>
                  {hasActiveFilters ? 'النتائج الأقرب لاختيارك' : 'اكتشف الجديد'}
                </AppText>
                <AppText muted style={styles.resultsDescription}>
                  {loading ? 'بنجهّز المشهد الآن.' : hasActiveFilters ? `ظهر ${filtered.length} عنصر من النتائج المحمّلة.` : `${filtered.length} عنصر ظاهر للتصفح الآن.`}
                </AppText>
              </View>
              {hasActiveFilters ? (
                <Pressable accessibilityRole="button" accessibilityLabel="مسح كل الفلاتر" onPress={clearAllFilters} style={styles.clearButton}>
                  <Ionicons name="refresh-outline" size={14} color={colors.primary} />
                  <AppText weight="semibold" style={styles.clearButtonText}>ابدأ من جديد</AppText>
                </Pressable>
              ) : (
                <View style={styles.resultsCountBadge}>
                  <AppText weight="bold" style={styles.resultsCountText}>{filtered.length}</AppText>
                </View>
              )}
            </View>
          </View>
        }
        renderItem={renderItem}
        ListFooterComponent={renderListFooter}
        ListEmptyComponent={
          loading ? (
            <DiscoverItemsLoadingState />
          ) : error ? (
            <View style={styles.stateBox}>
              <EmptyState
                title="المشهد مش متاح دلوقتي"
                description={error}
                iconName="cloud-offline-outline"
                actionLabel="حاول مرة أخرى"
                onAction={() => void loadItems()}
              />
            </View>
          ) : isFilteredEmptyWithMore ? (
            <View style={styles.stateBox}>
              <EmptyState
                title="لسه ما لقيناش تطابق"
                description="في نتائج أكثر لم تُحمّل بعد. افتح صفحة إضافية أو وسّع اختيارك."
                iconName="search-outline"
              />
              <AppButton label="حمّل نتائج أكثر" onPress={loadMoreItems} disabled={loadingMore} fullWidth />
              <AppButton label="وسّع الاختيار" variant="neutral" onPress={clearAllFilters} fullWidth />
            </View>
          ) : hasActiveFilters && filtered.length === 0 ? (
            <View style={styles.stateBox}>
              <EmptyState
                title="مفيش نتيجة بنفس الاختيار"
                description="جرّب كلمة أوسع أو امسح فلتر واحد عشان نفتح لك المشهد."
                iconName="options-outline"
                actionLabel="مسح الفلاتر"
                onAction={clearAllFilters}
              />
            </View>
          ) : (
            <EmptyState
              title="المشهد هادئ حاليًا"
              description="أول ما تتضاف عناصر جديدة هتظهر هنا مباشرة."
              iconName="cube-outline"
              actionLabel="اعرض حاجة"
              onAction={() => router.push('/(tabs)/add')}
            />
          )
        }
      />

      <AppBottomSheet ref={filterSheetRef} title="قرّب النتيجة" description="اختار الفئة والحالة، أو خلّي الموقع يقرب لك العناصر." snapPoints={['68%', '92%']}>
        <View style={styles.filterSheetContent}>
          <View style={styles.filterSection}>
            <View style={styles.filterSectionHeading}>
              <View style={styles.filterSectionIcon}>
                <Ionicons name="navigate-outline" size={16} color={colors.accent} />
              </View>
              <View style={styles.filterSectionCopy}>
                <AppText weight="bold">الأقرب ليك</AppText>
                <AppText muted style={styles.filterSectionDescription}>نستخدم موقعك مرة واحدة ونبحث داخل 3 كم تقريبًا.</AppText>
              </View>
            </View>
            {activeNearbyLocation ? (
              <View style={styles.sheetLocationState}>
                <AppText style={styles.sheetLocationText}>النتائج قريبة من {activeNearbyLocation.label}</AppText>
                <AppButton label="عرض كل العناصر" variant="neutral" size="sm" onPress={clearNearbyFilter} />
              </View>
            ) : (
              <AppButton
                label={nearbyLoading ? 'بنحدد موقعك' : 'اعرض الأقرب لي'}
                iconName="location-outline"
                onPress={handleUseMyLocation}
                loading={nearbyLoading}
                fullWidth
              />
            )}
            {nearbyError ? <AppText muted style={styles.sheetErrorText}>{nearbyError}</AppText> : null}
            {activeNearbyLocation && items.length === 0 && !hasActiveSearchOrFacetFilter ? (
              <AppText muted style={styles.filterSectionDescription}>لا توجد عناصر دقيقة في هذا النطاق بعد. جرّب عرض الكل أو عُد لاحقًا.</AppText>
            ) : null}
          </View>

          <View style={styles.filterSection}>
            <View style={styles.filterSectionHeading}>
              <View style={styles.filterSectionIconPrimary}>
                <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
              </View>
              <View style={styles.filterSectionCopy}>
                <AppText weight="bold">الفئة</AppText>
                <AppText muted style={styles.filterSectionDescription}>اختار نوع الحاجة اللي بتدور عليها.</AppText>
              </View>
            </View>
            <View style={styles.chipsRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: !selectedCategory }}
                onPress={() => setSelectedCategory(null)}
                style={({ pressed }) => [styles.chip, !selectedCategory && styles.chipActive, pressed && styles.chipPressed]}
              >
                <AppText weight="semibold" style={!selectedCategory ? styles.chipTextActive : styles.chipText}>الكل</AppText>
              </Pressable>
              {availableCategories.map((category) => {
                const isActive = selectedCategory?.toLocaleLowerCase() === category.toLocaleLowerCase();
                return (
                  <Pressable
                    key={category}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    onPress={() => setSelectedCategory(category)}
                    style={({ pressed }) => [styles.chip, isActive && styles.chipActive, pressed && styles.chipPressed]}
                  >
                    <AppText weight="semibold" style={isActive ? styles.chipTextActive : styles.chipText}>{category}</AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.filterSection}>
            <View style={styles.filterSectionHeading}>
              <View style={styles.filterSectionIconPrimary}>
                <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
              </View>
              <View style={styles.filterSectionCopy}>
                <AppText weight="bold">الحالة</AppText>
                <AppText muted style={styles.filterSectionDescription}>قرّب مستوى الاستخدام المناسب ليك.</AppText>
              </View>
            </View>
            <View style={styles.chipsRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: !selectedCondition }}
                onPress={() => setSelectedCondition(null)}
                style={({ pressed }) => [styles.chip, !selectedCondition && styles.chipActive, pressed && styles.chipPressed]}
              >
                <AppText weight="semibold" style={!selectedCondition ? styles.chipTextActive : styles.chipText}>الكل</AppText>
              </Pressable>
              {availableConditions.map((condition) => {
                const isActive = selectedCondition?.toLocaleLowerCase() === condition.toLocaleLowerCase();
                return (
                  <Pressable
                    key={condition}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    onPress={() => setSelectedCondition(condition)}
                    style={({ pressed }) => [styles.chip, isActive && styles.chipActive, pressed && styles.chipPressed]}
                  >
                    <AppText weight="semibold" style={isActive ? styles.chipTextActive : styles.chipText}>{getConditionLabel(condition)}</AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.filterSheetFooter}>
            <AppButton label="شوف النتائج" onPress={closeFilterSheet} fullWidth />
            {hasActiveFilters ? <AppButton label="مسح كل الفلاتر" variant="neutral" onPress={clearFiltersAndClose} fullWidth /> : null}
          </View>
        </View>
      </AppBottomSheet>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  header: { gap: 14, marginBottom: spacing.md },
  searchCard: { borderRadius: radii.lg, gap: 10 },
  sectionHeadingRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  sectionHeadingCopy: { flex: 1, gap: 3 },
  eyebrow: { color: colors.primary, fontSize: 11 },
  searchTitle: { fontSize: 19, lineHeight: 25 },
  searchDescription: { fontSize: 11, lineHeight: 17 },
  searchIconShell: { width: 36, height: 36, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(184,98,63,0.1)' },
  controlRow: { flexDirection: 'row-reverse', gap: spacing.sm },
  controlButton: {
    flex: 1,
    minHeight: 43,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm,
  },
  controlButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  controlButtonPressed: { opacity: 0.78 },
  controlButtonDisabled: { opacity: 0.64 },
  controlButtonText: { fontSize: 12 },
  controlButtonTextActive: { color: colors.white },
  filterCountBadge: { minWidth: 21, height: 21, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  filterCountText: { color: colors.white, fontSize: 10 },
  locationBanner: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: 'rgba(62,124,115,0.09)' },
  locationBannerCopy: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  locationBannerText: { flex: 1, color: colors.accent, fontSize: 11, lineHeight: 17 },
  bannerCloseButton: { width: 30, height: 30, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  inlineError: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  inlineErrorText: { flex: 1, fontSize: 11 },
  activeChipsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  activeChip: { maxWidth: '100%', flexDirection: 'row-reverse', alignItems: 'center', gap: 5, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 6, backgroundColor: 'rgba(184,98,63,0.09)' },
  activeChipText: { maxWidth: 160, color: colors.primary, fontSize: 11 },
  noticeCard: { borderColor: 'rgba(184,98,63,0.16)', borderRadius: radii.lg },
  noticeRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  noticeIcon: { width: 34, height: 34, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(184,98,63,0.09)' },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 18 },
  resultsHeading: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.xs },
  resultsHeadingCopy: { flex: 1, gap: 3 },
  resultsTitle: { fontSize: 21, lineHeight: 27 },
  resultsDescription: { fontSize: 12, lineHeight: 18 },
  resultsCountBadge: { minWidth: 38, height: 38, paddingHorizontal: spacing.sm, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  resultsCountText: { color: colors.primary, fontSize: 14 },
  clearButton: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderRadius: radii.round, backgroundColor: 'rgba(184,98,63,0.09)' },
  clearButtonText: { color: colors.primary, fontSize: 10 },
  editorialModule: { marginBottom: spacing.md },
  editorialCard: { borderRadius: radii.lg },
  loadingList: { gap: spacing.md },
  loadingCard: { borderRadius: radii.xl, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(184,98,63,0.14)', backgroundColor: colors.surface },
  loadingImage: { height: 184, backgroundColor: 'rgba(221,208,197,0.48)' },
  loadingCardCopy: { gap: spacing.sm, padding: spacing.md },
  loadingLine: { height: 13, borderRadius: radii.round, backgroundColor: 'rgba(221,208,197,0.52)' },
  loadingLineTitle: { width: '62%', height: 18 },
  loadingPillsRow: { flexDirection: 'row-reverse', gap: spacing.xs },
  loadingPill: { width: 86, height: 26, borderRadius: radii.round, backgroundColor: 'rgba(221,208,197,0.42)' },
  loadingPillShort: { width: 62 },
  loadingLineOwner: { width: '44%' },
  stateBox: { gap: spacing.md },
  footerBox: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  footerText: { fontSize: 12 },
  footerErrorBox: { gap: spacing.sm, marginVertical: spacing.md, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: 'rgba(184,98,63,0.16)', backgroundColor: 'rgba(184,98,63,0.05)' },
  footerErrorCopy: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  filterSheetContent: { gap: spacing.md, paddingBottom: spacing.xl },
  filterSection: { gap: spacing.md, padding: spacing.md, borderRadius: radii.xl, borderWidth: 1, borderColor: 'rgba(184,98,63,0.14)', backgroundColor: 'rgba(255,253,248,0.78)' },
  filterSectionHeading: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  filterSectionIcon: { width: 38, height: 38, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(62,124,115,0.1)' },
  filterSectionIconPrimary: { width: 38, height: 38, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(184,98,63,0.1)' },
  filterSectionCopy: { flex: 1, gap: 2 },
  filterSectionDescription: { fontSize: 11, lineHeight: 17 },
  sheetLocationState: { gap: spacing.sm },
  sheetLocationText: { fontSize: 12, lineHeight: 19 },
  sheetErrorText: { color: colors.primary, fontSize: 11 },
  chipsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.round, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.white },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipPressed: { opacity: 0.76 },
  chipText: { fontSize: 12 },
  chipTextActive: { color: colors.white, fontSize: 12 },
  filterSheetFooter: { gap: spacing.sm },
});
