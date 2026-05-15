import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { fetchMarketplaceItemById, MarketplaceItem } from '@/lib/marketplace-items';

export default function ItemDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<MarketplaceItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadItem = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setError(null);
    try {
      const result = await fetchMarketplaceItemById(id);
      setItem(result);
    } catch {
      setError('تعذر تحميل تفاصيل العنصر. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadItem();
  }, [loadItem]);

  if (!id) {
    return <AppScreen><EmptyState title="معرّف غير صالح" description="تعذر تحديد العنصر المطلوب." /></AppScreen>;
  }

  if (loading) {
    return <AppScreen><EmptyState title="جاري التحميل" description="نقوم بتحضير تفاصيل العنصر." /></AppScreen>;
  }

  if (error) {
    return <AppScreen><View style={styles.stateBox}><EmptyState title="خطأ في التحميل" description={error} /><AppButton label="إعادة المحاولة" onPress={loadItem} /></View></AppScreen>;
  }

  if (!item) {
    return <AppScreen><EmptyState title="العنصر غير موجود" description="قد يكون تم حذفه أو لم يعد متاحاً." /></AppScreen>;
  }

  return (
    <AppScreen scrollable>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.hero} resizeMode="cover" />
      ) : (
        <View style={[styles.hero, styles.placeholder]}>
          <AppText muted weight="semibold">لا توجد صورة لهذا العنصر</AppText>
        </View>
      )}

      <AppCard>
        <View style={styles.infoBlock}>
          <AppText weight="bold" style={styles.title}>{item.title}</AppText>
          {item.description ? <AppText>{item.description}</AppText> : <AppText muted>لا يوجد وصف مضاف حالياً.</AppText>}
          {!!item.ownerDisplayName && <AppText muted>صاحب العنصر: {item.ownerDisplayName}</AppText>}
        </View>
      </AppCard>

      <AppCard>
        <View style={styles.infoBlock}>
          <AppText weight="semibold">بيانات سريعة</AppText>
          <AppText muted>الفئة: {item.category || 'غير محددة'}</AppText>
          <AppText muted>الحالة: {item.condition || 'غير محددة'}</AppText>
          <AppText muted>الموقع: {item.location || 'غير محدد'}</AppText>
        </View>
      </AppCard>

      <View style={styles.ctaBox}>
        <AppButton label="طلب التبديل سيأتي في المرحلة التالية" disabled />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', height: 240, borderRadius: radii.lg, backgroundColor: colors.primarySoft },
  placeholder: { borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24 },
  infoBlock: { gap: spacing.sm },
  ctaBox: { marginTop: spacing.sm },
  stateBox: { gap: spacing.md },
});
