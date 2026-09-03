import type { TeswaBackend } from '@/lib/backend/teswa-backend';
import { createSupabaseAuthAdapter } from '@/lib/backend/adapters/supabase/auth-adapter';
import { createSupabaseMediaStorageAdapter } from '@/lib/backend/adapters/supabase/media-adapter';
import { createSupabaseMarketplaceReadAdapter } from '@/lib/backend/adapters/supabase/marketplace-adapter';
import { createSupabaseProfileReadAdapter } from '@/lib/backend/adapters/supabase/profile-adapter';
import type { ProfileReadContract } from '@/lib/backend/contracts/profile';
import type { MarketplaceReadContract } from '@/lib/backend/contracts/marketplace';

export type TeswaBackendRuntime = Pick<TeswaBackend, 'auth' | 'media'> & { profiles: ProfileReadContract; marketplace: MarketplaceReadContract };

export const teswaBackendRuntime: TeswaBackendRuntime = {
  auth: createSupabaseAuthAdapter(),
  media: createSupabaseMediaStorageAdapter(),
  marketplace: createSupabaseMarketplaceReadAdapter(),
  profiles: createSupabaseProfileReadAdapter(),
};
