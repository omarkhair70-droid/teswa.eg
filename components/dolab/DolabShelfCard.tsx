import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

type Props = {
  title: string;
  description: string;
  iconName: keyof typeof Ionicons.glyphMap;
  count: number;
  ctaLabel?: string;
  onPress: () => void;
};

export function DolabShelfCard({ title, description, iconName, count, ctaLabel = 'افتح الرف', onPress }: Props) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`فتح ${title}`} onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.topRow}>
        <View style={styles.iconWrap}><Ionicons name={iconName} size={19} color={colors.primary} /></View>
        <View style={styles.countBadge}><AppText weight="bold" style={styles.countText}>{count > 99 ? '99+' : count}</AppText></View>
      </View>
      <View style={styles.copy}>
        <AppText weight="bold" style={styles.title}>{title}</AppText>
        <AppText muted style={styles.description} numberOfLines={2}>{description}</AppText>
      </View>
      <View style={styles.footerRow}>
        <AppText weight="semibold" style={styles.cta}>{ctaLabel}</AppText>
        <Ionicons name="chevron-back" size={16} color={colors.primary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: '48.5%', minHeight: 154, borderWidth: 1, borderColor: 'rgba(184,98,63,0.16)', borderRadius: radii.xl, padding: spacing.md, backgroundColor: '#FFF9F1', gap: spacing.sm },
  topRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  iconWrap: { width: 38, height: 38, borderRadius: radii.lg, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  countBadge: { minWidth: 32, height: 28, borderRadius: radii.round, paddingHorizontal: spacing.xs, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  countText: { color: colors.primary, fontSize: 11 },
  copy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  title: { fontSize: 14, textAlign: 'right' },
  description: { fontSize: 10, lineHeight: 16, textAlign: 'right' },
  footerRow: { flexDirection: 'row-reverse', justifyContent: 'flex-start', alignItems: 'center', gap: 3 },
  cta: { color: colors.primary, fontSize: 10 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
