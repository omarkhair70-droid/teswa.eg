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
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع للرفوف" onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}><Ionicons name="chevron-forward" size={19} color={colors.text} /></Pressable>
        <View style={styles.copy}><AppText muted style={styles.eyebrow}>رف داخل دولابك</AppText><AppText weight="bold" style={styles.title}>{title}</AppText><AppText muted style={styles.description}>{description}</AppText></View>
        <View style={styles.iconWrap}><Ionicons name={iconName} size={20} color={colors.primary} /></View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`أضف داخل ${title}`} onPress={onAddHere} style={({ pressed }) => [styles.addHere, pressed && styles.pressed]}><Ionicons name="add" size={18} color={colors.white} /><AppText weight="semibold" style={styles.addHereText}>أضف داخل الرف</AppText></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, padding: spacing.md, backgroundColor: colors.surface, gap: spacing.md },
  topRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  backButton: { width: 40, height: 40, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  copy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  eyebrow: { fontSize: 9 },
  title: { fontSize: 18, textAlign: 'right' },
  description: { fontSize: 10, lineHeight: 16, textAlign: 'right' },
  iconWrap: { width: 42, height: 42, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  addHere: { minHeight: 42, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radii.lg, backgroundColor: colors.primary },
  addHereText: { color: colors.white, fontSize: 11 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
