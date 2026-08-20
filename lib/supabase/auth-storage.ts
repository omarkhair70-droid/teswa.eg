import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

type TeswaMmkvStorage = ReturnType<typeof createMMKV>;

const LEGACY_MMKV_ID = 'teswa-supabase-auth';
const SECURE_MMKV_ID = 'teswa-supabase-auth-secure-v1';
const SECURE_MMKV_KEY_NAME = 'teswa.supabase.auth.mmkv-key.v1';

let legacyStorage: TeswaMmkvStorage | null = null;
let legacyStorageInitAttempted = false;
let secureStoragePromise: Promise<TeswaMmkvStorage | null> | null = null;

const startupAt = Date.now();
const startupLog = (event: string, data?: Record<string, unknown>) => {
  console.log('[StartupTiming]', event, { dtMs: Date.now() - startupAt, ...data });
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getLegacyStorage(): TeswaMmkvStorage | null {
  if (legacyStorageInitAttempted) return legacyStorage;
  legacyStorageInitAttempted = true;

  try {
    legacyStorage = createMMKV({ id: LEGACY_MMKV_ID });
    return legacyStorage;
  } catch {
    legacyStorage = null;
    return null;
  }
}

async function getOrCreateEncryptionKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(SECURE_MMKV_KEY_NAME);
  if (existing) return existing;

  const generated = bytesToHex(await Crypto.getRandomBytesAsync(32));
  await SecureStore.setItemAsync(SECURE_MMKV_KEY_NAME, generated);
  return generated;
}

async function initializeSecureStorage(): Promise<TeswaMmkvStorage | null> {
  if (Platform.OS === 'web') return null;

  try {
    const encryptionKey = await getOrCreateEncryptionKey();
    return createMMKV({
      id: SECURE_MMKV_ID,
      encryptionKey,
      encryptionType: 'AES-256',
    });
  } catch (error) {
    console.warn('[SupabaseAuthStorage] encrypted MMKV unavailable; using legacy fallback', {
      message: error instanceof Error ? error.message : 'unknown_error',
    });
    return null;
  }
}

function getSecureStorage(): Promise<TeswaMmkvStorage | null> {
  if (!secureStoragePromise) secureStoragePromise = initializeSecureStorage();
  return secureStoragePromise;
}

async function removeLegacyCopies(key: string): Promise<void> {
  const legacy = getLegacyStorage();
  if (legacy) {
    try {
      legacy.remove(key);
    } catch {}
  }

  try {
    await AsyncStorage.removeItem(key);
  } catch {}
}

async function readLegacyValue(key: string): Promise<{ value: string | null; source: 'mmkv' | 'async-storage' | null }> {
  const legacy = getLegacyStorage();
  if (legacy) {
    try {
      const value = legacy.getString(key);
      if (typeof value === 'string') return { value, source: 'mmkv' };
    } catch {}
  }

  try {
    const value = await AsyncStorage.getItem(key);
    if (typeof value === 'string') return { value, source: 'async-storage' };
  } catch {}

  return { value: null, source: null };
}

export const supabaseAuthStorage = {
  getItem: async (key: string) => {
    const startedAt = Date.now();

    if (Platform.OS === 'web') {
      const value = await AsyncStorage.getItem(key);
      startupLog('supabase_auth_storage_get_done', {
        secureHit: false,
        legacyHit: Boolean(value),
        migrated: false,
        platform: 'web',
        dtMs: Date.now() - startedAt,
      });
      return value;
    }

    const secure = await getSecureStorage();
    if (secure) {
      try {
        const value = secure.getString(key);
        if (typeof value === 'string') {
          startupLog('supabase_auth_storage_get_done', {
            secureHit: true,
            legacyHit: false,
            migrated: false,
            dtMs: Date.now() - startedAt,
          });
          return value;
        }
      } catch {}
    }

    const legacy = await readLegacyValue(key);
    let migrated = false;

    if (legacy.value && secure) {
      try {
        secure.set(key, legacy.value);
        await removeLegacyCopies(key);
        migrated = true;
      } catch {}
    }

    startupLog('supabase_auth_storage_get_done', {
      secureHit: false,
      legacyHit: Boolean(legacy.value),
      legacySource: legacy.source,
      migrated,
      dtMs: Date.now() - startedAt,
    });

    return legacy.value;
  },

  setItem: async (key: string, value: string) => {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, value);
      return;
    }

    const secure = await getSecureStorage();
    if (secure) {
      secure.set(key, value);
      await removeLegacyCopies(key);
      return;
    }

    // Preserve auth availability if the native secure store is temporarily
    // unavailable. This is intentionally a fallback, not a dual write.
    await AsyncStorage.setItem(key, value);
  },

  removeItem: async (key: string) => {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(key);
      return;
    }

    const secure = await getSecureStorage();
    if (secure) {
      try {
        secure.remove(key);
      } catch {}
    }

    await removeLegacyCopies(key);
  },
};
