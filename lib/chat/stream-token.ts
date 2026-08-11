import { supabase } from '@/lib/supabase/client';

type DirectRuntimeAuthSuccess = { ok: true; apiKey: string; userId: string; token: string };
type DirectRuntimeAuthFailure = { ok: false; message: string };

type DirectRuntimeAuthInput = {
  conversationId?: string;
  otherUserId?: string;
  displayName?: string;
  avatarUrl?: string;
};

// Compatibility export kept temporarily so the existing Direct Chat screen can
// cut over without a risky UI rewrite. No Stream endpoint or Stream secret is
// touched here: authentication is the existing Supabase session.
export async function fetchStreamChatToken(_input?: DirectRuntimeAuthInput): Promise<DirectRuntimeAuthSuccess | DirectRuntimeAuthFailure> {
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
