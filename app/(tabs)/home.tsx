import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppButton } from '@/components/ui/AppButton';
import { ItemCard } from '@/components/marketplace/ItemCard';
import { spacing } from '@/constants/spacing';
import { fetchMarketplaceItems, MarketplaceItem } from '@/lib/marketplace-items';

export default function HomeScreen() {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMarketplaceItems();
      setItems(result);
    } catch {
      setError('تعذر تحميل العناصر حالياً. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  return (
    <AppScreen style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <AppText weight="bold" style={styles.title}>أهلاً بك في تِسوى</AppText>
            <AppText muted>استكشف أحدث العناصر الجاهزة للتبديل اليوم.</AppText>
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
  header: { gap: spacing.xs, marginBottom: spacing.md },
  title: { fontSize: 24 },
  stateBox: { gap: spacing.md },
});
