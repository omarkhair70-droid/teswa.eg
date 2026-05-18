import * as SQLite from 'expo-sqlite';

let offlineCacheDbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getOfflineCacheDb(): Promise<SQLite.SQLiteDatabase> {
  if (!offlineCacheDbPromise) {
    offlineCacheDbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('teswa-offline-cache.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS teswa_json_cache (
          cache_key TEXT PRIMARY KEY NOT NULL,
          payload_json TEXT NOT NULL,
          updated_at_ms INTEGER NOT NULL,
          expires_at_ms INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_teswa_json_cache_expires_at
        ON teswa_json_cache (expires_at_ms);
      `);
      return db;
    })();
  }

  return offlineCacheDbPromise;
}

export type OfflineJsonCacheRead<T> = {
  value: T;
  updatedAtMs: number;
  expiresAtMs: number | null;
  isExpired: boolean;
};

export async function writeOfflineJsonCache<T>(input: {
  key: string;
  value: T;
  ttlMs?: number | null;
}): Promise<void> {
  const key = input.key.trim();
  if (!key) {
    return;
  }

  try {
    const db = await getOfflineCacheDb();
    const updatedAtMs = Date.now();
    const expiresAtMs = Number.isFinite(input.ttlMs) && Number(input.ttlMs) > 0
      ? updatedAtMs + Number(input.ttlMs)
      : null;

    await db.runAsync(
      `
      INSERT INTO teswa_json_cache (cache_key, payload_json, updated_at_ms, expires_at_ms)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        payload_json = excluded.payload_json,
        updated_at_ms = excluded.updated_at_ms,
        expires_at_ms = excluded.expires_at_ms
      `,
      key,
      JSON.stringify(input.value),
      updatedAtMs,
      expiresAtMs,
    );
  } catch (error) {
    if (__DEV__) {
      console.warn('[offline-cache] write failed', error);
    }
  }
}

export async function readOfflineJsonCache<T>(input: {
  key: string;
  allowExpired?: boolean;
}): Promise<OfflineJsonCacheRead<T> | null> {
  const key = input.key.trim();
  if (!key) {
    return null;
  }

  try {
    const db = await getOfflineCacheDb();
    const row = await db.getFirstAsync<{ payload_json: string; updated_at_ms: number; expires_at_ms: number | null }>(
      'SELECT payload_json, updated_at_ms, expires_at_ms FROM teswa_json_cache WHERE cache_key = ?',
      key,
    );

    if (!row) {
      return null;
    }

    const expiresAtMs = row.expires_at_ms ?? null;
    const isExpired = expiresAtMs !== null && expiresAtMs <= Date.now();

    if (isExpired && input.allowExpired !== true) {
      return null;
    }

    return {
      value: JSON.parse(row.payload_json) as T,
      updatedAtMs: row.updated_at_ms,
      expiresAtMs,
      isExpired,
    };
  } catch (error) {
    if (__DEV__) {
      console.warn('[offline-cache] read failed', error);
    }
    return null;
  }
}

export async function deleteOfflineJsonCache(keyInput: string): Promise<void> {
  const key = keyInput.trim();
  if (!key) {
    return;
  }

  try {
    const db = await getOfflineCacheDb();
    await db.runAsync('DELETE FROM teswa_json_cache WHERE cache_key = ?', key);
  } catch (error) {
    if (__DEV__) {
      console.warn('[offline-cache] delete failed', error);
    }
  }
}

export async function pruneExpiredOfflineJsonCache(): Promise<void> {
  try {
    const db = await getOfflineCacheDb();
    await db.runAsync(
      `
      DELETE FROM teswa_json_cache
      WHERE expires_at_ms IS NOT NULL
      AND expires_at_ms <= ?
      `,
      Date.now(),
    );
  } catch (error) {
    if (__DEV__) {
      console.warn('[offline-cache] prune failed', error);
    }
  }
}
