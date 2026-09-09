import { teswaBackendRuntime } from '@/lib/backend/runtime';

export type CityPulseLocation = {
  label: string;
  matchTerms: string[];
};

export type CityPulseMovingItem = {
  id: string;
  title: string;
  imageUrl: string | null;
  category: string | null;
  condition: string | null;
  city: string | null;
  area: string | null;
  ownerDisplayName: string | null;
  openInterestCount: number;
  latestInterestAt: string | null;
};

export type CityPulseStoryItem = {
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
  createdAt: string | null;
};

export type CityPulsePerson = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  city: string | null;
  area: string | null;
  profileTagline: string | null;
  activeItemsCount: number;
};

export type CityPulseStoryAuthor = {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export type CityPulseActiveStorySummary = {
  author: CityPulseStoryAuthor;
  storiesCount: number;
  latestCreatedAt: string;
};

export type CityPulseSnapshot = {
  location: CityPulseLocation;
  movingItems: CityPulseMovingItem[];
  storyItems: CityPulseStoryItem[];
  people: CityPulsePerson[];
  activeStoryAuthors: CityPulseActiveStorySummary[];
};

const clamp = (
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(normalized)));
};

function normalizeCityPulseMatchTerms(matchTerms: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const term of matchTerms) {
    const normalized = term.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= 6) break;
  }

  return output;
}

export async function fetchCityPulseSnapshot(input: {
  location: CityPulseLocation;
  limits?: {
    movingItems?: number;
    storyItems?: number;
    people?: number;
    storyAuthors?: number;
  };
}): Promise<CityPulseSnapshot> {
  const matchTerms = normalizeCityPulseMatchTerms(input.location.matchTerms);
  if (!matchTerms.length) {
    return {
      location: input.location,
      movingItems: [],
      storyItems: [],
      people: [],
      activeStoryAuthors: [],
    };
  }

  const result = await teswaBackendRuntime.discovery.getCityPulse({
    matchTerms,
    movingItemsLimit: clamp(input.limits?.movingItems, 1, 16, 8),
    storyItemsLimit: clamp(input.limits?.storyItems, 1, 16, 8),
    peopleLimit: clamp(input.limits?.people, 1, 16, 8),
    storyAuthorsLimit: clamp(input.limits?.storyAuthors, 1, 16, 10),
  });

  return {
    location: input.location,
    movingItems: result.movingItems,
    storyItems: result.storyItems,
    people: result.people,
    activeStoryAuthors: result.activeStoryAuthors,
  };
}
