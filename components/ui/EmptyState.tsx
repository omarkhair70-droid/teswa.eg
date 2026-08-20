import { Ionicons } from '@expo/vector-icons';

import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { AppFadeIn } from '@/components/motion/AppFadeIn';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { TeswaThemeColors } from '@/constants/themes';
import { useTeswaColors, useTeswaStyles } from '@/lib/theme/use-teswa-theme';

const createStyles = (colors: TeswaThemeColors) => ({
  box: { borderWidth: 1, borderStyle: 'dashed' as const, borderColor: colors.border, borderRadius: radii.md, padding: spacing.lg, gap: spacing.sm },
  compact: { padding: spacing.md },
});

export function EmptyState({
  title,
  description,
  iconName,
  actionLabel,
  onAction,
  compact = false,
}: {
  title: string;
  description: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  const colors = useTeswaColors();
  const styles = useTeswaStyles(createStyles);
  return (
    <AppFadeIn style={[styles.box, compact && styles.compact]}>
      {iconName ? <Ionicons name={iconName} size={compact ? 18 : 20} color={colors.textMuted} /> : null}
      <AppText weight="semibold">{title}</AppText>
      <AppText muted>{description}</AppText>
      {actionLabel && onAction ? <AppButton label={actionLabel} onPress={onAction} variant="neutral" size="sm" /> : null}
    </AppFadeIn>
  );
}
