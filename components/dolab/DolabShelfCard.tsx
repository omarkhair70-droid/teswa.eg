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
  ctaLabel?: string;
  onPress: () => void;
};

export function DolabShelfCard({ title, description, iconName, ctaLabel = 'افتح الرف', onPress }: Props) {
  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={`فتح ${title}`}>
      <View style={styles.iconWrap}><Ionicons name={iconName} size={18} color={colors.primary} /></View>
      <View style={styles.copy}>
        <AppText weight="bold">{title}</AppText>
        <AppText muted>{description}</AppText>
      </View>
      <AppText style={styles.cta}>{ctaLabel}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, padding: spacing.md, backgroundColor: '#FFFEFC', gap: spacing.xs },
  iconWrap: { width: 34, height: 34, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  copy: { gap: 2 },
  cta: { color: colors.primary, fontWeight: '700' },
});
