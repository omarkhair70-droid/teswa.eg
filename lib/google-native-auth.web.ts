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

export function setGoogleNativeDiagnosticsListener(
  _listener: ((event: GoogleNativeDiagnosticsEvent) => void) | null
) {
  return;
}

export async function signInWithGoogleNative(): Promise<NativeGoogleSignInResult> {
  return { error: null, fallbackToBrowser: true };
}
