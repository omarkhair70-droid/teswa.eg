import { teswaBackendRuntime } from '@/lib/backend/runtime';

export type PeopleDirectoryEntry = {
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
  createdAt: string | null;
};

export const PEOPLE_DIRECTORY_PAGE_SIZE = 24;

export type PeopleDirectoryPage = {
  entries: PeopleDirectoryEntry[];
  hasMore: boolean;
};

function sanitizePeopleSearchQuery(raw: string): string {
  return raw
    .trim()
    .slice(0, 80)
    .replace(/[%]/g, '')
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchPeopleDirectory(input?: {
  query?: string;
  page?: number;
  pageSize?: number;
}): Promise<PeopleDirectoryPage> {
  const query = sanitizePeopleSearchQuery(input?.query ?? '');
  const rawPage = Number(input?.page);
  const rawPageSize = Number(input?.pageSize);
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.max(1, Math.floor(rawPageSize))
    : PEOPLE_DIRECTORY_PAGE_SIZE;

  return teswaBackendRuntime.profiles.listPeople({
    query,
    page,
    pageSize,
  });
}
