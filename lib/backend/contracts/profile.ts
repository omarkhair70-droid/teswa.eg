import type { IsoDateTime, TeswaPage, TeswaResult } from '@/lib/backend/contracts/core';

export type TeswaProfile = {
  id: string;
  displayName: string | null;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  city: string | null;
  area: string | null;
  profileTagline: string | null;
  successfulSwapsCount: number | null;
  responseRate: number | null;
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

export interface ProfileReadContract {
  getMine(userId: string): Promise<TeswaProfile | null>;
  getPublic(profileId: string): Promise<TeswaProfile | null>;
}

export type DirectMessagePrivacy = 'everyone' | 'followers_only' | 'no_one';

export interface ProfileCoreContract extends ProfileReadContract {
  setupMine(input: {
    userId: string;
    displayName: string;
    username: string;
  }): Promise<TeswaResult<void, 'username_taken' | 'unknown'>>;

  getDirectMessagePrivacy(userId: string): Promise<DirectMessagePrivacy>;
  updateDirectMessagePrivacy(
    userId: string,
    value: DirectMessagePrivacy,
  ): Promise<TeswaResult<void, 'unknown'>>;

  setProfileImageUrl(
    userId: string,
    kind: 'avatar' | 'cover',
    imageUrl: string | null,
  ): Promise<TeswaResult<void, 'not_found' | 'unknown'>>;

  updateMine(input: {
    userId: string;
    displayName: string;
    username: string;
    profileTagline?: string | null;
    bio?: string | null;
    city?: string | null;
    area?: string | null;
  }): Promise<TeswaResult<TeswaProfile, 'username_taken' | 'validation' | 'not_found' | 'unknown'>>;
}

export interface ProfileContract extends ProfileCoreContract {

  getTrust(profileId: string): Promise<ProfileTrustSnapshot>;
  getBadges(profileId: string): Promise<ProfileBadge[]>;
  getFollowState(viewerId: string, profileId: string): Promise<ProfileFollowState>;
  follow(viewerId: string, profileId: string): Promise<TeswaResult<void, 'blocked' | 'unknown'>>;
  unfollow(viewerId: string, profileId: string): Promise<TeswaResult<void, 'unknown'>>;

  searchPeople(query: string, options?: { cursor?: string | null; limit?: number }): Promise<TeswaPage<TeswaProfile>>;
}


export type SocialFollowState = {
  followingByMe: boolean;
  followsMe: boolean;
  mutual: boolean;
  followerCount: number;
  followingCount: number;
};

export type SocialActionOutcome = {
  message: string;
  code: string | null;
};

export type UserBlockStateSnapshot = {
  blockedByMe: boolean;
  blockedMe: boolean;
  isBlockedEitherDirection: boolean;
};

export type BlockedProfileRecord = {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  blockedAt: IsoDateTime | null;
};

export type ProfileConnectionRecord = {
  profileId: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  city: string | null;
  area: string | null;
};

export type TrustLevelKey =
  | 'new_swapper'
  | 'rising_swapper'
  | 'reliable_swapper'
  | 'trusted_swapper';

export type DetailedTrustMetrics = {
  userId: string;
  successfulSwapsCount: number;
  completedDealsCount: number;
  cancelledDealsCount: number;
  totalReviewsReceived: number;
  averageRating: number | null;
  clearDescriptionCount: number;
  goodCommunicationCount: number;
  onTimeCount: number;
  respectfulSwapperCount: number;
  responseRate: number | null;
  avgResponseTimeMinutes: number | null;
  trustLevelKey: TrustLevelKey;
  trustScore: number;
};

export type DetailedProfileBadge = {
  badgeKey: string;
  labelAr: string;
  descriptionAr: string;
  category: string;
  iconName: string | null;
  priority: number;
  awardedAt: IsoDateTime;
};

export interface ProfileSocialContract extends ProfileCoreContract, ProfileDirectoryContract {
  getFollowState(viewerId: string, profileId: string): Promise<SocialFollowState>;
  follow(viewerId: string, profileId: string): Promise<TeswaResult<SocialActionOutcome, 'unknown'>>;
  unfollow(viewerId: string, profileId: string): Promise<TeswaResult<SocialActionOutcome, 'unknown'>>;
  listConnections(
    profileId: string,
    mode: 'followers' | 'following',
    limit?: number,
  ): Promise<ProfileConnectionRecord[]>;

  getBlockState(viewerId: string, profileId: string): Promise<UserBlockStateSnapshot>;
  listBlocked(viewerId: string): Promise<BlockedProfileRecord[]>;
  block(viewerId: string, profileId: string): Promise<TeswaResult<SocialActionOutcome, 'unknown'>>;
  unblock(viewerId: string, profileId: string): Promise<TeswaResult<SocialActionOutcome, 'unknown'>>;

  getTrustMetrics(profileId: string): Promise<DetailedTrustMetrics | null>;
  getMyTrustMetrics(): Promise<DetailedTrustMetrics | null>;

  getBadges(profileId: string): Promise<DetailedProfileBadge[]>;
  getMyBadges(): Promise<DetailedProfileBadge[]>;
  refreshMyBadges(): Promise<string[]>;
}


export type PeopleDirectoryRecord = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  profileTagline: string | null;
  bio: string | null;
  city: string | null;
  area: string | null;
  successfulSwapsCount: number;
  responseRate: number | null;
  activeItemsCount: number;
  createdAt: IsoDateTime | null;
};

export type PeopleDirectoryResult = {
  entries: PeopleDirectoryRecord[];
  hasMore: boolean;
};

export interface ProfileDirectoryContract {
  listPeople(input: {
    query?: string;
    page: number;
    pageSize: number;
  }): Promise<PeopleDirectoryResult>;
}
