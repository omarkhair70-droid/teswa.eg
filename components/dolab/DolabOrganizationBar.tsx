import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { DolabViewMode } from '@/lib/dolab/organization';

const MODES: Array<{ key: DolabViewMode; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'media', label: 'ميديا' },
  { key: 'drafts', label: 'مسودات' },
  { key: 'notes', label: 'ملاحظات' },
  { key: 'ready', label: 'جاهز للنشر' },
  { key: 'issues', label: 'مشاكل' },
];

type Props = {
  value: DolabViewMode;
  onChange: (mode: DolabViewMode) => void;
};

export function DolabOrganizationBar({ value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {MODES.map((mode) => {
          const active = mode.key === value;
          return (
            <Pressable
              key={mode.key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onChange(mode.key)}
              accessibilityRole="button"
              accessibilityLabel={`عرض ${mode.label}`}
            >
              <AppText style={[styles.text, active && styles.textActive]}>{mode.label}</AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm },
  row: { gap: spacing.xs, paddingVertical: spacing.xs },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { fontSize: 13, color: colors.text },
  textActive: { color: colors.white },
});
