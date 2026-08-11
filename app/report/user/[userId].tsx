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
import { fetchUserReportContext, type ReportReason, submitUserReport } from '@/lib/reports';

const REASONS: ReportReasonOption[] = [
  { value: 'harassment', label: 'مضايقة أو إساءة', description: 'رسائل أو تصرفات فيها إساءة، ضغط أو تهديد.' },
  { value: 'fraud', label: 'احتيال أو انتحال', description: 'محاولة خداع، انتحال هوية أو طلبات غير موثوقة.' },
  { value: 'unsafe_behavior', label: 'سلوك غير آمن', description: 'تصرف ممكن يعرّضك أو يعرّض غيرك للخطر.' },
  { value: 'spam_offer', label: 'إزعاج أو تواصل متكرر', description: 'تواصل غير مرغوب فيه أو سلوك مزعج بشكل متكرر.' },
  { value: 'inappropriate_content', label: 'محتوى غير مناسب', description: 'محتوى مخالف أو غير مناسب لتجربة تِسوى.' },
  { value: 'other', label: 'سبب آخر', description: 'اختاره لو المشكلة مش موجودة ضمن الأسباب السابقة.' },
];

export default function UserReportScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<any>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);

  const goBack = useCallback(() => {
    if (userId) router.replace(`/profile/${userId}`);
    else router.back();
  }, [router, userId]);

  const load = useCallback(async () => {
    if (!user?.id || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchUserReportContext(userId, user.id);
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
  }, [user?.id, userId]);

  useEffect(() => { void load(); }, [load]);

  const canSubmit = useMemo(
    () => Boolean(reason) && (reason !== 'other' || Boolean(details.trim())) && !submitting,
    [reason, details, submitting],
  );

  const onSubmit = useCallback(async () => {
    if (!user?.id || !userId || !reason || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitUserReport({ reportedUserId: userId, currentUserId: user.id, reason, details });
      if (!result.ok) setError(result.message);
      else setDone(true);
    } catch {
      setError('تعذر إرسال البلاغ حالياً.');
    } finally {
      setSubmitting(false);
    }
  }, [user?.id, userId, reason, details, canSubmit]);

  if (!user?.id) return <AppScreen backgroundVariant="soft"><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً لإرسال البلاغ." /></AppScreen>;
  if (!userId) return <AppScreen backgroundVariant="soft"><EmptyState title="رابط غير صالح" description="تعذر تحديد المستخدم المطلوب." /></AppScreen>;
  if (loading) return <AppScreen backgroundVariant="soft"><EmptyState title="بنجهز البلاغ" description="ثواني ونتأكد من الحساب المطلوب." /></AppScreen>;
  if (!context) return <AppScreen backgroundVariant="soft"><View style={{ gap: spacing.sm }}><EmptyState title="تعذر فتح البلاغ" description={error ?? 'تعذر فتح الشاشة حالياً.'} /><AppButton label="الرجوع للملف" onPress={goBack} /><AppButton label="إعادة المحاولة" onPress={load} variant="neutral" /></View></AppScreen>;
  if (done) return <ReportSuccessScreen onBack={goBack} backLabel="الرجوع للملف" />;

  return (
    <ReportExperience
      eyebrow="أمان المجتمع"
      title="الإبلاغ عن حساب"
      description="اختار السبب الأقرب للي حصل. البلاغ المحدد بيساعد المراجعة تكون أسرع وأدق."
      subjectLabel="الحساب المُبلّغ عنه"
      subjectName={context.reportedUser.displayName ?? 'مستخدم'}
      subjectHandle={context.reportedUser.username}
      subjectAvatarUrl={context.reportedUser.avatarUrl}
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
