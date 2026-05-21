import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { getTrustLevelPresentation } from '@/lib/trust-level-presentation';
import type { TrustLevelKey } from '@/lib/trust-metrics';

type TrustLevelPillProps = {
  levelKey: TrustLevelKey | string | null | undefined;
  score?: number | null;
  compact?: boolean;
};

function clampScore(score: number | null | undefined): number | null {
  if (score == null || Number.isNaN(score)) return null;
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function TrustLevelPill({ levelKey, score, compact = false }: TrustLevelPillProps) {
  const presentation = getTrustLevelPresentation(levelKey);
  const safeScore = clampScore(score);

  return (
    <View style={[styles.pill, compact ? styles.pillCompact : null]}>
      <Ionicons name={presentation.iconName as keyof typeof Ionicons.glyphMap} size={compact ? 14 : 15} color={colors.primary} />
      <AppText weight="semibold" style={styles.levelText}>{presentation.shortLabelAr}</AppText>
      {safeScore != null ? <AppText style={styles.scoreText}>{safeScore} / 100</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primarySoft,
  },
  pillCompact: {
    paddingVertical: 5,
  },
  levelText: {
    color: colors.text,
    fontSize: 12,
  },
  scoreText: {
    color: colors.primary,
    fontSize: 12,
  },
});
