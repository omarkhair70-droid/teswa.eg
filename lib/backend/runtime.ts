import type { TeswaBackend } from '@/lib/backend/teswa-backend';
import { createSupabaseAuthAdapter } from '@/lib/backend/adapters/supabase/auth-adapter';
import { createSupabaseMediaStorageAdapter } from '@/lib/backend/adapters/supabase/media-adapter';
import { createSupabaseMarketplaceReadAdapter } from '@/lib/backend/adapters/supabase/marketplace-adapter';
import { createSupabaseOfferLifecycleAdapter } from '@/lib/backend/adapters/supabase/offers-deals-adapter';
import { createSupabaseProfileAdapter } from '@/lib/backend/adapters/supabase/profile-adapter';
import type { ProfileCoreContract } from '@/lib/backend/contracts/profile';
import type { MarketplaceReadContract } from '@/lib/backend/contracts/marketplace';
import type { OfferLifecycleContract } from '@/lib/backend/contracts/offers-deals';

export type TeswaBackendRuntime = Pick<TeswaBackend, 'auth' | 'media'> & { profiles: ProfileCoreContract; marketplace: MarketplaceReadContract; offers: OfferLifecycleContract };

export const teswaBackendRuntime: TeswaBackendRuntime = {
  auth: createSupabaseAuthAdapter(),
  media: createSupabaseMediaStorageAdapter(),
  marketplace: createSupabaseMarketplaceReadAdapter(),
  offers: createSupabaseOfferLifecycleAdapter(),
  profiles: createSupabaseProfileAdapter(),
};
