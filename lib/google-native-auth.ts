import { Platform } from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

import { supabase } from '@/lib/supabase/client';

export type NativeGoogleSignInResult = {
  error: string | null;
  fallbackToBrowser?: boolean;
  reason?:
    | 'native_success'
    | 'non_android'
    | 'missing_web_client_id'
    | 'play_services_unavailable'
    | 'in_progress'
    | 'cancelled'
    | 'missing_id_token'
    | 'supabase_session_failed'
    | 'native_exception';
};
type GoogleSignInDiagnosticFlow = 'native' | 'browser_fallback';
type GoogleSignInDiagnosticReason = NonNullable<NativeGoogleSignInResult['reason']>;
type GoogleNativeDiagnosticStep =
  | 'native_start'
  | 'config_check_start'
  | 'google_configure_done'
  | 'play_services_check_start'
  | 'play_services_check_done'
  | 'native_signout_start'
  | 'native_signout_done'
  | 'native_signin_start'
  | 'native_signin_resolved'
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
  hasError?: boolean;
  code?: string;
  platform?: string;
};

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
  emitGoogleNativeStep({ flow: 'native_step', step: 'native_start', platform: Platform.OS }, options);

  if (Platform.OS !== 'android') {
    logGoogleSignInDiagnostic('browser_fallback', 'non_android');
    return { error: null, fallbackToBrowser: true, reason: 'non_android' };
  }

  try {
    emitGoogleNativeStep({ flow: 'native_step', step: 'config_check_start' }, options);
    configureGoogleSignin();
    emitGoogleNativeStep({ flow: 'native_step', step: 'google_configure_done', configured }, options);

    if (!configured) {
      logGoogleSignInDiagnostic('browser_fallback', 'missing_web_client_id');
      return { error: null, fallbackToBrowser: true, reason: 'missing_web_client_id' };
    }

    emitGoogleNativeStep({ flow: 'native_step', step: 'play_services_check_start' }, options);
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    emitGoogleNativeStep({ flow: 'native_step', step: 'play_services_check_done' }, options);

    emitGoogleNativeStep({ flow: 'native_step', step: 'native_signout_start' }, options);
    await GoogleSignin.signOut().catch(() => undefined);
    emitGoogleNativeStep({ flow: 'native_step', step: 'native_signout_done' }, options);

    emitGoogleNativeStep({ flow: 'native_step', step: 'native_signin_start' }, options);
    const userInfo = await GoogleSignin.signIn();
    const resultType = typeof userInfo === 'object' && userInfo !== null && 'type' in userInfo ? String(userInfo.type) : 'unknown';
    emitGoogleNativeStep({ flow: 'native_step', step: 'native_signin_resolved', resultType }, options);

    if (resultType === 'cancelled') {
      emitGoogleNativeStep({ flow: 'native_step', step: 'native_result_cancelled' }, options);
      logGoogleSignInDiagnostic('native', 'cancelled');
      return { error: GOOGLE_NATIVE_CANCELLED, fallbackToBrowser: false, reason: 'cancelled' };
    }

    if (resultType !== 'success') {
      emitGoogleNativeStep({ flow: 'native_step', step: 'native_result_non_success', resultType }, options);
      logGoogleSignInDiagnostic('browser_fallback', 'native_exception');
      return { error: null, fallbackToBrowser: true, reason: 'native_exception' };
    }

    emitGoogleNativeStep({ flow: 'native_step', step: 'native_result_success' }, options);
    const successResult = userInfo as { data?: { idToken?: string | null } };
    const idToken = successResult.data?.idToken;

    if (!idToken) {
      emitGoogleNativeStep({ flow: 'native_step', step: 'native_missing_id_token' }, options);
      logGoogleSignInDiagnostic('native', 'missing_id_token');
      return {
        error: 'تعذر الحصول على بيانات تسجيل الدخول من جوجل. حاول مرة تانية.',
        fallbackToBrowser: true,
        reason: 'missing_id_token',
      };
    }

    emitGoogleNativeStep({ flow: 'native_step', step: 'supabase_id_token_start' }, options);
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    emitGoogleNativeStep({ flow: 'native_step', step: 'supabase_id_token_result', hasError: Boolean(error) }, options);

    if (error) {
      logGoogleSignInDiagnostic('native', 'supabase_session_failed');
      return {
        error: 'تم تسجيل الدخول بجوجل، لكن تعذر إكمال الجلسة. حاول مرة تانية.',
        fallbackToBrowser: true,
        reason: 'supabase_session_failed',
      };
    }

    emitGoogleNativeStep({ flow: 'native_step', step: 'native_success' }, options);
    logGoogleSignInDiagnostic('native', 'native_success');
    return { error: null, fallbackToBrowser: false, reason: 'native_success' };
  } catch (err: unknown) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: unknown }).code) : undefined;

    emitGoogleNativeStep({ flow: 'native_step', step: 'native_catch', code }, options);

    if (code === statusCodes.SIGN_IN_CANCELLED) {
      logGoogleSignInDiagnostic('native', 'cancelled');
      return { error: GOOGLE_NATIVE_CANCELLED, fallbackToBrowser: false, reason: 'cancelled' };
    }

    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      logGoogleSignInDiagnostic('browser_fallback', 'play_services_unavailable');
      return { error: null, fallbackToBrowser: true, reason: 'play_services_unavailable' };
    }

    if (code === statusCodes.IN_PROGRESS) {
      logGoogleSignInDiagnostic('browser_fallback', 'in_progress');
      return { error: null, fallbackToBrowser: true, reason: 'in_progress' };
    }

    logGoogleSignInDiagnostic('browser_fallback', 'native_exception');
    return { error: null, fallbackToBrowser: true, reason: 'native_exception' };
  }
}
