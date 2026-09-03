import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { logGoogleSignInDiagnostic, signInWithGoogleNative } from '@/lib/google-native-auth-v2';
import { teswaBackendRuntime } from '@/lib/backend/runtime';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_AUTH_ERROR = 'تعذر فتح تسجيل الدخول بجوجل. حاول مرة تانية.';
const GOOGLE_AUTH_CANCELLED = 'تم إلغاء تسجيل الدخول بجوجل.';
const GOOGLE_AUTH_CALLBACK_FAILED = 'تم الرجوع من جوجل، لكن تعذر إكمال تسجيل الدخول. حاول مرة تانية.';
const RECENT_CALLBACK_TTL_MS = 60_000;

let inFlightCallbackCompletion = new Map<string, Promise<{ error: string | null }>>();
let recentSuccessfulCallbacks = new Map<string, number>();
type QueryParamValue = string | string[] | undefined;
type OAuthCallbackParams = Record<string, QueryParamValue>;

type GoogleFlowReason =
  | 'native_disabled'
  | 'native_throw'
  | 'native_non_success'
  | 'native_error_present'
  | 'native_missing_reason'
  | 'native_missing_fallback_flag';

function logGoogleBrowserOAuthDiagnostic(
  step:
    | 'start'
    | 'redirect_uri_created'
    | 'supabase_oauth_url_created'
    | 'open_auth_session_start'
    | 'open_auth_session_result'
    | 'callback_completion_start'
    | 'callback_completion_result'
    | 'catch'
    | 'callback_received'
    | 'callback_has_error_params'
    | 'callback_has_tokens'
    | 'callback_has_code'
    | 'set_session_result'
    | 'exchange_code_result',
  details?: Record<string, boolean | string | null>
) {
  console.log('[GoogleOAuthBrowser]', { step, ...details });
}

function logGoogleNativeFallbackDiagnostic(reason: GoogleFlowReason, details?: Record<string, boolean | string | null>) {
  console.log('[GoogleSignIn]', { flow: 'native_to_browser_fallback', reason, ...details });
}

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
    logGoogleBrowserOAuthDiagnostic('callback_received');
    const { params, errorCode } = QueryParams.getQueryParams(url) as {
      params: OAuthCallbackParams;
      errorCode: string | null;
    };

    const hasErrorParams = Boolean(errorCode || params.error || params.error_description);
    logGoogleBrowserOAuthDiagnostic('callback_has_error_params', { hasErrorParams });
    if (errorCode || params.error || params.error_description) {
      return { error: GOOGLE_AUTH_CALLBACK_FAILED };
    }

    const hasTokens = Boolean(params.access_token && params.refresh_token);
    logGoogleBrowserOAuthDiagnostic('callback_has_tokens', { hasTokens });
    const code = typeof params.code === 'string' ? params.code : null;
    logGoogleBrowserOAuthDiagnostic('callback_has_code', { hasCode: Boolean(code) });
    if (!hasTokens && !code) {
      return { error: GOOGLE_AUTH_CALLBACK_FAILED };
    }

    const completionResult = await teswaBackendRuntime.auth.completeExternalSignIn(url);
    if (hasTokens) {
      logGoogleBrowserOAuthDiagnostic('set_session_result', { hasError: !completionResult.ok });
    } else {
      logGoogleBrowserOAuthDiagnostic('exchange_code_result', { hasError: !completionResult.ok });
    }
    return { error: completionResult.ok ? null : GOOGLE_AUTH_CALLBACK_FAILED };
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

export async function signInWithGoogleBrowserOAuth(): Promise<{ error: string | null }> {
  try {
    logGoogleBrowserOAuthDiagnostic('start');
    const redirectTo = makeRedirectUri({ scheme: 'teswa', path: 'auth/callback' });
    logGoogleBrowserOAuthDiagnostic('redirect_uri_created');

    const authStart = await teswaBackendRuntime.auth.startExternalSignIn({
      provider: 'google',
      redirectTo,
    });
    const authorizationUrl = authStart.ok ? authStart.data.authorizationUrl : null;
    logGoogleBrowserOAuthDiagnostic('supabase_oauth_url_created', {
      hasUrl: Boolean(authorizationUrl),
      hasSupabaseError: !authStart.ok,
    });

    if (!authStart.ok || !authorizationUrl) {
      return { error: GOOGLE_AUTH_ERROR };
    }

    logGoogleBrowserOAuthDiagnostic('open_auth_session_start');
    const result = await WebBrowser.openAuthSessionAsync(authorizationUrl, redirectTo);
    logGoogleBrowserOAuthDiagnostic('open_auth_session_result', { resultType: result.type });

    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { error: GOOGLE_AUTH_CANCELLED };
    }

    if (result.type !== 'success' || !result.url) {
      return { error: GOOGLE_AUTH_CALLBACK_FAILED };
    }

    logGoogleBrowserOAuthDiagnostic('callback_completion_start');
    const callbackResult = await completeGoogleOAuthFromUrl(result.url);
    logGoogleBrowserOAuthDiagnostic('callback_completion_result', { hasError: Boolean(callbackResult.error) });
    return callbackResult;
  } catch {
    logGoogleBrowserOAuthDiagnostic('catch', { reason: 'browser_exception' });
    return { error: GOOGLE_AUTH_ERROR };
  }
}

export async function testGoogleBrowserOAuthForDiagnostics(): Promise<{ error: string | null }> {
  return signInWithGoogleBrowserOAuth();
}

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  if (Platform.OS === 'web') {
    return signInWithGoogleBrowserOAuth();
  }

  const nativeGoogleEnabled = process.env.EXPO_PUBLIC_GOOGLE_NATIVE_ENABLED === 'true';
  if (!nativeGoogleEnabled) {
    logGoogleNativeFallbackDiagnostic('native_disabled');
    return signInWithGoogleBrowserOAuth();
  }

  try {
    const nativeResult = await signInWithGoogleNative();
    const nativeSuccess = nativeResult.status === 'success' && nativeResult.reason === 'native_success' && nativeResult.error === null;
    if (nativeSuccess) {
      return { error: null };
    }

    const activeSession = await teswaBackendRuntime.auth.getSession();
    const hasActiveSession = Boolean(activeSession);
    const sessionBackedNativeSuccess =
      hasActiveSession && (nativeResult.reason === 'native_success' || nativeResult.status === 'success');
    if (sessionBackedNativeSuccess) {
      return { error: null };
    }

    if (nativeResult.fallbackToBrowser === false) {
      logGoogleNativeFallbackDiagnostic('native_missing_fallback_flag', {
        status: nativeResult.status,
        reason: nativeResult.reason ?? null,
      });
    }

    logGoogleNativeFallbackDiagnostic('native_non_success', {
      status: nativeResult.status,
      reason: nativeResult.reason ?? 'unknown',
      hasError: Boolean(nativeResult.error),
    });

    if (nativeResult.reason) {
      logGoogleSignInDiagnostic('browser_fallback', nativeResult.reason);
    } else {
      logGoogleNativeFallbackDiagnostic('native_missing_reason');
    }

    return signInWithGoogleBrowserOAuth();
  } catch {
    logGoogleNativeFallbackDiagnostic('native_throw');
    return signInWithGoogleBrowserOAuth();
  }
}
