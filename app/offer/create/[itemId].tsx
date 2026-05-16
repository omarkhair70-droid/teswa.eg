import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { createSwapOffer, fetchOfferCreationContext, OfferCreationContextResult, OfferItemSummary } from '@/lib/offers';

function SummaryCard({ item }: { item: OfferItemSummary }) {
  return <AppCard><View style={styles.summary}><AppText weight="semibold">{item.title}</AppText><AppText muted>{[item.category, item.condition, item.location].filter(Boolean).join(' • ') || 'بدون تفاصيل إضافية'}</AppText></View></AppCard>;
}

export default function CreateOfferScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const { user } = useAuth();
  const [context, setContext] = useState<OfferCreationContextResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOfferedItemId, setSelectedOfferedItemId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    if (!itemId || !user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchOfferCreationContext(itemId, user.id);
      setContext(result);
    } catch (err) {
      if (__DEV__) console.log('[offer-create] load context failed', { itemId, code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
      setError('تعذر تحميل بيانات العرض حالياً. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }, [itemId, user?.id]);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  const canSubmit = useMemo(() => Boolean(selectedOfferedItemId) && !submitting, [selectedOfferedItemId, submitting]);

  const onSubmit = useCallback(async () => {
    if (!itemId || !user?.id || !selectedOfferedItemId || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createSwapOffer({ requestedItemId: itemId, offeredItemId: selectedOfferedItemId, message, currentUserId: user.id });
      if (!result.ok) {
        setSubmitError(result.message);
        return;
      }
      router.replace(`/offer/${result.offerId}`);
    } catch (err) {
      if (__DEV__) console.log('[offer-create] submit failed', { itemId, offeredItemId: selectedOfferedItemId, code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
      setSubmitError('تعذر إرسال العرض حالياً. حاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  }, [itemId, message, selectedOfferedItemId, submitting, user?.id]);

  if (!itemId) return <AppScreen><EmptyState title="رابط غير صالح" description="تعذر تحديد العنصر المطلوب." /></AppScreen>;
  if (!user?.id) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="لازم تسجل دخولك قبل إرسال عرض تبديل." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="جاري التحميل" description="نجهز لك شاشة إرسال العرض." /></AppScreen>;
  if (error) return <AppScreen><View style={styles.stateBox}><EmptyState title="خطأ" description={error} /><AppButton label="إعادة المحاولة" onPress={loadContext} /></View></AppScreen>;
  if (!context) return <AppScreen><EmptyState title="تعذر تحميل البيانات" description="حاول مرة أخرى." /></AppScreen>;
  if (!context.ok) return <AppScreen><View style={styles.stateBox}><EmptyState title="لا يمكن إنشاء العرض" description={context.message} /><AppButton label="رجوع" variant="neutral" onPress={() => router.back()} /></View></AppScreen>;

  const noOfferableItems = context.myActiveItems.length === 0;

  return (
    <AppScreen scrollable>
      <View style={styles.section}>
        <AppText weight="bold" style={styles.header}>اعرض تبديل</AppText>
        <AppText muted>اختر عنصر من عناصرك النشطة وأرسل عرض تبديل مباشر لصاحب العنصر.</AppText>
      </View>

      <View style={styles.section}>
        <AppText weight="semibold">العنصر المطلوب</AppText>
        <SummaryCard item={context.requestedItem} />
      </View>

      <View style={styles.section}>
        <AppText weight="semibold">اختر ما ستعرضه</AppText>
        {noOfferableItems ? (
          <View style={styles.stateBox}>
            <EmptyState title="لا توجد عناصر نشطة" description="أضف عنصرًا أولًا علشان تقدر تعرض تبديل." />
            <AppButton label="إضافة عنصر" onPress={() => router.push('/(tabs)/add')} />
          </View>
        ) : context.myActiveItems.map((item) => {
          const selected = selectedOfferedItemId === item.id;
          return (
            <Pressable key={item.id} style={[styles.selectable, selected && styles.selected]} onPress={() => setSelectedOfferedItemId(item.id)}>
              {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbPlaceholder]} />}
              <View style={styles.selectableContent}>
                <AppText weight="semibold">{item.title}</AppText>
                <AppText muted numberOfLines={1}>{[item.category, item.condition, item.location].filter(Boolean).join(' • ') || 'بدون تفاصيل إضافية'}</AppText>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.section}>
        <AppText weight="semibold">رسالة (اختيارية)</AppText>
        <AppInput value={message} onChangeText={setMessage} placeholder="اكتب رسالة قصيرة لصاحب العنصر" multiline numberOfLines={4} maxLength={500} style={styles.messageInput} />
      </View>

      {submitError ? <AppText style={styles.errorText}>{submitError}</AppText> : null}
      <AppButton label={submitting ? 'جاري إرسال العرض...' : 'إرسال العرض'} disabled={!canSubmit} onPress={onSubmit} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  header: { fontSize: 24 },
  stateBox: { gap: spacing.md },
  summary: { gap: spacing.xs },
  selectable: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  selected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  selectableContent: { flex: 1, gap: spacing.xs },
  thumb: { width: 56, height: 56, borderRadius: radii.sm, backgroundColor: colors.primarySoft },
  thumbPlaceholder: { borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  messageInput: { minHeight: 100, textAlignVertical: 'top' },
  errorText: { color: '#B42318' },
});
