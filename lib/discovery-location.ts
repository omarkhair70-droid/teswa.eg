import * as Location from 'expo-location';

export type DiscoveryLocationResult =
  | {
      ok: true;
      label: string;
      matchTerms: string[];
      latitude: number;
      longitude: number;
    }
  | {
      ok: false;
      reason: 'permission_denied' | 'location_unavailable' | 'reverse_geocode_failed';
      message: string;
    };

type GeocodedAddressResult =
  | {
      ok: true;
      address: Location.LocationGeocodedAddress;
      latitude: number;
      longitude: number;
    }
  | {
      ok: false;
      reason: 'permission_denied' | 'location_unavailable' | 'reverse_geocode_failed';
    };

function normalizeTerm(value: string | null | undefined): string | null {
  if (!value) return null;
  const term = value.trim();
  return term.length > 0 ? term : null;
}

function uniqueTerms(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];

  values.forEach((value) => {
    const term = normalizeTerm(value);
    if (!term) return;

    const key = term.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    terms.push(term);
  });

  return terms;
}

export async function resolveCurrentDiscoveryLocation(): Promise<DiscoveryLocationResult> {
  const geocoded = await resolveCurrentGeocodedAddress();
  if (!geocoded.ok) {
    if (geocoded.reason === 'permission_denied') {
      return {
        ok: false,
        reason: 'permission_denied',
        message: 'نحتاج إذن الموقع لعرض العناصر الأقرب لمدينتك.',
      };
    }

    return {
      ok: false,
      reason: geocoded.reason,
      message: 'تعذر تحديد مدينتك الآن. حاول مرة أخرى.',
    };
  }

  const { address, latitude, longitude } = geocoded;

  const label =
    normalizeTerm(address.city) ??
    normalizeTerm(address.district) ??
    normalizeTerm(address.subregion) ??
    normalizeTerm(address.region) ??
    normalizeTerm(address.formattedAddress);

  const matchTerms = uniqueTerms([address.city, address.district, address.subregion, address.region]);

  if (!label || matchTerms.length === 0) {
    return {
      ok: false,
      reason: 'reverse_geocode_failed',
      message: 'تعذر تحديد مدينتك الآن. حاول مرة أخرى.',
    };
  }

  return {
    ok: true,
    label,
    matchTerms,
    latitude,
    longitude,
  };
}

export async function resolveCurrentAddItemLocation(): Promise<
  | {
      ok: true;
      city: string;
      area: string | null;
      label: string;
      latitude: number;
      longitude: number;
    }
  | {
      ok: false;
      reason: 'permission_denied' | 'location_unavailable' | 'reverse_geocode_failed';
      message: string;
    }
> {
  const geocoded = await resolveCurrentGeocodedAddress();
  if (!geocoded.ok) {
    return {
      ok: false,
      reason: geocoded.reason,
      message: geocoded.reason === 'permission_denied'
        ? 'نحتاج إذن الموقع لاقتراح المدينة والمنطقة.'
        : 'تعذر تحديد مدينتك الآن. يمكنك كتابتها يدويًا.',
    };
  }

  const { address, latitude, longitude } = geocoded;
  const city = normalizeTerm(address.city) ?? normalizeTerm(address.subregion) ?? normalizeTerm(address.region);
  if (!city) {
    return {
      ok: false,
      reason: 'reverse_geocode_failed',
      message: 'تعذر تحديد مدينتك الآن. يمكنك كتابتها يدويًا.',
    };
  }

  const district = normalizeTerm(address.district);
  const subregion = normalizeTerm(address.subregion);
  const area = district ?? ((subregion && subregion.toLowerCase() !== city.toLowerCase()) ? subregion : null);
  const label = uniqueTerms([city, area]).join('، ');

  return {
    ok: true,
    city,
    area,
    label,
    latitude,
    longitude,
  };
}

async function resolveCurrentGeocodedAddress(): Promise<GeocodedAddressResult> {
  let permission: Location.LocationPermissionResponse;
  try {
    permission = await Location.requestForegroundPermissionsAsync();
  } catch {
    return { ok: false, reason: 'location_unavailable' };
  }

  if (permission.status !== 'granted') {
    return { ok: false, reason: 'permission_denied' };
  }

  let currentPosition: Location.LocationObject | null = null;
  try {
    currentPosition = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  } catch {
    return { ok: false, reason: 'location_unavailable' };
  }

  if (!currentPosition) {
    return { ok: false, reason: 'location_unavailable' };
  }

  let addresses: Location.LocationGeocodedAddress[];
  try {
    addresses = await Location.reverseGeocodeAsync({
      latitude: currentPosition.coords.latitude,
      longitude: currentPosition.coords.longitude,
    });
  } catch {
    return { ok: false, reason: 'reverse_geocode_failed' };
  }

  const address = addresses[0];
  if (!address) {
    return { ok: false, reason: 'reverse_geocode_failed' };
  }

  return {
    ok: true,
    address,
    latitude: currentPosition.coords.latitude,
    longitude: currentPosition.coords.longitude,
  };
}
