import { createTheme } from '@shopify/restyle';

// Temporary release switch: keep the app on the light theme until the dark
// theme pass is ready to ship. Flip this back to true to restore system mode.
export const SYSTEM_DARK_MODE_ENABLED = false;

export const teswaThemeTokens = {
  light: {
    background: '#F9F3EA',
    surface: '#FFFDF8',
    card: '#FFFFFF',
    elevated: '#FFFFFF',
    text: '#1D1A16',
    textMuted: '#746A61',
    border: '#DDD0C5',
    primary: '#B8623F',
    primarySoft: '#EED8CB',
    accent: '#3E7C73',
    accentSoft: '#D7E8E5',
    danger: '#B44343',
    dangerSoft: '#F6DFDF',
    success: '#2F7D4B',
    successSoft: '#DBEEDC',
    neutralSoft: '#EEE7DF',
    selectionSoft: '#FFF8F3',
    white: '#FFFFFF',
    black: '#0B0908',
    shadow: '#1D1A16',
  },
  dark: {
    background: '#15120F',
    surface: '#1E1915',
    card: '#251E19',
    elevated: '#2C231D',
    text: '#F6EEE6',
    textMuted: '#B9A99C',
    border: '#493A30',
    primary: '#D98962',
    primarySoft: '#3E281E',
    accent: '#74B4AA',
    accentSoft: '#223A35',
    danger: '#E68181',
    dangerSoft: '#3B2426',
    success: '#79BD8D',
    successSoft: '#23372A',
    neutralSoft: '#2B241F',
    selectionSoft: '#35261F',
    white: '#FFFFFF',
    black: '#0B0908',
    shadow: '#000000',
  },
} as const;

export type TeswaThemeMode = keyof typeof teswaThemeTokens;
export type TeswaSemanticColor = keyof typeof teswaThemeTokens.light;
export type TeswaThemeColors = { [Key in TeswaSemanticColor]: string };

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
