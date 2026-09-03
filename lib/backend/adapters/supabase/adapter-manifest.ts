export const SUPABASE_ADAPTER_MIGRATION_MANIFEST = {
  auth: {
    target: 'lib/backend/adapters/supabase/auth-adapter.ts',
    legacyFiles: [
      'lib/account-deletion.ts',
    ],
  },
  profiles: {
    target: 'lib/backend/adapters/supabase/profile-adapter.ts',
    legacyFiles: [
      'lib/profiles.ts',
      'lib/people.ts',
      'lib/user-follows.ts',
      'lib/trust-metrics.ts',
      'lib/badges.ts',
      'lib/direct-privacy.ts',
    ],
  },
  marketplace: {
    target: 'lib/backend/adapters/supabase/marketplace-adapter.ts',
    legacyFiles: [
      'lib/marketplace-items.ts',
      'lib/publish-item.ts',
      'lib/edit-listing.ts',
      'lib/edit-listing-images.ts',
      'lib/listing-lifecycle.ts',
      'lib/item-likes.ts',
      'lib/item-videos.ts',
    ],
  },
  offersDeals: {
    target: 'lib/backend/adapters/supabase/offers-deals-adapter.ts',
    legacyFiles: ['lib/offers.ts', 'lib/deals.ts', 'lib/messages.ts', 'lib/reviews.ts'],
  },
  messaging: {
    target: 'lib/backend/adapters/supabase/messaging-adapter.ts',
    legacyFiles: [
      'lib/direct-messages.ts',
      'lib/chat/supabase-direct-chat.ts',
      'lib/contextual-conversations.ts',
      'app/(tabs)/messages.tsx',
      'app/contextual/[id].tsx',
      'app/deal/[id].tsx',
    ],
  },
  media: {
    target: 'lib/backend/adapters/supabase/media-adapter.ts',
    legacyFiles: [
      'lib/profile-images.ts',
      'lib/stories.ts',
      'lib/item-videos.ts',
      'lib/dolab/upload.ts',
      'lib/dolab/signed-urls.ts',
      'lib/chat/supabase-direct-chat.ts',
    ],
  },
  notifications: {
    target: 'lib/backend/adapters/supabase/notifications-adapter.ts',
    legacyFiles: [
      'lib/notifications.ts',
      'lib/notification-preferences.ts',
      'lib/push-notifications.ts',
      'lib/unread-badges.tsx',
    ],
  },
  analytics: {
    target: 'lib/backend/adapters/supabase/analytics-adapter.ts',
    legacyFiles: ['lib/analytics.ts'],
  },
} as const;

export type SupabaseAdapterDomain = keyof typeof SUPABASE_ADAPTER_MIGRATION_MANIFEST;
