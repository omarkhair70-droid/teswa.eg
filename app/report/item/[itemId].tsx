import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppButton } from '@/components/ui/AppButton';
import { ReportExperience, type ReportReasonOption } from '@/components/reports/ReportExperience';
import { ReportSuccessScreen } from '@/components/reports/ReportSuccessScreen';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { fetchItemReportContext, type ReportReason, submitItemReport } from '@/lib/reports';

const REASONS: ReportReasonOption[] = [
  { value: 'misleading_item', label: 'الوصف أو الصور مضللة', description: 'العنصر مختلف بشكل واضح عن الوصف أو الصور المعروضة.' },
  { value: 'fraud', label: 'احتيال أو تضليل', description: 'العرض فيه مؤشرات خداع أو محاولة استغلال.' },
  { value: 'inappropriate_content', label: 'محتوى غير مناسب', description: 'الصور أو النص غير مناسبين لتجربة تِسوى.' },
  { value: 'spam_offer', label: 'محتوى مزعج أو مكرر', description: 'إعلان مكرر أو محتوى هدفه الإزعاج بدل المقايضة.' },
  { value: 'other', label: 'سبب آخر', description: 'لو المشكلة مش موجودة ضمن الأسباب السابقة.' },
];

export default function ItemReportScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<any>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);

  const goBack = useCallback(() => {
    if (itemId) router.replace(`/item/${itemId}`);
    else router.back();
  }, [itemId, router]);

  const load = useCallback(async () => {
    if (!user?.id || !itemId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchItemReportContext(itemId, user.id);
      if (!result.ok) {
        setContext(null);
        setError(result.message);
      } else {
        setContext(result.context);
      }
    } catch {
      setContext(null);
      setError('تعذر تحميل بيانات البلاغ حالياً.');
    } finally {
      setLoading(false);
    }
  }, [itemId, user?.id]);

  useEffect(() => { void load(); }, [load]);

  const canSubmit = useMemo(
    () => Boolean(reason) && (reason !== 'other' || Boolean(details.trim())) && !submitting,
    [reason, details, submitting],
  );

  const onSubmit = useCallback(async () => {
    if (!reason || !user?.id || !itemId || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitItemReport({ itemId, currentUserId: user.id, reason, details });
      if (!result.ok) setError(result.message);
      else setDone(true);
    } catch {
      setError('تعذر إرسال البلاغ حالياً.');
    } finally {
      setSubmitting(false);
    }
  }, [reason, user?.id, itemId, details, canSubmit]);

  if (!user?.id) return <AppScreen backgroundVariant="soft"><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً لإرسال البلاغ." /></AppScreen>;
  if (!itemId) return <AppScreen backgroundVariant="soft"><EmptyState title="رابط غير صالح" description="تعذر تحديد العنصر المطلوب." /></AppScreen>;
  if (loading) return <AppScreen backgroundVariant="soft"><EmptyState title="بنجهز البلاغ" description="ثواني ونتأكد من العنصر وصاحبه." /></AppScreen>;
  if (!context) return <AppScreen backgroundVariant="soft"><View style={{ gap: spacing.sm }}><EmptyState title="تعذر فتح البلاغ" description={error ?? 'تعذر فتح الشاشة حالياً.'} /><AppButton label="الرجوع للعنصر" onPress={goBack} /><AppButton label="إعادة المحاولة" onPress={load} variant="neutral" /></View></AppScreen>;
  if (done) return <ReportSuccessScreen onBack={goBack} backLabel="الرجوع للعنصر" />;

  return (
    <ReportExperience
      eyebrow="سلامة العروض"
      title="الإبلاغ عن عنصر"
      description="اختار المشكلة الموجودة في الإعلان نفسه. لو المشكلة في تصرف صاحب الحساب، تقدر تبلغ عن الحساب من ملفه."
      subjectLabel="العنصر المُبلّغ عنه"
      subjectName={context.title}
      subjectHandle={context.owner.username}
      subjectAvatarUrl={context.owner.avatarUrl}
      subjectMeta={`صاحب العنصر: ${context.owner.displayName ?? 'مستخدم'}`}
      reasons={REASONS}
      selectedReason={reason}
      onSelectReason={setReason}
      details={details}
      onChangeDetails={setDetails}
      error={error}
      submitting={submitting}
      canSubmit={canSubmit}
      onSubmit={onSubmit}
      onBack={goBack}
    />
  );
}
