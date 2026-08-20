import { Appearance } from 'react-native';

import { SYSTEM_DARK_MODE_ENABLED, teswaThemeTokens, type TeswaThemeColors } from '@/constants/themes';

const initialMode = SYSTEM_DARK_MODE_ENABLED && Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';

// Compatibility bridge for screens that still create static StyleSheets at module load.
// New UI should prefer useTeswaColors/useTeswaStyles so it can react live to theme changes.
export const colors: TeswaThemeColors = { ...teswaThemeTokens[initialMode] };
