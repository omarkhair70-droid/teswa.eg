import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useTeswaColors } from '@/lib/theme/use-teswa-theme';

type Tone = 'neutral' | 'primary' | 'accent' | 'danger' | 'success';

export function AppBadge({ label, tone = 'neutral', iconName }: { label: string; tone?: Tone; iconName?: keyof typeof Ionicons.glyphMap }) {
  const colors = useTeswaColors();
  const toneStyles: Record<Tone, { bg: string; text: string }> = {
    neutral: { bg: colors.neutralSoft, text: colors.text },
    primary: { bg: colors.primarySoft, text: colors.primary },
    accent: { bg: colors.accentSoft, text: colors.accent },
    danger: { bg: colors.dangerSoft, text: colors.danger },
    success: { bg: colors.successSoft, text: colors.success },
  };
  const palette = toneStyles[tone];

  return (
    <View style={[styles.base, { backgroundColor: palette.bg }]}>
      {iconName ? <Ionicons name={iconName} size={12} color={palette.text} /> : null}
      <AppText weight="medium" style={[styles.label, { color: palette.text }]}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: { fontSize: 12 },
});
