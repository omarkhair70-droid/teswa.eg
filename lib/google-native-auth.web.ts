export type NativeGoogleSignInResult = {
  status: 'success' | 'cancelled' | 'fallback' | 'error' | 'empty';
  error: string | null;
  code?: string;
  message?: string;
  reason?: string;
  resultType?: string;
  fallbackToBrowser?: boolean;
  implementation?: 'android-native' | 'web-shim' | 'unknown';
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
};

type GoogleNativeSignInOptions = {
  onStep?: (event: GoogleNativeDiagnosticsEvent) => void;
};

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
    implementation: 'web-shim',
  });
  return { status: 'fallback', error: null, fallbackToBrowser: true, reason: 'non_android', implementation: 'web-shim' };
}
