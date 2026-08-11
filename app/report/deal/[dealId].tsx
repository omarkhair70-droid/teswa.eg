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
import { fetchDealReportContext, type ReportReason, submitDealReport } from '@/lib/reports';

const REASONS: ReportReasonOption[] = [
  { value: 'no_show', label: 'عدم الحضور أو الإخلال بالاتفاق', description: 'الطرف الآخر ما التزمش بالموعد أو بالاتفاق الأساسي.' },
  { value: 'unsafe_behavior', label: 'سلوك غير آمن', description: 'حصل تصرف خلّى التنسيق أو المقابلة غير آمنة.' },
  { value: 'fraud', label: 'احتيال أو تضليل', description: 'في محاولة خداع أو تغيير جوهري في الاتفاق.' },
  { value: 'harassment', label: 'مضايقة أو إساءة', description: 'حصلت إساءة أو ضغط أو تهديد أثناء الصفقة.' },
  { value: 'misleading_item', label: 'العنصر مختلف عن الاتفاق', description: 'الوصف أو حالة العنصر ما كانتش مطابقة لما اتفقتم عليه.' },
  { value: 'other', label: 'سبب آخر', description: 'لو المشكلة مش موجودة ضمن الأسباب السابقة.' },
];

export default function DealReportScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { dealId } = useLocalSearchParams<{ dealId: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<any>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);

  const goBack = useCallback(() => {
    if (dealId) router.replace(`/deal/${dealId}`);
    else router.back();
  }, [dealId, router]);

  const load = useCallback(async () => {
    if (!user?.id || !dealId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDealReportContext(dealId, user.id);
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
  }, [dealId, user?.id]);

  useEffect(() => { void load(); }, [load]);

  const canSubmit = useMemo(
    () => Boolean(reason) && (reason !== 'other' || Boolean(details.trim())) && !submitting,
    [reason, details, submitting],
  );

  const onSubmit = useCallback(async () => {
    if (!reason || !user?.id || !dealId || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitDealReport({ dealId, currentUserId: user.id, reason, details });
      if (!result.ok) setError(result.message);
      else setDone(true);
    } catch {
      setError('تعذر إرسال البلاغ حالياً.');
    } finally {
      setSubmitting(false);
    }
  }, [reason, user?.id, dealId, details, canSubmit]);

  if (!user?.id) return <AppScreen backgroundVariant="soft"><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً لإرسال البلاغ." /></AppScreen>;
  if (!dealId) return <AppScreen backgroundVariant="soft"><EmptyState title="رابط غير صالح" description="تعذر تحديد الصفقة المطلوبة." /></AppScreen>;
  if (loading) return <AppScreen backgroundVariant="soft"><EmptyState title="بنجهز البلاغ" description="ثواني ونتأكد من الصفقة والطرف الآخر." /></AppScreen>;
  if (!context) return <AppScreen backgroundVariant="soft"><View style={{ gap: spacing.sm }}><EmptyState title="تعذر فتح البلاغ" description={error ?? 'تعذر فتح الشاشة حالياً.'} /><AppButton label="الرجوع للصفقة" onPress={goBack} /><AppButton label="إعادة المحاولة" onPress={load} variant="neutral" /></View></AppScreen>;
  if (done) return <ReportSuccessScreen onBack={goBack} backLabel="الرجوع للصفقة" />;

  return (
    <ReportExperience
      eyebrow="أمان الصفقة"
      title="الإبلاغ عن مشكلة"
      description="البلاغ هنا مرتبط بالصفقة والطرف الآخر، وبيساعد فريق المراجعة يفهم السياق بدل بلاغ عام من غير تفاصيل."
      subjectLabel="الطرف الآخر في الصفقة"
      subjectName={context.reportedUser.displayName ?? 'مستخدم'}
      subjectHandle={context.reportedUser.username}
      subjectAvatarUrl={context.reportedUser.avatarUrl}
      subjectMeta="البلاغ مربوط بالصفقة الحالية عشان المراجعة تشوف السياق الصحيح."
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
