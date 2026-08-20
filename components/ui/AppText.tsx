import { I18nManager, Text, type TextProps } from 'react-native';

import { typography } from '@/constants/typography';
import type { TeswaThemeColors } from '@/constants/themes';
import { useTeswaStyles } from '@/lib/theme/use-teswa-theme';

type Props = TextProps & { muted?: boolean; weight?: keyof typeof typography.weights };

const createStyles = (colors: TeswaThemeColors) => ({
  base: { color: colors.text, fontSize: typography.sizes.md, textAlign: I18nManager.isRTL ? 'right' as const : 'left' as const },
  muted: { color: colors.textMuted },
});

export function AppText({ style, muted, weight = 'regular', ...props }: Props) {
  const styles = useTeswaStyles(createStyles);
  return <Text style={[styles.base, muted && styles.muted, { fontWeight: typography.weights[weight] }, style]} {...props} />;
}
