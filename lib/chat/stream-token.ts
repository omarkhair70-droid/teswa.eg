import { supabase } from '@/lib/supabase/client';

type StreamTokenSuccess = { ok: true; apiKey: string; userId: string; token: string };
type StreamTokenFailure = { ok: false; message: string };

export async function fetchStreamChatToken(): Promise<StreamTokenSuccess | StreamTokenFailure> {
  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return { ok: false, message: 'Missing authenticated session.' };
    }

    const { data, error } = await supabase.functions.invoke<{
      userId?: unknown;
      token?: unknown;
      apiKey?: unknown;
      message?: unknown;
    }>('stream-chat-token', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      return { ok: false, message: error.message || 'Token endpoint request failed.' };
    }

    if (!data || typeof data.userId !== 'string' || typeof data.token !== 'string' || typeof data.apiKey !== 'string') {
      const message = typeof data?.message === 'string' ? data.message : 'Malformed token response.';
      return { ok: false, message };
    }

    return {
      ok: true,
      apiKey: data.apiKey,
      userId: data.userId,
      token: data.token,
    };
  } catch {
    return { ok: false, message: 'Unable to fetch Stream token right now.' };
  }
}
