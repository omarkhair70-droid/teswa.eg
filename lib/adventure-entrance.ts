import AsyncStorage from '@react-native-async-storage/async-storage';
import { getString, migrateSafeAsyncStorageKeysToMmkv, setString } from '@/lib/storage/mmkv-storage';

export const ADVENTURE_ENTRANCE_SEEN_KEY = 'teswa.hasSeenAdventureEntrance.v1';
export const ADVENTURE_MUTE_KEY = 'teswa.adventureEntranceMuted.v1';

export async function getAdventureEntranceSeen(): Promise<boolean> {
  await migrateSafeAsyncStorageKeysToMmkv();
  const mmkv = getString(ADVENTURE_ENTRANCE_SEEN_KEY);
  if (mmkv !== null) return mmkv === 'true';
  try {
    const fallback = await AsyncStorage.getItem(ADVENTURE_ENTRANCE_SEEN_KEY);
    return fallback === 'true';
  } catch {
    return false;
  }
}

export async function setAdventureEntranceSeen(seen: boolean): Promise<void> {
  await migrateSafeAsyncStorageKeysToMmkv();
  const value = seen ? 'true' : 'false';
  setString(ADVENTURE_ENTRANCE_SEEN_KEY, value);
  try { await AsyncStorage.setItem(ADVENTURE_ENTRANCE_SEEN_KEY, value); } catch {}
}

export async function getAdventureMuted(): Promise<boolean> {
  await migrateSafeAsyncStorageKeysToMmkv();
  const mmkv = getString(ADVENTURE_MUTE_KEY);
  if (mmkv !== null) return mmkv === 'true';
  try {
    const fallback = await AsyncStorage.getItem(ADVENTURE_MUTE_KEY);
    return fallback === 'true';
  } catch {
    return false;
  }
}

export async function setAdventureMuted(muted: boolean): Promise<void> {
  await migrateSafeAsyncStorageKeysToMmkv();
  const value = muted ? 'true' : 'false';
  setString(ADVENTURE_MUTE_KEY, value);
  try { await AsyncStorage.setItem(ADVENTURE_MUTE_KEY, value); } catch {}
}
