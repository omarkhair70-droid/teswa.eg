export type NativeGoogleSignInResult = {
  error: string | null;
  fallbackToBrowser?: boolean;
};

export type GoogleNativeDiagnosticsEvent = {
  flow: 'native_step';
  step: string;
};

export function setGoogleNativeDiagnosticsListener() {
  return;
}

export async function signInWithGoogleNative(): Promise<NativeGoogleSignInResult> {
  return { error: null, fallbackToBrowser: true };
}
