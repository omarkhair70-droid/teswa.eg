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
  if (Platform.OS !== 'android') {
    logGoogleSignInDiagnostic('browser_fallback', 'non_android');
    return { error: null, fallbackToBrowser: true, reason: 'non_android' };
  }

  try {
    configureGoogleSignin();

    if (!configured) {
      logGoogleSignInDiagnostic('browser_fallback', 'missing_web_client_id');
      return { error: null, fallbackToBrowser: true, reason: 'missing_web_client_id' };
    }

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await GoogleSignin.signOut().catch(() => undefined);

    const userInfo = await GoogleSignin.signIn();

    if (userInfo.type === 'cancelled') {
      logGoogleSignInDiagnostic('native', 'cancelled');
      return { error: GOOGLE_NATIVE_CANCELLED, fallbackToBrowser: false, reason: 'cancelled' };
    }

    if (userInfo.type !== 'success') {
      return { error: GOOGLE_NATIVE_GENERIC_ERROR, fallbackToBrowser: false };
    }

    const idToken = userInfo.data?.idToken;

    if (!idToken) {
      logGoogleSignInDiagnostic('native', 'missing_id_token');
      return {
        error: 'تعذر الحصول على بيانات تسجيل الدخول من جوجل. حاول مرة تانية.',
        fallbackToBrowser: false,
        reason: 'missing_id_token',
      };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) {
      logGoogleSignInDiagnostic('native', 'supabase_session_failed');
      return {
        error: 'تم تسجيل الدخول بجوجل، لكن تعذر إكمال الجلسة. حاول مرة تانية.',
        fallbackToBrowser: false,
        reason: 'supabase_session_failed',
      };
    }

    logGoogleSignInDiagnostic('native', 'native_success');
    return { error: null, fallbackToBrowser: false, reason: 'native_success' };
  } catch (err: unknown) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: unknown }).code) : undefined;

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

    logGoogleSignInDiagnostic('native', 'native_exception');
    return { error: GOOGLE_NATIVE_GENERIC_ERROR, fallbackToBrowser: false, reason: 'native_exception' };
  }
}
