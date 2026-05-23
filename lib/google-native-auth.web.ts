import { Platform } from 'react-native';

export const GOOGLE_NATIVE_AUTH_MODULE_VERSION = 'google-native-auth.web.ts.v1';
export const GOOGLE_NATIVE_AUTH_IMPLEMENTATION = 'web-shim';

export type NativeGoogleSignInResult = {
  status: 'success' | 'cancelled' | 'fallback' | 'error' | 'empty';
  error: string | null;
  code?: string;
  message?: string;
  reason?: string;
  resultType?: string;
  fallbackToBrowser?: boolean;
  implementation?: 'android-native' | 'web-shim' | 'unknown';
  moduleVersion?: string;
};

export type GoogleNativeDiagnosticsEvent = {
  flow: 'native_step';
  step: string;
  reason?: string;
  resultType?: string;
  configured?: boolean;
  hasWebClientId?: boolean;
  hasNativeModule?: boolean;
  hasError?: boolean;
  code?: string;
  message?: string;
  statusCode?: string;
  isCancelled?: boolean;
  hasIdToken?: boolean;
  hasUser?: boolean;
  platform?: string;
  implementation?: 'android-native' | 'web-shim' | 'unknown';
  moduleVersion?: string;
};

type GoogleNativeSignInOptions = {
  onStep?: (event: GoogleNativeDiagnosticsEvent) => void;
};

export function getGoogleNativeAuthModuleInfo() {
  return {
    moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION,
    implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION,
    platform: Platform.OS,
    hasSignInFunction: typeof signInWithGoogleNative === 'function',
  };
}

export function setGoogleNativeDiagnosticsListener(
  _listener: ((event: GoogleNativeDiagnosticsEvent) => void) | null
) {
  return;
}

export async function signInWithGoogleNative(
  options?: GoogleNativeSignInOptions
): Promise<NativeGoogleSignInResult> {
  options?.onStep?.({
    flow: 'native_step',
    step: 'native_helper_entered',
    reason: 'non_android',
    platform: 'web',
    implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION,
    moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION,
  });
  return {
    status: 'fallback',
    error: null,
    fallbackToBrowser: true,
    reason: 'non_android',
    implementation: GOOGLE_NATIVE_AUTH_IMPLEMENTATION,
    moduleVersion: GOOGLE_NATIVE_AUTH_MODULE_VERSION,
  };
}
