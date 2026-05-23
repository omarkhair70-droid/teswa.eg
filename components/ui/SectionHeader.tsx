import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { typography } from '@/constants/typography';

export function SectionHeader({
  title,
  description,
  subtitle,
  eyebrow,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  subtitle?: string;
  eyebrow?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const copy = description ?? subtitle;
  return (
    <View style={styles.row}>
      <View style={styles.wrap}>
        {eyebrow ? <AppText weight="medium" muted style={styles.eyebrow}>{eyebrow}</AppText> : null}
        <AppText weight="bold" style={styles.title}>{title}</AppText>
        {copy ? <AppText muted>{copy}</AppText> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={spacing.sm}>
          <AppText weight="semibold" style={styles.action}>{actionLabel}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  wrap: { gap: spacing.xs, flex: 1 },
  title: { fontSize: typography.sizes.xl },
  eyebrow: { textTransform: 'uppercase', fontSize: typography.sizes.xs },
  action: { color: colors.primary },
});
