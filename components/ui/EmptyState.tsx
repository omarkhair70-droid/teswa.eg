import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

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
  return (
    <View style={[styles.box, compact && styles.compact]}>
      {iconName ? <Ionicons name={iconName} size={compact ? 18 : 20} color={colors.textMuted} /> : null}
      <AppText weight="semibold">{title}</AppText>
      <AppText muted>{description}</AppText>
      {actionLabel && onAction ? <AppButton label={actionLabel} onPress={onAction} variant="neutral" size="sm" /> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  box: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radii.md, padding: spacing.lg, gap: spacing.sm },
  compact: { padding: spacing.md },
});
