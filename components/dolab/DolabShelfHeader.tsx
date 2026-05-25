import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

export function DolabShelfHeader({ title, description, onBack }: { title: string; description: string; onBack: () => void }) {
  return (
    <View style={styles.wrap}>
      <AppText weight="bold">{title}</AppText>
      <AppText muted>{description}</AppText>
      <Pressable style={styles.back} onPress={onBack} accessibilityRole="button" accessibilityLabel="رجوع للرفوف">
        <AppText style={styles.backText}>رجوع للرفوف</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, backgroundColor: 'rgba(255,255,255,0.92)', gap: spacing.xs },
  back: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.round, backgroundColor: colors.primarySoft },
  backText: { color: colors.primary, fontWeight: '700' },
});
