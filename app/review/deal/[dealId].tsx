import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppScreen } from '@/components/ui/AppScreen';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { type DealReviewContext, type ExistingDealReview, fetchDealReviewContext, submitDealReview } from '@/lib/reviews';

function formatResponseRate(responseRate: number | null): string {
  if (responseRate == null || Number.isNaN(responseRate)) return 'غير متاح بعد';
  return `${Math.round(Math.max(0, Math.min(100, responseRate)))}%`;
}

function ratingLabel(rating: number | null) {
  if (rating === 1) return 'التجربة محتاجة تتحسن';
  if (rating === 2) return 'تجربة مقبولة';
  if (rating === 3) return 'تجربة كويسة';
  if (rating === 4) return 'تجربة ممتازة';
  if (rating === 5) return 'تجربة جميلة جدًا';
  return 'اختار تقييمك العام';
}

export default function DealReviewScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { dealId } = useLocalSearchParams<{ dealId: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [context, setContext] = useState<DealReviewContext | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [clearDescription, setClearDescription] = useState(false);
  const [goodCommunication, setGoodCommunication] = useState(false);
  const [onTime, setOnTime] = useState(false);
  const [respectfulSwapper, setRespectfulSwapper] = useState(false);
  const [done, setDone] = useState(false);

  const goToDealRoom = useCallback(() => {
    if (!dealId) {
      router.replace('/(tabs)/messages');
      return;
    }
    router.replace(`/deal/${dealId}`);
  }, [dealId, router]);

  const load = useCallback(async () => {
    if (!user?.id || !dealId) return;
    setLoading(true);
    setError(null);
    setReason(null);
    try {
      const result = await fetchDealReviewContext(dealId, user.id);
      if (!result.ok) {
        setContext(null);
        setReason(result.reason);
        setError(result.message);
      } else {
        setContext(result.context);
      }
    } catch {
      setError('تعذر تحميل بيانات التقييم حالياً.');
      setReason('unknown');
    } finally {
      setLoading(false);
    }
  }, [dealId, user?.id]);

  useEffect(() => { load(); }, [load]);

  const trustTags = useMemo(() => [
    { key: 'clearDescription', label: 'الوصف كان واضح', icon: 'document-text-outline' as const, value: clearDescription, set: setClearDescription },
    { key: 'goodCommunication', label: 'التواصل كان جيد', icon: 'chatbubbles-outline' as const, value: goodCommunication, set: setGoodCommunication },
    { key: 'onTime', label: 'ملتزم بالميعاد', icon: 'time-outline' as const, value: onTime, set: setOnTime },
    { key: 'respectfulSwapper', label: 'محترم في التبديل', icon: 'heart-outline' as const, value: respectfulSwapper, set: setRespectfulSwapper },
  ], [clearDescription, goodCommunication, onTime, respectfulSwapper]);

  const existingReview = context?.existingReview as ExistingDealReview | null | undefined;

  const onSubmit = useCallback(async () => {
    if (!user?.id || !dealId || !rating || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitDealReview({ dealId, currentUserId: user.id, rating, comment, clearDescription, goodCommunication, onTime, respectfulSwapper });
      if (!result.ok) {
        setError(result.message);
        if (result.reason === 'duplicate') await load();
      } else {
        setDone(true);
      }
    } catch {
      setError('تعذر إرسال التقييم حالياً.');
    } finally {
      setSubmitting(false);
    }
  }, [user?.id, dealId, rating, comment, clearDescription, goodCommunication, onTime, respectfulSwapper, submitting, load]);

  if (!user?.id) return <AppScreen backgroundVariant="soft"><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً لإرسال تقييم الصفقة." /></AppScreen>;
  if (!dealId) return <AppScreen backgroundVariant="soft"><View style={styles.stateBox}><EmptyState title="رابط غير صالح" description="تعذر تحديد الصفقة المطلوبة." /><AppButton label="العودة للرسائل" onPress={() => router.replace('/(tabs)/messages')} /></View></AppScreen>;
  if (loading) return <AppScreen backgroundVariant="soft"><EmptyState title="بنجهز التقييم" description="ثواني ونجهز تجربة المقايضة اللي تمت." /></AppScreen>;
  if (reason && !context) return <AppScreen backgroundVariant="soft"><View style={styles.stateBox}><EmptyState title="تعذر فتح التقييم" description={error ?? 'تعذر فتح شاشة التقييم حالياً.'} /><AppButton label={reason === 'unauthorized' ? 'العودة للرئيسية' : 'الرجوع للصفقة'} onPress={() => reason === 'unauthorized' ? router.replace('/(tabs)/home') : goToDealRoom()} /><AppButton label="إعادة المحاولة" onPress={load} variant="neutral" /></View></AppScreen>;

  if (done) {
    return (
      <AppScreen backgroundVariant="alive">
        <View style={styles.successScreen}>
          <View style={styles.successIcon}><Ionicons name="heart" size={30} color={colors.primary} /></View>
          <AppText muted style={styles.eyebrow}>التقييم اتسجل</AppText>
          <AppText weight="bold" style={styles.successTitle}>شكراً إنك قفلت التجربة لآخرها</AppText>
          <AppText muted style={styles.successText}>تقييمك بيساعد الناس تعرف تتعامل بثقة، وبيخلي المقايضات الجاية أوضح للجميع.</AppText>
          <AppButton label="الرجوع للصفقة" onPress={goToDealRoom} />
          <AppButton label="العودة للرسائل" variant="neutral" onPress={() => router.replace('/(tabs)/messages')} />
        </View>
      </AppScreen>
    );
  }

  if (existingReview) {
    const existingTags = [
      existingReview.clearDescription ? 'الوصف كان واضح' : null,
      existingReview.goodCommunication ? 'التواصل كان جيد' : null,
      existingReview.onTime ? 'ملتزم بالميعاد' : null,
      existingReview.respectfulSwapper ? 'محترم في التبديل' : null,
    ].filter(Boolean) as string[];
    return (
      <AppScreen scrollable backgroundVariant="alive">
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="رجوع" style={styles.topIconButton} onPress={goToDealRoom}><Ionicons name="chevron-forward" size={20} color={colors.text} /></Pressable>
          <View style={styles.topCopy}><AppText muted style={styles.eyebrow}>تجربة مكتملة</AppText><AppText weight="bold">تقييم المقايضة</AppText></View>
        </View>
        <View style={styles.existingPanel}>
          <View style={styles.existingHeader}><View style={styles.existingIcon}><Ionicons name="checkmark" size={22} color={colors.primary} /></View><View style={styles.existingCopy}><AppText muted style={styles.eyebrow}>اتسجل قبل كده</AppText><AppText weight="bold" style={styles.sectionTitle}>تقييمك محفوظ</AppText></View></View>
          <View style={styles.readOnlyStars}>{[1, 2, 3, 4, 5].map((value) => <Ionicons key={value} name={value <= existingReview.rating ? 'star' : 'star-outline'} size={27} color={value <= existingReview.rating ? colors.primary : colors.textMuted} />)}</View>
          <AppText muted>{ratingLabel(existingReview.rating)}</AppText>
          {existingTags.length ? <View style={styles.selectedTags}>{existingTags.map((tag) => <View key={tag} style={styles.savedTag}><Ionicons name="checkmark-circle" size={15} color={colors.primary} /><AppText muted>{tag}</AppText></View>)}</View> : null}
          {existingReview.comment ? <View style={styles.savedComment}><AppText muted style={styles.eyebrow}>ملاحظتك</AppText><AppText style={styles.commentText}>{existingReview.comment}</AppText></View> : null}
          <AppButton label="الرجوع للصفقة" onPress={goToDealRoom} />
        </View>
      </AppScreen>
    );
  }

  if (!context) return <AppScreen backgroundVariant="soft"><EmptyState title="تعذر تجهيز التقييم" description="حاول فتح الصفقة مرة أخرى." /></AppScreen>;

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" style={styles.topIconButton} onPress={goToDealRoom}><Ionicons name="chevron-forward" size={20} color={colors.text} /></Pressable>
        <View style={styles.topCopy}><AppText muted style={styles.eyebrow}>الصفقة اكتملت</AppText><AppText weight="bold">قيّم التجربة</AppText></View>
        <View style={styles.donePill}><Ionicons name="checkmark-circle-outline" size={15} color={colors.primary} /><AppText style={styles.donePillText}>تمت</AppText></View>
      </View>

      <View style={styles.revieweeHero}>
        {context.reviewee.avatarUrl ? <Image source={{ uri: context.reviewee.avatarUrl }} style={styles.avatar} /> : <View style={styles.avatarFallback}><AppText weight="bold" style={styles.avatarLetter}>{(context.reviewee.displayName?.trim()?.[0] ?? '؟').toUpperCase()}</AppText></View>}
        <View style={styles.revieweeCopy}>
          <AppText muted style={styles.eyebrow}>أنت بتقيّم</AppText>
          <AppText weight="bold" style={styles.revieweeName}>{context.reviewee.displayName ?? 'مستخدم'}</AppText>
          {context.reviewee.username ? <AppText muted>@{context.reviewee.username}</AppText> : null}
          <View style={styles.trustMeta}><AppText muted style={styles.metaText}>{context.reviewee.successfulSwapsCount ?? 0} مقايضات ناجحة</AppText><View style={styles.metaDot} /><AppText muted style={styles.metaText}>{formatResponseRate(context.reviewee.responseRate)} معدل الرد</AppText></View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="عرض الملف العام" style={styles.profileButton} onPress={() => router.push(`/profile/${context.reviewee.id}`)}><Ionicons name="person-outline" size={18} color={colors.text} /></Pressable>
      </View>

      <View style={styles.ratingPanel}>
        <View style={styles.sectionHeader}><View style={styles.sectionIcon}><Ionicons name="star-outline" size={19} color={colors.primary} /></View><View style={styles.sectionCopy}><AppText muted style={styles.eyebrow}>التقييم العام</AppText><AppText weight="bold" style={styles.sectionTitle}>{ratingLabel(rating)}</AppText></View></View>
        <View style={styles.starRow}>
          {[1, 2, 3, 4, 5].map((value) => {
            const active = rating != null && value <= rating;
            return <Pressable key={value} accessibilityRole="button" accessibilityLabel={`${value} من 5`} accessibilityState={{ selected: rating === value }} style={[styles.starButton, rating === value && styles.starButtonSelected]} onPress={() => setRating(value)}><Ionicons name={active ? 'star' : 'star-outline'} size={29} color={active ? colors.primary : colors.textMuted} /></Pressable>;
          })}
        </View>
        <AppText muted style={styles.ratingHint}>اختيار واحد من 5 كفاية، وبعدها التفاصيل اختيارية.</AppText>
      </View>

      <View style={styles.trustPanel}>
        <View style={styles.sectionHeader}><View style={styles.sectionIcon}><Ionicons name="shield-checkmark-outline" size={19} color={colors.primary} /></View><View style={styles.sectionCopy}><AppText muted style={styles.eyebrow}>تفاصيل الثقة</AppText><AppText weight="bold" style={styles.sectionTitle}>إيه اللي كان كويس؟</AppText></View></View>
        <View style={styles.tagGrid}>{trustTags.map((tag) => <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: tag.value }} key={tag.key} onPress={() => tag.set(!tag.value)} style={[styles.trustTag, tag.value && styles.trustTagOn]}><View style={[styles.tagCheck, tag.value && styles.tagCheckOn]}><Ionicons name={tag.value ? 'checkmark' : tag.icon} size={16} color={tag.value ? colors.white : colors.primary} /></View><AppText style={styles.tagLabel}>{tag.label}</AppText></Pressable>)}</View>
      </View>

      <View style={styles.commentPanel}>
        <View style={styles.sectionHeader}><View style={styles.sectionIcon}><Ionicons name="chatbubble-ellipses-outline" size={19} color={colors.primary} /></View><View style={styles.sectionCopy}><AppText muted style={styles.eyebrow}>اختياري</AppText><AppText weight="bold" style={styles.sectionTitle}>سيب ملاحظة قصيرة</AppText></View></View>
        <TextInput multiline value={comment} onChangeText={setComment} maxLength={500} style={styles.input} placeholder="مثلاً: التعامل كان سهل والاتفاق تم زي ما اتفقنا..." placeholderTextColor={colors.textMuted} textAlign="right" textAlignVertical="top" />
        <AppText muted style={styles.characterCount}>{comment.length}/500</AppText>
      </View>

      {error ? <View style={styles.errorBox}><Ionicons name="alert-circle-outline" size={17} color="#B42318" /><AppText style={styles.errorText}>{error}</AppText></View> : null}

      <View style={styles.submitPanel}>
        <AppButton label={submitting ? 'جاري إرسال التقييم...' : rating ? 'إرسال التقييم' : 'اختار التقييم العام الأول'} disabled={!rating || submitting} onPress={onSubmit} />
        <AppText muted style={styles.submitHint}>التقييم بيتسجل مرة واحدة للصفقة دي وبيساهم في إشارات الثقة على تِسوى.</AppText>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  stateBox: { gap: spacing.sm },
  topBar: { minHeight: 52, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  topIconButton: { width: 40, height: 40, borderRadius: radii.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  topCopy: { flex: 1, alignItems: 'flex-end', gap: 1 },
  eyebrow: { fontSize: 10 },
  donePill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, borderRadius: radii.round, borderWidth: 1, borderColor: '#C7DDD7', backgroundColor: colors.accentSoft, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  donePillText: { color: colors.primary, fontSize: 10 },
  revieweeHero: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs, borderRadius: radii.xl, borderWidth: 1, borderColor: '#D9B8A3', backgroundColor: '#F7E8DD', padding: spacing.sm },
  avatar: { width: 58, height: 58, borderRadius: radii.round },
  avatarFallback: { width: 58, height: 58, borderRadius: radii.round, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 20 },
  revieweeCopy: { flex: 1, gap: 2, alignItems: 'flex-end' },
  revieweeName: { fontSize: 18 },
  trustMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  metaText: { fontSize: 10 },
  metaDot: { width: 3, height: 3, borderRadius: radii.round, backgroundColor: colors.border },
  profileButton: { width: 40, height: 40, borderRadius: radii.round, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  ratingPanel: { gap: spacing.sm, marginTop: spacing.sm, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  sectionIcon: { width: 40, height: 40, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  sectionCopy: { flex: 1, gap: 2, alignItems: 'flex-end' },
  sectionTitle: { fontSize: 17, textAlign: 'right' },
  starRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 6 },
  starButton: { flex: 1, minHeight: 52, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  starButtonSelected: { borderColor: '#D9B8A3', backgroundColor: '#F7E8DD' },
  ratingHint: { fontSize: 10, textAlign: 'right' },
  trustPanel: { gap: spacing.sm, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md },
  tagGrid: { gap: spacing.xs },
  trustTag: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, minHeight: 48, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, paddingHorizontal: spacing.sm, paddingVertical: 7 },
  trustTagOn: { borderColor: '#C7DDD7', backgroundColor: colors.accentSoft },
  tagCheck: { width: 30, height: 30, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  tagCheckOn: { backgroundColor: colors.primary },
  tagLabel: { flex: 1, textAlign: 'right' },
  commentPanel: { gap: spacing.sm, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md },
  input: { minHeight: 110, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, color: colors.text, backgroundColor: colors.background },
  characterCount: { fontSize: 10, alignSelf: 'flex-start' },
  errorBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, borderRadius: radii.lg, borderWidth: 1, borderColor: '#F0C7C1', backgroundColor: '#FFF2F0', padding: spacing.sm },
  errorText: { flex: 1, color: '#B42318', textAlign: 'right' },
  submitPanel: { gap: spacing.xs, borderRadius: radii.xl, borderWidth: 1, borderColor: '#D9B8A3', backgroundColor: '#F6E4D8', padding: spacing.md },
  submitHint: { fontSize: 10, lineHeight: 16, textAlign: 'right' },
  successScreen: { gap: spacing.sm, paddingTop: spacing.xl, alignItems: 'center' },
  successIcon: { width: 72, height: 72, borderRadius: radii.round, backgroundColor: '#F7E8DD', borderWidth: 1, borderColor: '#D9B8A3', alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 25, lineHeight: 32, textAlign: 'center' },
  successText: { textAlign: 'center', lineHeight: 21, marginBottom: spacing.sm },
  existingPanel: { gap: spacing.md, marginTop: spacing.sm, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md },
  existingHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  existingIcon: { width: 44, height: 44, borderRadius: radii.round, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  existingCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  readOnlyStars: { flexDirection: 'row-reverse', gap: 5, justifyContent: 'center' },
  selectedTags: { gap: spacing.xs },
  savedTag: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, borderRadius: radii.round, backgroundColor: colors.accentSoft, paddingHorizontal: spacing.sm, paddingVertical: 7 },
  savedComment: { gap: 4, borderRadius: radii.lg, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  commentText: { textAlign: 'right', lineHeight: 20 },
});
