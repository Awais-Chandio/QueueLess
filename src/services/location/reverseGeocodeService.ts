// Reverse geocodes a GPS fix into a human-readable "current area" label
// using Photon (https://photon.komoot.io), the same free, key-less provider
// NaviGo (MyPlacesTracker) uses for its own reverse geocoding.
//
// This is a soft, non-blocking display enhancement: if Photon is slow,
// unreachable, or rate-limited, callers get `null` and should fall back to
// whatever location label they already had (e.g. the nearest registered
// center's city) rather than surfacing an error.

import { LOCATION_CONFIG } from '../../config/location';
import { haversineDistanceMeters, isValidCoordinate } from './locationService';

export type CurrentAreaLabel = {
  /** Best short label for the user's current area (suburb/district/city). */
  area: string;
  /** City name, when Photon returns one distinct from `area`. */
  city: string | null;
};

const PHOTON_REVERSE_URL = 'https://photon.komoot.io/reverse';
const REQUEST_TIMEOUT_MS = 8000;

type CacheEntry = { timestamp: number; data: CurrentAreaLabel | null };

const cache = new Map<string, CacheEntry>();
let lastQuery: { latitude: number; longitude: number } | null = null;
let lastResult: CurrentAreaLabel | null = null;
let inFlight: {
  coords: { latitude: number; longitude: number };
  promise: Promise<CurrentAreaLabel | null>;
} | null = null;

const cacheKey = (latitude: number, longitude: number) =>
  `${latitude.toFixed(4)}_${longitude.toFixed(4)}`;

const isFresh = (entry: CacheEntry) =>
  Date.now() - entry.timestamp < LOCATION_CONFIG.REVERSE_GEOCODE_CACHE_TTL_MS;

const parsePhotonProperties = (
  properties: Record<string, unknown>,
): CurrentAreaLabel | null => {
  const district = String(
    properties.district ||
      properties.suburb ||
      properties.neighbourhood ||
      properties.locality ||
      '',
  ).trim();
  const city = String(properties.city || properties.town || '').trim();
  const county = String(properties.county || '').trim();
  const name = String(properties.name || '').trim();

  const area = district || city || county || name;
  if (!area) {
    return null;
  }

  return { area, city: city || county || null };
};

const fetchFromPhoton = async (
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<CurrentAreaLabel | null> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const response = await fetch(
      `${PHOTON_REVERSE_URL}?lat=${latitude}&lon=${longitude}&lang=en&limit=1`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      features?: Array<{ properties?: Record<string, unknown> }>;
    };
    const properties = payload.features?.[0]?.properties;
    return properties ? parsePhotonProperties(properties) : null;
  } catch {
    // Network failure, timeout, abort, or malformed JSON: Photon being
    // unavailable must never surface as an error to the caller.
    return null;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onExternalAbort);
  }
};

/**
 * Resolves a human-readable "current area" label for the given coordinates.
 *
 * Calls are gated on meaningful movement (LOCATION_CONFIG's
 * REVERSE_GEOCODE_MOVE_THRESHOLD_METERS, matching NaviGo's
 * ADDRESS_GEOCODE_THRESHOLD_METERS) and cached per rounded coordinate
 * (REVERSE_GEOCODE_CACHE_TTL_MS), so this is safe to call on every GPS
 * update — it will not fire a network request on every tick.
 *
 * Returns `null` if the coordinates are invalid or Photon is unavailable;
 * callers should fall back to another location label in that case.
 */
export async function getCurrentAreaLabel(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<CurrentAreaLabel | null> {
  if (!isValidCoordinate(latitude, longitude)) {
    return null;
  }

  if (
    lastQuery &&
    haversineDistanceMeters(
      lastQuery.latitude,
      lastQuery.longitude,
      latitude,
      longitude,
    ) < LOCATION_CONFIG.REVERSE_GEOCODE_MOVE_THRESHOLD_METERS
  ) {
    return lastResult;
  }

  const key = cacheKey(latitude, longitude);
  const cached = cache.get(key);
  if (cached) {
    if (isFresh(cached)) {
      lastQuery = { latitude, longitude };
      lastResult = cached.data;
      return cached.data;
    }
    cache.delete(key);
  }

  if (
    inFlight &&
    haversineDistanceMeters(
      inFlight.coords.latitude,
      inFlight.coords.longitude,
      latitude,
      longitude,
    ) < LOCATION_CONFIG.REVERSE_GEOCODE_MOVE_THRESHOLD_METERS
  ) {
    return inFlight.promise;
  }

  const promise = fetchFromPhoton(latitude, longitude, signal).then(
    result => {
      cache.set(key, { timestamp: Date.now(), data: result });
      lastQuery = { latitude, longitude };
      lastResult = result;
      inFlight = null;
      return result;
    },
  );

  inFlight = { coords: { latitude, longitude }, promise };
  return promise;
}
