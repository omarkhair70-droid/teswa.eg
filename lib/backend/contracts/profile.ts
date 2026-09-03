import type { IsoDateTime, TeswaPage, TeswaResult } from '@/lib/backend/contracts/core';

export type TeswaProfile = {
  id: string;
  displayName: string | null;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  city: string | null;
  createdAt: IsoDateTime | null;
};

export type ProfileTrustSnapshot = {
  completedDeals: number;
  reviewsCount: number;
  followersCount: number;
  followingCount: number;
  trustScore: number | null;
};

export type ProfileBadge = {
  key: string;
  labelAr: string;
  category: string;
};

export type ProfileFollowState = {
  isFollowing: boolean;
  followsYou: boolean;
  isBlockedEitherDirection: boolean;
};

export interface ProfileContract {
  getMine(userId: string): Promise<TeswaProfile | null>;
  getPublic(profileId: string): Promise<TeswaProfile | null>;

  updateMine(input: {
    userId: string;
    displayName?: string;
    username?: string;
    bio?: string | null;
    city?: string | null;
  }): Promise<TeswaResult<TeswaProfile, 'username_taken' | 'validation' | 'not_found' | 'unknown'>>;

  getTrust(profileId: string): Promise<ProfileTrustSnapshot>;
  getBadges(profileId: string): Promise<ProfileBadge[]>;
  getFollowState(viewerId: string, profileId: string): Promise<ProfileFollowState>;
  follow(viewerId: string, profileId: string): Promise<TeswaResult<void, 'blocked' | 'unknown'>>;
  unfollow(viewerId: string, profileId: string): Promise<TeswaResult<void, 'unknown'>>;

  searchPeople(query: string, options?: { cursor?: string | null; limit?: number }): Promise<TeswaPage<TeswaProfile>>;
}
