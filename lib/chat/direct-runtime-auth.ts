import { supabase } from '@/lib/supabase/client';

type DirectRuntimeAuthSuccess = { ok: true; apiKey: string; userId: string; token: string };
type DirectRuntimeAuthFailure = { ok: false; message: string };

export type DirectRuntimeAuthInput = {
  conversationId?: string;
  otherUserId?: string;
  displayName?: string;
  avatarUrl?: string;
};

export async function fetchDirectRuntimeAuth(_input?: DirectRuntimeAuthInput): Promise<DirectRuntimeAuthSuccess | DirectRuntimeAuthFailure> {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.user?.id || !session.access_token) {
      return { ok: false, message: 'Missing authenticated session.' };
    }

    return {
      ok: true,
      apiKey: 'teswa-native-direct',
      userId: session.user.id,
      token: session.access_token,
    };
  } catch {
    return { ok: false, message: 'Unable to resolve Direct Chat session right now.' };
  }
}
