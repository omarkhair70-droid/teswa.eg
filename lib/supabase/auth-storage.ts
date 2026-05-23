import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMMKV } from 'react-native-mmkv';

type TeswaMmkvStorage = ReturnType<typeof createMMKV>;

let storage: TeswaMmkvStorage | null = null;
let storageInitAttempted = false;

function getStorage(): TeswaMmkvStorage | null {
  if (storageInitAttempted) return storage;
  storageInitAttempted = true;
  try {
    storage = createMMKV({ id: 'teswa-supabase-auth' });
    return storage;
  } catch {
    storage = null;
    return null;
  }
}

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

    const storage = getStorage();
    if (storage) {
      try {
        const mmkvValue = storage.getString(key);
        if (typeof mmkvValue === 'string') {
          mmkvHit = true;
          return mmkvValue;
        }
      } catch {}
    }

    try {
      const legacyValue = await AsyncStorage.getItem(key);
      if (typeof legacyValue === 'string') {
        legacyHit = true;
        if (storage) {
          try {
            storage.set(key, legacyValue);
            migrated = true;
          } catch {}
        }
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
    const storage = getStorage();
    if (storage) {
      try {
        storage.set(key, value);
      } catch {}
    }
    await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    const storage = getStorage();
    if (storage) {
      try {
        storage.remove(key);
      } catch {}
    }
    await AsyncStorage.removeItem(key);
  },
};
