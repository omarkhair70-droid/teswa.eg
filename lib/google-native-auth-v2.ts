import { Platform } from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

import { supabase } from '@/lib/supabase/client';

export const GOOGLE_NATIVE_AUTH_MODULE_VERSION = 'google-native-auth-v2.android.ts.v1';
export type GoogleNativeAuthImplementation = 'android-native' | 'web-shim' | 'unknown';
export const GOOGLE_NATIVE_AUTH_IMPLEMENTATION: GoogleNativeAuthImplementation = 'android-native';

export type GoogleNativeAuthModuleInfo = {
  moduleVersion: string;
  implementation: GoogleNativeAuthImplementation;
  platform: string;
  hasSignInFunction: boolean;
};

export type NativeGoogleSignInResult = {
  status: 'success' | 'cancelled' | 'fallback' | 'error' | 'empty' | 'timeout';
  error: string | null;
  implementation?: GoogleNativeAuthImplementation;
  moduleVersion?: string;
  code?: string;
  message?: string;
  resultType?: string;
  fallbackToBrowser?: boolean;
  reason?: string;
  supabaseErrorName?: string;
  supabaseErrorMessage?: string;
  supabaseErrorStatus?: string;
  supabaseErrorCode?: string;
  audMatchesWebClientId?: boolean;
  tokenIssuer?: string;
  tokenExpired?: boolean;
  tokenAudSuffix?: string;
  tokenAzpSuffix?: string;
};

type GoogleSignInDiagnosticFlow = 'native' | 'browser_fallback';
export type GoogleNativeDiagnosticsEvent = {
  flow: 'native_step';
  step: string;
  reason?: string;
  resultType?: string;
  configured?: boolean;
  hasWebClientId?: boolean;
  hasNativeModule?: boolean;
  hasError?: boolean;
  message?: string;
  statusCode?: string;
  isCancelled?: boolean;
  hasIdToken?: boolean;
  hasUser?: boolean;
  code?: string;
  platform?: string;
  implementation?: GoogleNativeAuthImplementation;
  moduleVersion?: string;
  supabaseErrorName?: string;
  supabaseErrorMessage?: string;
  supabaseErrorStatus?: string;
  supabaseErrorCode?: string;
  audMatchesWebClientId?: boolean;
  tokenIssuer?: string;
  tokenExpired?: boolean;
  tokenAudSuffix?: string;
  tokenAzpSuffix?: string;
};

type GoogleNativeSignInOptions = { onStep?: (event: GoogleNativeDiagnosticsEvent) => void };
const GOOGLE_NATIVE_GENERIC_ERROR = 'تعذر تسجيل الدخول بجوجل. حاول مرة تانية.';
const GOOGLE_NATIVE_CANCELLED = 'تم إلغاء تسجيل الدخول بجوجل.';
let configured = false;

function emitGoogleNativeStep(event: GoogleNativeDiagnosticsEvent, options?: GoogleNativeSignInOptions) {
  console.log('[GoogleSignIn]', event);
  options?.onStep?.(event);
}

export function logGoogleSignInDiagnostic(flow: GoogleSignInDiagnosticFlow, reason: string) {
  console.log('[GoogleSignIn]', { flow, reason });
}

export function getGoogleNativeAuthModuleInfo(): GoogleNativeAuthModuleInfo {
  return {
    moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION,
    implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION,
    platform: Platform.OS,
    hasSignInFunction: typeof signInWithGoogleNative === 'function',
  };
}

function configureGoogleSignin() {
  if (configured) return;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) return;
  GoogleSignin.configure({ webClientId });
  configured = true;
}

type SafeIdTokenMetadata = {
  audMatchesWebClientId?: boolean;
  tokenIssuer?: string;
  tokenExpired?: boolean;
  tokenAudSuffix?: string;
  tokenAzpSuffix?: string;
};

function decodeIdTokenSafeMetadata(idToken: string, webClientId?: string): SafeIdTokenMetadata {
  try {
    const payloadPart = idToken.split('.')[1];
    if (!payloadPart) return {};
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = `${normalized}${'='.repeat((4 - (normalized.length % 4)) % 4)}`;
    const payloadRaw = globalThis.atob(padded);
    const payload = JSON.parse(payloadRaw) as { iss?: unknown; aud?: unknown; azp?: unknown; exp?: unknown };

    const iss = typeof payload.iss === 'string' ? payload.iss : undefined;
    const aud = typeof payload.aud === 'string' ? payload.aud : undefined;
    const azp = typeof payload.azp === 'string' ? payload.azp : undefined;
    const exp = typeof payload.exp === 'number' ? payload.exp : undefined;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const tokenExpired = typeof exp === 'number' ? exp <= nowSeconds : undefined;

    return {
      audMatchesWebClientId: Boolean(aud && webClientId && aud === webClientId),
      tokenIssuer: iss,
      tokenExpired,
      tokenAudSuffix: aud ? aud.slice(-8) : undefined,
      tokenAzpSuffix: azp ? azp.slice(-8) : undefined,
    };
  } catch {
    return {};
  }
}

export async function signInWithGoogleNative(options?: GoogleNativeSignInOptions): Promise<NativeGoogleSignInResult> {
  emitGoogleNativeStep({ flow: 'native_step', step: 'native_helper_entered', platform: Platform.OS, implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION }, options);
  emitGoogleNativeStep({ flow: 'native_step', step: 'native_start', platform: Platform.OS, implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION }, options);

  if (Platform.OS !== 'android') {
    logGoogleSignInDiagnostic('browser_fallback', 'non_android');
    return { status: 'fallback', error: null, fallbackToBrowser: true, reason: 'non_android', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION };
  }

  try {
    const hasWebClientId = Boolean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);
    emitGoogleNativeStep({ flow: 'native_step', step: 'config_check_start', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);
    configureGoogleSignin();
    emitGoogleNativeStep({ flow: 'native_step', step: 'google_configure_done', configured, hasWebClientId, hasNativeModule: typeof GoogleSignin.signIn === 'function', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION }, options);

    if (!configured) return { status: 'fallback', error: null, fallbackToBrowser: true, reason: 'missing_web_client_id', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION };

    emitGoogleNativeStep({ flow: 'native_step', step: 'play_services_check_start', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    emitGoogleNativeStep({ flow: 'native_step', step: 'play_services_check_done', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);

    emitGoogleNativeStep({ flow: 'native_step', step: 'native_signout_start', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);
    await GoogleSignin.signOut().catch(() => undefined);
    emitGoogleNativeStep({ flow: 'native_step', step: 'native_signout_done', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);

    emitGoogleNativeStep({ flow: 'native_step', step: 'native_signin_start', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);
    const userInfo = await GoogleSignin.signIn();
    if (!userInfo) return { status: 'empty', error: 'تعذر استلام نتيجة تسجيل الدخول من جوجل. حاول مرة تانية.', fallbackToBrowser: true, reason: 'empty_result', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION };

    const resultType = typeof userInfo === 'object' && userInfo !== null && 'type' in userInfo ? String(userInfo.type) : 'unknown';
    const hasUser = typeof userInfo === 'object' && userInfo !== null;
    emitGoogleNativeStep({ flow: 'native_step', step: 'native_signin_resolved', resultType, hasUser, implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);
    if (resultType === 'cancelled') return { status: 'cancelled', error: GOOGLE_NATIVE_CANCELLED, fallbackToBrowser: false, reason: 'cancelled', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION };
    if (resultType !== 'success') return { status: 'error', error: GOOGLE_NATIVE_GENERIC_ERROR, fallbackToBrowser: true, reason: 'non_success_result', resultType, implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION };

    const successResult = userInfo as { data?: { idToken?: string | null } };
    const idToken = successResult.data?.idToken;
    emitGoogleNativeStep({ flow: 'native_step', step: 'native_result_success', hasIdToken: Boolean(idToken), hasUser: true, implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);
    if (!idToken) return { status: 'error', error: 'تعذر الحصول على بيانات تسجيل الدخول من جوجل. حاول مرة تانية.', fallbackToBrowser: true, reason: 'missing_id_token', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION };

    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    const safeTokenMetadata = decodeIdTokenSafeMetadata(idToken, webClientId);
    emitGoogleNativeStep({ flow: 'native_step', step: 'supabase_id_token_start', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, ...safeTokenMetadata }, options);
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
    const supabaseErrorName = error && typeof error.name === 'string' ? error.name : undefined;
    const supabaseErrorMessage = error && typeof error.message === 'string' ? error.message : undefined;
    const supabaseErrorStatus = error && 'status' in error && (typeof error.status === 'number' || typeof error.status === 'string') ? String(error.status) : undefined;
    const supabaseErrorCode = error && typeof error.code === 'string' ? error.code : undefined;
    emitGoogleNativeStep({
      flow: 'native_step',
      step: 'supabase_id_token_result',
      hasError: Boolean(error),
      implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION,
      supabaseErrorName,
      supabaseErrorMessage,
      supabaseErrorStatus,
      supabaseErrorCode,
      ...safeTokenMetadata,
    }, options);
    if (error) return { status: 'error', error: 'تم تسجيل الدخول بجوجل، لكن تعذر إكمال الجلسة. حاول مرة تانية.', fallbackToBrowser: true, reason: 'supabase_session_failed', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION, supabaseErrorName, supabaseErrorMessage, supabaseErrorStatus, supabaseErrorCode, ...safeTokenMetadata };

    emitGoogleNativeStep({ flow: 'native_step', step: 'native_success', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);
    return { status: 'success', error: null, fallbackToBrowser: false, reason: 'native_success', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION };
  } catch (err: unknown) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: unknown }).code) : undefined;
    const message = typeof err === 'object' && err !== null && 'message' in err ? String((err as { message?: unknown }).message) : undefined;
    if (code === statusCodes.SIGN_IN_CANCELLED) return { status: 'cancelled', error: GOOGLE_NATIVE_CANCELLED, fallbackToBrowser: false, reason: 'cancelled', code, message, implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION };
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return { status: 'fallback', error: null, fallbackToBrowser: true, reason: 'play_services_unavailable', code, message, implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION };
    if (code === statusCodes.IN_PROGRESS) return { status: 'fallback', error: null, fallbackToBrowser: true, reason: 'in_progress', code, message, implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION };
    return { status: 'error', error: GOOGLE_NATIVE_GENERIC_ERROR, fallbackToBrowser: true, reason: 'native_exception', code, message, implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION };
  }
}
