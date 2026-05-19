import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { signInWithGoogleNative } from '@/lib/google-native-auth';
import { supabase } from '@/lib/supabase/client';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_AUTH_ERROR = 'تعذر فتح تسجيل الدخول بجوجل. حاول مرة تانية.';
const GOOGLE_AUTH_CANCELLED = 'تم إلغاء تسجيل الدخول بجوجل.';
const GOOGLE_AUTH_CALLBACK_FAILED = 'تم الرجوع من جوجل، لكن تعذر إكمال تسجيل الدخول. حاول مرة تانية.';
const RECENT_CALLBACK_TTL_MS = 60_000;

let inFlightCallbackCompletion = new Map<string, Promise<{ error: string | null }>>();
let recentSuccessfulCallbacks = new Map<string, number>();
type QueryParamValue = string | string[] | undefined;
type OAuthCallbackParams = Record<string, QueryParamValue>;

export async function completeGoogleOAuthFromUrl(url: string): Promise<{ error: string | null }> {
  const existing = inFlightCallbackCompletion.get(url);
  if (existing) {
    return existing;
  }

  const now = Date.now();
  const lastSuccessAt = recentSuccessfulCallbacks.get(url);
  if (lastSuccessAt && now - lastSuccessAt < RECENT_CALLBACK_TTL_MS) {
    return { error: null };
  }

  const completionPromise = (async () => {
    const { params, errorCode } = QueryParams.getQueryParams(url) as {
      params: OAuthCallbackParams;
      errorCode: string | null;
    };

    if (errorCode || params.error || params.error_description) {
      return { error: GOOGLE_AUTH_CALLBACK_FAILED };
    }

    if (params.access_token && params.refresh_token) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: String(params.access_token),
        refresh_token: String(params.refresh_token),
      });

      return { error: sessionError ? GOOGLE_AUTH_CALLBACK_FAILED : null };
    }

    const code = typeof params.code === 'string' ? params.code : null;
    if (!code) {
      return { error: GOOGLE_AUTH_CALLBACK_FAILED };
    }

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    return { error: exchangeError ? GOOGLE_AUTH_CALLBACK_FAILED : null };
  })();

  inFlightCallbackCompletion.set(url, completionPromise);
  try {
    const result = await completionPromise;
    if (!result.error) {
      recentSuccessfulCallbacks.set(url, Date.now());
    }
    return result;
  } finally {
    inFlightCallbackCompletion.delete(url);
    const cutoff = Date.now() - RECENT_CALLBACK_TTL_MS;
    for (const [callbackUrl, completedAt] of recentSuccessfulCallbacks.entries()) {
      if (completedAt < cutoff) {
        recentSuccessfulCallbacks.delete(callbackUrl);
      }
    }
  }
}

async function signInWithGoogleBrowserOAuth(): Promise<{ error: string | null }> {
  try {
    const redirectTo = makeRedirectUri({ scheme: 'teswa', path: 'auth/callback' });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data?.url) {
      return { error: GOOGLE_AUTH_ERROR };
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { error: GOOGLE_AUTH_CANCELLED };
    }

    if (result.type !== 'success' || !result.url) {
      return { error: GOOGLE_AUTH_CALLBACK_FAILED };
    }

    return completeGoogleOAuthFromUrl(result.url);
  } catch {
    return { error: GOOGLE_AUTH_ERROR };
  }
}

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  if (Platform.OS === 'web') {
    return signInWithGoogleBrowserOAuth();
  }

  const nativeResult = await signInWithGoogleNative();
  if (!nativeResult.fallbackToBrowser) {
    return { error: nativeResult.error ?? GOOGLE_AUTH_ERROR };
  }

  return signInWithGoogleBrowserOAuth();
}
