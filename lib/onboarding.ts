import AsyncStorage from '@react-native-async-storage/async-storage';

import { getString, migrateSafeAsyncStorageKeysToMmkv, setString } from '@/lib/storage/mmkv-storage';

export const ONBOARDING_STORAGE_KEY = 'teswa:onboarding_completed:v1';

export async function getOnboardingCompleted(): Promise<boolean> {
  await migrateSafeAsyncStorageKeysToMmkv();
  const value = getString(ONBOARDING_STORAGE_KEY);
  if (value !== null) return value === 'true';

  const fallback = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
  return fallback === 'true';
}

export async function setOnboardingCompleted(completed = true): Promise<void> {
  await migrateSafeAsyncStorageKeysToMmkv();
  const value = completed ? 'true' : 'false';
  setString(ONBOARDING_STORAGE_KEY, value);
  try {
    await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, value);
  } catch {
    // Keep non-throwing behavior if MMKV already persisted the value.
  }
}
