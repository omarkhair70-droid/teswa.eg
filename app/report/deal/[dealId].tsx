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
import { fetchDealReportContext, ReportReason, submitDealReport } from '@/lib/reports';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'misleading_item', label: 'الوصف غير دقيق' },
  { value: 'inappropriate_content', label: 'محتوى غير مناسب' },
  { value: 'spam_offer', label: 'عرض مزعج أو غير جاد' },
  { value: 'unsafe_behavior', label: 'سلوك غير آمن' },
  { value: 'no_show', label: 'عدم الحضور أو الإخلال بالاتفاق' },
  { value: 'other', label: 'سبب آخر' },
];

export default function DealReportScreen() { const { user } = useAuth(); const router = useRouter(); const { dealId } = useLocalSearchParams<{ dealId: string }>(); const [loading, setLoading] = useState(true); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState<string | null>(null); const [context, setContext] = useState<any>(null); const [reason, setReason] = useState<ReportReason | null>(null); const [details, setDetails] = useState(''); const [done, setDone] = useState(false);
  const load = useCallback(async () => { if (!user?.id || !dealId) return; setLoading(true); setError(null); try { const result = await fetchDealReportContext(dealId, user.id); if (!result.ok) { setContext(null); setError(result.message); } else setContext(result.context); } catch { setContext(null); setError('تعذر تحميل بيانات البلاغ حالياً.'); } finally { setLoading(false); } }, [dealId, user?.id]);
  useEffect(() => { load(); }, [load]);
  const canSubmit = useMemo(() => Boolean(reason) && (reason !== 'other' || Boolean(details.trim())) && !submitting, [reason, details, submitting]);
  const onSubmit = useCallback(async () => { if (!reason || !user?.id || !dealId || !canSubmit) return; setSubmitting(true); setError(null); try { const result = await submitDealReport({ dealId, currentUserId: user.id, reason, details }); if (!result.ok) setError(result.message); else setDone(true); } catch { setError('تعذر إرسال البلاغ حالياً.'); } finally { setSubmitting(false); } }, [reason, user?.id, dealId, details, canSubmit]);
  if (!user?.id) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً لإرسال البلاغ." /></AppScreen>;
  if (!dealId) return <AppScreen><EmptyState title="رابط غير صالح" description="تعذر تحديد الصفقة المطلوبة." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="جاري التحميل" description="نجهز لك شاشة البلاغ." /></AppScreen>;
  if (!context) return <AppScreen><View style={styles.group}><EmptyState title="تعذر فتح البلاغ" description={error ?? 'تعذر فتح الشاشة حالياً.'} /><AppButton label="الرجوع للصفقة" onPress={() => router.push(`/deal/${dealId}`)} /><AppButton label="إعادة المحاولة" onPress={load} variant="neutral" /></View></AppScreen>;
  if (done) return <AppScreen><View style={styles.group}><EmptyState title="تم استلام بلاغك" description="شكرًا لتعاونك. فريقنا يراجع البلاغات وفق سياسات الأمان." /><AppButton label="الرجوع للصفقة" onPress={() => router.push(`/deal/${dealId}`)} /></View></AppScreen>;
  return <AppScreen scrollable><View style={styles.group}><AppCard><View style={styles.group}><AppText weight="bold" style={styles.title}>الإبلاغ عن مشكلة</AppText><AppText weight="semibold">بلاغ داخل هذه الصفقة</AppText><AppText>{context.reportedUser.displayName ?? 'مستخدم'}</AppText>{context.reportedUser.username ? <AppText muted>@{context.reportedUser.username}</AppText> : null}</View></AppCard><AppCard><View style={styles.group}><AppText weight="semibold">سبب البلاغ</AppText>{REASONS.map((item) => <Pressable key={item.value} onPress={() => setReason(item.value)} style={[styles.reason, reason === item.value && styles.reasonSelected]}><AppText>{item.label}</AppText></Pressable>)}</View></AppCard><AppCard><View style={styles.group}><AppText weight="semibold">تفاصيل إضافية</AppText><TextInput multiline value={details} onChangeText={setDetails} style={styles.input} placeholder="اشرح المشكلة باختصار" textAlign="right" />{reason === 'other' ? <AppText muted>هذا الحقل مطلوب عند اختيار "سبب آخر".</AppText> : null}</View></AppCard>{!!error ? <AppCard><AppText muted>{error}</AppText></AppCard> : null}<AppButton label={submitting ? 'جاري إرسال البلاغ...' : 'إرسال البلاغ'} disabled={!canSubmit} onPress={onSubmit} /></View></AppScreen>;
}

const styles = StyleSheet.create({ group: { gap: spacing.sm }, title: { fontSize: 24 }, reason: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 10 }, reasonSelected: { backgroundColor: '#f5f5f5', borderColor: '#333' }, input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, minHeight: 100, padding: 12, textAlignVertical: 'top' } });
