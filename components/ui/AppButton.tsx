import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from './AppText';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { TeswaThemeColors } from '@/constants/themes';
import { useTeswaColors, useTeswaStyles } from '@/lib/theme/use-teswa-theme';

type AppButtonVariant = 'primary' | 'neutral' | 'danger' | 'ghost';
type AppButtonSize = 'sm' | 'md' | 'lg';

type AppButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: AppButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  size?: AppButtonSize;
  fullWidth?: boolean;
  iconName?: keyof typeof Ionicons.glyphMap;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const createStyles = (colors: TeswaThemeColors) => ({
  base: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 44,
  },
  content: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: spacing.sm },
  sizeSm: { minHeight: 40, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  sizeLg: { minHeight: 48, paddingVertical: spacing.lg, paddingHorizontal: spacing.xl },
  neutral: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  danger: { backgroundColor: colors.danger },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary },
  fullWidth: { width: '100%' as const },
  disabled: { opacity: 0.6 },
  primaryText: { color: colors.white },
  neutralText: { color: colors.text },
  ghostText: { color: colors.primary },
});

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  size = 'md',
  fullWidth = false,
  iconName,
}: AppButtonProps) {
  const colors = useTeswaColors();
  const styles = useTeswaStyles(createStyles);
  const scale = useSharedValue(1);
  const isDisabled = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const textStyles = [styles.primaryText, variant === 'neutral' && styles.neutralText, variant === 'danger' && styles.primaryText, variant === 'ghost' && styles.ghostText];
  const contentLabel = loading ? `${label}...` : label;
  const iconColor = variant === 'ghost' ? colors.primary : variant === 'neutral' ? colors.text : colors.white;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={[
        styles.base,
        size === 'sm' && styles.sizeSm,
        size === 'lg' && styles.sizeLg,
        variant === 'neutral' && styles.neutral,
        variant === 'danger' && styles.danger,
        variant === 'ghost' && styles.ghost,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        animatedStyle,
      ]}
      onPressIn={() => { scale.value = withTiming(0.98, { duration: 90 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 15, stiffness: 260, mass: 0.7 }); }}
      onPress={onPress}
    >
      <View style={styles.content}>
        {iconName ? <Ionicons name={iconName} size={16} color={iconColor} /> : null}
        <AppText weight="semibold" style={textStyles}>{contentLabel}</AppText>
      </View>
    </AnimatedPressable>
  );
}
