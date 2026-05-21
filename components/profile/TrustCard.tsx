import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { TrustLevelPill } from '@/components/profile/TrustLevelPill';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { getTrustLevelPresentation } from '@/lib/trust-level-presentation';
import type { UserTrustMetrics } from '@/lib/trust-metrics';

type TrustCardProps = {
  metrics: UserTrustMetrics | null;
  loading?: boolean;
  compact?: boolean;
};

function formatPercent(value: number | null): string {
  if (value == null) return 'غير متاح';
  const safe = Math.max(0, Math.min(100, value));
  return `${Math.round(safe)}%`;
}

function formatRating(value: number | null): string {
  if (value == null) return 'غير متاح';
  return `${value.toFixed(1)} / 5`;
}

function clampScore(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.round(Math.max(0, Math.min(100, value)));
}

export function TrustCard({ metrics, loading = false, compact = false }: TrustCardProps) {
  const presentation = getTrustLevelPresentation(metrics?.trustLevelKey);

  if (loading) {
    return (
      <AppCard>
        <View style={styles.headerRow}>
          <Ionicons name={presentation.iconName as keyof typeof Ionicons.glyphMap} size={18} color={colors.primary} />
          <AppText weight="semibold">مؤشر الثقة</AppText>
        </View>
        <AppText muted>جاري تحميل مؤشر الثقة...</AppText>
      </AppCard>
    );
  }

  if (!metrics) {
    return (
      <AppCard>
        <View style={styles.headerRow}>
          <Ionicons name={presentation.iconName as keyof typeof Ionicons.glyphMap} size={18} color={colors.primary} />
          <AppText weight="semibold">مؤشر الثقة</AppText>
        </View>
        <View style={styles.group}>
          <AppText weight="semibold">لسه مفيش بيانات ثقة كفاية</AppText>
          <AppText muted>مؤشر الثقة بيتكوّن مع أول التبديلات والتقييمات.</AppText>
          <AppText muted style={styles.subtleNote}>مش بنرفع مستوى الثقة غير مع نشاط حقيقي.</AppText>
        </View>
      </AppCard>
    );
  }

  const completedSwaps = Math.max(metrics.completedDealsCount ?? 0, metrics.successfulSwapsCount ?? 0);
  const safeScore = clampScore(metrics.trustScore);
  const trustTags = [
    metrics.clearDescriptionCount > 0 ? 'وصف واضح' : null,
    metrics.goodCommunicationCount > 0 ? 'تواصل جيد' : null,
    metrics.onTimeCount > 0 ? 'ملتزم بالميعاد' : null,
    metrics.respectfulSwapperCount > 0 ? 'محترم في التبديل' : null,
  ].filter(Boolean) as string[];

  return (
    <AppCard>
      <View style={styles.group}>
        <View style={styles.headerRow}>
          <Ionicons name={presentation.iconName as keyof typeof Ionicons.glyphMap} size={18} color={colors.primary} />
          <AppText weight="semibold">مؤشر الثقة</AppText>
        </View>

        <View style={styles.titleRow}>
          <AppText weight="bold" style={styles.levelLabel}>{presentation.labelAr}</AppText>
          <TrustLevelPill levelKey={metrics.trustLevelKey} score={safeScore} compact={compact} />
        </View>

        {!compact ? <AppText muted>{presentation.descriptionAr}</AppText> : null}

        <View style={styles.metricsGrid}>
          <View style={styles.metricCell}>
            <AppText muted style={styles.metricLabel}>تبديلات مكتملة</AppText>
            <AppText weight="semibold">{completedSwaps}</AppText>
          </View>
          <View style={styles.metricCell}>
            <AppText muted style={styles.metricLabel}>التقييمات</AppText>
            <AppText weight="semibold">{metrics.totalReviewsReceived}</AppText>
          </View>
          <View style={styles.metricCell}>
            <AppText muted style={styles.metricLabel}>معدل الرد</AppText>
            <AppText weight="semibold">{formatPercent(metrics.responseRate)}</AppText>
          </View>
          <View style={styles.metricCell}>
            <AppText muted style={styles.metricLabel}>متوسط التقييم</AppText>
            <AppText weight="semibold">{formatRating(metrics.averageRating)}</AppText>
          </View>
        </View>

        {trustTags.length > 0 ? (
          <View style={styles.tagsRow}>
            {trustTags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <AppText style={styles.tagText}>{tag}</AppText>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  levelLabel: { fontSize: 20, color: colors.text },
  subtleNote: { fontSize: 12 },
  metricsGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  metricCell: {
    width: '47%',
    minWidth: 120,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  metricLabel: { fontSize: 12 },
  tagsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  tag: {
    borderRadius: radii.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tagText: { fontSize: 12, color: colors.textMuted },
});
