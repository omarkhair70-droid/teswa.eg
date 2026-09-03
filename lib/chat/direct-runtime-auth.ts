import { teswaBackendRuntime } from '@/lib/backend/runtime';

type DirectRuntimeAuthSuccess = { ok: true; userId: string };
type DirectRuntimeAuthFailure = { ok: false; message: string };

export type DirectRuntimeAuthInput = {
  conversationId?: string;
  otherUserId?: string;
  displayName?: string;
  avatarUrl?: string;
};

export async function fetchDirectRuntimeAuth(_input?: DirectRuntimeAuthInput): Promise<DirectRuntimeAuthSuccess | DirectRuntimeAuthFailure> {
  try {
    const session = await teswaBackendRuntime.auth.getSession();

    if (!session?.user?.id) {
      return { ok: false, message: 'Missing authenticated session.' };
    }

    return {
      ok: true,
      userId: session.user.id,
    };
  } catch {
    return { ok: false, message: 'Unable to resolve Direct Chat session right now.' };
  }
}
