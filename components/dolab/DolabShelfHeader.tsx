import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

export function DolabShelfHeader({ title, description, iconName, onBack, onAddHere }: { title: string; description: string; iconName: keyof typeof Ionicons.glyphMap; onBack: () => void; onAddHere: () => void }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <View style={styles.iconWrap}><Ionicons name={iconName} size={16} color={colors.primary} /></View>
        <AppText weight="bold">{title}</AppText>
      </View>
      <AppText muted>{description}</AppText>
      <View style={styles.row}>
        <Pressable style={styles.back} onPress={onBack} accessibilityRole="button" accessibilityLabel="رجوع للرفوف">
          <AppText style={styles.backText}>رجوع للرفوف</AppText>
        </Pressable>
        <Pressable style={styles.addHere} onPress={onAddHere} accessibilityRole="button" accessibilityLabel="أضف هنا">
          <AppText style={styles.addHereText}>أضف هنا</AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, backgroundColor: 'rgba(255,255,255,0.92)', gap: spacing.xs },
  topRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  iconWrap: { width: 28, height: 28, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  row: { flexDirection: 'row-reverse', gap: spacing.xs, alignItems: 'center' },
  back: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.round, backgroundColor: colors.primarySoft },
  backText: { color: colors.primary, fontWeight: '700' },
  addHere: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.round, backgroundColor: colors.primary },
  addHereText: { color: '#fff', fontWeight: '700' },
});
