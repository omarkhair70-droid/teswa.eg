import type { IsoDateTime } from '@/lib/backend/contracts/core';

export type CityPulseMovingItemRecord = {
  id: string;
  title: string;
  imageUrl: string | null;
  category: string | null;
  condition: string | null;
  city: string | null;
  area: string | null;
  ownerDisplayName: string | null;
  openInterestCount: number;
  latestInterestAt: IsoDateTime | null;
};

export type CityPulseStoryItemRecord = {
  id: string;
  title: string;
  imageUrl: string | null;
  category: string | null;
  city: string | null;
  area: string | null;
  ownerId: string | null;
  ownerDisplayName: string | null;
  storyLabel: 'حكاية العنصر' | 'ليه صاحبه بيبدله' | 'مفيد لمين';
  storySnippet: string;
  createdAt: IsoDateTime | null;
};

export type CityPulsePersonRecord = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  city: string | null;
  area: string | null;
  profileTagline: string | null;
  activeItemsCount: number;
};

export type CityPulseActiveStoryAuthorRecord = {
  author: {
    id: string;
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  storiesCount: number;
  latestCreatedAt: IsoDateTime;
};

export type CityPulseDataRecord = {
  movingItems: CityPulseMovingItemRecord[];
  storyItems: CityPulseStoryItemRecord[];
  people: CityPulsePersonRecord[];
  activeStoryAuthors: CityPulseActiveStoryAuthorRecord[];
};

export interface DiscoveryContract {
  getCityPulse(input: {
    matchTerms: string[];
    movingItemsLimit: number;
    storyItemsLimit: number;
    peopleLimit: number;
    storyAuthorsLimit: number;
  }): Promise<CityPulseDataRecord>;
}
