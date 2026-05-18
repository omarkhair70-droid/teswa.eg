import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { colors } from '@/constants/colors';

export type TeswaAmbientBackgroundVariant = 'soft' | 'alive' | 'quiet';

type TeswaAmbientBackgroundProps = {
  variant?: TeswaAmbientBackgroundVariant;
};

type VariantSettings = {
  primaryOpacity: number;
  accentOpacity: number;
  creamOpacity: number;
  gradientOpacity: number;
  scaleDrift: number;
  positionDrift: number;
  breath: number;
};

const VARIANT_SETTINGS: Record<TeswaAmbientBackgroundVariant, VariantSettings> = {
  quiet: {
    primaryOpacity: 0.1,
    accentOpacity: 0.055,
    creamOpacity: 0.15,
    gradientOpacity: 0.34,
    scaleDrift: 0.014,
    positionDrift: 4,
    breath: 0.018,
  },
  soft: {
    primaryOpacity: 0.16,
    accentOpacity: 0.08,
    creamOpacity: 0.22,
    gradientOpacity: 0.42,
    scaleDrift: 0.024,
    positionDrift: 7,
    breath: 0.03,
  },
  alive: {
    primaryOpacity: 0.21,
    accentOpacity: 0.11,
    creamOpacity: 0.27,
    gradientOpacity: 0.48,
    scaleDrift: 0.035,
    positionDrift: 10,
    breath: 0.045,
  },
};

const rgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

export function TeswaAmbientBackground({ variant = 'soft' }: TeswaAmbientBackgroundProps) {
  const settings = VARIANT_SETTINGS[variant];
  const primaryMotion = useSharedValue(0);
  const accentMotion = useSharedValue(0);
  const creamMotion = useSharedValue(0);

  useEffect(() => {
    const calmingEase = Easing.inOut(Easing.sin);
    primaryMotion.value = withRepeat(withTiming(1, { duration: 18500, easing: calmingEase }), -1, true);
    accentMotion.value = withRepeat(withTiming(1, { duration: 22600, easing: calmingEase }), -1, true);
    creamMotion.value = withRepeat(withTiming(1, { duration: 27400, easing: calmingEase }), -1, true);

    return () => {
      cancelAnimation(primaryMotion);
      cancelAnimation(accentMotion);
      cancelAnimation(creamMotion);
    };
  }, [accentMotion, creamMotion, primaryMotion]);

  const primaryStyle = useAnimatedStyle(() => ({
    opacity: settings.primaryOpacity + primaryMotion.value * settings.breath,
    transform: [
      { translateX: primaryMotion.value * settings.positionDrift },
      { translateY: primaryMotion.value * settings.positionDrift * 0.45 },
      { scale: 1 + primaryMotion.value * settings.scaleDrift },
    ],
  }));

  const accentStyle = useAnimatedStyle(() => ({
    opacity: settings.accentOpacity + accentMotion.value * settings.breath * 0.72,
    transform: [
      { translateX: -accentMotion.value * settings.positionDrift * 0.8 },
      { translateY: accentMotion.value * settings.positionDrift },
      { scale: 1 + accentMotion.value * settings.scaleDrift * 0.85 },
    ],
  }));

  const creamStyle = useAnimatedStyle(() => ({
    opacity: settings.creamOpacity + creamMotion.value * settings.breath * 0.58,
    transform: [
      { translateX: creamMotion.value * settings.positionDrift * 0.35 },
      { translateY: -creamMotion.value * settings.positionDrift * 0.7 },
      { scale: 1 + creamMotion.value * settings.scaleDrift * 0.65 },
    ],
  }));

  return (
    <View pointerEvents="none" style={styles.root}>
      <View style={styles.baseWash} />
      <LinearGradient
        pointerEvents="none"
        colors={[rgba(colors.surface, settings.gradientOpacity), rgba(colors.background, 0.16), rgba(colors.primarySoft, settings.gradientOpacity * 0.5)]}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 0.94, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View pointerEvents="none" style={[styles.orb, styles.primaryOrb, primaryStyle]} />
      <Animated.View pointerEvents="none" style={[styles.orb, styles.accentOrb, accentStyle]} />
      <Animated.View pointerEvents="none" style={[styles.orb, styles.creamOrb, creamStyle]} />
      <LinearGradient
        pointerEvents="none"
        colors={[rgba(colors.white, 0.22), rgba(colors.background, 0.02), rgba(colors.primary, 0.035)]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  baseWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  primaryOrb: {
    width: 360,
    height: 360,
    top: -132,
    right: -150,
    backgroundColor: colors.primary,
  },
  accentOrb: {
    width: 330,
    height: 330,
    bottom: 58,
    left: -178,
    backgroundColor: colors.accent,
  },
  creamOrb: {
    width: 460,
    height: 460,
    right: -184,
    bottom: -238,
    backgroundColor: colors.primarySoft,
  },
});
