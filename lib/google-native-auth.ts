export type NativeGoogleSignInResult = {
  error: string | null;
  fallbackToBrowser?: boolean;
};

export async function signInWithGoogleNative(): Promise<NativeGoogleSignInResult> {
  return { error: null, fallbackToBrowser: true };
}
