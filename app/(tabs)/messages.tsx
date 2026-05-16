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
import { fetchDealConversationsForUser, DealConversation } from '@/lib/messages';
import { getDealStatusLabel } from '@/lib/deals';
import { useUnreadBadges } from '@/lib/unread-badges';

function OfferRow({ offer, label }: { offer: OfferRowSummary; label: string }) {
  return <Pressable onPress={() => router.push(`/offer/${offer.id}`)}><AppCard><View style={styles.group}><AppText weight="semibold">{label}</AppText><AppText weight="semibold">{offer.requestedItem?.title ?? 'عنصر مطلوب غير متاح'}</AppText><AppText muted>مقابل: {offer.offeredItem?.title ?? 'عنصر معروض غير متاح'}</AppText><AppText muted>{getOfferStatusLabel(offer.status)}</AppText></View></AppCard></Pressable>;
}

function DealRow({ convo }: { convo: DealConversation }) {
  return <Pressable onPress={() => router.push(`/deal/${convo.dealId}`)}><AppCard><View style={styles.group}><AppText weight="semibold">{convo.otherParticipant.displayName ?? 'محادثة صفقة'}</AppText><AppText muted>{getDealStatusLabel(convo.status)}</AppText><AppText>المطلوب: {convo.requestedItemTitle}</AppText><AppText>المعروض: {convo.offeredItemTitle}</AppText>{convo.latestMessage ? <AppText muted numberOfLines={2}>{convo.latestMessage.senderId === convo.otherParticipant.id ? `${convo.otherParticipant.displayName ?? 'الطرف التاني'}: ` : 'أنت: '}{convo.latestMessage.body}</AppText> : <AppText muted>لسه مفيش رسائل</AppText>}<AppText muted>{new Date(convo.lastActivityAt).toLocaleString('ar-EG')}</AppText>{convo.unreadCount > 0 ? <AppText weight="semibold">غير مقروء: {convo.unreadCount}</AppText> : null}</View></AppCard></Pressable>;
}

export default function Screen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<OfferRowSummary[]>([]);
  const [sent, setSent] = useState<OfferRowSummary[]>([]);
  const [conversations, setConversations] = useState<DealConversation[]>([]);
  const { refreshBadges } = useUnreadBadges();

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true); setError(null);
    try {
      const [offersData, convosData] = await Promise.all([fetchOffersInbox(user.id), fetchDealConversationsForUser(user.id)]);
      setIncoming(offersData.incomingActionableOffers);
      setSent(offersData.sentOffers);
      setConversations(convosData);
      void refreshBadges();
    } catch { setError('تعذر تحميل الرسائل والعروض حالياً.'); }
    finally { setLoading(false); }
  }, [refreshBadges, user?.id]);

  useEffect(() => { load(); }, [load]);

  if (!user?.id) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك لعرض العروض والمحادثات." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="جاري التحميل" description="نحمّل الرسائل والعروض الآن." /></AppScreen>;
  if (error) return <AppScreen><View style={styles.group}><EmptyState title="حدث خطأ" description={error} /><AppButton label="إعادة المحاولة" onPress={load} /></View></AppScreen>;

  return <AppScreen scrollable><View style={styles.group}><AppText weight="bold" style={styles.title}>الرسائل والعروض</AppText>
    <AppText weight="semibold">العروض الواردة التي تحتاج رد</AppText>
    {incoming.length ? incoming.map((offer) => <OfferRow key={offer.id} offer={offer} label="عرض وارد" />) : <EmptyState title="لا توجد عروض واردة" description="أي عرض جديد سيظهر هنا." />}

    <AppText weight="semibold">العروض المرسلة</AppText>
    {sent.length ? sent.map((offer) => <OfferRow key={offer.id} offer={offer} label="عرض مرسل" />) : <EmptyState title="لا توجد عروض مرسلة" description="ارسل أول عرض تبديل من صفحة أي عنصر." />}

    <AppText weight="semibold">محادثات الصفقات</AppText>
    {conversations.length ? conversations.map((convo) => <DealRow key={convo.dealId} convo={convo} />) : <EmptyState title="لا توجد محادثات صفقات" description="عند قبول أي عرض هتظهر محادثة الصفقة هنا." />}
  </View></AppScreen>;
}

const styles = StyleSheet.create({ group: { gap: spacing.sm }, title: { fontSize: 24 } });
