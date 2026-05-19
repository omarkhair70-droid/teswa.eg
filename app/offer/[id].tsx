import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AppScreen } from '@/components/ui/AppScreen';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { TeswaMomentCard } from '@/components/ui/TeswaMomentCard';
import { spacing } from '@/constants/spacing';
import { acceptOfferFromMobile, fetchOfferById, getOfferStatusLabel, markOfferThinkingFromMobile, OfferDetail, softRejectOfferFromMobile } from '@/lib/offers';
import { useAuth } from '@/lib/auth';

function ItemSummary({ title, item }: { title: string; item: OfferDetail['requestedItem'] }) {
  return <AppCard><View style={styles.group}><AppText weight="semibold">{title}</AppText>{item ? <><AppText weight="semibold">{item.title}</AppText><AppText muted>{[item.category, item.condition, item.location].filter(Boolean).join(' • ') || 'بدون تفاصيل إضافية'}</AppText></> : <AppText muted>تعذر تحميل بيانات هذا العنصر حالياً.</AppText>}</View></AppCard>;
}

export default function OfferDetailScreen() {
  const { user } = useAuth();
  const { id, moment } = useLocalSearchParams<{ id: string; moment?: string }>();
  const [offer, setOffer] = useState<OfferDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [actionLoading, setActionLoading] = useState<'thinking' | 'reject' | 'accept' | null>(null);
  const [actionMoment, setActionMoment] = useState<'thinking' | 'rejected' | null>(null);

  const loadOffer = useCallback(async () => {
    if (!id || !user?.id) return;
    setLoading(true); setError(null);
    try { const result = await fetchOfferById(id, user.id); if (!result.ok) { setOffer(null); setError(result.reason === 'unauthorized' ? 'غير مسموح لك بعرض هذا العرض.' : 'العرض غير موجود.'); } else { setOffer(result.offer); } }
    catch { setError('تعذر تحميل تفاصيل العرض. حاول مرة أخرى.'); }
    finally { setLoading(false); }
  }, [id, user?.id]);

  useEffect(() => { loadOffer(); }, [loadOffer]);

  const doAction = useCallback(async (action: 'thinking' | 'reject' | 'accept') => {
    if (!id || !user?.id || !offer || actionLoading) return;
    setActionLoading(action);
    setError(null);
    try {
      if (action === 'thinking') {
        const r = await markOfferThinkingFromMobile({ offerId: id, currentUserId: user.id, note });
        if (!r.ok) return setError(r.message);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        await loadOffer();
        setActionMoment('thinking');
      } else if (action === 'reject') {
        const r = await softRejectOfferFromMobile({ offerId: id, currentUserId: user.id, note });
        if (!r.ok) return setError(r.message);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        await loadOffer();
        setActionMoment('rejected');
      } else {
        const r = await acceptOfferFromMobile({ offerId: id, currentUserId: user.id });
        if (!r.ok || !r.dealId) return setError(r.ok ? 'تعذر فتح الصفقة.' : r.message);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        router.replace(`/deal/${r.dealId}?moment=accepted`);
      }
    } catch (err) {
      if (__DEV__) console.log('[offer-detail] action failed', { action, offerId: id, code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
      setError('تعذر تنفيذ الإجراء حالياً. حاول مرة أخرى.');
    } finally { setActionLoading(null); }
  }, [actionLoading, id, loadOffer, note, offer, user?.id]);

  if (!user?.id) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل الدخول لمتابعة العروض." /></AppScreen>;
  if (!id) return <AppScreen><EmptyState title="رابط غير صالح" description="تعذر تحديد العرض." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="جاري التحميل" description="نقوم بتحميل تفاصيل العرض." /></AppScreen>;
  if (error && !offer) return <AppScreen><View style={styles.group}><EmptyState title="خطأ" description={error} /><AppButton label="إعادة المحاولة" onPress={loadOffer} /></View></AppScreen>;
  if (!offer) return <AppScreen><EmptyState title="العرض غير موجود" description="قد يكون تم حذفه أو لم يعد متاحاً." /></AppScreen>;

  const receiverCanRespond = offer.viewerRole === 'receiver' && (offer.status === 'pending' || offer.status === 'thinking');

  const showSentMoment = moment === 'sent';


  return <AppScreen scrollable>
    {actionMoment === 'thinking' ? <TeswaMomentCard eyebrow="تم إرسال ردك" title="الطرف الآخر عرف إنك محتاج وقت" body="العرض ما زال مفتوحًا، وردك اتسجل بوضوح." icon="hourglass-outline" tone="waiting" /> : null}
    {actionMoment === 'rejected' ? <TeswaMomentCard eyebrow="ردك وصل" title="تم رفض العرض بلطف" body="قفلنا هذا العرض بهدوء، ويمكن لصاحبه متابعة فرص أخرى." icon="heart-dislike-outline" tone="calm" /> : null}
    {showSentMoment ? <TeswaMomentCard eyebrow="لحظة جديدة" title="عرضك وصل" body="أرسلنا عرض التبديل لصاحب العنصر. تابع حالته من هنا." icon="paper-plane-outline" tone="warm" /> : null}
    <AppCard><View style={styles.group}><AppText weight="bold" style={styles.title}>تفاصيل العرض</AppText><AppText muted>حالة العرض: {getOfferStatusLabel(offer.status)}</AppText>{!!offer.createdAt && <AppText muted>تاريخ الإرسال: {new Date(offer.createdAt).toLocaleString('ar-EG')}</AppText>}</View></AppCard>
    <ItemSummary title="العنصر المطلوب" item={offer.requestedItem} />
    <ItemSummary title="العنصر المعروض" item={offer.offeredItem} />
    {offer.message ? <AppCard><View style={styles.group}><AppText weight="semibold">الرسالة</AppText><AppText>{offer.message}</AppText></View></AppCard> : null}
    {offer.status === 'accepted' && offer.dealId ? <AppCard><View style={styles.group}><AppText weight="semibold">العرض اتقبل</AppText><AppText muted>اتفتحت دردشة الصفقة علشان تكملوا تنسيق التبديل.</AppText><AppButton label="افتح دردشة الصفقة" onPress={() => router.push(`/deal/${offer.dealId}`)} /></View></AppCard> : null}
    {offer.status === 'accepted' && !offer.dealId ? <AppText muted>العرض مقبول، لكن تعذر تحديد دردشة الصفقة حالياً.</AppText> : null}
    {receiverCanRespond ? <AppCard><View style={styles.group}><AppText weight="semibold">الرد على العرض</AppText><TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="ملاحظة اختيارية" textAlign="right" /><AppButton label={actionLoading === 'thinking' ? 'جارٍ التنفيذ...' : 'محتاج أفكر'} disabled={Boolean(actionLoading)} onPress={() => doAction('thinking')} /><AppButton label={actionLoading === 'reject' ? 'جارٍ التنفيذ...' : 'رفض بلطف'} disabled={Boolean(actionLoading)} onPress={() => doAction('reject')} /><AppButton label={actionLoading === 'accept' ? 'جارٍ التنفيذ...' : 'قبول العرض'} disabled={Boolean(actionLoading)} onPress={() => doAction('accept')} /></View></AppCard> : null}
    {error ? <AppText style={styles.error}>{error}</AppText> : null}
  </AppScreen>;
}

const styles = StyleSheet.create({ group: { gap: spacing.sm }, title: { fontSize: 24 }, input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 12 }, error: { color: '#b42318' } });
