import type { TeswaBackend } from '@/lib/backend/teswa-backend';
import { createSupabaseAuthAdapter } from '@/lib/backend/adapters/supabase/auth-adapter';
import { createSupabaseMediaStorageAdapter } from '@/lib/backend/adapters/supabase/media-adapter';
import { createSupabaseMarketplaceReadAdapter } from '@/lib/backend/adapters/supabase/marketplace-adapter';
import { createSupabaseDirectMessagingAdapter } from '@/lib/backend/adapters/supabase/messaging-adapter';
import { createSupabaseMessagingRealtimeAdapter } from '@/lib/backend/adapters/supabase/messaging-realtime-adapter';
import { createSupabaseNotificationsAdapter } from '@/lib/backend/adapters/supabase/notifications-adapter';
import { createSupabaseDealLifecycleAdapter, createSupabaseOfferLifecycleAdapter } from '@/lib/backend/adapters/supabase/offers-deals-adapter';
import { createSupabaseProfileAdapter } from '@/lib/backend/adapters/supabase/profile-adapter';
import type { ProfileSocialContract } from '@/lib/backend/contracts/profile';
import type { MarketplaceCoreContract } from '@/lib/backend/contracts/marketplace';
import type { DealLifecycleContract, OfferLifecycleContract } from '@/lib/backend/contracts/offers-deals';
import type { DirectMessagingTransportContract, MessagingRealtimeContract } from '@/lib/backend/contracts/messaging';
import type { NotificationsContract } from '@/lib/backend/contracts/notifications';

export type TeswaBackendRuntime = Pick<TeswaBackend, 'auth' | 'media'> & { profiles: ProfileSocialContract; marketplace: MarketplaceCoreContract; offers: OfferLifecycleContract; deals: DealLifecycleContract; realtime: MessagingRealtimeContract; directMessaging: DirectMessagingTransportContract; notifications: NotificationsContract };

export const teswaBackendRuntime: TeswaBackendRuntime = {
  auth: createSupabaseAuthAdapter(),
  media: createSupabaseMediaStorageAdapter(),
  marketplace: createSupabaseMarketplaceReadAdapter(),
  offers: createSupabaseOfferLifecycleAdapter(),
  deals: createSupabaseDealLifecycleAdapter(),
  realtime: createSupabaseMessagingRealtimeAdapter(),
  directMessaging: createSupabaseDirectMessagingAdapter(),
  notifications: createSupabaseNotificationsAdapter(),
  profiles: createSupabaseProfileAdapter(),
};
