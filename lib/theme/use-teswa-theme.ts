import { useMemo } from 'react';
import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { useTheme } from '@shopify/restyle';

import type { TeswaTheme, TeswaThemeColors } from '@/constants/themes';

export function useTeswaTheme() {
  return useTheme<TeswaTheme>();
}

export function useTeswaColors(): TeswaThemeColors {
  return useTeswaTheme().colors as TeswaThemeColors;
}

type NamedStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

export function useTeswaStyles<TStyles extends NamedStyles>(
  factory: (colors: TeswaThemeColors) => TStyles,
) {
  const colors = useTeswaColors();
  return useMemo(() => StyleSheet.create(factory(colors)), [colors, factory]);
}
