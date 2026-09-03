import type { TeswaBackend } from '@/lib/backend/teswa-backend';
import { createSupabaseAuthAdapter } from '@/lib/backend/adapters/supabase/auth-adapter';

export type TeswaBackendRuntime = Pick<TeswaBackend, 'auth'>;

export const teswaBackendRuntime: TeswaBackendRuntime = {
  auth: createSupabaseAuthAdapter(),
};
