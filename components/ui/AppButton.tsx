import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { AppText } from './AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function AppButton({ label, onPress, variant = 'primary', disabled = false }: { label: string; onPress?: () => void; variant?: 'primary' | 'neutral'; disabled?: boolean }) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      disabled={disabled}
      style={[styles.base, variant === 'neutral' && styles.neutral, disabled && styles.disabled, animatedStyle]}
      onPressIn={() => {
        scale.value = withTiming(0.98, { duration: 90 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 15, stiffness: 260, mass: 0.7 });
      }}
      onPress={onPress}
    >
      <AppText weight="semibold" style={variant === 'neutral' ? styles.neutralText : styles.primaryText}>{label}</AppText>
    </AnimatedPressable>
  );
}
const styles = StyleSheet.create({ base: { backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, alignItems: 'center' }, neutral: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border }, disabled: { opacity: 0.6 }, primaryText: { color: colors.white }, neutralText: { color: colors.text } });
