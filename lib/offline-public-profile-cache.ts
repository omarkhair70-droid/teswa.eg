import { PublicProfile, PublicProfileListing } from '@/lib/profiles';
import {
  deleteOfflineJsonCache,
  pruneExpiredOfflineJsonCache,
  readOfflineJsonCache,
  writeOfflineJsonCache,
} from '@/lib/offline-cache';

const publicProfileCacheKey = (profileId: string) => `profile:public:v1:${profileId.trim()}`;
const publicProfileListingsCacheKey = (profileId: string) => `profile:public-listings:v1:${profileId.trim()}`;

const PUBLIC_PROFILE_CACHE_TTL_MS = 15 * 60 * 1000;
const PUBLIC_PROFILE_LISTINGS_CACHE_TTL_MS = 5 * 60 * 1000;

export type CachedPublicProfile = {
  profile: PublicProfile;
  updatedAtMs: number;
  isExpired: boolean;
};

export type CachedPublicProfileListings = {
  listings: PublicProfileListing[];
  updatedAtMs: number;
  isExpired: boolean;
};

export async function readFreshPublicProfileCache(profileId: string): Promise<CachedPublicProfile | null> {
  if (!profileId.trim()) {
    return null;
  }

  const cached = await readOfflineJsonCache<PublicProfile>({
    key: publicProfileCacheKey(profileId),
    allowExpired: false,
  });

  if (!cached) {
    return null;
  }

  return {
    profile: cached.value,
    updatedAtMs: cached.updatedAtMs,
    isExpired: cached.isExpired,
  };
}

export async function readAnyPublicProfileCache(profileId: string): Promise<CachedPublicProfile | null> {
  if (!profileId.trim()) {
    return null;
  }

  const cached = await readOfflineJsonCache<PublicProfile>({
    key: publicProfileCacheKey(profileId),
    allowExpired: true,
  });

  if (!cached) {
    return null;
  }

  return {
    profile: cached.value,
    updatedAtMs: cached.updatedAtMs,
    isExpired: cached.isExpired,
  };
}

export async function writePublicProfileCache(profileId: string, profile: PublicProfile): Promise<void> {
  if (!profileId.trim()) {
    return;
  }

  await writeOfflineJsonCache<PublicProfile>({
    key: publicProfileCacheKey(profileId),
    value: profile,
    ttlMs: PUBLIC_PROFILE_CACHE_TTL_MS,
  });

  void pruneExpiredOfflineJsonCache();
}

export async function deletePublicProfileCache(profileId: string): Promise<void> {
  if (!profileId.trim()) {
    return;
  }

  await deleteOfflineJsonCache(publicProfileCacheKey(profileId));
}

export async function readFreshPublicProfileListingsCache(profileId: string): Promise<CachedPublicProfileListings | null> {
  if (!profileId.trim()) {
    return null;
  }

  const cached = await readOfflineJsonCache<PublicProfileListing[]>({
    key: publicProfileListingsCacheKey(profileId),
    allowExpired: false,
  });

  if (!cached) {
    return null;
  }

  return {
    listings: cached.value,
    updatedAtMs: cached.updatedAtMs,
    isExpired: cached.isExpired,
  };
}

export async function readAnyPublicProfileListingsCache(profileId: string): Promise<CachedPublicProfileListings | null> {
  if (!profileId.trim()) {
    return null;
  }

  const cached = await readOfflineJsonCache<PublicProfileListing[]>({
    key: publicProfileListingsCacheKey(profileId),
    allowExpired: true,
  });

  if (!cached) {
    return null;
  }

  return {
    listings: cached.value,
    updatedAtMs: cached.updatedAtMs,
    isExpired: cached.isExpired,
  };
}

export async function writePublicProfileListingsCache(profileId: string, listings: PublicProfileListing[]): Promise<void> {
  if (!profileId.trim()) {
    return;
  }

  await writeOfflineJsonCache<PublicProfileListing[]>({
    key: publicProfileListingsCacheKey(profileId),
    value: listings,
    ttlMs: PUBLIC_PROFILE_LISTINGS_CACHE_TTL_MS,
  });

  void pruneExpiredOfflineJsonCache();
}

export async function deletePublicProfileListingsCache(profileId: string): Promise<void> {
  if (!profileId.trim()) {
    return;
  }

  await deleteOfflineJsonCache(publicProfileListingsCacheKey(profileId));
}
