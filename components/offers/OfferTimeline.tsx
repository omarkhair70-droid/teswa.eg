import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { getOfferStatusLabel, OfferDetail } from '@/lib/offers';

type OfferTimelineProps = {
  status: OfferDetail['status'];
  viewerRole?: OfferDetail['viewerRole'] | string | null;
  createdAt?: string | null;
  dealId?: string | null;
  compact?: boolean;
};

type StepState = 'completed' | 'current' | 'inactive';
type TimelineStep = {
  key: string;
  title: string;
  description: string;
  state: StepState;
  date?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('ar-EG');
}

function buildSteps({ status, viewerRole, createdAt, dealId }: Omit<OfferTimelineProps, 'compact'>): TimelineStep[] {
  const role = viewerRole === 'receiver' ? 'receiver' : 'sender';
  const steps: TimelineStep[] = [
    { key: 'sent', title: 'العرض اتبعت', description: 'تم إرسال عرض التبديل للطرف الآخر.', state: 'completed', date: formatDate(createdAt) },
  ];

  if (status === 'pending') {
    steps.push({ key: 'pending', title: 'في انتظار الرد', description: role === 'receiver' ? 'راجع العرض وخد قرارك بهدوء.' : 'العرض عند الطرف الآخر، مستني قراره.', state: 'current' });
    return steps;
  }

  if (status === 'thinking') {
    steps.push({ key: 'thinking', title: 'بيفكر في العرض', description: role === 'receiver' ? 'سجلنا إنك محتاج تفكر قبل القرار.' : 'الطرف الآخر محتاج وقت قبل القرار.', state: 'current' });
    return steps;
  }

  if (status === 'accepted') {
    steps.push({ key: 'accepted', title: 'العرض اتقبل', description: 'اتفتحت صفقة علشان تكملوا التنسيق.', state: dealId ? 'completed' : 'current' });
    if (dealId) steps.push({ key: 'deal-ready', title: 'دردشة الصفقة جاهزة', description: 'تقدروا تبدأوا التنسيق مباشرة من دردشة الصفقة.', state: 'current' });
    return steps;
  }

  if (status === 'soft_rejected' || status === 'rejected') {
    steps.push({ key: 'closed-softly', title: 'اتقفل بلطف', description: 'العرض انتهى بهدوء، وتقدر تتابع فرص تانية.', state: 'completed' });
    return steps;
  }

  steps.push({ key: 'status-update', title: 'تحديث على العرض', description: getOfferStatusLabel(status), state: 'current' });
  return steps;
}

export function OfferTimeline(props: OfferTimelineProps) {
  const steps = buildSteps(props);

  return (
    <AppCard>
      <View style={styles.header}>
        <AppText weight="bold">مسار العرض</AppText>
        <AppText muted>تابع العرض من لحظة الإرسال لحد القرار.</AppText>
      </View>
      <View style={styles.timeline}>
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const iconName: keyof typeof Ionicons.glyphMap = step.state === 'completed' ? 'checkmark' : step.state === 'current' ? 'time-outline' : 'ellipse-outline';
          return (
            <View key={step.key} style={styles.row}>
              <View style={styles.markerWrap}>
                <View style={[styles.iconCircle, step.state === 'completed' ? styles.completedCircle : null, step.state === 'current' ? styles.currentCircle : null]}>
                  <Ionicons name={iconName} size={14} color={step.state === 'inactive' ? colors.textMuted : colors.primary} />
                </View>
                {!isLast ? <View style={[styles.connector, step.state === 'inactive' ? styles.connectorMuted : null]} /> : null}
              </View>
              <View style={[styles.content, step.state === 'current' ? styles.currentContent : null]}>
                <AppText weight="semibold">{step.title}</AppText>
                <AppText muted>{step.description}</AppText>
                {step.date ? <AppText muted style={styles.date}>{step.date}</AppText> : null}
              </View>
            </View>
          );
        })}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs, marginBottom: spacing.md },
  timeline: { gap: spacing.sm },
  row: { flexDirection: 'row-reverse', gap: spacing.sm, alignItems: 'stretch' },
  markerWrap: { width: 28, alignItems: 'center' },
  iconCircle: { width: 24, height: 24, borderRadius: radii.round, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  completedCircle: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  currentCircle: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  connector: { flex: 1, width: 2, marginTop: spacing.xs, backgroundColor: colors.primarySoft, borderRadius: radii.round },
  connectorMuted: { backgroundColor: colors.border },
  content: { flex: 1, gap: spacing.xs, padding: spacing.sm, borderRadius: radii.md },
  currentContent: { backgroundColor: colors.primarySoft },
  date: { fontSize: 12 },
});
