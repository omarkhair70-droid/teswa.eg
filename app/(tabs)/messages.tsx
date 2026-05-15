import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppButton } from '@/components/ui/AppButton';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { fetchOffersInbox, getOfferStatusLabel, OfferRowSummary } from '@/lib/offers';

function OfferRow({ offer, label }: { offer: OfferRowSummary; label: string }) {
  return <Pressable onPress={() => router.push(`/offer/${offer.id}`)}><AppCard><View style={styles.group}><AppText weight="semibold">{label}</AppText><AppText weight="semibold">{offer.requestedItem?.title ?? 'عنصر مطلوب غير متاح'}</AppText><AppText muted>مقابل: {offer.offeredItem?.title ?? 'عنصر معروض غير متاح'}</AppText><AppText muted>{getOfferStatusLabel(offer.status)}</AppText></View></AppCard></Pressable>;
}

export default function Screen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<OfferRowSummary[]>([]);
  const [sent, setSent] = useState<OfferRowSummary[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true); setError(null);
    try { const data = await fetchOffersInbox(user.id); setIncoming(data.incomingActionableOffers); setSent(data.sentOffers); }
    catch { setError('تعذر تحميل العروض حالياً.'); }
    finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (!user?.id) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك لعرض العروض الواردة والمرسلة." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="جاري التحميل" description="نحمّل العروض الآن." /></AppScreen>;
  if (error) return <AppScreen><View style={styles.group}><EmptyState title="حدث خطأ" description={error} /><AppButton label="إعادة المحاولة" onPress={load} /></View></AppScreen>;

  return <AppScreen scrollable><View style={styles.group}><AppText weight="bold" style={styles.title}>العروض</AppText>
    <AppText weight="semibold">عروض واردة تحتاج رد</AppText>
    {incoming.length ? incoming.map((offer) => <OfferRow key={offer.id} offer={offer} label="عرض وارد" />) : <EmptyState title="لا توجد عروض واردة" description="أي عرض جديد سيظهر هنا." />}
    <AppText weight="semibold">العروض المرسلة</AppText>
    {sent.length ? sent.map((offer) => <OfferRow key={offer.id} offer={offer} label="عرض مرسل" />) : <EmptyState title="لا توجد عروض مرسلة" description="ارسل أول عرض تبديل من صفحة أي عنصر." />}
  </View></AppScreen>;
}

const styles = StyleSheet.create({ group: { gap: spacing.sm }, title: { fontSize: 24 } });
