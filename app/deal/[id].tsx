import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import { fetchDealEntryById, getDealStatusLabel } from '@/lib/deals';
import { useAuth } from '@/lib/auth';

export default function Screen() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deal, setDeal] = useState<any>(null);

  const load = useCallback(async () => {
    if (!id || !user?.id) return;
    setLoading(true); setError(null);
    try {
      const result = await fetchDealEntryById(id, user.id);
      if (!result.ok) {
        setDeal(null);
        setError(result.reason === 'unauthorized' ? 'غير مسموح لك بعرض هذه الصفقة.' : 'الصفقة غير موجودة.');
      } else setDeal(result.deal);
    } catch { setError('تعذر تحميل بيانات الصفقة.'); }
    finally { setLoading(false); }
  }, [id, user?.id]);

  useEffect(() => { load(); }, [load]);

  if (!user?.id) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل الدخول لمتابعة الصفقة." /></AppScreen>;
  if (!id) return <AppScreen><EmptyState title="رابط غير صالح" description="تعذر تحديد الصفقة." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="جاري التحميل" description="نحمّل بيانات الصفقة." /></AppScreen>;
  if (error && !deal) return <AppScreen><View style={styles.group}><EmptyState title="تعذر عرض الصفقة" description={error} /><AppButton label="إعادة المحاولة" onPress={load} /></View></AppScreen>;

  return <AppScreen scrollable><AppCard><View style={styles.group}><AppText weight="bold" style={styles.title}>تم قبول العرض</AppText><AppText muted>حالة الصفقة: {getDealStatusLabel(deal.status)}</AppText>{deal.acceptedAt ? <AppText muted>تاريخ القبول: {new Date(deal.acceptedAt).toLocaleString('ar-EG')}</AppText> : null}</View></AppCard>
    <AppCard><View style={styles.group}><AppText weight="semibold">العنصر المطلوب</AppText><AppText>{deal.requestedItem?.title ?? 'غير متاح'}</AppText></View></AppCard>
    <AppCard><View style={styles.group}><AppText weight="semibold">العنصر المعروض</AppText><AppText>{deal.offeredItem?.title ?? 'غير متاح'}</AppText></View></AppCard>
    <AppText muted>سنضيف صفحة التنسيق والرسائل في المرحلة التالية.</AppText>
  </AppScreen>;
}

const styles = StyleSheet.create({ group: { gap: spacing.sm }, title: { fontSize: 24 } });
