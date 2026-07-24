import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  View,
  StyleSheet,
  Text,
  FlatList,
  Pressable,
  Image,
  Alert,
} from 'react-native';

import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import Loader from '../../../components/ui/Loader';
import ErrorState from '../../../components/ui/ErrorState';
import EmptyState from '../../../components/ui/EmptyState';
import AppButton from '../../../components/ui/AppButton';
import Badge from '../../../components/ui/Badge';
import Card from '../../../components/ui/Card';
import {
  Clock,
  MapPin,
  Sparkles,
  ChevronLeft,
  CreditCard,
  Hourglass,
  Stethoscope,
  Heart,
  Eye,
  FlaskConical,
  Smile,
  Brain,
  Bone,
  Baby,
  Wind,
  Activity,
  Info,
  Phone,
  Hospital,
  Navigation,
} from 'lucide-react-native';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
} from '@maplibre/maplibre-react-native';

import { useTheme } from '../../../hooks/useTheme';

import type { AppStackParamList } from '../../../navigation/types';

import { centersService } from '../api/centersService';

import type {
  Center,
  CenterService,
} from '../../../types/center';
import { MAP_STYLE_URL } from '../../../config/map';
import {
  calculateDistanceKm,
} from '../../../services/centers/centerService';
import { locationService } from '../../../services/location/locationService';
import { openMapNavigation } from '../../../services/location/mapNavigationService';
import { useCenterStore } from '../../../store/centerStore';
import {
  formatCenterTime,
  formatDistance,
} from '../../../utils/centerLocation';

type NavigationProp = NativeStackNavigationProp<
  AppStackParamList,
  'CenterDetails'
>;

type CenterDetailsRouteProp = RouteProp<
  AppStackParamList,
  'CenterDetails'
>;

/** Map a department name to a contextual Lucide icon */
const getDepartmentIcon = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('general') || lower.includes('physician') || lower.includes('gp')) return Stethoscope;
  if (lower.includes('cardio') || lower.includes('heart')) return Heart;
  if (lower.includes('dental') || lower.includes('tooth') || lower.includes('ortho')) return Smile;
  if (lower.includes('eye') || lower.includes('ophthal')) return Eye;
  if (lower.includes('lab') || lower.includes('pathol') || lower.includes('test')) return FlaskConical;
  if (lower.includes('neuro') || lower.includes('brain')) return Brain;
  if (lower.includes('bone') || lower.includes('orthoped') || lower.includes('spine')) return Bone;
  if (lower.includes('pediatric') || lower.includes('child') || lower.includes('baby')) return Baby;
  if (lower.includes('pulmo') || lower.includes('chest') || lower.includes('respir')) return Wind;
  if (lower.includes('emer') || lower.includes('urgent') || lower.includes('acute')) return Activity;
  return Stethoscope; // default fallback
};

const CenterDetailsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<CenterDetailsRouteProp>();
  const { colors, radius, spacing, typography } = useTheme();

  const { centerId } = route.params as { centerId: string };

  const [center, setCenter] = useState<Center | null>(null);
  const [services, setServices] = useState<CenterService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const userLocation = useCenterStore(state => state.userLocation);
  const setUserLocation = useCenterStore(state => state.setUserLocation);

  const fetchCenterDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const centerData = await centersService.getCenterById(centerId);
      const servicesData = await centersService.getCenterServices(centerId);

      setCenter(centerData);
      setServices(servicesData);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load clinic details',
      );
    } finally {
      setLoading(false);
    }
  }, [centerId]);

  useEffect(() => {
    fetchCenterDetails();
  }, [fetchCenterDetails]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let stopTracking: (() => void) | undefined;

      const beginTracking = async () => {
        try {
          const currentLocation =
            await locationService.getCurrentUserLocation();
          if (!active) {
            return;
          }

          setUserLocation(currentLocation);
          setLocationError(null);

          stopTracking = await locationService.watchLiveLocation(
            location => {
              if (active) {
                setUserLocation(location);
                setLocationError(null);
              }
            },
            trackingError => {
              if (active) {
                setLocationError(trackingError.message);
              }
            },
          );

          if (!active) {
            stopTracking();
          }
        } catch (trackingError) {
          if (active) {
            setLocationError(
              trackingError instanceof Error
                ? trackingError.message
                : 'Live distance is currently unavailable.',
            );
          }
        }
      };

      void beginTracking();

      return () => {
        active = false;
        stopTracking?.();
      };
    }, [setUserLocation]),
  );

  const distance = useMemo(() => {
    if (
      !center ||
      center.latitude == null ||
      center.longitude == null ||
      !userLocation
    ) {
      return null;
    }

    return calculateDistanceKm(
      userLocation.latitude,
      userLocation.longitude,
      center.latitude,
      center.longitude,
    );
  }, [center, userLocation]);

  const centerPoint = useMemo(
    () =>
      center?.latitude != null && center.longitude != null
        ? {
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [center.longitude, center.latitude],
            },
            properties: {},
          }
        : null,
    [center],
  );

  const userPoint = useMemo(
    () =>
      userLocation
        ? {
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [
                userLocation.longitude,
                userLocation.latitude,
              ],
            },
            properties: {},
          }
        : null,
    [userLocation],
  );

  const handleNavigate = useCallback(async () => {
    if (center?.latitude == null || center.longitude == null) {
      Alert.alert(
        'Location unavailable',
        'This center does not have valid map coordinates yet.',
      );
      return;
    }

    try {
      await openMapNavigation(center.latitude, center.longitude);
    } catch {
      Alert.alert(
        'Navigation unavailable',
        'Unable to open a navigation application on this device.',
      );
    }
  }, [center]);

  const openingTime = formatCenterTime(center?.open_time ?? null);
  const closingTime = formatCenterTime(center?.close_time ?? null);

  if (loading) {
    return (
      <ScreenWrapper>
        <Loader />
      </ScreenWrapper>
    );
  }

  if (error) {
    return (
      <ScreenWrapper>
        <ErrorState
          title="Failed To Load Clinic"
          message={error}
          buttonTitle="Retry"
          onRetry={fetchCenterDetails}
        />
      </ScreenWrapper>
    );
  }

  if (!center) {
    return (
      <ScreenWrapper>
        <EmptyState
          title="Clinic Not Found"
          subtitle="Unable to find this clinic"
          buttonTitle="Go Back"
          onButtonPress={() => navigation.goBack()}
        />
      </ScreenWrapper>
    );
  }

  const mockPhone = '+92 (21) 111-222-333';

  return (
    <ScreenWrapper>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <ChevronLeft size={24} color={colors.primary} />
          <Text style={[styles.backButtonText, { color: colors.primary, fontSize: typography.sizes.md, marginLeft: spacing.xs }]}>
            Back
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={services}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.lg }}>
            {/* Clinic Image */}
            {center.image_url ? (
              <Image source={{ uri: center.image_url }} style={[styles.clinicImage, { borderRadius: radius.xl, marginBottom: spacing.md }]} />
            ) : (
              <View style={[styles.clinicImagePlaceholder, { backgroundColor: colors.primary + '10', borderRadius: radius.xl, marginBottom: spacing.md }]}>
                <Hospital size={48} color={colors.primary} />
              </View>
            )}

            <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl, marginBottom: spacing.xs }]}>
              {center.name}
            </Text>

            <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.sm, marginBottom: spacing.md }]}>
              {center.city}
            </Text>

            {!!center.category && (
              <View style={{ flexDirection: 'row', marginBottom: spacing.md }}>
                <Badge label={center.category} variant="info" />
              </View>
            )}

            {/* Address */}
            <View style={styles.infoRow}>
              <MapPin size={16} color={colors.primary} style={{ marginRight: spacing.sm, marginTop: 2 }} />
              <Text style={[styles.infoText, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
                {center.address}
              </Text>
            </View>

            {/* Phone */}
            <View style={[styles.infoRow, { marginTop: spacing.sm }]}>
              <Phone size={16} color={colors.primary} style={{ marginRight: spacing.sm }} />
              <Text style={[styles.infoText, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
                {mockPhone}
              </Text>
            </View>

            {/* Timing Hours */}
            {openingTime && closingTime && (
              <Card
                variant="flat"
                style={[styles.timingCard, { marginTop: spacing.md, padding: spacing.md }]}
              >
                <View style={styles.cardRow}>
                  <Clock size={16} color={colors.primary} style={{ marginRight: spacing.xs }} />
                  <Text style={[styles.timingLabel, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                    Working Hours
                  </Text>
                </View>

                <Text style={[styles.timingValue, { color: colors.text, fontSize: typography.sizes.md, marginTop: spacing.xs }]}>
                  {openingTime} - {closingTime}
                </Text>
              </Card>
            )}

            {centerPoint && (
              <View style={{ marginTop: spacing.lg }}>
                <View
                  style={[
                    styles.mapHeader,
                    { marginBottom: spacing.sm },
                  ]}
                >
                  <View style={styles.mapTitleRow}>
                    <MapPin
                      size={18}
                      color={colors.primary}
                      style={{ marginRight: spacing.xs }}
                    />
                    <Text
                      style={[
                        styles.sectionTitle,
                        {
                          color: colors.text,
                          fontSize: typography.sizes.md,
                        },
                      ]}
                    >
                      Location
                    </Text>
                  </View>
                  {distance != null && (
                    <Text
                      style={[
                        styles.liveDistance,
                        {
                          color: colors.primary,
                          fontSize: typography.sizes.sm,
                        },
                      ]}
                    >
                      {formatDistance(distance)} away
                    </Text>
                  )}
                </View>

                <View
                  style={[
                    styles.mapPreview,
                    {
                      borderRadius: radius.xl,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <MapLibreMap
                    style={styles.map}
                    mapStyle={MAP_STYLE_URL}
                    dragPan={false}
                    touchZoom={false}
                    touchRotate={false}
                    touchPitch={false}
                    attributionPosition={{ bottom: 4, right: 4 }}
                    logoPosition={{ bottom: 4, left: 4 }}
                  >
                    <Camera
                      initialViewState={{
                        center: [
                          center.longitude as number,
                          center.latitude as number,
                        ],
                        zoom: 14,
                      }}
                    />
                    <GeoJSONSource
                      id={`details-center-${center.id}`}
                      data={centerPoint}
                    >
                      <Layer
                        id={`details-center-marker-${center.id}`}
                        type="circle"
                        paint={{
                          'circle-color': colors.primary,
                          'circle-radius': 11,
                          'circle-stroke-color': '#FFFFFF',
                          'circle-stroke-width': 3,
                        }}
                      />
                    </GeoJSONSource>
                    {userPoint && (
                      <GeoJSONSource
                        id="details-user-location"
                        data={userPoint}
                      >
                        <Layer
                          id="details-user-location-dot"
                          type="circle"
                          paint={{
                            'circle-color': '#2563EB',
                            'circle-radius': 7,
                            'circle-stroke-color': '#FFFFFF',
                            'circle-stroke-width': 3,
                          }}
                        />
                      </GeoJSONSource>
                    )}
                  </MapLibreMap>
                </View>

                <AppButton
                  title="Navigate"
                  onPress={() => void handleNavigate()}
                  containerStyle={{ marginTop: spacing.sm }}
                  leftIcon={<Navigation size={17} color="#FFFFFF" />}
                />
                {!!locationError && (
                  <Text
                    style={[
                      styles.locationError,
                      {
                        color: colors.textSecondary,
                        fontSize: typography.sizes.xs,
                        marginTop: spacing.xs,
                      },
                    ]}
                  >
                    Live distance unavailable: {locationError}
                  </Text>
                )}
              </View>
            )}

            {/* Departments Section */}
            <View style={[styles.sectionTitleRow, { marginTop: spacing.lg, marginBottom: spacing.xs }]}>
              <Sparkles size={18} color={colors.primary} style={{ marginRight: spacing.xs }} />
              <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.md }]}>
                Available Departments
              </Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginBottom: spacing.sm, fontStyle: 'italic' }}>
              Select a department to choose your doctor & view live queue
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const DeptIcon = getDepartmentIcon(item.name);
          return (
            <Card
              variant="elevated"
              onPress={() =>
                navigation.navigate('DoctorList', {
                  centerId: center.id,
                  serviceId: item.id,
                  serviceName: item.name,
                })
              }
              style={[styles.serviceCard, { padding: spacing.md }]}
              containerStyle={{ marginBottom: spacing.md }}
            >
              <View style={styles.serviceHeader}>
                <View style={[styles.deptIconContainer, { backgroundColor: colors.primary + '12', borderRadius: radius.md }]}>
                  <DeptIcon size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={[styles.serviceName, { color: colors.text, fontSize: typography.sizes.md, marginBottom: spacing.xs }]}>
                    {item.name}
                  </Text>

                  {!!item.description && (
                    <Text style={[styles.serviceDescription, { color: colors.textSecondary, fontSize: typography.sizes.xs, marginBottom: spacing.sm }]}>
                      {item.description}
                    </Text>
                  )}

                  {!!item.on_duty_note && (
                    <View style={[styles.onDutyRow, { backgroundColor: colors.primary + '08', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 }]}>
                      <Info size={11} color={colors.primary} style={{ marginRight: 4 }} />
                      <Text style={[styles.onDutyText, { color: colors.primary, fontSize: typography.sizes.xs }]}>
                        {item.on_duty_note}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.metaRow}>
                <View style={[styles.metaItem, { backgroundColor: colors.border + '30', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }]}>
                  <Hourglass size={12} color={colors.textSecondary} style={{ marginRight: 4 }} />
                  <Text style={[styles.metaText, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                    {item.duration_minutes} mins
                  </Text>
                </View>

                <View style={[styles.metaItem, { backgroundColor: colors.border + '30', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }]}>
                  <CreditCard size={12} color={colors.textSecondary} style={{ marginRight: 4 }} />
                  <Text style={[styles.metaText, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                    Rs. {item.price}
                  </Text>
                </View>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title="No Departments Found"
            subtitle="No departments available for this clinic"
          />
        }
      />

      {/* Sticky Bottom View Doctors Button */}
      <View style={[styles.stickyFooter, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <AppButton
          title="View Doctors"
          onPress={() => {
            if (services.length > 0) {
              navigation.navigate('DoctorList', {
                centerId: center.id,
                serviceId: services[0].id,
                serviceName: services[0].name,
              });
            } else {
              Alert.alert('No Doctors', 'There are no active doctors or services in this clinic.');
            }
          }}
          variant="primary"
        />
      </View>
    </ScreenWrapper>
  );
};

export default CenterDetailsScreen;

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  backButtonText: {
    fontWeight: '700',
  },
  title: {
    fontWeight: '800',
  },
  subtitle: {
    fontWeight: '600',
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  address: {
    flex: 1,
    lineHeight: 18,
  },
  description: {
    lineHeight: 20,
  },
  timingCard: {
    borderWidth: 0,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timingLabel: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timingValue: {
    fontWeight: '800',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontWeight: '800',
  },
  serviceCard: {
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  deptIconContainer: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceName: {
    fontWeight: '800',
  },
  serviceDescription: {
    lineHeight: 16,
  },
  onDutyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  onDutyText: {
    flex: 1,
    fontWeight: '600',
    lineHeight: 15,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontWeight: '700',
  },
  clinicImage: {
    width: '100%',
    height: 160,
  },
  clinicImagePlaceholder: {
    width: '100%',
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoText: {
    flex: 1,
    lineHeight: 18,
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mapTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDistance: {
    fontWeight: '800',
  },
  mapPreview: {
    height: 190,
    overflow: 'hidden',
    borderWidth: 1,
  },
  map: {
    flex: 1,
  },
  locationError: {
    lineHeight: 16,
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopWidth: 1.2,
  },
});
