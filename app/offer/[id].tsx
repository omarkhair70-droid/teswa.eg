import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { AppScreen } from '@/components/ui/AppScreen';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { TeswaMomentCard } from '@/components/ui/TeswaMomentCard';
import { SwapCeremony } from '@/components/exchange/SwapCeremony';
import { OfferTimeline } from '@/components/offers/OfferTimeline';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { acceptOfferFromMobile, fetchOfferById, getOfferStatusLabel, markOfferThinkingFromMobile, type OfferDetail, softRejectOfferFromMobile } from '@/lib/offers';
import { useAuth } from '@/lib/auth';
import { trackEvent } from '@/lib/analytics';
import { isSwapCeremonyEnabled } from '@/lib/feature-flags';

function itemMeta(item: OfferDetail['requestedItem']) {
  if (!item) return 'تعذر تحميل التفاصيل';
  return [item.category, item.condition, item.location].filter(Boolean).join(' • ') || 'بدون تفاصيل إضافية';
}

function TradeItemCard({ label, item, accent = false }: { label: string; item: OfferDetail['requestedItem']; accent?: boolean }) {
  return (
    <View style={[styles.tradeItemCard, accent && styles.tradeItemCardAccent]}>
      {item?.imageUrl ? (
        <ExpoImage source={{ uri: item.imageUrl }} style={styles.tradeItemImage} contentFit="cover" cachePolicy="memory-disk" transition={120} recyclingKey={item.id} />
      ) : (
        <View style={[styles.tradeItemImage, styles.tradeItemPlaceholder]}><Ionicons name="image-outline" size={20} color={colors.textMuted} /></View>
      )}
      <View style={styles.tradeItemCopy}>
        <AppText muted style={styles.eyebrow}>{label}</AppText>
        <AppText weight="bold" numberOfLines={2} style={styles.tradeItemTitle}>{item?.title ?? 'العنصر غير متاح'}</AppText>
        <AppText muted numberOfLines={2} style={styles.metaLine}>{itemMeta(item)}</AppText>
      </View>
    </View>
  );
}

function statusIcon(status: OfferDetail['status']): keyof typeof Ionicons.glyphMap {
  if (status === 'accepted') return 'checkmark-circle-outline';
  if (status === 'thinking') return 'hourglass-outline';
  if (status === 'soft_rejected' || status === 'rejected') return 'close-circle-outline';
  return 'time-outline';
}

function statusHeadline(offer: OfferDetail) {
  if (offer.status === 'accepted') return 'اتفقتم على التبديل';
  if (offer.status === 'thinking') return offer.viewerRole === 'receiver' ? 'طلبت وقت للتفكير' : 'الطرف التاني بيفكر';
  if (offer.status === 'soft_rejected' || offer.status === 'rejected') return 'العرض اتقفل';
  return offer.viewerRole === 'receiver' ? 'العرض مستني قرارك' : 'العرض عند الطرف التاني';
}

function statusDescription(offer: OfferDetail) {
  if (offer.status === 'accepted') return offer.dealId ? 'الصفقة جاهزة؛ افتح دردشة الصفقة واتفقوا على التنفيذ.' : 'العرض اتقبل، وبنجهز خطوة الصفقة.';
  if (offer.status === 'thinking') return offer.viewerRole === 'receiver' ? 'العرض لسه مفتوح وتقدر ترجع تقرر لما تكون جاهز.' : 'العرض لسه مفتوح، والطرف التاني طلب وقت قبل القرار.';
  if (offer.status === 'soft_rejected' || offer.status === 'rejected') return 'مفيش إجراء مطلوب دلوقتي، وتقدر تكمل تشوف فرص تانية.';
  return offer.viewerRole === 'receiver' ? 'قارن الحاجتين، راجع الرسالة، وبعدها اختار القرار المناسب.' : 'مفيش حاجة مطلوبة منك دلوقتي؛ القرار عند الطرف التاني.';
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
    setLoading(true);
    setError(null);
    try {
      const result = await fetchOfferById(id, user.id);
      if (!result.ok) {
        setOffer(null);
        setError(result.reason === 'unauthorized' ? 'غير مسموح لك بعرض هذا العرض.' : 'العرض غير موجود.');
      } else {
        setOffer(result.offer);
      }
    } catch {
      setError('تعذر تحميل تفاصيل العرض. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
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
        void trackEvent('offer_action_taken', { route: '/offer/[id]', entityType: 'offer', entityId: id, metadata: { action: 'thinking' } });
      } else if (action === 'reject') {
        const r = await softRejectOfferFromMobile({ offerId: id, currentUserId: user.id, note });
        if (!r.ok) return setError(r.message);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        await loadOffer();
        setActionMoment('rejected');
        void trackEvent('offer_action_taken', { route: '/offer/[id]', entityType: 'offer', entityId: id, metadata: { action: 'reject' } });
      } else {
        const r = await acceptOfferFromMobile({ offerId: id, currentUserId: user.id });
        if (!r.ok || !r.dealId) return setError(r.ok ? 'تعذر فتح الصفقة.' : r.message);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        void trackEvent('offer_action_taken', { route: '/offer/[id]', entityType: 'offer', entityId: id, metadata: { action: 'accept' } });
        router.replace(`/deal/${r.dealId}?moment=accepted`);
      }
    } catch (err) {
      if (__DEV__) console.log('[offer-detail] action failed', { action, offerId: id, code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
      setError('تعذر تنفيذ الإجراء حالياً. حاول مرة أخرى.');
    } finally {
      setActionLoading(null);
    }
  }, [actionLoading, id, loadOffer, note, offer, user?.id]);

  if (!user?.id) return <AppScreen backgroundVariant="soft"><EmptyState title="تسجيل الدخول مطلوب" description="سجّل الدخول لمتابعة العروض." /></AppScreen>;
  if (!id) return <AppScreen backgroundVariant="soft"><EmptyState title="رابط غير صالح" description="تعذر تحديد العرض." /></AppScreen>;
  if (loading) return <AppScreen backgroundVariant="soft"><EmptyState title="بنجيب العرض" description="بنجهز الحاجتين وحالة العرض." /></AppScreen>;
  if (error && !offer) return <AppScreen backgroundVariant="soft"><View style={styles.stateBox}><EmptyState title="تعذر فتح العرض" description={error} /><AppButton label="إعادة المحاولة" onPress={loadOffer} /></View></AppScreen>;
  if (!offer) return <AppScreen backgroundVariant="soft"><EmptyState title="العرض غير موجود" description="قد يكون تم حذفه أو لم يعد متاحاً." /></AppScreen>;

  const receiverCanRespond = offer.viewerRole === 'receiver' && (offer.status === 'pending' || offer.status === 'thinking');
  const showReceiverNoActionCard = offer.viewerRole === 'receiver' && !receiverCanRespond;
  const showSentMoment = moment === 'sent' && Boolean(offer.id);
  const swapCeremonyEnabled = isSwapCeremonyEnabled();
  const statusLabel = getOfferStatusLabel(offer.status);
  const createdLabel = useMemo(() => {
    if (!offer.createdAt) return null;
    const date = new Date(offer.createdAt);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleString('ar-EG');
  }, [offer.createdAt]);

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" style={styles.topIconButton} onPress={() => router.back()}><Ionicons name="chevron-forward" size={20} color={colors.text} /></Pressable>
        <View style={styles.topCopy}><AppText muted style={styles.eyebrow}>{offer.viewerRole === 'receiver' ? 'عرض وصلك' : 'عرضك'}</AppText><AppText weight="bold">تفاصيل العرض</AppText></View>
        <View style={styles.statusPill}><AppText style={styles.statusPillText}>{statusLabel}</AppText></View>
      </View>

      {actionMoment === 'thinking' ? <TeswaMomentCard eyebrow="تم إرسال ردك" title="الطرف الآخر عرف إنك محتاج وقت" body="العرض ما زال مفتوحًا، وردك اتسجل بوضوح." icon="hourglass-outline" tone="waiting" /> : null}
      {actionMoment === 'rejected' ? <TeswaMomentCard eyebrow="ردك وصل" title="تم رفض العرض بلطف" body="قفلنا هذا العرض بهدوء، ويمكن لصاحبه متابعة فرص أخرى." icon="heart-dislike-outline" tone="calm" /> : null}
      {showSentMoment && swapCeremonyEnabled ? <SwapCeremony status="sent" requestedItemTitle={offer.requestedItem?.title} offeredItemTitle={offer.offeredItem?.title} requestedItemImageUrl={offer.requestedItem?.imageUrl ?? undefined} offeredItemImageUrl={offer.offeredItem?.imageUrl ?? undefined} onClose={() => router.replace(`/offer/${offer.id}`)} /> : null}

      <View style={styles.statusHero}>
        <View style={styles.statusHeroIcon}><Ionicons name={statusIcon(offer.status)} size={24} color={colors.primary} /></View>
        <View style={styles.statusHeroCopy}>
          <AppText muted style={styles.eyebrow}>{statusLabel}</AppText>
          <AppText weight="bold" style={styles.statusTitle}>{statusHeadline(offer)}</AppText>
          <AppText muted style={styles.statusDescription}>{statusDescription(offer)}</AppText>
          {createdLabel ? <AppText muted style={styles.createdAt}>اتبعت: {createdLabel}</AppText> : null}
        </View>
      </View>

      <View style={styles.exchangePanel}>
        <View style={styles.exchangeHeader}><Ionicons name="swap-horizontal-outline" size={17} color={colors.primary} /><AppText weight="bold">العرض نفسه</AppText></View>
        <TradeItemCard label="المطلوب" item={offer.requestedItem} />
        <View style={styles.swapBridge}><View style={styles.swapBridgeLine} /><View style={styles.swapBridgeIcon}><Ionicons name="swap-vertical" size={18} color={colors.primary} /></View><View style={styles.swapBridgeLine} /></View>
        <TradeItemCard label="المعروض" item={offer.offeredItem} accent />
      </View>

      {offer.message ? (
        <View style={styles.messageCard}>
          <View style={styles.messageIcon}><Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} /></View>
          <View style={styles.messageCopy}><AppText muted style={styles.eyebrow}>الرسالة مع العرض</AppText><AppText style={styles.messageText}>{offer.message}</AppText></View>
        </View>
      ) : null}

      <OfferTimeline status={offer.status} viewerRole={offer.viewerRole} createdAt={offer.createdAt} dealId={offer.dealId} />

      {offer.status === 'accepted' && offer.dealId ? (
        <View style={styles.dealReadyPanel}>
          <View style={styles.dealReadyHeader}><View style={styles.dealReadyIcon}><Ionicons name="checkmark" size={20} color={colors.primary} /></View><View style={styles.dealReadyCopy}><AppText muted style={styles.eyebrow}>الخطوة الجاية</AppText><AppText weight="bold" style={styles.dealReadyTitle}>دردشة الصفقة جاهزة</AppText><AppText muted>كملوا هناك تفاصيل المعاد والمكان والتنفيذ.</AppText></View></View>
          <AppButton label="افتح دردشة الصفقة" onPress={() => router.push(`/deal/${offer.dealId}`)} />
        </View>
      ) : null}

      {offer.status === 'accepted' && !offer.dealId ? <View style={styles.infoBox}><Ionicons name="information-circle-outline" size={17} color={colors.primary} /><AppText muted style={styles.infoBoxText}>العرض مقبول، لكن تعذر تحديد دردشة الصفقة حالياً.</AppText></View> : null}

      {receiverCanRespond ? (
        <View style={styles.decisionPanel}>
          <View style={styles.decisionHeader}><View style={styles.decisionIcon}><Ionicons name="hand-left-outline" size={20} color={colors.primary} /></View><View style={styles.decisionCopy}><AppText muted style={styles.eyebrow}>قرارك</AppText><AppText weight="bold" style={styles.decisionTitle}>إيه الأنسب ليك؟</AppText><AppText muted>لو محتاج وقت أو عايز ترفض بلطف، تقدر تسيب ملاحظة قصيرة.</AppText></View></View>
          <TextInput value={note} onChangeText={setNote} placeholder="ملاحظة اختيارية..." placeholderTextColor={colors.textMuted} style={styles.input} textAlign="right" multiline maxLength={300} />
          <AppButton label={actionLoading === 'accept' ? 'جارٍ قبول العرض...' : 'قبول العرض وفتح الصفقة'} disabled={Boolean(actionLoading)} onPress={() => doAction('accept')} />
          <AppButton label={actionLoading === 'thinking' ? 'جارٍ التنفيذ...' : 'محتاج أفكر'} variant="neutral" disabled={Boolean(actionLoading)} onPress={() => doAction('thinking')} />
          <AppButton label={actionLoading === 'reject' ? 'جارٍ التنفيذ...' : 'رفض بلطف'} variant="neutral" disabled={Boolean(actionLoading)} onPress={() => doAction('reject')} />
          <AppText muted style={styles.decisionHint}>القبول بيحوّل العرض لصفقة ويفتح مساحة تنسيق بينكم.</AppText>
        </View>
      ) : null}

      {showReceiverNoActionCard ? (
        <View style={styles.infoBox}><Ionicons name="lock-closed-outline" size={17} color={colors.textMuted} /><AppText muted style={styles.infoBoxText}>القرار اتاخد على العرض بالفعل، فمفيش إجراء جديد متاح هنا دلوقتي.</AppText></View>
      ) : null}

      {error ? <View style={styles.errorBox}><Ionicons name="alert-circle-outline" size={17} color="#B42318" /><AppText style={styles.error}>{error}</AppText></View> : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  topBar: { minHeight: 52, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  topIconButton: { width: 40, height: 40, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  topCopy: { flex: 1, alignItems: 'flex-end', gap: 1 },
  eyebrow: { fontSize: 10 },
  statusPill: { borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 6, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.border },
  statusPillText: { color: colors.primary, fontSize: 11 },
  stateBox: { gap: spacing.md },
  statusHero: { marginTop: spacing.xs, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, borderWidth: 1, borderColor: '#D9B8A3', backgroundColor: '#F6E4D8', borderRadius: radii.xl, padding: spacing.md },
  statusHeroIcon: { width: 48, height: 48, borderRadius: radii.round, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  statusHeroCopy: { flex: 1, gap: 4, alignItems: 'flex-end' },
  statusTitle: { fontSize: 21, lineHeight: 27, textAlign: 'right' },
  statusDescription: { lineHeight: 20, textAlign: 'right' },
  createdAt: { fontSize: 10, marginTop: 2 },
  exchangePanel: { gap: spacing.sm, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.md },
  exchangeHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  tradeItemCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, padding: 9 },
  tradeItemCardAccent: { borderColor: '#C7DDD7', backgroundColor: colors.accentSoft },
  tradeItemImage: { width: 72, height: 72, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  tradeItemPlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  tradeItemCopy: { flex: 1, gap: 3, alignItems: 'flex-end' },
  tradeItemTitle: { fontSize: 17, textAlign: 'right' },
  metaLine: { fontSize: 10, textAlign: 'right' },
  swapBridge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm },
  swapBridgeLine: { flex: 1, height: 1, backgroundColor: colors.border },
  swapBridgeIcon: { width: 34, height: 34, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  messageCard: { marginTop: spacing.sm, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.sm },
  messageIcon: { width: 38, height: 38, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  messageCopy: { flex: 1, gap: 4, alignItems: 'flex-end' },
  messageText: { lineHeight: 21, textAlign: 'right' },
  dealReadyPanel: { gap: spacing.sm, borderRadius: radii.xl, borderWidth: 1, borderColor: '#C7DDD7', backgroundColor: colors.accentSoft, padding: spacing.md },
  dealReadyHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  dealReadyIcon: { width: 44, height: 44, borderRadius: radii.round, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  dealReadyCopy: { flex: 1, gap: 3, alignItems: 'flex-end' },
  dealReadyTitle: { fontSize: 18 },
  decisionPanel: { gap: spacing.sm, borderRadius: radii.xl, borderWidth: 1, borderColor: '#D9B8A3', backgroundColor: '#F7E8DD', padding: spacing.md },
  decisionHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm },
  decisionIcon: { width: 44, height: 44, borderRadius: radii.round, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  decisionCopy: { flex: 1, gap: 3, alignItems: 'flex-end' },
  decisionTitle: { fontSize: 18 },
  decisionHint: { fontSize: 10, lineHeight: 16, textAlign: 'right' },
  input: { minHeight: 76, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, color: colors.text, backgroundColor: colors.background, textAlignVertical: 'top' },
  infoBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface, padding: spacing.sm },
  infoBoxText: { flex: 1, textAlign: 'right' },
  errorBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, borderRadius: radii.lg, borderWidth: 1, borderColor: '#F0C7C1', backgroundColor: '#FFF2F0', padding: spacing.sm },
  error: { color: '#B42318', flex: 1, textAlign: 'right' },
});
