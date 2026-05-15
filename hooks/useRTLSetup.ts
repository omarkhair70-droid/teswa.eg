import { useEffect } from 'react';
import { I18nManager, Platform } from 'react-native';

export function useRTLSetup() {
  useEffect(() => {
    I18nManager.allowRTL(true);
    if (Platform.OS === 'web') return;
    // Intentionally avoid forceRTL to preserve user/device preference in production.
  }, []);
}
