import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import { ThemeProvider as RestyleThemeProvider } from '@shopify/restyle';
import { darkTheme, lightTheme, type TeswaThemeMode } from '@/constants/themes';
import { getString, setString } from '@/lib/storage/mmkv-storage';

export type AppearancePreference = 'system' | 'light' | 'dark';
type SystemColorScheme = 'light' | 'dark' | null;

const APPEARANCE_STORAGE_KEY = 'teswa:appearance-preference:v1';
const APPEARANCE_VALUES: readonly AppearancePreference[] = ['system', 'light', 'dark'];

function isAppearancePreference(value: string | null): value is AppearancePreference {
  return APPEARANCE_VALUES.includes(value as AppearancePreference);
}

function readStoredAppearancePreference(): AppearancePreference {
  const stored = getString(APPEARANCE_STORAGE_KEY);
  return isAppearancePreference(stored) ? stored : 'system';
}

function normalizeSystemColorScheme(value: ColorSchemeName | null | undefined): SystemColorScheme {
  if (value === 'dark' || value === 'light') return value;
  return null;
}

function resolveThemeMode(preference: AppearancePreference, systemScheme: SystemColorScheme): TeswaThemeMode {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemScheme === 'dark' ? 'dark' : 'light';
}

type ThemePreferencesContextValue = {
  appearancePreference: AppearancePreference;
  setAppearancePreference: (nextPreference: AppearancePreference) => void;
  systemColorScheme: SystemColorScheme;
  resolvedThemeMode: TeswaThemeMode;
};

const ThemePreferencesContext = createContext<ThemePreferencesContextValue | null>(null);

export function ThemePreferencesProvider({ children }: PropsWithChildren) {
  const [appearancePreference, setAppearancePreferenceState] = useState<AppearancePreference>(readStoredAppearancePreference);
  const [systemColorScheme, setSystemColorScheme] = useState<SystemColorScheme>(() =>
    normalizeSystemColorScheme(Appearance.getColorScheme()),
  );

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemColorScheme(normalizeSystemColorScheme(colorScheme));
    });

    return () => subscription.remove();
  }, []);

  const setAppearancePreference = useCallback((nextPreference: AppearancePreference) => {
    setAppearancePreferenceState(nextPreference);
    setString(APPEARANCE_STORAGE_KEY, nextPreference);
  }, []);

  const resolvedThemeMode = resolveThemeMode(appearancePreference, systemColorScheme);
  const theme = resolvedThemeMode === 'dark' ? darkTheme : lightTheme;

  const value = useMemo<ThemePreferencesContextValue>(() => ({
    appearancePreference,
    setAppearancePreference,
    systemColorScheme,
    resolvedThemeMode,
  }), [appearancePreference, resolvedThemeMode, setAppearancePreference, systemColorScheme]);

  return (
    <ThemePreferencesContext.Provider value={value}>
      <RestyleThemeProvider theme={theme}>{children}</RestyleThemeProvider>
    </ThemePreferencesContext.Provider>
  );
}

export function useThemePreferences() {
  const context = useContext(ThemePreferencesContext);
  if (!context) {
    throw new Error('useThemePreferences must be used within ThemePreferencesProvider');
  }
  return context;
}

export { APPEARANCE_STORAGE_KEY };
