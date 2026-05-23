import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

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
  const scale = useSharedValue(1);
  const isDisabled = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const textStyles = [
    styles.primaryText,
    variant === 'neutral' && styles.neutralText,
    variant === 'danger' && styles.primaryText,
    variant === 'ghost' && styles.ghostText,
  ];

  const contentLabel = loading ? `${label}...` : label;

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
      onPressIn={() => {
        scale.value = withTiming(0.98, { duration: 90 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 15, stiffness: 260, mass: 0.7 });
      }}
      onPress={onPress}
    >
      <View style={styles.content}>
        {iconName ? <Ionicons name={iconName} size={16} color={variant === 'ghost' ? colors.primary : variant === 'neutral' ? colors.text : colors.white} /> : null}
        <AppText weight="semibold" style={textStyles}>{contentLabel}</AppText>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  sizeSm: {
    minHeight: 40,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  sizeLg: {
    minHeight: 48,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  neutral: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.6,
  },
  primaryText: { color: colors.white },
  neutralText: { color: colors.text },
  ghostText: { color: colors.primary },
});
