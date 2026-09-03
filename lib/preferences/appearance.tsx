import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, type ColorSchemeName } from 'react-native';
import { ThemeProvider as RestyleThemeProvider } from '@shopify/restyle';
import { setStatusBarStyle } from 'expo-status-bar';

import { SYSTEM_DARK_MODE_ENABLED, darkTheme, lightTheme, type TeswaThemeMode } from '@/constants/themes';

type SystemColorScheme = 'light' | 'dark' | null;

type ThemePreferencesContextValue = {
  systemColorScheme: SystemColorScheme;
  resolvedThemeMode: TeswaThemeMode;
};

const ThemePreferencesContext = createContext<ThemePreferencesContextValue | null>(null);

function normalizeSystemColorScheme(value: ColorSchemeName | null | undefined): SystemColorScheme {
  if (value === 'dark' || value === 'light') return value;
  return null;
}

export function ThemePreferencesProvider({ children }: PropsWithChildren) {
  const [systemColorScheme, setSystemColorScheme] = useState<SystemColorScheme>(() => (
    SYSTEM_DARK_MODE_ENABLED ? normalizeSystemColorScheme(Appearance.getColorScheme()) : null
  ));

  useEffect(() => {
    if (!SYSTEM_DARK_MODE_ENABLED) return;
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemColorScheme(normalizeSystemColorScheme(colorScheme));
    });
    return () => subscription.remove();
  }, []);

  const resolvedThemeMode: TeswaThemeMode = SYSTEM_DARK_MODE_ENABLED && systemColorScheme === 'dark' ? 'dark' : 'light';
  const theme = resolvedThemeMode === 'dark' ? darkTheme : lightTheme;

  useEffect(() => {
    setStatusBarStyle(resolvedThemeMode === 'dark' ? 'light' : 'dark', true);
  }, [resolvedThemeMode]);

  const value = useMemo<ThemePreferencesContextValue>(() => ({ systemColorScheme, resolvedThemeMode }), [resolvedThemeMode, systemColorScheme]);

  return (
    <ThemePreferencesContext.Provider value={value}>
      <RestyleThemeProvider theme={theme}>{children}</RestyleThemeProvider>
    </ThemePreferencesContext.Provider>
  );
}

export function useThemePreferences() {
  const context = useContext(ThemePreferencesContext);
  if (!context) throw new Error('useThemePreferences must be used within ThemePreferencesProvider');
  return context;
}
