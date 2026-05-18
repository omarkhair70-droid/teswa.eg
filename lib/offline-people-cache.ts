import { readOfflineJsonCache, pruneExpiredOfflineJsonCache, writeOfflineJsonCache } from '@/lib/offline-cache';
import { PeopleDirectoryEntry } from '@/lib/people';

const PEOPLE_DEFAULT_DIRECTORY_CACHE_KEY = 'people:default-directory:v1';
const PEOPLE_DEFAULT_DIRECTORY_CACHE_TTL_MS = 10 * 60 * 1000;

export type CachedPeopleDefaultDirectory = {
  entries: PeopleDirectoryEntry[];
  updatedAtMs: number;
  isExpired: boolean;
};

export async function readFreshPeopleDefaultDirectoryCache(): Promise<CachedPeopleDefaultDirectory | null> {
  const cached = await readOfflineJsonCache<PeopleDirectoryEntry[]>({
    key: PEOPLE_DEFAULT_DIRECTORY_CACHE_KEY,
    allowExpired: false,
  });

  if (!cached) {
    return null;
  }

  return {
    entries: cached.value,
    updatedAtMs: cached.updatedAtMs,
    isExpired: cached.isExpired,
  };
}

export async function readAnyPeopleDefaultDirectoryCache(): Promise<CachedPeopleDefaultDirectory | null> {
  const cached = await readOfflineJsonCache<PeopleDirectoryEntry[]>({
    key: PEOPLE_DEFAULT_DIRECTORY_CACHE_KEY,
    allowExpired: true,
  });

  if (!cached) {
    return null;
  }

  return {
    entries: cached.value,
    updatedAtMs: cached.updatedAtMs,
    isExpired: cached.isExpired,
  };
}

export async function writePeopleDefaultDirectoryCache(entries: PeopleDirectoryEntry[]): Promise<void> {
  await writeOfflineJsonCache<PeopleDirectoryEntry[]>({
    key: PEOPLE_DEFAULT_DIRECTORY_CACHE_KEY,
    value: entries,
    ttlMs: PEOPLE_DEFAULT_DIRECTORY_CACHE_TTL_MS,
  });

  await pruneExpiredOfflineJsonCache();
}
