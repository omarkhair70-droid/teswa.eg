import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { ABSOLUTE_FILL } from '@/lib/styles/absolute-fill';

import type { TeswaThemeColors } from '@/constants/themes';
import { useThemePreferences } from '@/lib/preferences/appearance';
import { useTeswaColors, useTeswaStyles } from '@/lib/theme/use-teswa-theme';

export type TeswaAmbientBackgroundVariant = 'soft' | 'alive' | 'quiet';

type TeswaAmbientBackgroundProps = { variant?: TeswaAmbientBackgroundVariant };
type VariantSettings = { primaryOpacity: number; accentOpacity: number; creamOpacity: number; gradientOpacity: number; scaleDrift: number; positionDrift: number; breath: number };

const VARIANT_SETTINGS: Record<TeswaAmbientBackgroundVariant, VariantSettings> = {
  quiet: { primaryOpacity: 0.045, accentOpacity: 0.025, creamOpacity: 0.08, gradientOpacity: 0.28, scaleDrift: 0.008, positionDrift: 2, breath: 0.008 },
  soft: { primaryOpacity: 0.07, accentOpacity: 0.038, creamOpacity: 0.11, gradientOpacity: 0.32, scaleDrift: 0.012, positionDrift: 4, breath: 0.012 },
  alive: { primaryOpacity: 0.095, accentOpacity: 0.052, creamOpacity: 0.14, gradientOpacity: 0.36, scaleDrift: 0.016, positionDrift: 5, breath: 0.016 },
};

const rgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const createStyles = (colors: TeswaThemeColors) => ({
  root: { ...ABSOLUTE_FILL, backgroundColor: colors.background, overflow: 'hidden' as const },
  baseWash: { ...ABSOLUTE_FILL, backgroundColor: colors.background },
  orb: { position: 'absolute' as const, borderRadius: 999 },
  primaryOrb: { width: 310, height: 310, top: -158, right: -172, backgroundColor: colors.primary },
  accentOrb: { width: 290, height: 290, bottom: 96, left: -194, backgroundColor: colors.accent },
  creamOrb: { width: 380, height: 380, right: -232, bottom: -248, backgroundColor: colors.primarySoft },
});

export function TeswaAmbientBackground({ variant = 'soft' }: TeswaAmbientBackgroundProps) {
  const colors = useTeswaColors();
  const styles = useTeswaStyles(createStyles);
  const { resolvedThemeMode } = useThemePreferences();
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
    transform: [{ translateX: primaryMotion.value * settings.positionDrift }, { translateY: primaryMotion.value * settings.positionDrift * 0.45 }, { scale: 1 + primaryMotion.value * settings.scaleDrift }],
  }));
  const accentStyle = useAnimatedStyle(() => ({
    opacity: settings.accentOpacity + accentMotion.value * settings.breath * 0.72,
    transform: [{ translateX: -accentMotion.value * settings.positionDrift * 0.8 }, { translateY: accentMotion.value * settings.positionDrift }, { scale: 1 + accentMotion.value * settings.scaleDrift * 0.85 }],
  }));
  const creamStyle = useAnimatedStyle(() => ({
    opacity: settings.creamOpacity + creamMotion.value * settings.breath * 0.58,
    transform: [{ translateX: creamMotion.value * settings.positionDrift * 0.35 }, { translateY: -creamMotion.value * settings.positionDrift * 0.7 }, { scale: 1 + creamMotion.value * settings.scaleDrift * 0.65 }],
  }));

  const topGlowAlpha = resolvedThemeMode === 'dark' ? 0.045 : 0.22;
  const primaryWashAlpha = resolvedThemeMode === 'dark' ? 0.065 : 0.035;

  return (
    <View pointerEvents="none" style={styles.root}>
      <View style={styles.baseWash} />
      <LinearGradient
        pointerEvents="none"
        colors={[rgba(colors.surface, settings.gradientOpacity), rgba(colors.background, resolvedThemeMode === 'dark' ? 0.4 : 0.16), rgba(colors.primarySoft, settings.gradientOpacity * 0.5)]}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 0.94, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View pointerEvents="none" style={[styles.orb, styles.primaryOrb, primaryStyle]} />
      <Animated.View pointerEvents="none" style={[styles.orb, styles.accentOrb, accentStyle]} />
      <Animated.View pointerEvents="none" style={[styles.orb, styles.creamOrb, creamStyle]} />
      <LinearGradient
        pointerEvents="none"
        colors={[rgba(colors.white, topGlowAlpha), rgba(colors.background, 0.02), rgba(colors.primary, primaryWashAlpha)]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
