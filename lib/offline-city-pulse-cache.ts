import type { CityPulseLocation, CityPulseSnapshot } from '@/lib/city-pulse';
import {
  deleteOfflineJsonCache,
  pruneExpiredOfflineJsonCache,
  readOfflineJsonCache,
  writeOfflineJsonCache,
} from '@/lib/offline-cache';

const CITY_PULSE_LOCATION_CACHE_KEY = 'city-pulse:last-location:v1';
const CITY_PULSE_SNAPSHOT_CACHE_KEY = 'city-pulse:last-snapshot:v1';

const CITY_PULSE_LOCATION_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CITY_PULSE_SNAPSHOT_CACHE_TTL_MS = 5 * 60 * 1000;

export type CachedCityPulseLocation = {
  location: CityPulseLocation;
  updatedAtMs: number;
  isExpired: boolean;
};

export type CachedCityPulseSnapshot = {
  snapshot: CityPulseSnapshot;
  updatedAtMs: number;
  isExpired: boolean;
};

export async function readCityPulseLocationCache(): Promise<CachedCityPulseLocation | null> {
  const cached = await readOfflineJsonCache<CityPulseLocation>({
    key: CITY_PULSE_LOCATION_CACHE_KEY,
    allowExpired: true,
  });

  if (!cached) {
    return null;
  }

  return {
    location: cached.value,
    updatedAtMs: cached.updatedAtMs,
    isExpired: cached.isExpired,
  };
}

export async function writeCityPulseLocationCache(location: CityPulseLocation): Promise<void> {
  await writeOfflineJsonCache({
    key: CITY_PULSE_LOCATION_CACHE_KEY,
    value: location,
    ttlMs: CITY_PULSE_LOCATION_CACHE_TTL_MS,
  });
  void pruneExpiredOfflineJsonCache();
}

export async function deleteCityPulseLocationCache(): Promise<void> {
  await deleteOfflineJsonCache(CITY_PULSE_LOCATION_CACHE_KEY);
}

export async function readFreshCityPulseSnapshotCache(): Promise<CachedCityPulseSnapshot | null> {
  const cached = await readOfflineJsonCache<CityPulseSnapshot>({
    key: CITY_PULSE_SNAPSHOT_CACHE_KEY,
    allowExpired: false,
  });

  if (!cached) {
    return null;
  }

  return {
    snapshot: cached.value,
    updatedAtMs: cached.updatedAtMs,
    isExpired: cached.isExpired,
  };
}

export async function readAnyCityPulseSnapshotCache(): Promise<CachedCityPulseSnapshot | null> {
  const cached = await readOfflineJsonCache<CityPulseSnapshot>({
    key: CITY_PULSE_SNAPSHOT_CACHE_KEY,
    allowExpired: true,
  });

  if (!cached) {
    return null;
  }

  return {
    snapshot: cached.value,
    updatedAtMs: cached.updatedAtMs,
    isExpired: cached.isExpired,
  };
}

export async function writeCityPulseSnapshotCache(snapshot: CityPulseSnapshot): Promise<void> {
  await writeOfflineJsonCache({
    key: CITY_PULSE_SNAPSHOT_CACHE_KEY,
    value: snapshot,
    ttlMs: CITY_PULSE_SNAPSHOT_CACHE_TTL_MS,
  });
  void pruneExpiredOfflineJsonCache();
}

export async function deleteCityPulseSnapshotCache(): Promise<void> {
  await deleteOfflineJsonCache(CITY_PULSE_SNAPSHOT_CACHE_KEY);
}
