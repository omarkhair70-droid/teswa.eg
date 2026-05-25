export type DolabViewMode = 'all' | 'media' | 'drafts' | 'notes' | 'ready' | 'issues' | 'inbox';
export type DolabSortMode = 'newest' | 'oldest' | 'ready';
export type DolabStatusFilter = 'all' | 'saved' | 'temporary' | 'failed' | 'published';

export function includesQuery(values: Array<string | null | undefined>, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return values.some((value) => (value ?? '').toLowerCase().includes(q));
}

export function byTime<T>(items: T[], getTime: (item: T) => number, sort: DolabSortMode, getReadyScore?: (item: T) => number): T[] {
  const cloned = [...items];
  if (sort === 'ready' && getReadyScore) {
    return cloned.sort((a, b) => getReadyScore(b) - getReadyScore(a) || getTime(b) - getTime(a));
  }
  return cloned.sort((a, b) => (sort === 'oldest' ? getTime(a) - getTime(b) : getTime(b) - getTime(a)));
}
