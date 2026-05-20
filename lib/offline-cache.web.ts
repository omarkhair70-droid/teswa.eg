export type OfflineJsonCacheRead<T> = {
  value: T;
  updatedAtMs: number;
  expiresAtMs: number | null;
  isExpired: boolean;
};

type OfflineEntry<T = unknown> = {
  value: T;
  updatedAtMs: number;
  expiresAtMs: number | null;
};

const memoryStore = new Map<string, OfflineEntry>();
const WEB_CACHE_PREFIX = 'teswa:offline-json-cache:';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function storageKey(key: string): string {
  return `${WEB_CACHE_PREFIX}${key}`;
}

function isExpiredEntry(expiresAtMs: number | null): boolean {
  return expiresAtMs !== null && expiresAtMs <= Date.now();
}

function readEntry(key: string): OfflineEntry | null {
  const storage = getStorage();
  if (storage) {
    try {
      const raw = storage.getItem(storageKey(key));
      if (raw) {
        const parsed = JSON.parse(raw) as OfflineEntry;
        return parsed;
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[offline-cache:web] read localStorage failed', error);
      }
    }
  }

  return memoryStore.get(key) ?? null;
}

function writeEntry(key: string, entry: OfflineEntry): void {
  memoryStore.set(key, entry);
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(storageKey(key), JSON.stringify(entry));
  } catch (error) {
    if (__DEV__) {
      console.warn('[offline-cache:web] write localStorage failed', error);
    }
  }
}

function deleteEntry(key: string): void {
  memoryStore.delete(key);
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.removeItem(storageKey(key));
  } catch (error) {
    if (__DEV__) {
      console.warn('[offline-cache:web] delete localStorage failed', error);
    }
  }
}

export async function writeOfflineJsonCache<T>(input: {
  key: string;
  value: T;
  ttlMs?: number | null;
}): Promise<void> {
  const key = input.key.trim();
  if (!key) return;

  const updatedAtMs = Date.now();
  const expiresAtMs = Number.isFinite(input.ttlMs) && Number(input.ttlMs) > 0
    ? updatedAtMs + Number(input.ttlMs)
    : null;

  writeEntry(key, {
    value: input.value,
    updatedAtMs,
    expiresAtMs,
  });
}

export async function readOfflineJsonCache<T>(input: {
  key: string;
  allowExpired?: boolean;
}): Promise<OfflineJsonCacheRead<T> | null> {
  const key = input.key.trim();
  if (!key) return null;

  const entry = readEntry(key);
  if (!entry) return null;

  const expired = isExpiredEntry(entry.expiresAtMs);
  if (expired && input.allowExpired !== true) {
    return null;
  }

  return {
    value: entry.value as T,
    updatedAtMs: entry.updatedAtMs,
    expiresAtMs: entry.expiresAtMs,
    isExpired: expired,
  };
}

export async function deleteOfflineJsonCache(keyInput: string): Promise<void> {
  const key = keyInput.trim();
  if (!key) return;

  deleteEntry(key);
}

export async function pruneExpiredOfflineJsonCache(): Promise<void> {
  const now = Date.now();

  for (const [key, entry] of memoryStore.entries()) {
    if (entry.expiresAtMs !== null && entry.expiresAtMs <= now) {
      memoryStore.delete(key);
    }
  }

  const storage = getStorage();
  if (!storage) return;

  try {
    const keysToDelete: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const rawKey = storage.key(index);
      if (!rawKey || !rawKey.startsWith(WEB_CACHE_PREFIX)) continue;
      const rawValue = storage.getItem(rawKey);
      if (!rawValue) continue;

      try {
        const parsed = JSON.parse(rawValue) as OfflineEntry;
        if (parsed.expiresAtMs !== null && parsed.expiresAtMs <= now) {
          keysToDelete.push(rawKey);
        }
      } catch {
        keysToDelete.push(rawKey);
      }
    }

    keysToDelete.forEach((k) => storage.removeItem(k));
  } catch (error) {
    if (__DEV__) {
      console.warn('[offline-cache:web] prune localStorage failed', error);
    }
  }
}
