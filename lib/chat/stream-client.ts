import { fetchStreamChatToken } from '@/lib/chat/stream-token';

type WarmStreamClient = {
  client: any;
  userId: string;
};

let warmClientState: WarmStreamClient | null = null;
let warmupPromise: Promise<void> | null = null;

function devLog(message: string) {
  if (__DEV__) console.log(message);
}

async function createOrReuseConnectedClient() {
  if (warmClientState?.client && warmClientState.userId === warmClientState.client?.userID) {
    devLog('[direct/stream] warmup reused existing client');
    return warmClientState;
  }

  const creds = await fetchStreamChatToken();
  if (!creds.ok) throw new Error(creds.message);

  const { StreamChat } = await import('stream-chat');
  const client = StreamChat.getInstance(creds.apiKey);
  const alreadyConnectedUser = typeof client.userID === 'string' ? client.userID : null;

  if (alreadyConnectedUser === creds.userId) {
    warmClientState = { client, userId: creds.userId };
    devLog('[direct/stream] warmup reused existing client');
    return warmClientState;
  }

  if (alreadyConnectedUser && alreadyConnectedUser !== creds.userId && typeof client.disconnectUser === 'function') {
    await client.disconnectUser();
  }

  await client.connectUser({ id: creds.userId }, creds.token);
  warmClientState = { client, userId: creds.userId };
  devLog('[direct/stream] warmup connected');
  return warmClientState;
}

export async function getOrCreateStreamClient() {
  const state = await createOrReuseConnectedClient();
  return state.client;
}

export function getWarmStreamClientIfReady() {
  const state = warmClientState;
  if (!state?.client) return null;
  const connectedUser = typeof state.client.userID === 'string' ? state.client.userID : null;
  if (!connectedUser || connectedUser !== state.userId) return null;
  return state.client;
}

export async function warmupDirectStreamClient() {
  if (warmupPromise) return warmupPromise;

  warmupPromise = (async () => {
    try {
      devLog('[direct/stream] warmup started');
      await createOrReuseConnectedClient();
    } catch {
      // Keep warmup silent; direct screen will cold-connect as fallback.
    }
  })().finally(() => {
    warmupPromise = null;
  });

  return warmupPromise;
}
