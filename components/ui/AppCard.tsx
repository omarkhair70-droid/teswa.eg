import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { shadows } from '@/constants/shadows';
import { spacing } from '@/constants/spacing';

type AppCardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'soft' | 'outlined';
  padding?: 'sm' | 'md' | 'lg';
}>;

export function AppCard({ children, style, variant = 'default', padding = 'lg' }: AppCardProps) {
  return <View style={[styles.card, variant === 'soft' && styles.soft, variant === 'outlined' && styles.outlined, padding === 'sm' && styles.paddingSm, padding === 'md' && styles.paddingMd, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.card,
  },
  soft: {
    backgroundColor: colors.background,
  },
  outlined: {
    backgroundColor: colors.white,
    shadowOpacity: 0,
    elevation: 0,
  },
  paddingSm: {
    padding: spacing.sm,
  },
  paddingMd: {
    padding: spacing.md,
  },
});
