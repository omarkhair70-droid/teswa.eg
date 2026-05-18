import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { ItemCard } from '@/components/marketplace/ItemCard';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { radii } from '@/constants/radii';
import { fetchMarketplaceItemsPage, MarketplaceItem } from '@/lib/marketplace-items';
import { matchesDiscoveryLocation, resolveCurrentDiscoveryLocation } from '@/lib/discovery-location';
import {
  readAnyMarketplaceFirstPageCache,
  readFreshMarketplaceFirstPageCache,
  writeMarketplaceFirstPageCache,
} from '@/lib/offline-marketplace-cache';

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
    } catch {
      // Keep existing items visible on refresh failure.
    } finally {
      setRefreshing(false);
    }
  }, [refreshing]);

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
  }, [loadItems]);

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
  const isFilteredEmptyWithMore = hasActiveFilters && filtered.length === 0 && hasMore;

  const renderListFooter = useCallback(() => {
    if (loadingMore) {
      return (
        <View style={styles.footerBox}>
          <AppText>جارٍ تحميل المزيد...</AppText>
        </View>
      );
    }

    if (loadMoreError) {
      return (
        <View style={styles.footerBox}>
          <AppText>تعذر تحميل المزيد. حاول مرة أخرى.</AppText>
          <AppButton label="إعادة المحاولة" variant="neutral" onPress={loadMoreItems} />
        </View>
      );
    }

    if (!hasMore && items.length > 0) {
      return (
        <View style={styles.footerBox}>
          <AppText>وصلت لنهاية النتائج.</AppText>
        </View>
      );
    }

    return null;
  }, [hasMore, items.length, loadMoreError, loadMoreItems, loadingMore]);

  return (
    <AppScreen style={styles.screen}>
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
            <AppCard>
              <View style={styles.heroBox}>
                <AppText weight="bold" style={styles.heroTitle}>اكتشف تِسوى</AppText>
                <AppText>ناس، حكايات، وحاجات بتدور على رحلة جديدة. اختار الباب اللي عايز تبدأ منه.</AppText>
                <AppText muted>ولو بتدور على عنصر محدد، كمّل تحت وفلتر النتائج براحتك.</AppText>
              </View>
            </AppCard>
            <AppCard>
              <View style={styles.worldPathsBox}>
                <AppText weight="bold">أبواب الاكتشاف</AppText>
                <AppText muted>تِسوى مش قائمة عناصر فقط. ادخل من الناس، من الحركة، أو انزل للتصفح المباشر.</AppText>
                <View style={styles.pathBlock}>
                  <AppText weight="bold">ناس تِسوى</AppText>
                  <AppText muted>شوف مين بيعرض، مين عنده حكايات، وافتح ملفه.</AppText>
                  <AppButton label="اكتشف الناس" variant="neutral" onPress={() => router.push('/people')} />
                </View>
                <View style={styles.pathSeparator} />
                <View style={styles.pathBlock}>
                  <AppText weight="bold">حركة تِسوى</AppText>
                  <AppText muted>قصص نشطة، حاجات ليها حكاية، وأبواب بدأت تتحرك.</AppText>
                  <AppButton label="ادخل الحركة" variant="neutral" onPress={() => router.push('/motion')} />
                </View>
                <View style={styles.pathSeparator} />
                <View style={styles.pathBlock}>
                  <AppText weight="bold">العناصر</AppText>
                  <AppText muted>ابحث وفلتر العناصر الجاهزة للتبديل.</AppText>
                  <View style={styles.itemsHint}>
                    <AppText muted>كمّل للتصفح</AppText>
                  </View>
                </View>
              </View>
            </AppCard>
            <View style={styles.browseIntro}>
              <AppText weight="bold" style={styles.browseTitle}>تصفح العناصر</AppText>
              <AppText muted>ابحث بالاسم أو الفئة أو المدينة، وقرّب النتائج لموقعك.</AppText>
            </View>
            <AppInput value={query} onChangeText={setQuery} placeholder="ابحث بالاسم أو الفئة أو المدينة" />
            {itemsCacheNotice ? (
              <AppCard>
                <AppText muted>{itemsCacheNotice}</AppText>
              </AppCard>
            ) : null}
            <AppCard>
              <View style={styles.nearbyBox}>
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
                <AppText weight="bold">الفئة</AppText>
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
                <AppText weight="bold">الحالة</AppText>
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
                  <AppText>{hasActiveFilters ? `نستعرض ${filtered.length} عنصرًا مطابقًا` : `نستعرض ${filtered.length} عنصرًا`}</AppText>
                  {hasActiveFilters ? <AppButton label="مسح الفلاتر" variant="neutral" onPress={clearAllFilters} /> : null}
                </View>
              </AppCard>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <ItemCard item={item} />}
        ListFooterComponent={renderListFooter}
        ListEmptyComponent={
          loading ? (
            <EmptyState title="جاري التحميل" description="نجهز لك نتائج التصفح." />
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
  heroBox: { gap: spacing.sm },
  heroTitle: { fontSize: 26 },
  worldPathsBox: { gap: spacing.sm },
  pathBlock: { gap: spacing.xs },
  pathSeparator: { height: 1, backgroundColor: colors.border },
  itemsHint: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.primarySoft, borderRadius: radii.round },
  browseIntro: { gap: spacing.xs, marginTop: spacing.sm },
  browseTitle: { fontSize: 24 },
  nearbyBox: { gap: spacing.sm },
  filterBox: { gap: spacing.sm },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTextActive: { color: colors.white },
  resultsRow: { gap: spacing.sm },
  stateBox: { gap: spacing.md },
  footerBox: { gap: spacing.sm, marginTop: spacing.md },
});
