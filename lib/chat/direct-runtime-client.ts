import { NativeDirectCompatClient } from '@/lib/chat/native-direct-channel';
import { fetchDirectRuntimeAuth } from '@/lib/chat/direct-runtime-auth';

type WarmDirectClient = {
  client: NativeDirectCompatClient;
  userId: string;
};

let warmClientState: WarmDirectClient | null = null;
let warmupPromise: Promise<void> | null = null;

async function createOrReuseConnectedClient() {
  const creds = await fetchDirectRuntimeAuth();
  if (!creds.ok) throw new Error(creds.message);

  if (warmClientState?.client && warmClientState.userId === creds.userId) return warmClientState;

  if (warmClientState?.client) {
    await warmClientState.client.disconnectUser().catch(() => undefined);
  }

  const client = new NativeDirectCompatClient(creds.userId);
  await client.connectUser();
  warmClientState = { client, userId: creds.userId };
  return warmClientState;
}

export async function getOrCreateDirectRuntimeClient() {
  const state = await createOrReuseConnectedClient();
  return state.client;
}

export function getWarmDirectRuntimeClientIfReady() {
  const state = warmClientState;
  if (!state?.client || state.client.userID !== state.userId) return null;
  return state.client;
}

export async function warmupDirectRuntimeClient() {
  if (warmupPromise) return warmupPromise;
  warmupPromise = (async () => {
    try { await createOrReuseConnectedClient(); } catch {}
  })().finally(() => {
    warmupPromise = null;
  });
  return warmupPromise;
}

export async function connectDirectRuntimeClient(input: { userId: string }) {
  if (warmClientState?.client && warmClientState.userId === input.userId) return warmClientState.client;
  if (warmClientState?.client) await warmClientState.client.disconnectUser().catch(() => undefined);

  const client = new NativeDirectCompatClient(input.userId);
  await client.connectUser();
  warmClientState = { client, userId: input.userId };
  return client;
}
