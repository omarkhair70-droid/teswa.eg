import { Platform } from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

import { supabase } from '@/lib/supabase/client';

export type NativeGoogleSignInResult = {
  error: string | null;
  fallbackToBrowser?: boolean;
};

const GOOGLE_NATIVE_GENERIC_ERROR = 'تعذر تسجيل الدخول بجوجل. حاول مرة تانية.';
const GOOGLE_NATIVE_CANCELLED = 'تم إلغاء تسجيل الدخول بجوجل.';

let configured = false;

function configureGoogleSignin() {
  if (configured) return;

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

  if (!webClientId && !androidClientId) {
    return;
  }

  GoogleSignin.configure({
    webClientId: webClientId ?? androidClientId,
  });

  configured = true;
}

export async function signInWithGoogleNative(): Promise<NativeGoogleSignInResult> {
  if (Platform.OS !== 'android') {
    return { error: null, fallbackToBrowser: true };
  }

  try {
    configureGoogleSignin();

    if (!configured) {
      return { error: null, fallbackToBrowser: true };
    }

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await GoogleSignin.signOut().catch(() => undefined);

    const userInfo = await GoogleSignin.signIn();
    const idToken = userInfo.data?.idToken;

    if (!idToken) {
      return { error: 'تعذر الحصول على بيانات تسجيل الدخول من جوجل. حاول مرة تانية.', fallbackToBrowser: false };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) {
      return { error: 'تم تسجيل الدخول بجوجل، لكن تعذر إكمال الجلسة. حاول مرة تانية.', fallbackToBrowser: false };
    }

    return { error: null, fallbackToBrowser: false };
  } catch (err: unknown) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: unknown }).code) : undefined;

    if (code === statusCodes.SIGN_IN_CANCELLED) {
      return { error: GOOGLE_NATIVE_CANCELLED, fallbackToBrowser: false };
    }

    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE || code === statusCodes.IN_PROGRESS) {
      return { error: null, fallbackToBrowser: true };
    }

    return { error: GOOGLE_NATIVE_GENERIC_ERROR, fallbackToBrowser: false };
  }
}
