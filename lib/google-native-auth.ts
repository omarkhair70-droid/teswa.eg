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

const GOOGLE_NATIVE_GENERIC_ERROR = 'تعذر تسجيل الدخول بجوجل. حاول مرة تانية.';
const GOOGLE_NATIVE_CANCELLED = 'تم إلغاء تسجيل الدخول بجوجل.';

let configured = false;

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
    if (__DEV__) {
      console.log('[GoogleSignIn]', { flow: 'browser_fallback', reason: 'non_android' as const });
    }
    return { error: null, fallbackToBrowser: true, reason: 'non_android' };
  }

  try {
    configureGoogleSignin();

    if (!configured) {
      if (__DEV__) {
        console.log('[GoogleSignIn]', { flow: 'browser_fallback', reason: 'missing_web_client_id' as const });
      }
      return { error: null, fallbackToBrowser: true, reason: 'missing_web_client_id' };
    }

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await GoogleSignin.signOut().catch(() => undefined);

    const userInfo = await GoogleSignin.signIn();

    if (userInfo.type === 'cancelled') {
      if (__DEV__) {
        console.log('[GoogleSignIn]', { flow: 'native', reason: 'cancelled' as const });
      }
      return { error: GOOGLE_NATIVE_CANCELLED, fallbackToBrowser: false, reason: 'cancelled' };
    }

    if (userInfo.type !== 'success') {
      return { error: GOOGLE_NATIVE_GENERIC_ERROR, fallbackToBrowser: false };
    }

    const idToken = userInfo.data?.idToken;

    if (!idToken) {
      if (__DEV__) {
        console.log('[GoogleSignIn]', { flow: 'native', reason: 'missing_id_token' as const });
      }
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
      if (__DEV__) {
        console.log('[GoogleSignIn]', { flow: 'native', reason: 'supabase_session_failed' as const });
      }
      return {
        error: 'تم تسجيل الدخول بجوجل، لكن تعذر إكمال الجلسة. حاول مرة تانية.',
        fallbackToBrowser: false,
        reason: 'supabase_session_failed',
      };
    }

    if (__DEV__) {
      console.log('[GoogleSignIn]', { flow: 'native', reason: 'native_success' as const });
    }
    return { error: null, fallbackToBrowser: false, reason: 'native_success' };
  } catch (err: unknown) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: unknown }).code) : undefined;

    if (code === statusCodes.SIGN_IN_CANCELLED) {
      if (__DEV__) {
        console.log('[GoogleSignIn]', { flow: 'native', reason: 'cancelled' as const });
      }
      return { error: GOOGLE_NATIVE_CANCELLED, fallbackToBrowser: false, reason: 'cancelled' };
    }

    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      if (__DEV__) {
        console.log('[GoogleSignIn]', { flow: 'browser_fallback', reason: 'play_services_unavailable' as const });
      }
      return { error: null, fallbackToBrowser: true, reason: 'play_services_unavailable' };
    }

    if (code === statusCodes.IN_PROGRESS) {
      if (__DEV__) {
        console.log('[GoogleSignIn]', { flow: 'browser_fallback', reason: 'in_progress' as const });
      }
      return { error: null, fallbackToBrowser: true, reason: 'in_progress' };
    }

    if (__DEV__) {
      console.log('[GoogleSignIn]', { flow: 'native', reason: 'native_exception' as const });
    }
    return { error: GOOGLE_NATIVE_GENERIC_ERROR, fallbackToBrowser: false, reason: 'native_exception' };
  }
}
