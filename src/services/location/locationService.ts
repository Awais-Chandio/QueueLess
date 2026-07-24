import {
  PermissionsAndroid,
  Platform,
} from 'react-native';
import Geolocation, {
  type GeoError,
  type GeoPosition,
} from 'react-native-geolocation-service';

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
  distanceFilter: 10,
  interval: 5000,
  fastestInterval: 2500,
  showLocationDialog: true,
  forceRequestLocation: true,
} as const;

const toUserLocation = (position: GeoPosition): UserLocation => ({
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
  accuracy: position.coords.accuracy,
  heading: position.coords.heading,
});

const toLocationError = (error: GeoError) =>
  new Error(error.message || 'Unable to determine your current location.');

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

    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        position => resolve(toUserLocation(position)),
        error => reject(toLocationError(error)),
        {
          ...LOCATION_OPTIONS,
          timeout: 15000,
          maximumAge: 10000,
        },
      );
    });
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

    const watchId = Geolocation.watchPosition(
      position => onUpdate(toUserLocation(position)),
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

