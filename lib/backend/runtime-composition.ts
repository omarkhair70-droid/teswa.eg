import type { TeswaBackendRuntime } from '@/lib/backend/runtime';

export type TeswaBackendProvider = 'supabase' | 'oracle';

// A provider must supply the entire runtime. Never fill missing Oracle
// capabilities with Supabase adapters: their sessions are not interchangeable.
const REQUIRED_CAPABILITIES: ReadonlyArray<keyof TeswaBackendRuntime> = [
  'auth', 'account', 'analytics', 'policies', 'media', 'marketplace',
  'offers', 'deals', 'realtime', 'directMessaging', 'contextualMessaging',
  'notifications', 'profiles', 'reviews', 'moderation', 'stories',
  'discovery', 'dolab',
];

export function selectTeswaBackendRuntime(
  provider: string | undefined,
  factories: {
    supabase: () => TeswaBackendRuntime;
    oracle?: () => TeswaBackendRuntime;
  },
): TeswaBackendRuntime {
  const selected = provider || 'supabase';
  if (selected !== 'supabase' && selected !== 'oracle') {
    throw new Error(`Unsupported Teswa backend provider: ${selected}`);
  }
  const factory = selected === 'oracle' ? factories.oracle : factories.supabase;
  if (!factory) {
    throw new Error(`Teswa ${selected} backend is not fully configured.`);
  }
  const runtime = factory();
  for (const capability of REQUIRED_CAPABILITIES) {
    if (runtime?.[capability] == null) {
      throw new Error(`Teswa ${selected} backend is missing ${capability}.`);
    }
  }
  return runtime;
}
