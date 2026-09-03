import type { TeswaBackend } from '@/lib/backend/teswa-backend';
import { createSupabaseAuthAdapter } from '@/lib/backend/adapters/supabase/auth-adapter';
import { createSupabaseAnalyticsAdapter } from '@/lib/backend/adapters/supabase/analytics-adapter';
import { createSupabaseMediaStorageAdapter } from '@/lib/backend/adapters/supabase/media-adapter';
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
import type { DolabContract } from '@/lib/backend/contracts/dolab';
import type { PolicyAcceptanceContract } from '@/lib/backend/contracts/policies';
import type { ReviewsContract } from '@/lib/backend/contracts/reviews';

export type TeswaBackendRuntime = Pick<TeswaBackend, 'auth' | 'media'> & { profiles: ProfileSocialContract; marketplace: MarketplaceCoreContract; offers: OfferLifecycleContract; deals: DealLifecycleContract; realtime: MessagingRealtimeContract; directMessaging: DirectMessagingTransportContract; contextualMessaging: ContextualMessagingTransportContract; notifications: NotificationsContract; stories: StoriesContract; discovery: DiscoveryContract; dolab: DolabContract; analytics: AnalyticsContract; policies: PolicyAcceptanceContract; reviews: ReviewsContract };

export const teswaBackendRuntime: TeswaBackendRuntime = {
  auth: createSupabaseAuthAdapter(),
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
  stories: createSupabaseStoriesAdapter(),
  discovery: createSupabaseDiscoveryAdapter(),
  dolab: createSupabaseDolabAdapter(),
};
