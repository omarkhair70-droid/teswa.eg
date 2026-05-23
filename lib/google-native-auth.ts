import { Platform } from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

import { supabase } from '@/lib/supabase/client';

export const GOOGLE_NATIVE_AUTH_MODULE_VERSION = 'google-native-auth.android.ts.v1';
export type GoogleNativeAuthImplementation = 'android-native' | 'web-shim' | 'unknown';
export const GOOGLE_NATIVE_AUTH_IMPLEMENTATION: GoogleNativeAuthImplementation = 'android-native';

export type GoogleNativeAuthModuleInfo = {
  moduleVersion: string;
  implementation: GoogleNativeAuthImplementation;
  platform: string;
  hasSignInFunction: boolean;
};

export type NativeGoogleSignInResult = {
  status: 'success' | 'cancelled' | 'fallback' | 'error' | 'empty';
  error: string | null;
  implementation?: GoogleNativeAuthImplementation;
  moduleVersion?: string;
  code?: string;
  message?: string;
  resultType?: string;
  fallbackToBrowser?: boolean;
  reason?:
    | 'native_success'
    | 'non_android'
    | 'missing_web_client_id'
    | 'play_services_unavailable'
    | 'in_progress'
    | 'cancelled'
    | 'non_success_result'
    | 'missing_id_token'
    | 'supabase_session_failed'
    | 'empty_result'
    | 'native_exception';
};
type GoogleSignInDiagnosticFlow = 'native' | 'browser_fallback';
type GoogleSignInDiagnosticReason = NonNullable<NativeGoogleSignInResult['reason']>;
type GoogleNativeDiagnosticStep =
  | 'diagnostics_button_pressed'
  | 'module_info_observed'
  | 'calling_native_helper'
  | 'native_helper_returned'
  | 'native_helper_threw'
  | 'native_helper_returned_empty'
  | 'native_helper_not_function'
  | 'native_helper_entered'
  | 'native_timeout_no_result'
  | 'native_start'
  | 'config_check_start'
  | 'google_configure_done'
  | 'play_services_check_start'
  | 'play_services_check_done'
  | 'native_signout_start'
  | 'native_signout_done'
  | 'native_signin_start'
  | 'native_signin_resolved'
  | 'native_signin_empty'
  | 'native_result_cancelled'
  | 'native_result_non_success'
  | 'native_result_success'
  | 'native_missing_id_token'
  | 'supabase_id_token_start'
  | 'supabase_id_token_result'
  | 'native_success'
  | 'native_catch';

export type GoogleNativeDiagnosticsEvent = {
  flow: 'native_step';
  step: GoogleNativeDiagnosticStep;
  reason?: GoogleSignInDiagnosticReason;
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
};


export function getGoogleNativeAuthModuleInfo(): GoogleNativeAuthModuleInfo {
  return {
    moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION,
    implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION,
    platform: Platform.OS,
    hasSignInFunction: typeof signInWithGoogleNative === 'function',
  };
}

const GOOGLE_NATIVE_GENERIC_ERROR = 'تعذر تسجيل الدخول بجوجل. حاول مرة تانية.';
const GOOGLE_NATIVE_CANCELLED = 'تم إلغاء تسجيل الدخول بجوجل.';

let configured = false;
type GoogleNativeSignInOptions = {
  onStep?: (event: GoogleNativeDiagnosticsEvent) => void;
};

function emitGoogleNativeStep(event: GoogleNativeDiagnosticsEvent, options?: GoogleNativeSignInOptions) {
  console.log('[GoogleSignIn]', event);
  options?.onStep?.(event);
}

export function logGoogleSignInDiagnostic(flow: GoogleSignInDiagnosticFlow, reason: GoogleSignInDiagnosticReason) {
  console.log('[GoogleSignIn]', { flow, reason });
}

function configureGoogleSignin() {
  if (configured) return;

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  if (!webClientId) {
    return;
  }

  GoogleSignin.configure({
    webClientId,
  });

  configured = true;
}

export async function signInWithGoogleNative(options?: GoogleNativeSignInOptions): Promise<NativeGoogleSignInResult> {
  emitGoogleNativeStep({
    flow: 'native_step',
    step: 'native_helper_entered',
    platform: Platform.OS,
    implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION,
    moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION,
  }, options);
  emitGoogleNativeStep({ flow: 'native_step', step: 'native_start', platform: Platform.OS, implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION }, options);

  if (Platform.OS !== 'android') {
    logGoogleSignInDiagnostic('browser_fallback', 'non_android');
    return { status: 'fallback', error: null, fallbackToBrowser: true, reason: 'non_android', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION };
  }

  try {
    const hasWebClientId = Boolean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);
    emitGoogleNativeStep({ flow: 'native_step', step: 'config_check_start', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);
    configureGoogleSignin();
    emitGoogleNativeStep(
      {
        flow: 'native_step',
        step: 'google_configure_done',
        configured,
        hasWebClientId,
        hasNativeModule: typeof GoogleSignin.signIn === 'function',
        implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION,
    moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION,
      },
      options
    );

    if (!configured) {
      logGoogleSignInDiagnostic('browser_fallback', 'missing_web_client_id');
      return { status: 'fallback', error: null, fallbackToBrowser: true, reason: 'missing_web_client_id', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION };
    }

    emitGoogleNativeStep({ flow: 'native_step', step: 'play_services_check_start', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    emitGoogleNativeStep({ flow: 'native_step', step: 'play_services_check_done', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);

    emitGoogleNativeStep({ flow: 'native_step', step: 'native_signout_start', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);
    await GoogleSignin.signOut().catch(() => undefined);
    emitGoogleNativeStep({ flow: 'native_step', step: 'native_signout_done', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);

    emitGoogleNativeStep({ flow: 'native_step', step: 'native_signin_start', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);
    const userInfo = await GoogleSignin.signIn();
    if (!userInfo) {
      emitGoogleNativeStep({ flow: 'native_step', step: 'native_signin_empty', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);
      return {
        status: 'empty',
        error: 'تعذر استلام نتيجة تسجيل الدخول من جوجل. حاول مرة تانية.',
        fallbackToBrowser: true,
        reason: 'empty_result',
        implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION,
    moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION,
      };
    }

    const resultType = typeof userInfo === 'object' && userInfo !== null && 'type' in userInfo ? String(userInfo.type) : 'unknown';
    emitGoogleNativeStep({ flow: 'native_step', step: 'native_signin_resolved', resultType, implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);

    if (resultType === 'cancelled') {
      emitGoogleNativeStep({ flow: 'native_step', step: 'native_result_cancelled', isCancelled: true, implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);
      logGoogleSignInDiagnostic('native', 'cancelled');
      return { status: 'cancelled', error: GOOGLE_NATIVE_CANCELLED, fallbackToBrowser: false, reason: 'cancelled', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION };
    }

    if (resultType !== 'success') {
      emitGoogleNativeStep({ flow: 'native_step', step: 'native_result_non_success', resultType, implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);
      logGoogleSignInDiagnostic('browser_fallback', 'non_success_result');
      return { status: 'error', error: GOOGLE_NATIVE_GENERIC_ERROR, fallbackToBrowser: true, reason: 'non_success_result', resultType, implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION };
    }

    emitGoogleNativeStep({ flow: 'native_step', step: 'native_result_success', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);
    const successResult = userInfo as { data?: { idToken?: string | null } };
    const idToken = successResult.data?.idToken;

    if (!idToken) {
      emitGoogleNativeStep({ flow: 'native_step', step: 'native_missing_id_token', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);
      logGoogleSignInDiagnostic('native', 'missing_id_token');
      return {
        status: 'error',
        error: 'تعذر الحصول على بيانات تسجيل الدخول من جوجل. حاول مرة تانية.',
        fallbackToBrowser: true,
        reason: 'missing_id_token',
        implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION,
    moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION,
      };
    }

    emitGoogleNativeStep({ flow: 'native_step', step: 'supabase_id_token_start', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    emitGoogleNativeStep({ flow: 'native_step', step: 'supabase_id_token_result', hasError: Boolean(error), implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);

    if (error) {
      logGoogleSignInDiagnostic('native', 'supabase_session_failed');
      return {
        status: 'error',
        error: 'تم تسجيل الدخول بجوجل، لكن تعذر إكمال الجلسة. حاول مرة تانية.',
        fallbackToBrowser: true,
        reason: 'supabase_session_failed',
        implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION,
    moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION,
      };
    }

    emitGoogleNativeStep({ flow: 'native_step', step: 'native_success', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);
    logGoogleSignInDiagnostic('native', 'native_success');
    return { status: 'success', error: null, fallbackToBrowser: false, reason: 'native_success', implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION };
  } catch (err: unknown) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: unknown }).code) : undefined;
    const message = typeof err === 'object' && err !== null && 'message' in err ? String((err as { message?: unknown }).message) : undefined;
    const statusCode =
      typeof err === 'object' && err !== null && 'statusCode' in err ? String((err as { statusCode?: unknown }).statusCode) : undefined;

    emitGoogleNativeStep({ flow: 'native_step', step: 'native_catch', code, message, statusCode, implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION }, options);

    if (code === statusCodes.SIGN_IN_CANCELLED) {
      logGoogleSignInDiagnostic('native', 'cancelled');
      return { status: 'cancelled', error: GOOGLE_NATIVE_CANCELLED, fallbackToBrowser: false, reason: 'cancelled', code, message, implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION };
    }

    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      logGoogleSignInDiagnostic('browser_fallback', 'play_services_unavailable');
      return { status: 'fallback', error: null, fallbackToBrowser: true, reason: 'play_services_unavailable', code, message, implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION };
    }

    if (code === statusCodes.IN_PROGRESS) {
      logGoogleSignInDiagnostic('browser_fallback', 'in_progress');
      return { status: 'fallback', error: null, fallbackToBrowser: true, reason: 'in_progress', code, message, implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION };
    }

    logGoogleSignInDiagnostic('browser_fallback', 'native_exception');
    return { status: 'error', error: GOOGLE_NATIVE_GENERIC_ERROR, fallbackToBrowser: true, reason: 'native_exception', code, message, implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION, moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION };
  }
}
