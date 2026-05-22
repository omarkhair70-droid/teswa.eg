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

const GOOGLE_NATIVE_GENERIC_ERROR = 'تعذر تسجيل الدخول بجوجل. حاول مرة تانية.';
const GOOGLE_NATIVE_CANCELLED = 'تم إلغاء تسجيل الدخول بجوجل.';

let configured = false;

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

export async function signInWithGoogleNative(): Promise<NativeGoogleSignInResult> {
  console.log('[GoogleSignIn]', { flow: 'native_step', step: 'native_start', platform: Platform.OS });

  if (Platform.OS !== 'android') {
    logGoogleSignInDiagnostic('browser_fallback', 'non_android');
    return { error: null, fallbackToBrowser: true, reason: 'non_android' };
  }

  try {
    console.log('[GoogleSignIn]', { flow: 'native_step', step: 'config_check_start' });
    console.log('[GoogleSignIn]', { flow: 'native_step', step: 'google_configure_start' });
    configureGoogleSignin();
    console.log('[GoogleSignIn]', { flow: 'native_step', step: 'google_configure_done', configured });

    if (!configured) {
      console.log('[GoogleSignIn]', { flow: 'native_step', step: 'config_missing_web_client_id' });
      logGoogleSignInDiagnostic('browser_fallback', 'missing_web_client_id');
      return { error: null, fallbackToBrowser: true, reason: 'missing_web_client_id' };
    }

    console.log('[GoogleSignIn]', { flow: 'native_step', step: 'play_services_check_start' });
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    console.log('[GoogleSignIn]', { flow: 'native_step', step: 'play_services_check_done' });

    console.log('[GoogleSignIn]', { flow: 'native_step', step: 'native_signout_start' });
    await GoogleSignin.signOut().catch(() => undefined);
    console.log('[GoogleSignIn]', { flow: 'native_step', step: 'native_signout_done' });

    console.log('[GoogleSignIn]', { flow: 'native_step', step: 'native_signin_start' });
    const userInfo = await GoogleSignin.signIn();
    console.log('[GoogleSignIn]', { flow: 'native_step', step: 'native_signin_resolved', resultType: userInfo?.type });

    if (userInfo.type === 'cancelled') {
      console.log('[GoogleSignIn]', { flow: 'native_step', step: 'native_result_cancelled' });
      logGoogleSignInDiagnostic('native', 'cancelled');
      return { error: GOOGLE_NATIVE_CANCELLED, fallbackToBrowser: false, reason: 'cancelled' };
    }

    if (userInfo.type !== 'success') {
      console.log('[GoogleSignIn]', { flow: 'native_step', step: 'native_result_non_success', resultType: userInfo.type });
      logGoogleSignInDiagnostic('browser_fallback', 'native_exception');
      return { error: null, fallbackToBrowser: true, reason: 'native_exception' };
    }

    console.log('[GoogleSignIn]', { flow: 'native_step', step: 'native_result_success' });
    const idToken = userInfo.data?.idToken;

    if (!idToken) {
      console.log('[GoogleSignIn]', { flow: 'native_step', step: 'native_missing_id_token' });
      logGoogleSignInDiagnostic('native', 'missing_id_token');
      return {
        error: 'تعذر الحصول على بيانات تسجيل الدخول من جوجل. حاول مرة تانية.',
        fallbackToBrowser: true,
        reason: 'missing_id_token',
      };
    }

    console.log('[GoogleSignIn]', { flow: 'native_step', step: 'supabase_id_token_start' });
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    console.log('[GoogleSignIn]', { flow: 'native_step', step: 'supabase_id_token_result', hasError: Boolean(error) });

    if (error) {
      logGoogleSignInDiagnostic('native', 'supabase_session_failed');
      return {
        error: 'تم تسجيل الدخول بجوجل، لكن تعذر إكمال الجلسة. حاول مرة تانية.',
        fallbackToBrowser: true,
        reason: 'supabase_session_failed',
      };
    }

    console.log('[GoogleSignIn]', { flow: 'native_step', step: 'native_success' });
    logGoogleSignInDiagnostic('native', 'native_success');
    return { error: null, fallbackToBrowser: false, reason: 'native_success' };
  } catch (err: unknown) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: unknown }).code) : undefined;

    console.log('[GoogleSignIn]', { flow: 'native_step', step: 'native_catch', code });

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
