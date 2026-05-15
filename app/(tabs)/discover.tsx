import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { ItemCard } from '@/components/marketplace/ItemCard';
import { spacing } from '@/constants/spacing';
import { fetchMarketplaceItems, MarketplaceItem } from '@/lib/marketplace-items';

export default function DiscoverScreen() {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;

    return items.filter((item) => {
      const haystack = [item.title, item.category, item.location].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(normalized);
    });
  }, [items, query]);

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
  stateBox: { gap: spacing.md },
});
