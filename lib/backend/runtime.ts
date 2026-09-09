import type { TeswaBackend } from '@/lib/backend/teswa-backend';
import { selectTeswaBackendRuntime } from '@/lib/backend/runtime-composition';
import { createSupabaseAuthAdapter } from '@/lib/backend/adapters/supabase/auth-adapter';
import { createSupabaseAnalyticsAdapter } from '@/lib/backend/adapters/supabase/analytics-adapter';
import { createSupabaseAccountLifecycleAdapter } from '@/lib/backend/adapters/supabase/account-adapter';
import { createSupabaseMediaStorageAdapter } from '@/lib/backend/adapters/supabase/media-adapter';
import { createSupabaseModerationAdapter } from '@/lib/backend/adapters/supabase/moderation-adapter';
import { createOracleAuthAdapter } from '@/lib/backend/adapters/oracle/auth-adapter';
import { createOracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';
import { createOracleAccountLifecycleAdapter } from '@/lib/backend/adapters/oracle/account-adapter';
import { createOracleAnalyticsAdapter } from '@/lib/backend/adapters/oracle/analytics-adapter';
import { createOraclePolicyAcceptanceAdapter } from '@/lib/backend/adapters/oracle/policies-adapter';
import { createOracleMediaStorageAdapter } from '@/lib/backend/adapters/oracle/media-adapter';
import { createOracleMarketplaceReadAdapter } from '@/lib/backend/adapters/oracle/marketplace-read-adapter';
import { createOracleMarketplaceWriteAdapter } from '@/lib/backend/adapters/oracle/marketplace-write-adapter';
import { createOracleOfferLifecycleAdapter, createOracleDealLifecycleAdapter } from '@/lib/backend/adapters/oracle/exchange-lifecycle-adapter';
import { createOracleMessagingRealtimeAdapter } from '@/lib/backend/adapters/oracle/messaging-realtime-adapter';
import { createOracleDirectMessagingAdapter } from '@/lib/backend/adapters/oracle/direct-messaging-adapter';
import { createOracleContextualMessagingAdapter } from '@/lib/backend/adapters/oracle/contextual-messaging-adapter';
import { createOracleNotificationsAdapter } from '@/lib/backend/adapters/oracle/notifications-adapter';
import { createOracleProfileSocialAdapter } from '@/lib/backend/adapters/oracle/profile-core-adapter';
import { createOracleReviewsAdapter } from '@/lib/backend/adapters/oracle/reviews-adapter';
import { createOracleModerationAdapter } from '@/lib/backend/adapters/oracle/moderation-adapter';
import { createOracleStoriesAdapter } from '@/lib/backend/adapters/oracle/stories-adapter';
import { createOracleDiscoveryAdapter } from '@/lib/backend/adapters/oracle/discovery-adapter';
import { createOracleDolabAdapter } from '@/lib/backend/adapters/oracle/dolab-adapter';
import { createSupabaseMarketplaceReadAdapter } from '@/lib/backend/adapters/supabase/marketplace-adapter';
import { createSupabaseDirectMessagingAdapter } from '@/lib/backend/adapters/supabase/messaging-adapter';
import { createSupabaseContextualMessagingAdapter } from '@/lib/backend/adapters/supabase/contextual-messaging-adapter';
import { createSupabaseDiscoveryAdapter } from '@/lib/backend/adapters/supabase/discovery-adapter';
import { createSupabaseDolabAdapter } from '@/lib/backend/adapters/supabase/dolab-adapter';
import { createSupabaseMessagingRealtimeAdapter } from '@/lib/backend/adapters/supabase/messaging-realtime-adapter';
import { createSupabaseNotificationsAdapter } from '@/lib/backend/adapters/supabase/notifications-adapter';
import { createSupabasePolicyAcceptanceAdapter } from '@/lib/backend/adapters/supabase/policies-adapter';
import { createSupabaseDealLifecycleAdapter, createSupabaseOfferLifecycleAdapter } from '@/lib/backend/adapters/supabase/offers-deals-adapter';
import { createSupabaseProfileAdapter } from '@/lib/backend/adapters/supabase/profile-adapter';
import { createSupabaseReviewsAdapter } from '@/lib/backend/adapters/supabase/reviews-adapter';
import { createSupabaseStoriesAdapter } from '@/lib/backend/adapters/supabase/stories-adapter';
import type { ProfileSocialContract } from '@/lib/backend/contracts/profile';
import type { MarketplaceCoreContract } from '@/lib/backend/contracts/marketplace';
import type { DealLifecycleContract, OfferLifecycleContract } from '@/lib/backend/contracts/offers-deals';
import type { ContextualMessagingTransportContract, DirectMessagingTransportContract, MessagingRealtimeContract } from '@/lib/backend/contracts/messaging';
import type { NotificationsContract } from '@/lib/backend/contracts/notifications';
import type { StoriesContract } from '@/lib/backend/contracts/stories';
import type { DiscoveryContract } from '@/lib/backend/contracts/discovery';
import type { AnalyticsContract } from '@/lib/backend/contracts/analytics';
import type { AccountLifecycleContract } from '@/lib/backend/contracts/account';
import type { DolabContract } from '@/lib/backend/contracts/dolab';
import type { PolicyAcceptanceContract } from '@/lib/backend/contracts/policies';
import type { ReviewsContract } from '@/lib/backend/contracts/reviews';
import type { ModerationContract } from '@/lib/backend/contracts/moderation';

export type TeswaBackendRuntime = Pick<TeswaBackend, 'auth' | 'media'> & { profiles: ProfileSocialContract; marketplace: MarketplaceCoreContract; offers: OfferLifecycleContract; deals: DealLifecycleContract; realtime: MessagingRealtimeContract; directMessaging: DirectMessagingTransportContract; contextualMessaging: ContextualMessagingTransportContract; notifications: NotificationsContract; stories: StoriesContract; discovery: DiscoveryContract; dolab: DolabContract; analytics: AnalyticsContract; policies: PolicyAcceptanceContract; reviews: ReviewsContract; moderation: ModerationContract; account: AccountLifecycleContract };

export function createOracleBackendRuntime(): TeswaBackendRuntime {
  const auth = createOracleAuthAdapter();
  const transport = createOracleHttpTransport({ auth });
  return {
    auth,
    account: createOracleAccountLifecycleAdapter(transport),
    analytics: createOracleAnalyticsAdapter(transport),
    policies: createOraclePolicyAcceptanceAdapter(transport),
    media: createOracleMediaStorageAdapter({ transport }),
    marketplace: {
      ...createOracleMarketplaceReadAdapter(transport),
      ...createOracleMarketplaceWriteAdapter(transport),
    },
    offers: createOracleOfferLifecycleAdapter(transport),
    deals: createOracleDealLifecycleAdapter(transport),
    realtime: createOracleMessagingRealtimeAdapter(transport),
    directMessaging: createOracleDirectMessagingAdapter(transport),
    contextualMessaging: createOracleContextualMessagingAdapter(transport),
    notifications: createOracleNotificationsAdapter(transport),
    profiles: createOracleProfileSocialAdapter(transport),
    reviews: createOracleReviewsAdapter(transport),
    moderation: createOracleModerationAdapter(transport),
    stories: createOracleStoriesAdapter(transport),
    discovery: createOracleDiscoveryAdapter(transport),
    dolab: createOracleDolabAdapter(transport),
  };
}

// Production remains on Supabase. Oracle must supply a complete backend before
// it can be selected; an Oracle Auth + Supabase data hybrid is not supported.
export const teswaBackendRuntime: TeswaBackendRuntime = selectTeswaBackendRuntime(
  process.env.EXPO_PUBLIC_TESWA_BACKEND_PROVIDER,
  {
    supabase: () => ({
      auth: createSupabaseAuthAdapter(),
      account: createSupabaseAccountLifecycleAdapter(),
      analytics: createSupabaseAnalyticsAdapter(),
      policies: createSupabasePolicyAcceptanceAdapter(),
      media: createSupabaseMediaStorageAdapter(),
      marketplace: createSupabaseMarketplaceReadAdapter(),
      offers: createSupabaseOfferLifecycleAdapter(),
      deals: createSupabaseDealLifecycleAdapter(),
      realtime: createSupabaseMessagingRealtimeAdapter(),
      directMessaging: createSupabaseDirectMessagingAdapter(),
      contextualMessaging: createSupabaseContextualMessagingAdapter(),
      notifications: createSupabaseNotificationsAdapter(),
      profiles: createSupabaseProfileAdapter(),
      reviews: createSupabaseReviewsAdapter(),
      moderation: createSupabaseModerationAdapter(),
      stories: createSupabaseStoriesAdapter(),
      discovery: createSupabaseDiscoveryAdapter(),
      dolab: createSupabaseDolabAdapter(),
    }),
    oracle: createOracleBackendRuntime,
  },
);
