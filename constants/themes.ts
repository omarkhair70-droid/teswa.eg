import { createTheme } from '@shopify/restyle';

export const teswaThemeTokens = {
  light: {
    background: '#F9F3EA',
    surface: '#FFFDF8',
    card: '#FFFFFF',
    text: '#1D1A16',
    textMuted: '#746A61',
    border: '#DDD0C5',
    primary: '#B8623F',
    primarySoft: '#EED8CB',
    accent: '#3E7C73',
    danger: '#B44343',
    success: '#2F7D4B',
  },
  dark: {
    background: '#17130F',
    surface: '#221B16',
    card: '#2B221C',
    text: '#FFF7EF',
    textMuted: '#C9B7A8',
    border: '#4A3A30',
    primary: '#E29A73',
    primarySoft: '#4B2D20',
    accent: '#7EC5B9',
    danger: '#F08A8A',
    success: '#77C88D',
  },
} as const;

export type TeswaThemeMode = keyof typeof teswaThemeTokens;
export type TeswaSemanticColor = keyof typeof teswaThemeTokens.light;

const baseTheme = {
  spacing: {
    none: 0,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  borderRadii: {
    none: 0,
    sm: 8,
    md: 12,
    lg: 18,
    xl: 24,
    pill: 999,
  },
  textVariants: {
    defaults: {},
  },
  cardVariants: {
    defaults: {},
  },
} as const;

export const lightTheme = createTheme({
  ...baseTheme,
  colors: teswaThemeTokens.light,
});

export const darkTheme = createTheme({
  ...baseTheme,
  colors: teswaThemeTokens.dark,
});

export type TeswaTheme = typeof lightTheme;
