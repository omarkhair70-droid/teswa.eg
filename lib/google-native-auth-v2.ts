export {
  GOOGLE_NATIVE_AUTH_IMPLEMENTATION,
  GOOGLE_NATIVE_AUTH_MODULE_VERSION,
  getGoogleNativeAuthModuleInfo,
  logGoogleSignInDiagnostic,
  signInWithGoogleNative,
} from '@/lib/google-native-auth';

export type {
  GoogleNativeAuthImplementation,
  GoogleNativeAuthModuleInfo,
  GoogleNativeDiagnosticsEvent,
  NativeGoogleSignInResult,
} from '@/lib/google-native-auth';
