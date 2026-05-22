export type NativeGoogleSignInResult = {
  error: string | null;
  fallbackToBrowser?: boolean;
};

export type GoogleNativeDiagnosticsEvent = {
  flow: 'native_step';
  step: string;
  reason?: string;
  resultType?: string;
  configured?: boolean;
  hasError?: boolean;
  code?: string;
  platform?: string;
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
    step: 'native_start',
    reason: 'non_android',
    platform: 'web',
  });
  return { error: null, fallbackToBrowser: true };
}
