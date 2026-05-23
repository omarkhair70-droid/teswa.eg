import AsyncStorage from '@react-native-async-storage/async-storage';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'teswa-local-cache' });

function devLog(tag: 'storage_available' | 'migrated_key', value: boolean): void {
  if (!__DEV__) return;
  console.log(`[MMKV] ${tag} ${value}`);
}

let availabilityChecked = false;
let storageAvailable = false;

function isStorageAvailable(): boolean {
  if (availabilityChecked) return storageAvailable;
  try {
    storage.set('__teswa_mmkv_probe__', '1');
    storage.delete('__teswa_mmkv_probe__');
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
  try {
    return storage.getString(key) ?? null;
  } catch {
    return null;
  }
}

export function setString(key: string, value: string): boolean {
  if (!isStorageAvailable()) return false;
  try {
    storage.set(key, value);
    return true;
  } catch {
    return false;
  }
}

export function getBoolean(key: string): boolean | null {
  if (!isStorageAvailable()) return null;
  try {
    const value = storage.getBoolean(key);
    return typeof value === 'boolean' ? value : null;
  } catch {
    return null;
  }
}

export function setBoolean(key: string, value: boolean): boolean {
  if (!isStorageAvailable()) return false;
  try {
    storage.set(key, value);
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string): boolean {
  if (!isStorageAvailable()) return false;
  try {
    storage.delete(key);
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
    for (const key of SAFE_ASYNC_MIGRATIONS) {
      try {
        const existing = storage.getString(key);
        if (typeof existing === 'string') {
          devLog('migrated_key', false);
          continue;
        }
        const value = await AsyncStorage.getItem(key);
        if (typeof value !== 'string') {
          devLog('migrated_key', false);
          continue;
        }
        storage.set(key, value);
        await AsyncStorage.removeItem(key);
        devLog('migrated_key', true);
      } catch {
        devLog('migrated_key', false);
      }
    }
  })();
  return migrationPromise;
}
