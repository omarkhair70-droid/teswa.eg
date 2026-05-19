import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { ItemCard } from '@/components/marketplace/ItemCard';
import { ItemVideoDiscoveryRail } from '@/components/marketplace/ItemVideoDiscoveryRail';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { radii } from '@/constants/radii';
import { fetchMarketplaceItemsPage, MarketplaceItem } from '@/lib/marketplace-items';
import { fetchStoryDiscoveryItems, StoryDiscoveryItem } from '@/lib/story-discovery';
import { matchesDiscoveryLocation, resolveCurrentDiscoveryLocation } from '@/lib/discovery-location';
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

export default function DiscoverScreen() {
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
  const [activeNearbyLocation, setActiveNearbyLocation] = useState<{ label: string; matchTerms: string[] } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<string | null>(null);
  const [videoMoments, setVideoMoments] = useState<ItemVideoDiscoveryMoment[]>([]);
  const [videoMomentsLoading, setVideoMomentsLoading] = useState(true);
  const [videoMomentsError, setVideoMomentsError] = useState<string | null>(null);
  const [storyHighlights, setStoryHighlights] = useState<StoryDiscoveryItem[]>([]);
  const [storyHighlightsLoading, setStoryHighlightsLoading] = useState(true);
  const [storyHighlightsError, setStoryHighlightsError] = useState<string | null>(null);

  const clearAllFilters = useCallback(() => {
    setQuery('');
    setActiveNearbyLocation(null);
    setNearbyError(null);
    setSelectedCategory(null);
    setSelectedCondition(null);
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadMoreError(null);
    setItemsCacheNotice(null);

    let hasFreshCacheVisible = false;

    const cached = await readFreshMarketplaceFirstPageCache();
    if (cached) {
      hasFreshCacheVisible = true;
      setItems(cached.page.items);
      setHasMore(cached.page.hasMore);
      setLoading(false);
      setItemsCacheNotice('نستعرض نتائج محفوظة بينما نتحقق من الجديد.');
    }

    try {
      const page = await fetchMarketplaceItemsPage({ offset: 0 });
      setItems(page.items);
      setHasMore(page.hasMore);
      setError(null);
      setItemsCacheNotice(null);
      void writeMarketplaceFirstPageCache(page);
    } catch {
      if (hasFreshCacheVisible) {
        setItemsCacheNotice('تعذر تحديث التصفح الآن، نعرض آخر نسخة محفوظة.');
      } else {
        const stale = await readAnyMarketplaceFirstPageCache();
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
      setLoading(false);
    }
  }, []);

  const loadVideoMoments = useCallback(async () => {
    setVideoMomentsLoading(true);
    setVideoMomentsError(null);
    try {
      const moments = await fetchRecentItemVideoDiscoveryMoments(8);
      setVideoMoments(moments);
    } catch {
      setVideoMoments([]);
      setVideoMomentsError('تعذر تحميل اللمحات المرئية الآن.');
    } finally {
      setVideoMomentsLoading(false);
    }
  }, []);

  const loadStoryHighlights = useCallback(async () => {
    setStoryHighlightsLoading(true);
    setStoryHighlightsError(null);
    try {
      const highlights = await fetchStoryDiscoveryItems({ limit: 8 });
      setStoryHighlights(highlights);
    } catch {
      setStoryHighlights([]);
      setStoryHighlightsError('تعذر تحميل العناصر ذات الحكاية الآن.');
    } finally {
      setStoryHighlightsLoading(false);
    }
  }, []);

  const refreshItems = useCallback(async () => {
    if (refreshing) {
      return;
    }

    setRefreshing(true);
    setLoadMoreError(null);
    try {
      const page = await fetchMarketplaceItemsPage({ offset: 0 });
      setItems(page.items);
      setHasMore(page.hasMore);
      setError(null);
      void writeMarketplaceFirstPageCache(page);
      void loadVideoMoments();
      void loadStoryHighlights();
    } catch {
      // Keep existing items visible on refresh failure.
    } finally {
      setRefreshing(false);
    }
  }, [loadStoryHighlights, loadVideoMoments, refreshing]);

  const loadMoreItems = useCallback(async () => {
    if (loading || refreshing || loadingMore || !hasMore || error) {
      return;
    }

    setLoadingMore(true);
    setLoadMoreError(null);

    try {
      const page = await fetchMarketplaceItemsPage({ offset: items.length });
      setItems((currentItems) => {
        const merged = [...currentItems, ...page.items];
        const uniqueById = new Map(merged.map((item) => [item.id, item]));
        return Array.from(uniqueById.values());
      });
      setHasMore(page.hasMore);
    } catch {
      setLoadMoreError('تعذر تحميل المزيد. حاول مرة أخرى.');
    } finally {
      setLoadingMore(false);
    }
  }, [error, hasMore, items.length, loading, loadingMore, refreshing]);

  const handleUseMyLocation = useCallback(async () => {
    setNearbyLoading(true);
    setNearbyError(null);

    try {
      const result = await resolveCurrentDiscoveryLocation();
      if (result.ok) {
        setActiveNearbyLocation({ label: result.label, matchTerms: result.matchTerms });
        return;
      }

      setActiveNearbyLocation(null);
      setNearbyError(result.message);
    } finally {
      setNearbyLoading(false);
    }
  }, []);

  const clearNearbyFilter = useCallback(() => {
    setActiveNearbyLocation(null);
    setNearbyError(null);
  }, []);

  useEffect(() => {
    loadItems();
    void loadVideoMoments();
    void loadStoryHighlights();
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
  const activeFiltersCount = [Boolean(query.trim()), Boolean(activeNearbyLocation), Boolean(selectedCategory), Boolean(selectedCondition)].filter(Boolean).length;
  const shouldShowVideoMomentsRail = videoMomentsLoading || Boolean(videoMomentsError) || videoMoments.length > 0;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const queryFiltered = normalized
      ? items.filter((item) => {
          const haystack = [item.title, item.category, item.location].filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(normalized);
        })
      : items;

    const nearbyFiltered = activeNearbyLocation
      ? queryFiltered.filter((item) => matchesDiscoveryLocation(item.location, activeNearbyLocation.matchTerms))
      : queryFiltered;

    const categoryFiltered = selectedCategory
      ? nearbyFiltered.filter((item) => item.category?.trim().toLocaleLowerCase() === selectedCategory.toLocaleLowerCase())
      : nearbyFiltered;

    return selectedCondition
      ? categoryFiltered.filter((item) => item.condition?.trim().toLocaleLowerCase() === selectedCondition.toLocaleLowerCase())
      : categoryFiltered;
  }, [activeNearbyLocation, items, query, selectedCategory, selectedCondition]);
  const discoverIntelligenceState = buildDiscoverIntelligenceState({
    visibleItemsCount: filtered.length,
    loadedItemsCount: items.length,
    videoMomentsCount: videoMoments.length,
    storyHighlightsCount: storyHighlights.length,
    activeFiltersCount,
    nearbyLabel: activeNearbyLocation?.label ?? null,
  });
  const spotlightItems = buildDiscoverSpotlightItems(hasActiveFilters ? filtered : items, 6);
  const isFilteredEmptyWithMore = hasActiveFilters && filtered.length === 0 && hasMore;

  const renderListFooter = useCallback(() => {
    if (loadingMore) {
      return (
        <View style={styles.footerBox}>
          <Ionicons name="hourglass-outline" size={16} color={colors.primary} />
          <AppText>جارٍ فتح المزيد من العناصر...</AppText>
        </View>
      );
    }

    if (loadMoreError) {
      return (
        <View style={styles.footerBox}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.primary} />
          <AppText>تعذر تحميل المزيد. حاول مرة أخرى.</AppText>
          <AppButton label="إعادة المحاولة" variant="neutral" onPress={loadMoreItems} />
        </View>
      );
    }

    if (!hasMore && items.length > 0) {
      return (
        <View style={styles.footerBox}>
          <Ionicons name="checkmark-done-outline" size={16} color={colors.primary} />
          <AppText>وصلت لنهاية المشهد الحالي.</AppText>
        </View>
      );
    }

    return null;
  }, [hasMore, items.length, loadMoreError, loadMoreItems, loadingMore]);

  return (
    <AppScreen backgroundVariant="alive" style={styles.screen}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshing={refreshing}
        onRefresh={refreshItems}
        onEndReached={isFilteredEmptyWithMore ? undefined : loadMoreItems}
        onEndReachedThreshold={0.35}
        ListHeaderComponent={
          <View style={styles.header}>
            <LinearGradient colors={['#FFF6E8', '#FFE7C8', 'rgba(62,124,115,0.24)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
              <View style={styles.heroOrbOne} />
              <View style={styles.heroOrbTwo} />
              <View style={styles.heroIconShell}>
                <Ionicons name="compass-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.heroBox}>
                <AppText weight="bold" style={styles.heroTitle}>اكتشف تِسوى</AppText>
                <AppText>ناس، حركة، وحاجات بتدور على رحلة جديدة. اختار الباب اللي تحب تبدأ منه.</AppText>
                <AppText muted>لو هدفك عنصر معيّن، مركز التصفح تحت يختصر الطريق عليك.</AppText>
              </View>
            </LinearGradient>

            <AppCard>
              <View style={styles.worldPathsBox}>
                <AppText weight="bold">أبواب الاكتشاف</AppText>
                <AppText muted>تِسوى مش مجرد قائمة عناصر؛ فيها ناس، حركة، وتصفح حيّ للعناصر الجاهزة للتبديل.</AppText>
                <View style={styles.gateCard}>
                  <View style={styles.gateTitleRow}>
                    <Ionicons name="people-outline" size={16} color={colors.primary} />
                    <AppText weight="bold">ناس تِسوى</AppText>
                  </View>
                  <AppText muted>اكتشف الناس، عناصرهم، والحكايات اللي تعرّفك على أسلوب كل واحد في التبديل.</AppText>
                  <AppButton label="اكتشف الناس" variant="neutral" onPress={() => router.push('/people')} />
                </View>
                <View style={styles.gateCard}>
                  <View style={styles.gateTitleRow}>
                    <Ionicons name="pulse-outline" size={16} color={colors.primary} />
                    <AppText weight="bold">حركة تِسوى</AppText>
                  </View>
                  <AppText muted>شاهد القصص النشطة والحركة الظاهرة حولك، وخليك قريب من الأبواب اللي بدأت تتفتح.</AppText>
                  <AppButton label="ادخل الحركة" variant="neutral" onPress={() => router.push('/motion')} />
                </View>
                <View style={styles.gateCard}>
                  <View style={styles.gateTitleRow}>
                    <Ionicons name="cube-outline" size={16} color={colors.primary} />
                    <AppText weight="bold">العناصر</AppText>
                  </View>
                  <AppText muted>تصفح العناصر الجاهزة للتبديل، وفلتر النتائج حسب ما يناسبك بسرعة ووضوح.</AppText>
                  <View style={styles.itemsHint}>
                    <Ionicons name="arrow-down-outline" size={13} color={colors.primary} />
                    <AppText muted>التصفح يبدأ تحت</AppText>
                  </View>
                </View>
              </View>
            </AppCard>

            {shouldShowVideoMomentsRail ? (
              <AppCard>
                <ItemVideoDiscoveryRail
            onOpenViewer={() => router.push('/motion/viewer')}
            viewerCtaLabel='افتح الريل المرئي'
                  eyebrow="اكتشاف مرئي"
                  title="شوف عناصر لها لمحة فيديو"
                  description="قبل ما تدخل التفاصيل، فيه عناصر تفتح لك لقطة أقرب من شكلها الحقيقي."
                  moments={videoMoments}
                  loading={videoMomentsLoading}
                  errorMessage={videoMomentsError}
                  onRetry={loadVideoMoments}
                />
              </AppCard>
            ) : null}
            <AppCard>
              <DiscoverStoryHighlightsRail items={storyHighlights} loading={storyHighlightsLoading} errorMessage={storyHighlightsError} onRetry={loadStoryHighlights} />
            </AppCard>
            <DiscoverIntelligencePanel state={discoverIntelligenceState} />

            <AppCard>
              <View style={styles.browseBox}>
                <AppText style={styles.eyebrow}>تصفح مباشر</AppText>
                <AppText weight="bold" style={styles.browseTitle}>مركز استكشاف العناصر</AppText>
                <AppText muted>ابحث بسرعة، فعّل الموقع القريب، واضبط الفلاتر عشان توصل للعنصر المناسب بثقة.</AppText>
                <AppInput value={query} onChangeText={setQuery} placeholder="ابحث بالاسم أو الفئة أو المدينة" />
              </View>
            </AppCard>

            {itemsCacheNotice ? (
              <AppCard>
                <View style={styles.noticeRow}>
                  <Ionicons name="layers-outline" size={16} color={colors.primary} />
                  <AppText muted style={styles.noticeText}>{itemsCacheNotice}</AppText>
                </View>
              </AppCard>
            ) : null}

            <AppCard>
              <View style={styles.nearbyBox}>
                <View style={styles.nearbyTitleRow}>
                  <Ionicons name="navigate-outline" size={16} color={colors.primary} />
                  <AppText weight="bold">التصفح القريب</AppText>
                </View>
                {activeNearbyLocation ? (
                  <>
                    <AppText>نعرض العناصر الأقرب إلى: {activeNearbyLocation.label}</AppText>
                    <AppButton label="عرض كل العناصر" variant="neutral" onPress={clearNearbyFilter} />
                  </>
                ) : (
                  <>
                    <AppButton label={nearbyLoading ? 'جارٍ تحديد موقعك...' : 'اعرض الأقرب لمدينتي'} onPress={handleUseMyLocation} disabled={nearbyLoading} />
                    <AppText muted>نستخدم موقعك مرة واحدة لتقريب نتائج التصفح.</AppText>
                  </>
                )}
                {nearbyError ? <AppText muted>{nearbyError}</AppText> : null}
              </View>
            </AppCard>

            <AppCard>
              <View style={styles.filterBox}>
                <View style={styles.filterHeaderRow}>
                  <Ionicons name="pricetag-outline" size={15} color={colors.primary} />
                  <AppText weight="bold">الفئة</AppText>
                </View>
                <View style={styles.chipsRow}>
                  <Pressable onPress={() => setSelectedCategory(null)} style={[styles.chip, !selectedCategory && styles.chipActive]}>
                    <AppText style={!selectedCategory ? styles.chipTextActive : undefined}>الكل</AppText>
                  </Pressable>
                  {availableCategories.map((category) => {
                    const isActive = selectedCategory?.toLocaleLowerCase() === category.toLocaleLowerCase();
                    return (
                      <Pressable key={category} onPress={() => setSelectedCategory(category)} style={[styles.chip, isActive && styles.chipActive]}>
                        <AppText style={isActive ? styles.chipTextActive : undefined}>{category}</AppText>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.filterHeaderRow}>
                  <Ionicons name="sparkles-outline" size={15} color={colors.primary} />
                  <AppText weight="bold">الحالة</AppText>
                </View>
                <View style={styles.chipsRow}>
                  <Pressable onPress={() => setSelectedCondition(null)} style={[styles.chip, !selectedCondition && styles.chipActive]}>
                    <AppText style={!selectedCondition ? styles.chipTextActive : undefined}>الكل</AppText>
                  </Pressable>
                  {availableConditions.map((condition) => {
                    const isActive = selectedCondition?.toLocaleLowerCase() === condition.toLocaleLowerCase();
                    return (
                      <Pressable key={condition} onPress={() => setSelectedCondition(condition)} style={[styles.chip, isActive && styles.chipActive]}>
                        <AppText style={isActive ? styles.chipTextActive : undefined}>{condition}</AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </AppCard>
            {!loading && !error ? (
              <AppCard>
                <View style={styles.resultsRow}>
                  <View style={styles.resultsLabelRow}>
                    <Ionicons name="search-outline" size={15} color={colors.primary} />
                    <AppText>{hasActiveFilters ? `وجدنا ${filtered.length} عنصرًا قريبًا من اختيارك` : `المشهد يضم ${filtered.length} عنصرًا للتصفح الآن`}</AppText>
                  </View>
                  {hasActiveFilters ? <AppButton label="مسح الفلاتر" variant="neutral" onPress={clearAllFilters} /> : null}
                </View>
              </AppCard>
            ) : null}
            <AppCard>
              <DiscoverSpotlightRail items={spotlightItems} />
            </AppCard>
          </View>
        }
        renderItem={({ item }) => <ItemCard item={item} />}
        ListFooterComponent={renderListFooter}
        ListEmptyComponent={
          loading ? (
            <EmptyState title="جاري التحميل" description="نجهز لك بوابة التصفح الآن." />
          ) : error ? (
            <View style={styles.stateBox}>
              <EmptyState title="تعذر تحميل التصفح" description={error} />
              <AppButton label="إعادة المحاولة" onPress={loadItems} />
            </View>
          ) : isFilteredEmptyWithMore ? (
            <View style={styles.stateBox}>
              <EmptyState
                title="لا توجد نتائج مطابقة في النتائج المحمّلة"
                description="حمّل المزيد أو جرّب مسح بعض الفلاتر."
              />
              <AppButton label="تحميل المزيد" onPress={loadMoreItems} disabled={loadingMore} />
              <AppButton label="مسح الفلاتر" variant="neutral" onPress={clearAllFilters} />
            </View>
          ) : hasActiveFilters && filtered.length === 0 ? (
            <View style={styles.stateBox}>
              <EmptyState
                title="لا توجد نتائج مطابقة"
                description="جرّب مسح بعض الفلاتر أو تغيير كلمة البحث."
              />
              <AppButton label="مسح الفلاتر" variant="neutral" onPress={clearAllFilters} />
            </View>
          ) : (
            <EmptyState title="لا توجد عناصر حالياً" description="عند إضافة عناصر جديدة ستظهر هنا مباشرة." />
          )
        }
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  header: { gap: spacing.sm, marginBottom: spacing.md },
  heroCard: {
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(62,124,115,0.28)',
    overflow: 'hidden',
    gap: spacing.xs,
  },
  heroOrbOne: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.34)',
    top: -40,
    right: -20,
  },
  heroOrbTwo: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 999,
    backgroundColor: 'rgba(255,226,182,0.5)',
    bottom: -44,
    left: -30,
  },
  heroIconShell: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(62,124,115,0.25)',
    backgroundColor: 'rgba(255,255,255,0.68)',
  },
  heroBox: { gap: spacing.sm },
  heroTitle: { fontSize: 26 },
  worldPathsBox: { gap: spacing.sm },
  gateCard: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  gateTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  itemsHint: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.round,
  },
  browseBox: { gap: spacing.sm },
  eyebrow: { color: colors.primary, fontSize: 12 },
  browseTitle: { fontSize: 24 },
  noticeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  noticeText: { flex: 1 },
  nearbyBox: { gap: spacing.sm },
  nearbyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  filterBox: { gap: spacing.sm },
  filterHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.74)',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTextActive: { color: colors.white },
  resultsRow: { gap: spacing.sm },
  resultsLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stateBox: { gap: spacing.md },
  footerBox: { gap: spacing.sm, marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
});
