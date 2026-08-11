// Temporary compatibility aliases for the existing Direct Chat screen.
// All implementations live in the Supabase-native Direct Chat runtime.
import {
  connectDirectRuntimeClient,
  getOrCreateDirectRuntimeClient,
  getWarmDirectRuntimeClientIfReady,
  warmupDirectRuntimeClient,
} from '@/lib/chat/direct-runtime-client';

export const getOrCreateStreamClient = getOrCreateDirectRuntimeClient;
export const getWarmStreamClientIfReady = getWarmDirectRuntimeClientIfReady;
export const warmupDirectStreamClient = warmupDirectRuntimeClient;

export async function connectStreamClientWithToken(input: { apiKey: string; userId: string; token: string }) {
  return connectDirectRuntimeClient({ userId: input.userId });
}
