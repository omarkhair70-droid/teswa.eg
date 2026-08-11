import { NativeDirectCompatClient } from '@/lib/chat/native-direct-channel';
import { fetchStreamChatToken } from '@/lib/chat/stream-token';

type WarmDirectClient = {
  client: NativeDirectCompatClient;
  userId: string;
};

let warmClientState: WarmDirectClient | null = null;
let warmupPromise: Promise<void> | null = null;

function devLog(message: string) {
  if (__DEV__) console.log(message);
}

async function createOrReuseConnectedClient() {
  const creds = await fetchStreamChatToken();
  if (!creds.ok) throw new Error(creds.message);

  if (warmClientState?.client && warmClientState.userId === creds.userId) {
    devLog('[direct/native] reused warm Supabase client');
    return warmClientState;
  }

  if (warmClientState?.client) {
    await warmClientState.client.disconnectUser().catch(() => undefined);
  }

  const client = new NativeDirectCompatClient(creds.userId);
  await client.connectUser();
  warmClientState = { client, userId: creds.userId };
  devLog('[direct/native] connected Supabase Direct Chat runtime');
  return warmClientState;
}

export async function getOrCreateStreamClient() {
  const state = await createOrReuseConnectedClient();
  return state.client;
}

export function getWarmStreamClientIfReady() {
  const state = warmClientState;
  if (!state?.client || state.client.userID !== state.userId) return null;
  return state.client;
}

export async function warmupDirectStreamClient() {
  if (warmupPromise) return warmupPromise;

  warmupPromise = (async () => {
    try {
      await createOrReuseConnectedClient();
    } catch {
      // Warmup is best-effort. The Direct screen can connect on demand.
    }
  })().finally(() => {
    warmupPromise = null;
  });

  return warmupPromise;
}

export async function connectStreamClientWithToken(input: { apiKey: string; userId: string; token: string }) {
  if (warmClientState?.client && warmClientState.userId === input.userId) return warmClientState.client;
  if (warmClientState?.client) await warmClientState.client.disconnectUser().catch(() => undefined);

  const client = new NativeDirectCompatClient(input.userId);
  await client.connectUser();
  warmClientState = { client, userId: input.userId };
  return client;
}
