import * as Location from 'expo-location';

export type LocationDiscoveryState = {
  enabled: boolean;
  loading: boolean;
  errorMessage: string | null;
  selectedRadiusKm: number;
};

type DiscoveryLocationSuccess = {
  ok: true;
  latitude: number;
  longitude: number;
};

type DiscoveryLocationFailureReason = 'permission_denied' | 'unavailable' | 'timeout' | 'unknown';

type DiscoveryLocationFailure = {
  ok: false;
  reason: DiscoveryLocationFailureReason;
  message: string;
};

export type DiscoveryLocationResult = DiscoveryLocationSuccess | DiscoveryLocationFailure;

const LOCATION_PERMISSION_DENIED_MESSAGE = 'محتاجين إذن الموقع علشان نعرض حاجات قريبة منك.';
const LOCATION_UNAVAILABLE_MESSAGE = 'تعذر تحديد موقعك حالياً. تقدر تكمل بالتصفح العادي.';
const LOCATION_TIMEOUT_MESSAGE = 'الموقع مش متاح دلوقتي. جرّب تاني بعد شوية.';

export function formatRadiusLabel(radiusKm: number): string {
  return `${radiusKm} كم`;
}

export async function requestCurrentDiscoveryLocation(): Promise<DiscoveryLocationResult> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      return { ok: false, reason: 'permission_denied', message: LOCATION_PERMISSION_DENIED_MESSAGE };
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    if (!position?.coords) {
      return { ok: false, reason: 'unavailable', message: LOCATION_UNAVAILABLE_MESSAGE };
    }

    return {
      ok: true,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('timeout') || message.includes('timed out')) {
      return { ok: false, reason: 'timeout', message: LOCATION_TIMEOUT_MESSAGE };
    }

    return { ok: false, reason: 'unknown', message: LOCATION_UNAVAILABLE_MESSAGE };
  }
}
