import { PropsWithChildren } from 'react';
import { type StyleProp, type ViewStyle, View } from 'react-native';

import { radii } from '@/constants/radii';
import { shadows } from '@/constants/shadows';
import { spacing } from '@/constants/spacing';
import type { TeswaThemeColors } from '@/constants/themes';
import { useTeswaStyles } from '@/lib/theme/use-teswa-theme';

type AppCardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'soft' | 'outlined';
  padding?: 'sm' | 'md' | 'lg';
}>;

const createStyles = (colors: TeswaThemeColors) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.card,
    shadowColor: colors.shadow,
  },
  soft: { backgroundColor: colors.background },
  outlined: { backgroundColor: colors.card, shadowOpacity: 0, elevation: 0 },
  paddingSm: { padding: spacing.sm },
  paddingMd: { padding: spacing.md },
});

export function AppCard({ children, style, variant = 'default', padding = 'lg' }: AppCardProps) {
  const styles = useTeswaStyles(createStyles);
  return <View style={[styles.card, variant === 'soft' && styles.soft, variant === 'outlined' && styles.outlined, padding === 'sm' && styles.paddingSm, padding === 'md' && styles.paddingMd, style]}>{children}</View>;
}
