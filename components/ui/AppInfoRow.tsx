import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

type AppInfoRowProps = {
  label: string;
  value: string;
  description?: string;
};

export function AppInfoRow({ label, value, description }: AppInfoRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <AppText muted style={styles.label}>{label}</AppText>
        {description ? <AppText muted style={styles.description}>{description}</AppText> : null}
      </View>
      <View style={styles.valuePill}>
        <AppText weight="semibold" style={styles.value} numberOfLines={1}>{value}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.sm,
    backgroundColor: 'rgba(255,253,248,0.78)',
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 13,
  },
  description: {
    fontSize: 12,
  },
  valuePill: {
    maxWidth: '48%',
    borderRadius: radii.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primarySoft,
  },
  value: {
    color: colors.primary,
    fontSize: 12,
  },
});
