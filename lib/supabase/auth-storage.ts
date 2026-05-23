import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMMKV } from 'react-native-mmkv';

const supabaseAuthStorageMmkv = createMMKV({ id: 'teswa-supabase-auth' });

const startupAt = Date.now();
const startupLog = (event: string, data?: Record<string, unknown>) => {
  console.log('[StartupTiming]', event, { dtMs: Date.now() - startupAt, ...data });
};

export const supabaseAuthStorage = {
  getItem: async (key: string) => {
    const startedAt = Date.now();
    let mmkvHit = false;
    let legacyHit = false;
    let migrated = false;

    try {
      const mmkvValue = supabaseAuthStorageMmkv.getString(key);
      if (typeof mmkvValue === 'string') {
        mmkvHit = true;
        return mmkvValue;
      }
    } catch {}

    try {
      const legacyValue = await AsyncStorage.getItem(key);
      if (typeof legacyValue === 'string') {
        legacyHit = true;
        try {
          supabaseAuthStorageMmkv.set(key, legacyValue);
          migrated = true;
        } catch {}
      }
      return legacyValue;
    } finally {
      startupLog('supabase_auth_storage_get_done', {
        mmkvHit,
        legacyHit,
        migrated,
        dtMs: Date.now() - startedAt,
      });
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      supabaseAuthStorageMmkv.set(key, value);
    } catch {}
    await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    try {
      supabaseAuthStorageMmkv.remove(key);
    } catch {}
    await AsyncStorage.removeItem(key);
  },
};
