import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMMKV } from 'react-native-mmkv';

type TeswaMmkvStorage = ReturnType<typeof createMMKV>;

let storage: TeswaMmkvStorage | null = null;
let storageInitAttempted = false;

function getStorage(): TeswaMmkvStorage | null {
  if (storageInitAttempted) return storage;
  storageInitAttempted = true;
  try {
    storage = createMMKV({ id: 'teswa-local-cache' });
    return storage;
  } catch {
    storage = null;
    return null;
  }
}

function devLog(tag: 'storage_available' | 'migrated_key', value: boolean): void {
  if (!__DEV__) return;
  console.log(`[MMKV] ${tag} ${value}`);
}

let availabilityChecked = false;
let storageAvailable = false;

function isStorageAvailable(): boolean {
  if (availabilityChecked) return storageAvailable;
  const activeStorage = getStorage();
  if (!activeStorage) {
    storageAvailable = false;
    availabilityChecked = true;
    devLog('storage_available', storageAvailable);
    return storageAvailable;
  }
  try {
    activeStorage.set('__teswa_mmkv_probe__', '1');
    activeStorage.delete('__teswa_mmkv_probe__');
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  availabilityChecked = true;
  devLog('storage_available', storageAvailable);
  return storageAvailable;
}

export function getString(key: string): string | null {
  if (!isStorageAvailable()) return null;
  const activeStorage = getStorage();
  if (!activeStorage) return null;
  try {
    return activeStorage.getString(key) ?? null;
  } catch {
    return null;
  }
}

export function setString(key: string, value: string): boolean {
  if (!isStorageAvailable()) return false;
  const activeStorage = getStorage();
  if (!activeStorage) return false;
  try {
    activeStorage.set(key, value);
    return true;
  } catch {
    return false;
  }
}

export function getBoolean(key: string): boolean | null {
  if (!isStorageAvailable()) return null;
  const activeStorage = getStorage();
  if (!activeStorage) return null;
  try {
    const value = activeStorage.getBoolean(key);
    return typeof value === 'boolean' ? value : null;
  } catch {
    return null;
  }
}

export function setBoolean(key: string, value: boolean): boolean {
  if (!isStorageAvailable()) return false;
  const activeStorage = getStorage();
  if (!activeStorage) return false;
  try {
    activeStorage.set(key, value);
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string): boolean {
  if (!isStorageAvailable()) return false;
  const activeStorage = getStorage();
  if (!activeStorage) return false;
  try {
    activeStorage.delete(key);
    return true;
  } catch {
    return false;
  }
}

const SAFE_ASYNC_MIGRATIONS = ['teswa:onboarding_completed:v1'] as const;

let migrationPromise: Promise<void> | null = null;

export async function migrateSafeAsyncStorageKeysToMmkv(): Promise<void> {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    if (!isStorageAvailable()) return;
    const activeStorage = getStorage();
    if (!activeStorage) return;
    for (const key of SAFE_ASYNC_MIGRATIONS) {
      try {
        const existing = activeStorage.getString(key);
        if (typeof existing === 'string') {
          devLog('migrated_key', false);
          continue;
        }
        const value = await AsyncStorage.getItem(key);
        if (typeof value !== 'string') {
          devLog('migrated_key', false);
          continue;
        }
        activeStorage.set(key, value);
        devLog('migrated_key', true);
      } catch {
        devLog('migrated_key', false);
      }
    }
  })();
  return migrationPromise;
}
