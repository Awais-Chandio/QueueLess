import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Crosshair, LocateFixed, MapPin } from 'lucide-react-native';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  type CameraRef,
  type GeoJSONSourceProps,
  type GeoJSONSourceRef,
} from '@maplibre/maplibre-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type {
  Feature,
  FeatureCollection,
  Point,
} from 'geojson';

import CenterBottomSheet from '../../components/centers/CenterBottomSheet';
import {
  DEFAULT_MAP_CENTER,
  MAP_STYLE_URL,
} from '../../config/map';
import { useTheme } from '../../hooks/useTheme';
import type { AppStackParamList } from '../../navigation/types';
import {
  calculateDistanceKm,
  type NearbyCenter,
} from '../../services/centers/centerService';
import {
  locationService,
  type UserLocation,
} from '../../services/location/locationService';
import { useCenterStore } from '../../store/centerStore';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

type CenterFeatureProperties = {
  centerId: string;
  name: string;
};

const CENTER_SOURCE_ID = 'nearby-centers-source';
const USER_SOURCE_ID = 'user-location-source';
const CENTER_REFRESH_DISTANCE_KM = 1;

const MapScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors, radius, spacing, typography } = useTheme();
  const cameraRef = useRef<CameraRef>(null);
  const centersSourceRef = useRef<GeoJSONSourceRef>(null);
  const lastFetchLocationRef = useRef<UserLocation | null>(null);
  const hasCenteredInitiallyRef = useRef(false);

  const centers = useCenterStore(state => state.centers);
  const loading = useCenterStore(state => state.loading);
  const storeError = useCenterStore(state => state.error);
  const userLocation = useCenterStore(state => state.userLocation);
  const setUserLocation = useCenterStore(state => state.setUserLocation);
  const fetchNearbyCenters = useCenterStore(
    state => state.fetchNearbyCenters,
  );

  const [selectedCenter, setSelectedCenter] =
    useState<NearbyCenter | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const centerFeatures = useMemo<
    FeatureCollection<Point, CenterFeatureProperties>
  >(
    () => ({
      type: 'FeatureCollection',
      features: centers.map(center => ({
        type: 'Feature',
        id: center.id,
        geometry: {
          type: 'Point',
          coordinates: [center.longitude, center.latitude],
        },
        properties: {
          centerId: center.id,
          name: center.name,
        },
      })),
    }),
    [centers],
  );

  const userFeature = useMemo<Feature<Point> | FeatureCollection<Point>>(
    () =>
      userLocation
        ? {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [
                userLocation.longitude,
                userLocation.latitude,
              ],
            },
            properties: {
              accuracy: userLocation.accuracy,
            },
          }
        : {
            type: 'FeatureCollection',
            features: [],
          },
    [userLocation],
  );

  const centerOnUser = useCallback(
    (location: UserLocation, animated = true) => {
      const camera = cameraRef.current;
      if (!camera) {
        return;
      }

      const cameraOptions = {
        center: [location.longitude, location.latitude] as [number, number],
        zoom: 14,
      };

      if (animated) {
        camera.easeTo({
          ...cameraOptions,
          duration: 650,
        });
      } else {
        camera.jumpTo(cameraOptions);
      }
    },
    [],
  );

  const refreshLocation = useCallback(async () => {
    try {
      setLocationError(null);
      const location = await locationService.getCurrentUserLocation();
      setUserLocation(location);
      lastFetchLocationRef.current = location;
      centerOnUser(location);
      await fetchNearbyCenters();
    } catch (error) {
      setLocationError(
        error instanceof Error
          ? error.message
          : 'Unable to access your current location.',
      );
    }
  }, [centerOnUser, fetchNearbyCenters, setUserLocation]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let stopTracking: (() => void) | undefined;

      const beginTracking = async () => {
        try {
          setLocationError(null);
          const initialLocation =
            await locationService.getCurrentUserLocation();

          if (!active) {
            return;
          }

          setUserLocation(initialLocation);
          lastFetchLocationRef.current = initialLocation;

          if (!hasCenteredInitiallyRef.current) {
            hasCenteredInitiallyRef.current = true;
            centerOnUser(initialLocation, false);
          }

          await fetchNearbyCenters();

          stopTracking = await locationService.watchLiveLocation(
            location => {
              if (!active) {
                return;
              }

              setUserLocation(location);

              const previousFetchLocation =
                lastFetchLocationRef.current;
              if (
                previousFetchLocation &&
                calculateDistanceKm(
                  previousFetchLocation.latitude,
                  previousFetchLocation.longitude,
                  location.latitude,
                  location.longitude,
                ) < CENTER_REFRESH_DISTANCE_KM
              ) {
                return;
              }

              lastFetchLocationRef.current = location;
              void useCenterStore.getState().fetchNearbyCenters();
            },
            error => {
              if (active) {
                setLocationError(error.message);
              }
            },
          );

          if (!active) {
            stopTracking();
          }
        } catch (error) {
          if (active) {
            setLocationError(
              error instanceof Error
                ? error.message
                : 'Unable to start live location tracking.',
            );
          }
        }
      };

      void beginTracking();

      return () => {
        active = false;
        stopTracking?.();
      };
    }, [centerOnUser, fetchNearbyCenters, setUserLocation]),
  );

  const handleCenterPress = useCallback<
    NonNullable<GeoJSONSourceProps['onPress']>
  >(
    async event => {
      event.stopPropagation();
      const feature = event.nativeEvent.features[0];
      if (!feature) {
        return;
      }

      const properties = feature.properties ?? {};
      const clusterId = Number(properties.cluster_id);

      if (properties.cluster && Number.isFinite(clusterId)) {
        const zoom =
          await centersSourceRef.current?.getClusterExpansionZoom(
            clusterId,
          );
        const coordinates =
          feature.geometry.type === 'Point'
            ? feature.geometry.coordinates
            : null;

        if (
          zoom != null &&
          coordinates &&
          typeof coordinates[0] === 'number' &&
          typeof coordinates[1] === 'number'
        ) {
          cameraRef.current?.easeTo({
            center: [coordinates[0], coordinates[1]],
            zoom,
            duration: 450,
          });
        }
        return;
      }

      const centerId = String(properties.centerId ?? '');
      const center = centers.find(item => item.id === centerId);
      if (center) {
        setSelectedCenter(center);
      }
    },
    [centers],
  );

  const handleViewDetails = useCallback(
    (centerId: string) => {
      navigation.navigate('CenterDetails', { centerId });
    },
    [navigation],
  );

  const handleRecenter = useCallback(() => {
    if (userLocation) {
      centerOnUser(userLocation);
    } else {
      void refreshLocation();
    }
  }, [centerOnUser, refreshLocation, userLocation]);

  const combinedError = locationError ?? storeError;

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Map
        style={styles.map}
        mapStyle={MAP_STYLE_URL}
        attributionPosition={{ bottom: 94, right: 8 }}
        logoPosition={{ bottom: 94, left: 8 }}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: DEFAULT_MAP_CENTER,
            zoom: 11,
          }}
          minZoom={3}
          maxZoom={19}
        />

        <GeoJSONSource
          ref={centersSourceRef}
          id={CENTER_SOURCE_ID}
          data={centerFeatures}
          cluster
          clusterRadius={52}
          clusterMaxZoom={14}
          hitbox={{ top: 18, right: 18, bottom: 18, left: 18 }}
          onPress={handleCenterPress}
        >
          <Layer
            id="center-clusters"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': colors.primary,
              'circle-radius': [
                'step',
                ['get', 'point_count'],
                18,
                10,
                23,
                30,
                28,
              ],
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 3,
            }}
          />
          <Layer
            id="center-cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              'text-field': ['get', 'point_count_abbreviated'],
              'text-size': 12,
              'text-font': ['Noto Sans Regular'],
            }}
            paint={{
              'text-color': '#FFFFFF',
            }}
          />
          <Layer
            id="center-marker-halo"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
              'circle-color': colors.primary + '28',
              'circle-radius': 17,
            }}
          />
          <Layer
            id="center-markers"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
              'circle-color': colors.primary,
              'circle-radius': 11,
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 3,
            }}
          />
          <Layer
            id="center-marker-symbol"
            type="symbol"
            filter={['!', ['has', 'point_count']]}
            layout={{
              'text-field': 'H',
              'text-size': 10,
              'text-font': ['Noto Sans Bold'],
            }}
            paint={{
              'text-color': '#FFFFFF',
            }}
          />
        </GeoJSONSource>

        <GeoJSONSource id={USER_SOURCE_ID} data={userFeature}>
          <Layer
            id="user-location-accuracy"
            type="circle"
            paint={{
              'circle-color': '#2563EB',
              'circle-opacity': 0.14,
              'circle-radius': 24,
            }}
          />
          <Layer
            id="user-location-dot"
            type="circle"
            paint={{
              'circle-color': '#2563EB',
              'circle-radius': 8,
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 3,
            }}
          />
        </GeoJSONSource>
      </Map>

      <View
        pointerEvents="none"
        style={[
          styles.headerCard,
          {
            backgroundColor: colors.surface + 'F2',
            borderColor: colors.border,
            borderRadius: radius.xl,
            left: spacing.md,
            right: spacing.md,
            top: spacing.sm,
            padding: spacing.md,
          },
        ]}
      >
        <View
          style={[
            styles.headerIcon,
            {
              backgroundColor: colors.primary + '12',
              borderRadius: radius.md,
              marginRight: spacing.sm,
            },
          ]}
        >
          <MapPin size={20} color={colors.primary} />
        </View>
        <View style={styles.headerCopy}>
          <Text
            style={[
              styles.title,
              { color: colors.text, fontSize: typography.sizes.lg },
            ]}
          >
            Nearby healthcare
          </Text>
          <Text
            style={[
              styles.subtitle,
              {
                color: colors.textSecondary,
                fontSize: typography.sizes.xs,
                marginTop: 2,
              },
            ]}
          >
            {centers.length > 0
              ? `${centers.length} center${centers.length === 1 ? '' : 's'} found`
              : 'Searching within 10–15 km'}
          </Text>
        </View>
        {loading && <ActivityIndicator color={colors.primary} size="small" />}
      </View>

      {!!combinedError && (
        <Pressable
          onPress={() => void refreshLocation()}
          style={[
            styles.errorCard,
            {
              backgroundColor: colors.error,
              borderRadius: radius.lg,
              left: spacing.md,
              right: spacing.md,
              padding: spacing.md,
            },
          ]}
        >
          <Text
            style={[
              styles.errorText,
              { fontSize: typography.sizes.xs },
            ]}
          >
            {combinedError} Tap to retry.
          </Text>
        </Pressable>
      )}

      <View
        style={[
          styles.mapControls,
          {
            right: spacing.md,
            bottom: 112,
            gap: spacing.sm,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh current location"
          onPress={() => void refreshLocation()}
          style={({ pressed }) => [
            styles.controlButton,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.full,
            },
            pressed && styles.pressed,
          ]}
        >
          <LocateFixed size={22} color={colors.primary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Recenter map on current location"
          onPress={handleRecenter}
          style={({ pressed }) => [
            styles.controlButton,
            {
              backgroundColor: colors.primary,
              borderColor: colors.primary,
              borderRadius: radius.full,
            },
            pressed && styles.pressed,
          ]}
        >
          <Crosshair size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      <CenterBottomSheet
        center={selectedCenter}
        visible={selectedCenter != null}
        onClose={() => setSelectedCenter(null)}
        onViewDetails={handleViewDetails}
      />
    </SafeAreaView>
  );
};

export default MapScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  headerCard: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  headerIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontWeight: '800',
  },
  subtitle: {
    fontWeight: '600',
  },
  errorCard: {
    position: 'absolute',
    top: 94,
  },
  errorText: {
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
  },
  mapControls: {
    position: 'absolute',
  },
  controlButton: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 6,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },
});

