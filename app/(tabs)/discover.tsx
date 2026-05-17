import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { ItemCard } from '@/components/marketplace/ItemCard';
import { spacing } from '@/constants/spacing';
import { fetchMarketplaceItems, MarketplaceItem } from '@/lib/marketplace-items';
import { matchesDiscoveryLocation, resolveCurrentDiscoveryLocation } from '@/lib/discovery-location';

export default function DiscoverScreen() {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [activeNearbyLocation, setActiveNearbyLocation] = useState<{ label: string; matchTerms: string[] } | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchMarketplaceItems());
    } catch {
      setError('تعذر تحميل قائمة التصفح. حاول لاحقاً.');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const queryFiltered = normalized
      ? items.filter((item) => {
          const haystack = [item.title, item.category, item.location].filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(normalized);
        })
      : items;

    if (!activeNearbyLocation) return queryFiltered;

    return queryFiltered.filter((item) => matchesDiscoveryLocation(item.location, activeNearbyLocation.matchTerms));
  }, [activeNearbyLocation, items, query]);

  return (
    <AppScreen style={styles.screen}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <AppText weight="bold" style={styles.title}>اكتشف العناصر</AppText>
            <AppInput value={query} onChangeText={setQuery} placeholder="ابحث بالاسم أو الفئة أو المدينة" />
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
          </View>
        }
        renderItem={({ item }) => <ItemCard item={item} />}
        ListEmptyComponent={
          loading ? (
            <EmptyState title="جاري التحميل" description="نجهز لك نتائج التصفح." />
          ) : error ? (
            <View style={styles.stateBox}>
              <EmptyState title="تعذر تحميل التصفح" description={error} />
              <AppButton label="إعادة المحاولة" onPress={loadItems} />
            </View>
          ) : activeNearbyLocation ? (
            <View style={styles.stateBox}>
              <EmptyState
                title="لا توجد عناصر قريبة حالياً"
                description="لم نجد عناصر مطابقة لمدينتك في النتائج الحالية. جرّب عرض كل العناصر أو ابحث بكلمة أخرى."
              />
              <AppButton label="عرض كل العناصر" variant="neutral" onPress={clearNearbyFilter} />
            </View>
          ) : query.trim() ? (
            <EmptyState title="لا توجد نتائج" description="جرّب كلمة بحث أخرى للعثور على عناصر مناسبة." />
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
  title: { fontSize: 24 },
  nearbyBox: { gap: spacing.sm },
  stateBox: { gap: spacing.md },
});
