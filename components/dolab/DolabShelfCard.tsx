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
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={`فتح ${title}`}>
      <View style={styles.topRow}>
        <View style={styles.iconWrap}><Ionicons name={iconName} size={18} color={colors.primary} /></View>
        <View style={styles.countBadge}><AppText style={styles.countText}>{count}</AppText></View>
      </View>
      <View style={styles.copy}>
        <AppText weight="bold">{title}</AppText>
        <AppText muted>{description}</AppText>
      </View>
      <View style={styles.footerRow}>
        <View style={styles.shelfTag}><AppText style={styles.shelfTagText}>على الرف</AppText></View>
        <AppText style={styles.cta}>{ctaLabel}</AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: 'rgba(184,98,63,0.18)', borderRadius: radii.xl, padding: spacing.md, backgroundColor: '#FFF9F1', gap: spacing.xs },
  topRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  iconWrap: { width: 34, height: 34, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  countBadge: { minWidth: 30, borderRadius: radii.round, paddingHorizontal: spacing.xs, paddingVertical: 4, alignItems: 'center', backgroundColor: '#FFF2DE', borderWidth: 1, borderColor: 'rgba(184,98,63,0.24)' },
  countText: { color: colors.primary, fontWeight: '700' },
  copy: { gap: 2 },
  footerRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  shelfTag: { paddingHorizontal: spacing.xs, paddingVertical: 3, borderRadius: radii.round, backgroundColor: '#FFF2DE' },
  shelfTagText: { color: '#8A5A34', fontSize: 12 },
  cta: { color: colors.primary, fontWeight: '700' },
});
