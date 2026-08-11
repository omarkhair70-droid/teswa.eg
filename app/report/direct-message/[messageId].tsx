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
import {
  fetchDirectMessageReportContext,
  type ReportReason,
  submitDirectMessageReport,
} from '@/lib/reports';

const REASONS: ReportReasonOption[] = [
  { value: 'harassment', label: 'مضايقة أو إساءة', description: 'الرسالة فيها إهانة، ضغط، تهديد أو مضايقة.' },
  { value: 'fraud', label: 'احتيال أو محاولة خداع', description: 'الرسالة بتحاول تطلب حاجة مريبة أو تخدعك.' },
  { value: 'unsafe_behavior', label: 'سلوك غير آمن', description: 'الرسالة فيها اقتراح أو تصرف ممكن يعرّضك للخطر.' },
  { value: 'spam_offer', label: 'إزعاج أو تكرار', description: 'رسالة مزعجة أو تواصل متكرر وغير مرغوب فيه.' },
  { value: 'inappropriate_content', label: 'محتوى غير مناسب', description: 'الرسالة فيها محتوى غير مناسب لتجربة تِسوى.' },
  { value: 'other', label: 'سبب آخر', description: 'اختاره لو المشكلة مش موجودة ضمن الأسباب السابقة.' },
];

export default function DirectMessageReportScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{
    messageId?: string | string[];
    conversationId?: string | string[];
    reportedUserId?: string | string[];
  }>();
  const messageId = Array.isArray(params.messageId) ? params.messageId[0] ?? '' : params.messageId ?? '';
  const conversationId = Array.isArray(params.conversationId) ? params.conversationId[0] ?? '' : params.conversationId ?? '';
  const reportedUserId = Array.isArray(params.reportedUserId) ? params.reportedUserId[0] ?? '' : params.reportedUserId ?? '';

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<any>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);

  const goBack = useCallback(() => {
    if (conversationId) router.replace(`/direct/${conversationId}`);
    else router.back();
  }, [conversationId, router]);

  const load = useCallback(async () => {
    if (!user?.id || !messageId || !conversationId || !reportedUserId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDirectMessageReportContext({
        conversationId,
        messageId,
        reportedUserId,
        currentUserId: user.id,
      });
      if (!result.ok) {
        setContext(null);
        setError(result.message);
      } else {
        setContext(result.context);
      }
    } catch {
      setContext(null);
      setError('تعذر تحميل بيانات الرسالة حالياً.');
    } finally {
      setLoading(false);
    }
  }, [conversationId, messageId, reportedUserId, user?.id]);

  useEffect(() => { void load(); }, [load]);

  const canSubmit = useMemo(
    () => Boolean(reason) && (reason !== 'other' || Boolean(details.trim())) && !submitting,
    [details, reason, submitting],
  );

  const onSubmit = useCallback(async () => {
    if (!reason || !canSubmit || !context) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitDirectMessageReport({
        conversationId: context.conversationId,
        messageId: context.messageId,
        reportedUserId: context.reportedUser.id,
        reason,
        details,
      });
      if (!result.ok) setError(result.message);
      else setDone(true);
    } catch {
      setError('تعذر إرسال البلاغ حالياً.');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, context, details, reason]);

  if (!user?.id) return <AppScreen backgroundVariant="soft"><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً لإرسال البلاغ." /></AppScreen>;
  if (!messageId || !conversationId || !reportedUserId) return <AppScreen backgroundVariant="soft"><EmptyState title="رابط غير صالح" description="تعذر تحديد الرسالة المطلوبة." /></AppScreen>;
  if (loading) return <AppScreen backgroundVariant="soft"><EmptyState title="بنجهز البلاغ" description="ثواني ونتأكد من الرسالة وصاحبها." /></AppScreen>;
  if (!context) return <AppScreen backgroundVariant="soft"><View style={{ gap: spacing.sm }}><EmptyState title="تعذر فتح البلاغ" description={error ?? 'تعذر فتح الشاشة حالياً.'} /><AppButton label="الرجوع للمحادثة" onPress={goBack} /><AppButton label="إعادة المحاولة" onPress={load} variant="neutral" /></View></AppScreen>;
  if (done) return <ReportSuccessScreen onBack={goBack} backLabel="الرجوع للمحادثة" />;

  return (
    <ReportExperience
      eyebrow="أمان المحادثة"
      title="الإبلاغ عن رسالة"
      description="اختار السبب اللي يصف الرسالة نفسها. مش هنفترض نوع المخالفة عنك."
      subjectLabel="صاحب الرسالة"
      subjectName={context.reportedUser.displayName ?? 'مستخدم'}
      subjectHandle={context.reportedUser.username}
      subjectAvatarUrl={context.reportedUser.avatarUrl}
      subjectMeta={context.preview}
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
