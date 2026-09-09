export const SUPABASE_ADAPTER_MIGRATION_MANIFEST = {
  auth: {
    target: 'lib/backend/adapters/supabase/auth-adapter.ts',
    legacyFiles: [
    ],
  },
  profiles: {
    target: 'lib/backend/adapters/supabase/profile-adapter.ts',
    legacyFiles: [
    ],
  },
  marketplace: {
    target: 'lib/backend/adapters/supabase/marketplace-adapter.ts',
    legacyFiles: [
    ],
  },
  offersDeals: {
    target: 'lib/backend/adapters/supabase/offers-deals-adapter.ts',
    legacyFiles: ['lib/reviews.ts'],
  },
  messaging: {
    target: 'lib/backend/adapters/supabase/messaging-adapter.ts',
    legacyFiles: [
    ],
  },
  media: {
    target: 'lib/backend/adapters/supabase/media-adapter.ts',
    legacyFiles: [],
  },
  notifications: {
    target: 'lib/backend/adapters/supabase/notifications-adapter.ts',
    legacyFiles: [
    ],
  },
  analytics: {
    target: 'lib/backend/adapters/supabase/analytics-adapter.ts',
    legacyFiles: ['lib/analytics.ts'],
  },
} as const;

export type SupabaseAdapterDomain = keyof typeof SUPABASE_ADAPTER_MIGRATION_MANIFEST;
