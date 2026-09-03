import type { TeswaBackend } from '@/lib/backend/teswa-backend';
import { createSupabaseAuthAdapter } from '@/lib/backend/adapters/supabase/auth-adapter';
import { createSupabaseMediaStorageAdapter } from '@/lib/backend/adapters/supabase/media-adapter';
import { createSupabaseProfileReadAdapter } from '@/lib/backend/adapters/supabase/profile-adapter';
import type { ProfileReadContract } from '@/lib/backend/contracts/profile';

export type TeswaBackendRuntime = Pick<TeswaBackend, 'auth' | 'media'> & { profiles: ProfileReadContract };

export const teswaBackendRuntime: TeswaBackendRuntime = {
  auth: createSupabaseAuthAdapter(),
  media: createSupabaseMediaStorageAdapter(),
  profiles: createSupabaseProfileReadAdapter(),
};
