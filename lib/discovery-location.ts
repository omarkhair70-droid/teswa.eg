import * as Location from 'expo-location';

export type DiscoveryLocationResult =
  | {
      ok: true;
      label: string;
      matchTerms: string[];
    }
  | {
      ok: false;
      reason: 'permission_denied' | 'location_unavailable' | 'reverse_geocode_failed';
      message: string;
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
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    return {
      ok: false,
      reason: 'permission_denied',
      message: 'نحتاج إذن الموقع لعرض العناصر الأقرب لمدينتك.',
    };
  }

  const lastKnown = await Location.getLastKnownPositionAsync();
  const currentPosition = lastKnown ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));

  if (!currentPosition) {
    return {
      ok: false,
      reason: 'location_unavailable',
      message: 'تعذر تحديد مدينتك الآن. حاول مرة أخرى.',
    };
  }

  const addresses = await Location.reverseGeocodeAsync({
    latitude: currentPosition.coords.latitude,
    longitude: currentPosition.coords.longitude,
  });

  const address = addresses[0];
  if (!address) {
    return {
      ok: false,
      reason: 'reverse_geocode_failed',
      message: 'تعذر تحديد مدينتك الآن. حاول مرة أخرى.',
    };
  }

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
  };
}

export function matchesDiscoveryLocation(itemLocation: string | null, matchTerms: string[]): boolean {
  const normalizedLocation = itemLocation?.trim().toLowerCase();
  if (!normalizedLocation) return false;

  const normalizedTerms = matchTerms.map((term) => term.trim().toLowerCase()).filter(Boolean);
  if (normalizedTerms.length === 0) return false;

  return normalizedTerms.some((term) => normalizedLocation.includes(term) || term.includes(normalizedLocation));
}
