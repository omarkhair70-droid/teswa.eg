import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { checkIsAdminUser } from '@/lib/admin';
import { AdminReportStatus, AdminReportStatusFilter, AdminReportSummary, AdminReportTypeFilter, fetchAdminReports, hideReportedItem, reviewAdminReport } from '@/lib/admin-reports';

type AccessState = 'checking' | 'denied' | 'allowed';

const STATUS_FILTERS: { value: AdminReportStatusFilter; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'open', label: 'مفتوح' },
  { value: 'reviewing', label: 'قيد المراجعة' },
  { value: 'actioned', label: 'تم الإجراء' },
  { value: 'dismissed', label: 'مرفوض' },
];

const TYPE_FILTERS: { value: AdminReportTypeFilter; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'user', label: 'مستخدم' },
  { value: 'item', label: 'عنصر' },
  { value: 'story', label: 'قصة' },
  { value: 'deal', label: 'صفقة' },
  { value: 'direct_message', label: 'رسالة مباشرة' },
  { value: 'deal_message', label: 'رسالة صفقة' },
];

const STATUS_LABELS: Record<AdminReportStatus, string> = {
  open: 'مفتوح',
  reviewing: 'قيد المراجعة',
  actioned: 'تم الإجراء',
  dismissed: 'مرفوض',
};

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function reportType(report: AdminReportSummary) {
  if (report.reportedItemId) return { label: 'عنصر', reference: report.itemTitle ? `${report.itemTitle} · ${report.reportedItemId}` : report.reportedItemId };
  if (report.storyId) return { label: 'قصة', reference: report.storyId };
  if (report.reportedDealMessageId) return { label: 'رسالة صفقة', reference: report.reportedDealMessageId };
  if (report.reportedStreamMessageId || report.reportedDirectConversationId) return { label: 'رسالة مباشرة', reference: report.reportedStreamMessageId ?? report.reportedDirectConversationId ?? '—' };
  if (report.reportedDealId) return { label: 'صفقة', reference: report.reportedDealId };
  if (report.reportedOfferId) return { label: 'عرض', reference: report.reportedOfferId };
  if (report.reportedUserId) return { label: 'مستخدم', reference: report.reportedUserName ?? report.reportedUserId };
  return { label: 'بلاغ', reference: report.id };
}

function statusTone(status: AdminReportStatus): 'neutral' | 'primary' | 'accent' | 'danger' | 'success' {
  if (status === 'open') return 'danger';
  if (status === 'reviewing') return 'accent';
  if (status === 'actioned') return 'success';
  return 'neutral';
}

function detailsPreview(details: string | null) {
  const trimmed = details?.trim();
  if (!trimmed) return 'بدون تفاصيل إضافية.';
  return trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed;
}

function confirmHideItem() {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      'إخفاء العنصر؟',
      'الإجراء ده هيخفي العنصر من الظهور العام لو مسموح.',
      [
        { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
        { text: 'إخفاء', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

function ReportCard({ report, busy, onReview, onHideItem }: {
  report: AdminReportSummary;
  busy: boolean;
  onReview: (report: AdminReportSummary, status: Exclude<AdminReportStatus, 'open'>) => void;
  onHideItem: (report: AdminReportSummary) => void;
}) {
  const type = reportType(report);

  return (
    <AppCard style={styles.card}>
      <View style={styles.badgeRow}>
        <AppBadge label={type.label} tone="primary" />
        <AppBadge label={STATUS_LABELS[report.status]} tone={statusTone(report.status)} />
      </View>

      <View style={styles.cardBody}>
        <AppText weight="semibold" style={styles.reason}>{report.reason}</AppText>
        <AppText muted>{detailsPreview(report.details)}</AppText>
      </View>

      <View style={styles.metaBlock}>
        <AppText style={styles.metaLine}>المبلّغ: {report.reporterName ?? report.reporterId}</AppText>
        {report.reportedUserId ? <AppText style={styles.metaLine}>المُبلّغ عنه: {report.reportedUserName ?? report.reportedUserId}</AppText> : null}
        <AppText style={styles.metaLine}>الهدف: {type.reference}</AppText>
        <AppText muted style={styles.metaLine}>تاريخ الإنشاء: {formatDate(report.createdAt)}</AppText>
      </View>

      <View style={styles.actionGrid}>
        <AppButton label="قيد المراجعة" size="sm" variant="neutral" loading={busy} disabled={busy || report.status === 'reviewing'} onPress={() => onReview(report, 'reviewing')} />
        <AppButton label="تم الإجراء" size="sm" variant="primary" loading={busy} disabled={busy || report.status === 'actioned'} onPress={() => onReview(report, 'actioned')} />
        <AppButton label="رفض البلاغ" size="sm" variant="ghost" loading={busy} disabled={busy || report.status === 'dismissed'} onPress={() => onReview(report, 'dismissed')} />
        {report.reportedItemId ? <AppButton label="إخفاء العنصر" size="sm" variant="danger" loading={busy} disabled={busy} onPress={() => onHideItem(report)} /> : null}
      </View>
    </AppCard>
  );
}

export default function AdminReportsScreen() {
  const [access, setAccess] = useState<AccessState>('checking');
  const [statusFilter, setStatusFilter] = useState<AdminReportStatusFilter>('open');
  const [typeFilter, setTypeFilter] = useState<AdminReportTypeFilter>('all');
  const [reports, setReports] = useState<AdminReportSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadReports = useCallback(async (nextStatusFilter: AdminReportStatusFilter, nextTypeFilter: AdminReportTypeFilter, mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setMessage(null);

    const result = await fetchAdminReports({ status: nextStatusFilter, type: nextTypeFilter });
    if (result.ok) {
      setReports(result.reports);
    } else {
      setMessage(result.message);
      setReports([]);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      const result = await checkIsAdminUser();
      if (!mounted) return;

      if (!result.ok || !result.isAdmin) {
        setAccess('denied');
        return;
      }

      setAccess('allowed');
      await loadReports('open', 'all');
    })();

    return () => {
      mounted = false;
    };
  }, [loadReports]);

  const visibleMessage = useMemo(() => {
    if (loading) return 'بنحمّل البلاغات...';
    return message;
  }, [loading, message]);

  const changeStatusFilter = (nextStatusFilter: AdminReportStatusFilter) => {
    setStatusFilter(nextStatusFilter);
    if (access === 'allowed') void loadReports(nextStatusFilter, typeFilter);
  };

  const changeTypeFilter = (nextTypeFilter: AdminReportTypeFilter) => {
    setTypeFilter(nextTypeFilter);
    if (access === 'allowed') void loadReports(statusFilter, nextTypeFilter);
  };

  const handleReview = async (report: AdminReportSummary, status: Exclude<AdminReportStatus, 'open'>) => {
    setBusyReportId(report.id);
    const result = await reviewAdminReport({
      reportId: report.id,
      status,
      actionTaken: status === 'actioned' ? 'reviewed' : null,
      adminNotes: null,
    });
    setBusyReportId(null);

    if (!result.ok) {
      Alert.alert('تعذر تنفيذ الإجراء', result.message);
      return;
    }

    await loadReports(statusFilter, typeFilter, 'refresh');
  };

  const handleHideItem = async (report: AdminReportSummary) => {
    if (!report.reportedItemId) return;

    const confirmed = await confirmHideItem();
    if (!confirmed) return;

    setBusyReportId(report.id);
    const result = await hideReportedItem({ itemId: report.reportedItemId, reportId: report.id });
    setBusyReportId(null);

    if (!result.ok) {
      Alert.alert('تعذر إخفاء العنصر', result.message);
      return;
    }

    await loadReports(statusFilter, typeFilter, 'refresh');
  };

  if (access === 'checking') {
    return (
      <AppScreen>
        <EmptyState title="بنراجع الصلاحيات" description="ثواني ونتأكد إن الصفحة متاحة لحسابك." iconName="shield-checkmark-outline" />
      </AppScreen>
    );
  }

  if (access === 'denied') {
    return (
      <AppScreen>
        <EmptyState title="غير مسموح" description="الصفحة دي متاحة لفريق الإدارة فقط." iconName="lock-closed-outline" />
      </AppScreen>
    );
  }

  return (
    <AppScreen scrollable>
      <View style={styles.header}>
        <AppText weight="bold" style={styles.title}>بلاغات الإدارة</AppText>
        <AppText muted>راجع البلاغات واتخذ إجراء واضح.</AppText>
      </View>

      <View style={styles.filters}>
        {STATUS_FILTERS.map((item) => {
          const active = item.value === statusFilter;
          return (
            <Pressable key={item.value} accessibilityRole="button" style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => changeStatusFilter(item.value)}>
              <AppText weight="semibold" style={[styles.filterLabel, active && styles.filterLabelActive]}>{item.label}</AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.filters}>
        {TYPE_FILTERS.map((item) => {
          const active = item.value === typeFilter;
          return (
            <Pressable key={item.value} accessibilityRole="button" style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => changeTypeFilter(item.value)}>
              <AppText weight="semibold" style={[styles.filterLabel, active && styles.filterLabelActive]}>{item.label}</AppText>
            </Pressable>
          );
        })}
      </View>

      {visibleMessage ? <AppCard variant="outlined"><AppText muted>{visibleMessage}</AppText></AppCard> : null}

      <AppButton label="تحديث البلاغات" variant="neutral" size="sm" loading={refreshing} onPress={() => void loadReports(statusFilter, typeFilter, 'refresh')} />

      {!loading && reports.length === 0 ? (
        <EmptyState title="لا توجد بلاغات" description="مفيش بلاغات مطابقة للفلاتر الحالية." iconName="file-tray-outline" />
      ) : null}

      {reports.map((report) => (
        <ReportCard
          key={report.id}
          report={report}
          busy={busyReportId === report.id}
          onReview={handleReview}
          onHideItem={handleHideItem}
        />
      ))}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  title: { fontSize: 24 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterChip: {
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  filterLabel: { color: colors.textMuted },
  filterLabelActive: { color: colors.primary },
  card: { gap: spacing.md },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cardBody: { gap: spacing.xs },
  reason: { fontSize: 16 },
  metaBlock: { gap: spacing.xs },
  metaLine: { fontSize: 13 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
