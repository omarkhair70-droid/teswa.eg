import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { TeswaAuthSession } from '@/lib/backend/contracts/auth';

const ORACLE_AUTH_SESSION_KEY = 'teswa.oracle.auth.session.v1';
let memoryFallback: string | null = null;

function isSession(value: unknown): value is TeswaAuthSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<TeswaAuthSession>;
  return (
    typeof session.accessToken === 'string' &&
    session.accessToken.length > 0 &&
    (session.refreshToken === null || typeof session.refreshToken === 'string') &&
    (session.expiresAt === null || typeof session.expiresAt === 'number') &&
    Boolean(session.user) &&
    typeof session.user?.id === 'string'
  );
}

async function getRaw(): Promise<string | null> {
  try {
    const value = Platform.OS === 'web'
      ? await AsyncStorage.getItem(ORACLE_AUTH_SESSION_KEY)
      : await SecureStore.getItemAsync(ORACLE_AUTH_SESSION_KEY);
    memoryFallback = value;
    return value;
  } catch {
    return memoryFallback;
  }
}

async function setRaw(value: string | null): Promise<void> {
  memoryFallback = value;
  try {
    if (Platform.OS === 'web') {
      if (value === null) await AsyncStorage.removeItem(ORACLE_AUTH_SESSION_KEY);
      else await AsyncStorage.setItem(ORACLE_AUTH_SESSION_KEY, value);
      return;
    }
    if (value === null) await SecureStore.deleteItemAsync(ORACLE_AUTH_SESSION_KEY);
    else await SecureStore.setItemAsync(ORACLE_AUTH_SESSION_KEY, value);
  } catch {
    // Memory fallback preserves current-process continuity without exposing tokens.
  }
}

export async function readOracleAuthSession(): Promise<TeswaAuthSession | null> {
  const raw = await getRaw();
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isSession(parsed)) return parsed;
  } catch {
    // Corrupt state is cleared below.
  }
  await setRaw(null);
  return null;
}

export async function writeOracleAuthSession(session: TeswaAuthSession): Promise<void> {
  await setRaw(JSON.stringify(session));
}

export async function clearOracleAuthSession(): Promise<void> {
  await setRaw(null);
}
