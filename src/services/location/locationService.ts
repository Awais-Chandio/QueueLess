import {
  PermissionsAndroid,
  Platform,
} from 'react-native';
import Geolocation, {
  type GeoError,
  type GeoPosition,
} from 'react-native-geolocation-service';
import { LOCATION_CONFIG } from '../../config/location';

export type UserLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading: number | null;
};

type LocationUpdateHandler = (location: UserLocation) => void;
type LocationErrorHandler = (error: Error) => void;

const LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  distanceFilter: LOCATION_CONFIG.GPS_DISTANCE_FILTER_METERS,
  interval: LOCATION_CONFIG.GPS_WATCH_INTERVAL_MS,
  fastestInterval: LOCATION_CONFIG.GPS_WATCH_FASTEST_INTERVAL_MS,
  showLocationDialog: true,
  forceRequestLocation: true,
} as const;

// Rejects NaN/out-of-range coordinates and "Null Island" (0, 0), which is
// what a missing/uninitialized GPS reading commonly reports as rather than a
// genuine position. Exported for reuse by reverseGeocodeService.
export const isValidCoordinate = (latitude: unknown, longitude: unknown): boolean =>
  typeof latitude === 'number' &&
  Number.isFinite(latitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  typeof longitude === 'number' &&
  Number.isFinite(longitude) &&
  longitude >= -180 &&
  longitude <= 180 &&
  !(latitude === 0 && longitude === 0);

// A GPS fix is only usable for computing distance-to-clinic if its reported
// accuracy radius is within a sane bound. Devices routinely report fixes
// with accuracy in the kilometers (cell/wifi-only positioning) that would
// otherwise silently corrupt "nearest clinic" ordering and distance labels.
const isAccurateFix = (position: GeoPosition): boolean => {
  const { latitude, longitude, accuracy } = position.coords;
  return (
    isValidCoordinate(latitude, longitude) &&
    typeof accuracy === 'number' &&
    Number.isFinite(accuracy) &&
    accuracy > 0 &&
    accuracy <= LOCATION_CONFIG.GPS_ACCURACY_MAX_THRESHOLD_METERS
  );
};

const EARTH_RADIUS_METERS = 6371e3;

// Exported for reuse by reverseGeocodeService, which needs the same
// distance math to gate reverse-geocode calls on meaningful movement.
export const haversineDistanceMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Rejects a watched fix that implies travel faster than is physically
// plausible between two consecutive readings — a classic symptom of a GPS
// glitch (a momentary bad satellite solve) rather than real movement.
const isImplausibleJump = (
  previous: { latitude: number; longitude: number; timestamp: number },
  next: { latitude: number; longitude: number; timestamp: number },
): boolean => {
  const timeDeltaSec = (next.timestamp - previous.timestamp) / 1000;
  if (timeDeltaSec <= 0) {
    return false;
  }

  const distanceMeters = haversineDistanceMeters(
    previous.latitude,
    previous.longitude,
    next.latitude,
    next.longitude,
  );

  if (timeDeltaSec < 1 && distanceMeters > 100) {
    return true;
  }

  return (
    distanceMeters / timeDeltaSec > LOCATION_CONFIG.GPS_MAX_PLAUSIBLE_SPEED_MPS
  );
};

const toUserLocation = (position: GeoPosition): UserLocation => ({
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
  accuracy: position.coords.accuracy,
  heading: position.coords.heading,
});

const toLocationError = (error: GeoError) =>
  new Error(error.message || 'Unable to determine your current location.');

const getPosition = (
  options: Parameters<typeof Geolocation.getCurrentPosition>[2],
): Promise<GeoPosition> =>
  new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      resolve,
      error => reject(toLocationError(error)),
      options,
    );
  });

const requestAndroidPermission = async () => {
  const finePermission = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;

  if (await PermissionsAndroid.check(finePermission)) {
    return true;
  }

  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    finePermission,
  ]);

  return result[finePermission] === PermissionsAndroid.RESULTS.GRANTED;
};

export const locationService = {
  async requestLocationPermission(): Promise<boolean> {
    if (Platform.OS === 'android') {
      return requestAndroidPermission();
    }

    if (Platform.OS === 'ios') {
      const result = await Geolocation.requestAuthorization('whenInUse');
      return result === 'granted';
    }

    return false;
  },

  async getCurrentUserLocation(): Promise<UserLocation> {
    const hasPermission = await this.requestLocationPermission();

    if (!hasPermission) {
      throw new Error(
        'Location permission is required to show nearby healthcare centers.',
      );
    }

    // Try the (possibly cached) fix first, then fall back to a single
    // forced-fresh read if it's missing, stale, or too inaccurate to trust.
    // This keeps the common case fast while giving a bad first fix — common
    // right after a cold start or indoors — one real chance to improve
    // before we give up and ask the user to retry.
    const attempts = [
      { maximumAge: LOCATION_CONFIG.CACHED_FIX_MAX_AGE_MS },
      { maximumAge: 0 },
    ];

    let lastError: Error = new Error(
      'Unable to determine your current location.',
    );

    for (const attempt of attempts) {
      try {
        const position = await getPosition({
          ...LOCATION_OPTIONS,
          timeout: LOCATION_CONFIG.INITIAL_FIX_TIMEOUT_MS,
          maximumAge: attempt.maximumAge,
        });

        if (isAccurateFix(position)) {
          return toUserLocation(position);
        }

        lastError = new Error(
          `GPS accuracy is too low (${Math.round(
            position.coords.accuracy,
          )}m). Move to an open area and try again.`,
        );
      } catch (error) {
        lastError = error instanceof Error ? error : lastError;
      }
    }

    throw lastError;
  },

  async watchLiveLocation(
    onUpdate: LocationUpdateHandler,
    onError?: LocationErrorHandler,
  ): Promise<() => void> {
    const hasPermission = await this.requestLocationPermission();

    if (!hasPermission) {
      throw new Error(
        'Location permission is required to track your live location.',
      );
    }

    let lastAccepted: {
      latitude: number;
      longitude: number;
      timestamp: number;
    } | null = null;
    let consecutiveInaccurateFixes = 0;

    const watchId = Geolocation.watchPosition(
      position => {
        if (!isAccurateFix(position)) {
          consecutiveInaccurateFixes += 1;
          if (consecutiveInaccurateFixes === 3) {
            onError?.(
              new Error(
                `GPS accuracy is too low (${Math.round(
                  position.coords.accuracy,
                )}m). Move to an open area for a better signal.`,
              ),
            );
          }
          return;
        }
        consecutiveInaccurateFixes = 0;

        const timestamp = position.timestamp || Date.now();

        if (lastAccepted) {
          // A delayed/out-of-order callback must never replace a fix we've
          // already accepted and shown to the user.
          if (timestamp <= lastAccepted.timestamp) {
            return;
          }

          if (
            isImplausibleJump(lastAccepted, {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              timestamp,
            })
          ) {
            return;
          }
        }

        lastAccepted = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp,
        };
        onUpdate(toUserLocation(position));
      },
      error => onError?.(toLocationError(error)),
      LOCATION_OPTIONS,
    );

    let stopped = false;

    return () => {
      if (stopped) {
        return;
      }

      stopped = true;
      Geolocation.clearWatch(watchId);
    };
  },
};

