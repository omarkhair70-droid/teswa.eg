import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { fetchUserReportContext, ReportReason, submitUserReport } from '@/lib/reports';
import { Controller, useForm, z, zodResolver } from '@/lib/forms';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'inappropriate_content', label: 'محتوى غير مناسب' },
  { value: 'spam_offer', label: 'سلوك مزعج أو إزعاج متكرر' },
  { value: 'unsafe_behavior', label: 'سلوك غير آمن' },
  { value: 'harassment', label: 'مضايقة أو إساءة' },
  { value: 'fraud', label: 'احتيال أو انتحال' },
  { value: 'other', label: 'سبب آخر' },
];

const reportReasonValues = REASONS.map((reason) => reason.value) as [ReportReason, ...ReportReason[]];
const userReportSchema = z.object({
  reason: z.enum(reportReasonValues, { required_error: 'اختار سبب البلاغ.' }),
  details: z.string().max(800, 'التفاصيل طويلة جدًا. اختصر البلاغ شوية.').optional(),
}).superRefine((value, ctx) => {
  if (value.reason === 'other' && !value.details?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['details'], message: 'اكتب تفاصيل بسيطة عند اختيار سبب آخر.' });
  }
});

type UserReportFormValues = z.infer<typeof userReportSchema>;

export default function UserReportScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<Awaited<ReturnType<typeof fetchUserReportContext>> extends { ok: true; context: infer T } ? T : any>(null);
  const [done, setDone] = useState(false);
  const { control, handleSubmit, watch, formState: { errors, isValid } } = useForm<UserReportFormValues>({
    resolver: zodResolver(userReportSchema),
    mode: 'onChange',
    defaultValues: { details: '' },
  });
  const selectedReason = watch('reason');

  const load = useCallback(async () => {
    if (!user?.id || !userId) return;
    setLoading(true); setError(null);
    try {
      const result = await fetchUserReportContext(userId, user.id);
      if (!result.ok) { setContext(null); setError(result.message); }
      else setContext(result.context);
    } catch { setContext(null); setError('تعذر تحميل بيانات البلاغ حالياً.'); }
    finally { setLoading(false); }
  }, [user?.id, userId]);

  useEffect(() => { void load(); }, [load]);
  const canSubmit = useMemo(() => isValid && !submitting, [isValid, submitting]);

  const onSubmit = useCallback(async (values: UserReportFormValues) => {
    if (!user?.id || !userId || submitting) return;
    setSubmitting(true); setError(null);
    try {
      const result = await submitUserReport({ reportedUserId: userId, currentUserId: user.id, reason: values.reason, details: values.details ?? '' });
      if (!result.ok) setError(result.message); else setDone(true);
    } catch { setError('تعذر إرسال البلاغ حالياً.'); }
    finally { setSubmitting(false); }
  }, [submitting, user?.id, userId]);

  if (!user?.id) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً لإرسال البلاغ." /></AppScreen>;
  if (!userId) return <AppScreen><EmptyState title="رابط غير صالح" description="تعذر تحديد المستخدم المطلوب." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="جاري التحميل" description="نجهز لك شاشة البلاغ." /></AppScreen>;
  if (!context) return <AppScreen><View style={styles.group}><EmptyState title="تعذر فتح البلاغ" description={error ?? 'تعذر فتح الشاشة حالياً.'} /><AppButton label="الرجوع للملف" onPress={() => router.push(`/profile/${userId}`)} /><AppButton label="إعادة المحاولة" onPress={load} variant="neutral" /></View></AppScreen>;
  if (done) return <AppScreen><View style={styles.group}><EmptyState title="تم استلام بلاغك" description="شكرًا لتعاونك. فريقنا يراجع البلاغات وفق سياسات الأمان." /><AppButton label="الرجوع للملف" onPress={() => router.push(`/profile/${userId}`)} /></View></AppScreen>;

  return <AppScreen scrollable><View style={styles.group}><AppCard><View style={styles.group}><AppText weight="bold" style={styles.title}>الإبلاغ عن المستخدم</AppText><AppText weight="semibold">بلاغ ضد هذا المستخدم</AppText><AppText>{context.reportedUser.displayName ?? 'مستخدم'}</AppText>{context.reportedUser.username ? <AppText muted>@{context.reportedUser.username}</AppText> : null}</View></AppCard><AppCard><View style={styles.group}><AppText weight="semibold">سبب البلاغ</AppText><Controller control={control} name="reason" render={({ field: { onChange, value } }) => <>{REASONS.map((item) => <Pressable key={item.value} onPress={() => onChange(item.value)} style={[styles.reason, value === item.value && styles.reasonSelected]}><AppText>{item.label}</AppText></Pressable>)}</>} />{errors.reason?.message ? <AppText muted>{errors.reason.message}</AppText> : null}</View></AppCard><AppCard><View style={styles.group}><AppText weight="semibold">تفاصيل إضافية</AppText><Controller control={control} name="details" render={({ field: { onBlur, onChange, value } }) => <TextInput multiline value={value ?? ''} onBlur={onBlur} onChangeText={onChange} style={styles.input} placeholder="اشرح المشكلة باختصار" textAlign="right" />} />{selectedReason === 'other' ? <AppText muted>هذا الحقل مطلوب عند اختيار "سبب آخر".</AppText> : null}{errors.details?.message ? <AppText muted>{errors.details.message}</AppText> : null}</View></AppCard>{!!error ? <AppCard><AppText muted>{error}</AppText></AppCard> : null}<AppButton label={submitting ? 'جاري إرسال البلاغ...' : 'إرسال البلاغ'} disabled={!canSubmit} onPress={handleSubmit(onSubmit)} /></View></AppScreen>;
}

const styles = StyleSheet.create({ group: { gap: spacing.sm }, title: { fontSize: 24 }, reason: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 10 }, reasonSelected: { backgroundColor: '#f5f5f5', borderColor: '#333' }, input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, minHeight: 100, padding: 12, textAlignVertical: 'top' } });