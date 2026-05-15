import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import { fetchOfferById, OfferDetail, OfferItemSummary } from '@/lib/offers';

function ItemSummary({ title, item }: { title: string; item: OfferItemSummary | null }) {
  return (
    <AppCard>
      <View style={styles.group}>
        <AppText weight="semibold">{title}</AppText>
        {item ? (
          <>
            <AppText weight="semibold">{item.title}</AppText>
            <AppText muted>{[item.category, item.condition, item.location].filter(Boolean).join(' • ') || 'بدون تفاصيل إضافية'}</AppText>
          </>
        ) : (
          <AppText muted>تعذر تحميل بيانات هذا العنصر حالياً.</AppText>
        )}
      </View>
    </AppCard>
  );
}

export default function OfferDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [offer, setOffer] = useState<OfferDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOffer = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchOfferById(id);
      setOffer(result);
    } catch {
      setError('تعذر تحميل تفاصيل العرض. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadOffer();
  }, [loadOffer]);

  const statusLabel = useMemo(() => {
    if (!offer) return '-';
    if (offer.status === 'pending') return 'بانتظار الرد';
    return offer.status;
  }, [offer]);

  if (!id) return <AppScreen><EmptyState title="رابط غير صالح" description="تعذر تحديد العرض." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="جاري التحميل" description="نقوم بتحميل تفاصيل العرض." /></AppScreen>;
  if (error) return <AppScreen><View style={styles.group}><EmptyState title="خطأ" description={error} /><AppButton label="إعادة المحاولة" onPress={loadOffer} /></View></AppScreen>;
  if (!offer) return <AppScreen><EmptyState title="العرض غير موجود" description="قد يكون تم حذفه أو لم يعد متاحاً." /></AppScreen>;

  return (
    <AppScreen scrollable>
      <AppCard>
        <View style={styles.group}>
          <AppText weight="bold" style={styles.title}>تم إرسال العرض</AppText>
          <AppText muted>حالة العرض: {statusLabel}</AppText>
          {!!offer.createdAt && <AppText muted>تاريخ الإرسال: {new Date(offer.createdAt).toLocaleString('ar-EG')}</AppText>}
        </View>
      </AppCard>

      <ItemSummary title="العنصر المطلوب" item={offer.requestedItem} />
      <ItemSummary title="العنصر المعروض" item={offer.offeredItem} />

      {offer.message ? (
        <AppCard>
          <View style={styles.group}>
            <AppText weight="semibold">رسالتك</AppText>
            <AppText>{offer.message}</AppText>
          </View>
        </AppCard>
      ) : null}

      <AppText muted>سنضيف إدارة العروض والرد عليها في المرحلة التالية.</AppText>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  title: { fontSize: 24 },
});
