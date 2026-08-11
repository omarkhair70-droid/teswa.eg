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
import { fetchStoryReportContext, type ReportReason, submitStoryReport } from '@/lib/reports';

const REASONS: ReportReasonOption[] = [
  { value: 'inappropriate_content', label: 'محتوى غير مناسب', description: 'صورة، فيديو أو نص غير مناسب لتجربة تِسوى.' },
  { value: 'harassment', label: 'مضايقة أو إساءة', description: 'القصة فيها استهداف، إساءة أو مضايقة لشخص.' },
  { value: 'unsafe_behavior', label: 'سلوك غير آمن', description: 'محتوى يشجع أو يعرض سلوكاً ممكن يكون خطيراً.' },
  { value: 'fraud', label: 'احتيال أو انتحال', description: 'محتوى هدفه الخداع أو انتحال هوية أو جهة.' },
  { value: 'other', label: 'سبب آخر', description: 'لو المشكلة مش موجودة ضمن الأسباب السابقة.' },
];

export default function StoryReportScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<any>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);

  const goBack = useCallback(() => router.back(), [router]);

  const load = useCallback(async () => {
    if (!user?.id || !storyId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchStoryReportContext(storyId, user.id);
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
  }, [storyId, user?.id]);

  useEffect(() => { void load(); }, [load]);

  const canSubmit = useMemo(
    () => Boolean(reason) && (reason !== 'other' || Boolean(details.trim())) && !submitting,
    [reason, details, submitting],
  );

  const onSubmit = useCallback(async () => {
    if (!reason || !user?.id || !storyId || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitStoryReport({ storyId, currentUserId: user.id, reason, details });
      if (!result.ok) setError(result.message);
      else setDone(true);
    } catch {
      setError('تعذر إرسال البلاغ حالياً.');
    } finally {
      setSubmitting(false);
    }
  }, [reason, user?.id, storyId, details, canSubmit]);

  if (!user?.id) return <AppScreen backgroundVariant="soft"><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً لإرسال البلاغ." /></AppScreen>;
  if (!storyId) return <AppScreen backgroundVariant="soft"><EmptyState title="رابط غير صالح" description="تعذر تحديد القصة المطلوبة." /></AppScreen>;
  if (loading) return <AppScreen backgroundVariant="soft"><EmptyState title="بنجهز البلاغ" description="ثواني ونتأكد من القصة وصاحبها." /></AppScreen>;
  if (!context) return <AppScreen backgroundVariant="soft"><View style={{ gap: spacing.sm }}><EmptyState title="تعذر فتح البلاغ" description={error ?? 'تعذر فتح الشاشة حالياً.'} /><AppButton label="رجوع" onPress={goBack} /><AppButton label="إعادة المحاولة" onPress={load} variant="neutral" /></View></AppScreen>;
  if (done) return <ReportSuccessScreen onBack={goBack} backLabel="الرجوع" />;

  const caption = context.caption?.trim();
  return (
    <ReportExperience
      eyebrow="سلامة القصص"
      title="الإبلاغ عن قصة"
      description="اختار السبب المرتبط بالمحتوى الظاهر في القصة. البلاغ بيتراجع مع سياقه ومش بيظهر لصاحب القصة مين أرسله."
      subjectLabel="صاحب القصة"
      subjectName={context.author.displayName ?? 'مستخدم'}
      subjectHandle={context.author.username}
      subjectAvatarUrl={context.author.avatarUrl}
      subjectMeta={caption ? `نص القصة: ${caption}` : 'القصة بدون نص مكتوب.'}
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
