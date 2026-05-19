import { Platform } from 'react-native';
import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import { supabase } from '@/lib/supabase/client';

const GOOGLE_AUTH_ERROR = 'تعذر فتح تسجيل الدخول بجوجل. حاول مرة تانية.';
const GOOGLE_AUTH_CANCELLED = 'تم إلغاء تسجيل الدخول بجوجل.';
const GOOGLE_AUTH_IN_PROGRESS = 'جاري فتح جوجل بالفعل.';

let isGoogleSigninConfigured = false;

export type NativeGoogleSignInResult = {
  error: string | null;
  fallbackToBrowser?: boolean;
};

export async function signInWithGoogleNative(): Promise<NativeGoogleSignInResult> {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (!webClientId) {
    return { error: null, fallbackToBrowser: true };
  }

  try {
    if (!isGoogleSigninConfigured) {
      GoogleSignin.configure({ webClientId });
      isGoogleSigninConfigured = true;
    }

    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }

    const signInResponse = await GoogleSignin.signIn();

    if (isCancelledResponse(signInResponse)) {
      return { error: GOOGLE_AUTH_CANCELLED };
    }

    if (!isSuccessResponse(signInResponse)) {
      return { error: GOOGLE_AUTH_ERROR };
    }

    const { idToken } = await GoogleSignin.getTokens();
    if (!idToken) {
      return { error: GOOGLE_AUTH_ERROR };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) {
      return { error: GOOGLE_AUTH_ERROR };
    }

    return { error: null };
  } catch (error: unknown) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.IN_PROGRESS) {
        return { error: GOOGLE_AUTH_IN_PROGRESS };
      }

      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { error: null, fallbackToBrowser: true };
      }
    }

    return { error: null, fallbackToBrowser: true };
  }
}
