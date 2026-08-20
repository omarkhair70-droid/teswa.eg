import { fetchDirectRuntimeAuth } from '@/lib/chat/direct-runtime-auth';

// Temporary compatibility shim for the existing Direct Chat screen.
// No Stream API key or Stream token exists at runtime; the canonical auth path is Supabase-native.
export async function fetchStreamChatToken() {
  const auth = await fetchDirectRuntimeAuth();
  if (!auth.ok) return auth;
  return {
    ok: true as const,
    apiKey: 'teswa-native-direct',
    userId: auth.userId,
    token: 'supabase-native-compat',
  };
}
