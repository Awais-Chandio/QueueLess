import { supabase } from '../../lib/supabase';

const EARTH_RADIUS_KM = 6371;
const KM_PER_LATITUDE_DEGREE = 111.32;
const DEFAULT_RADIUS_KM = 10;
const FALLBACK_RADIUS_KM = 15;

type CenterRow = {
  id: string;
  name: string;
  description: string | null;
  city: string | null;
  address: string | null;
  category: string | null;
  image_url: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  open_time: string | null;
  close_time: string | null;
};

export type NearbyCenter = {
  id: string;
  name: string;
  description: string | null;
  city: string;
  address: string;
  category: string;
  image_url: string | null;
  latitude: number;
  longitude: number;
  distance: number;
  open_time: string | null;
  close_time: string | null;
};

const degreesToRadians = (degrees: number) => degrees * (Math.PI / 180);

export const calculateDistanceKm = (
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
) => {
  const latitudeDelta = degreesToRadians(toLatitude - fromLatitude);
  const longitudeDelta = degreesToRadians(toLongitude - fromLongitude);
  const fromLatitudeRadians = degreesToRadians(fromLatitude);
  const toLatitudeRadians = degreesToRadians(toLatitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitudeRadians) *
      Math.cos(toLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    EARTH_RADIUS_KM *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
};

const isValidCoordinate = (value: number) => Number.isFinite(value);

const queryCentersWithinRadius = async (
  latitude: number,
  longitude: number,
  radiusKm: number,
): Promise<NearbyCenter[]> => {
  const latitudeDelta = radiusKm / KM_PER_LATITUDE_DEGREE;
  const longitudeScale = Math.max(
    Math.abs(Math.cos(degreesToRadians(latitude))),
    0.01,
  );
  const longitudeDelta =
    radiusKm / (KM_PER_LATITUDE_DEGREE * longitudeScale);

  const { data, error } = await supabase
    .from('service_centers')
    .select(
      'id, name, description, city, address, category, image_url, latitude, longitude, open_time, close_time',
    )
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .gte('latitude', latitude - latitudeDelta)
    .lte('latitude', latitude + latitudeDelta)
    .gte('longitude', longitude - longitudeDelta)
    .lte('longitude', longitude + longitudeDelta);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as CenterRow[])
    .map(center => {
      const centerLatitude = Number(center.latitude);
      const centerLongitude = Number(center.longitude);

      if (
        !isValidCoordinate(centerLatitude) ||
        !isValidCoordinate(centerLongitude)
      ) {
        return null;
      }

      const distance = calculateDistanceKm(
        latitude,
        longitude,
        centerLatitude,
        centerLongitude,
      );

      if (distance > radiusKm) {
        return null;
      }

      return {
        id: center.id,
        name: center.name,
        description: center.description,
        city: center.city ?? '',
        address: center.address ?? 'Address unavailable',
        category: center.category ?? 'Healthcare',
        image_url: center.image_url,
        latitude: centerLatitude,
        longitude: centerLongitude,
        distance,
        open_time: center.open_time,
        close_time: center.close_time,
      };
    })
    .filter((center): center is NearbyCenter => center !== null)
    .sort((first, second) => first.distance - second.distance);
};

export const getNearbyCenters = async (
  latitude: number,
  longitude: number,
  radius = DEFAULT_RADIUS_KM,
): Promise<NearbyCenter[]> => {
  if (
    !isValidCoordinate(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !isValidCoordinate(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error('Invalid user coordinates.');
  }

  const primaryRadius =
    Number.isFinite(radius) && radius > 0 ? radius : DEFAULT_RADIUS_KM;
  const nearbyCenters = await queryCentersWithinRadius(
    latitude,
    longitude,
    primaryRadius,
  );

  if (nearbyCenters.length > 0 || primaryRadius >= FALLBACK_RADIUS_KM) {
    return nearbyCenters;
  }

  return queryCentersWithinRadius(
    latitude,
    longitude,
    FALLBACK_RADIUS_KM,
  );
};

export const nearbyCenterService = {
  getNearbyCenters,
};
