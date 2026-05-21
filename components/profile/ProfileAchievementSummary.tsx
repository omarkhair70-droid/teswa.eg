import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { TrustLevelPill } from '@/components/profile/TrustLevelPill';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { getBadgePresentation } from '@/lib/badge-presentation';
import { getTrustLevelPresentation } from '@/lib/trust-level-presentation';
import type { UserBadge } from '@/lib/badges';
import type { UserTrustMetrics } from '@/lib/trust-metrics';

type ProfileAchievementSummaryProps = {
  trustMetrics: UserTrustMetrics | null;
  badges: UserBadge[];
  loading?: boolean;
  compact?: boolean;
};

const BADGE_PRIORITY: Record<string, number> = {
  reliable_swapper: 1,
  first_swap: 2,
};

function pickHighlightedBadge(badges: UserBadge[]): UserBadge | null {
  const reliable = badges.find((badge) => badge.badgeKey === 'reliable_swapper');
  if (reliable) return reliable;

  const firstSwap = badges.find((badge) => badge.badgeKey === 'first_swap');
  if (firstSwap) return firstSwap;

  const sorted = [...badges].sort((a, b) => {
    const aPriority = BADGE_PRIORITY[a.badgeKey] ?? 99;
    const bPriority = BADGE_PRIORITY[b.badgeKey] ?? 99;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.badgeKey.localeCompare(b.badgeKey);
  });

  return sorted[0] ?? null;
}

function buildHint({
  trustMetrics,
  badges,
  completedSwaps,
}: {
  trustMetrics: UserTrustMetrics | null;
  badges: UserBadge[];
  completedSwaps: number;
}): string {
  const hasReliableSwapperBadge = badges.some((badge) => badge.badgeKey === 'reliable_swapper');

  if (trustMetrics?.trustLevelKey === 'trusted_swapper') {
    return 'ملفك بيظهر سجل ثقة قوي للمجتمع.';
  }

  if (hasReliableSwapperBadge) {
    return 'عندك إشارة ثقة واضحة — حافظ على نفس مستوى التواصل.';
  }

  if (!trustMetrics && badges.length === 0) {
    return 'ابدأ بأول تبديلة علشان سجل الثقة يظهر.';
  }

  if (completedSwaps === 0) {
    return 'أول تبديلة ناجحة هتفتح أول شارة في ملفك.';
  }

  return 'استمر في التواصل والالتزام علشان تقوّي مؤشر الثقة.';
}

export function ProfileAchievementSummary({ trustMetrics, badges, loading = false, compact = false }: ProfileAchievementSummaryProps) {
  const completedSwaps = Math.max(trustMetrics?.completedDealsCount ?? 0, trustMetrics?.successfulSwapsCount ?? 0);
  const trustPresentation = getTrustLevelPresentation(trustMetrics?.trustLevelKey);
  const highlightedBadge = pickHighlightedBadge(badges);
  const highlightedBadgePresentation = highlightedBadge ? getBadgePresentation(highlightedBadge) : null;
  const nextHint = buildHint({ trustMetrics, badges, completedSwaps });

  if (loading) {
    return (
      <AppCard>
        <View style={styles.group}>
          <View style={styles.headerRow}>
            <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
            <AppText weight="semibold">ملخص الإنجازات</AppText>
          </View>
          <AppText muted>بنجهز ملخص الإنجازات...</AppText>
        </View>
      </AppCard>
    );
  }

  return (
    <AppCard>
      <View style={styles.group}>
        <View style={styles.headerRow}>
          <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
          <AppText weight="semibold">ملخص الإنجازات</AppText>
        </View>
        <AppText muted>لمحة سريعة عن الثقة والتبديلات والشارات.</AppText>

        <View style={styles.grid}>
          <View style={styles.metricCard}>
            <AppText muted style={styles.metricLabel}>مستوى الثقة</AppText>
            <AppText weight="semibold" numberOfLines={1}>
              {trustMetrics ? trustPresentation.labelAr : 'مؤشر الثقة بيتكوّن'}
            </AppText>
            {trustMetrics ? <TrustLevelPill levelKey={trustMetrics.trustLevelKey} score={trustMetrics.trustScore} compact={compact} /> : null}
          </View>

          <View style={styles.metricCard}>
            <AppText muted style={styles.metricLabel}>تبديلات مكتملة</AppText>
            <AppText weight="bold" style={styles.metricValue}>{completedSwaps}</AppText>
          </View>

          <View style={styles.metricCard}>
            <AppText muted style={styles.metricLabel}>شارات</AppText>
            <AppText weight="bold" style={styles.metricValue}>{badges.length}</AppText>
          </View>

          <View style={styles.metricCard}>
            <AppText muted style={styles.metricLabel}>أبرز شارة</AppText>
            {highlightedBadge && highlightedBadgePresentation ? (
              <View style={styles.badgeHighlightGroup}>
                <View style={styles.badgeTitleRow}>
                  <Ionicons name={highlightedBadgePresentation.iconName} size={15} color={colors.primary} />
                  <AppText weight="semibold" numberOfLines={1} style={styles.badgeLabel}>{highlightedBadge.labelAr}</AppText>
                </View>
                {!compact ? <AppText muted style={styles.badgeHint}>{highlightedBadgePresentation.shortHintAr}</AppText> : null}
              </View>
            ) : (
              <AppText muted>أول شارة بتظهر مع أول نشاط موثوق.</AppText>
            )}
          </View>
        </View>

        <View style={styles.hintBox}>
          <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
          <AppText style={styles.hintText}>{nextHint}</AppText>
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  metricCard: {
    width: '47%',
    minWidth: 130,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.background,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  metricLabel: { fontSize: 12 },
  metricValue: { fontSize: 20, color: colors.text },
  badgeHighlightGroup: { gap: 6 },
  badgeTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  badgeLabel: { flexShrink: 1 },
  badgeHint: { fontSize: 12 },
  hintBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  hintText: { color: colors.text, flexShrink: 1 },
});
