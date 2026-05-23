export const queryKeys = {
  feed: {
    all: ['feed'] as const,
    homeFirstPage: ['feed', 'home-first-page'] as const,
  },
  itemDetail: {
    all: ['item-detail'] as const,
    byId: (itemId: string) => ['item-detail', itemId] as const,
  },
  profile: {
    all: ['profile'] as const,
    byId: (profileId: string) => ['profile', profileId] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    byUserId: (userId: string) => ['notifications', userId] as const,
  },
  search: {
    all: ['search'] as const,
    byTerm: (term: string) => ['search', term] as const,
  },
};
