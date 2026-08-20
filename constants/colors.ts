import { Appearance } from 'react-native';

import { teswaThemeTokens, type TeswaThemeColors } from '@/constants/themes';

const initialMode = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';

// Compatibility bridge for screens that still create static StyleSheets at module load.
// New UI should prefer useTeswaColors/useTeswaStyles so it can react live to theme changes.
export const colors: TeswaThemeColors = { ...teswaThemeTokens[initialMode] };
