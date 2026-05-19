import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

const KEY_PREFIX = 'teswa:biometric_app_lock:v1:';

export type BiometricCapabilityState =
  | { status: 'available'; supportedLabels: string[] }
  | { status: 'no_hardware'; supportedLabels: string[] }
  | { status: 'not_enrolled'; supportedLabels: string[] }
  | { status: 'error'; supportedLabels: string[] };

function getScopedKey(userId: string) {
  const trimmed = userId.trim();
  if (!trimmed) return null;
  return `${KEY_PREFIX}${trimmed}`;
}

function mapSupportedLabels(types: LocalAuthentication.AuthenticationType[]): string[] {
  const labels = new Set<string>();
  types.forEach((type) => {
    if (type === LocalAuthentication.AuthenticationType.FINGERPRINT) labels.add('بصمة');
    if (type === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) labels.add('تعرف على الوجه');
    if (type === LocalAuthentication.AuthenticationType.IRIS) labels.add('بصمة العين');
  });
  return Array.from(labels);
}

export async function readBiometricAppLockEnabled(userId: string): Promise<boolean> {
  const key = getScopedKey(userId);
  if (!key) return false;

  try {
    return (await AsyncStorage.getItem(key)) === 'true';
  } catch {
    return false;
  }
}

export async function writeBiometricAppLockEnabled(userId: string, enabled: boolean): Promise<void> {
  const key = getScopedKey(userId);
  if (!key) return;

  try {
    await AsyncStorage.setItem(key, enabled ? 'true' : 'false');
  } catch {
    // fail softly
  }
}

export async function getBiometricCapabilityState(): Promise<BiometricCapabilityState> {
  try {
    const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    const supportedLabels = mapSupportedLabels(supportedTypes ?? []);

    if (!hasHardware) return { status: 'no_hardware', supportedLabels };
    if (!isEnrolled) return { status: 'not_enrolled', supportedLabels };
    return { status: 'available', supportedLabels };
  } catch {
    return { status: 'error', supportedLabels: [] };
  }
}

export async function authenticateTeswaAppLock(promptVariant: 'enable' | 'unlock' = 'unlock'): Promise<{ success: boolean; errorCode?: string }> {
  try {
    const isEnablePrompt = promptVariant === 'enable';
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: isEnablePrompt ? 'فعّل قفل تِسوى' : 'افتح تِسوى',
      promptSubtitle: isEnablePrompt
        ? 'سنستخدم التحقق البيومتري لحماية التطبيق على هذا الجهاز.'
        : 'استخدم البصمة أو التحقق المتاح على جهازك.',
      cancelLabel: 'إلغاء',
      disableDeviceFallback: false,
    });

    if (result.success) return { success: true };
    return { success: false, errorCode: result.error };
  } catch {
    return { success: false, errorCode: 'unknown' };
  }
}
