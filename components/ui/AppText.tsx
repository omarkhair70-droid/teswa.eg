import { I18nManager, StyleSheet, Text, TextProps } from 'react-native';
import { colors } from '@/constants/colors';
import { typography } from '@/constants/typography';

type Props = TextProps & { muted?: boolean; weight?: keyof typeof typography.weights };

export function AppText({ style, muted, weight = 'regular', ...props }: Props) {
  return <Text style={[styles.base, muted && styles.muted, { fontWeight: typography.weights[weight] }, style]} {...props} />;
}

const styles = StyleSheet.create({
  base: { color: colors.text, fontSize: typography.sizes.md, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  muted: { color: colors.textMuted },
});
