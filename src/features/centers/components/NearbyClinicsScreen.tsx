import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, FlatList, Pressable, ActivityIndicator, Alert, Platform, PermissionsAndroid } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Geolocation from '@react-native-community/geolocation';
import { ChevronLeft, MapPin, AlertCircle, RefreshCw } from 'lucide-react-native';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import Card from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import AppButton from '../../../components/ui/AppButton';
import { useTheme } from '../../../hooks/useTheme';
import { supabase } from '../../../lib/supabase';
import type { AppStackParamList } from '../../../navigation/types';

type NavigationProp = NativeStackNavigationProp<AppStackParamList, 'NearbyClinics'>;

const NearbyClinicsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors, spacing, typography, radius } = useTheme();

  const [loading, setLoading] = useState(true);
  const [centers, setCenters] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchNearby = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Access Required',
            message: 'QueueLess needs access to your location to show healthcare centers near you.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setErrorMsg('Location permission was denied. Please enable it in Settings.');
          setLoading(false);
          return;
        }
      }

      Geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { data, error } = await supabase.rpc('get_nearby_centers', {
              p_lat: pos.coords.latitude,
              p_lng: pos.coords.longitude,
              p_radius_km: 15,
            });

            if (error) throw error;
            setCenters(data || []);
          } catch (err: any) {
            console.warn('RPC get_nearby_centers error:', err);
            setErrorMsg('Failed to query nearby clinics from database.');
          } finally {
            setLoading(false);
          }
        },
        (geoError) => {
          console.warn('Geolocation error:', geoError);
          setErrorMsg('Could not fetch location. Make sure GPS/location services are enabled.');
          setLoading(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    } catch (err) {
      console.warn('Location permission request error:', err);
      setErrorMsg('An error occurred while requesting location permissions.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNearby();
  }, []);

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary, fontSize: typography.sizes.md, marginLeft: spacing.xs }]}>
            Back
          </Text>
        </Pressable>
      </View>

      <View style={[styles.titleSection, { paddingHorizontal: spacing.md, marginBottom: spacing.md }]}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xl, fontWeight: '800' }]}>
          Nearby Clinics
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
          Showing healthcare centers within 15 km of your location
        </Text>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginTop: spacing.sm }}>
            Fetching location & nearby clinics...
          </Text>
        </View>
      ) : errorMsg ? (
        <View style={[styles.centerContainer, { paddingHorizontal: spacing.xl }]}>
          <AlertCircle size={40} color={colors.error} style={{ marginBottom: spacing.sm }} />
          <Text style={{ color: colors.text, fontSize: typography.sizes.sm, fontWeight: '700', textAlign: 'center' }}>
            Location Unresolved
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, textAlign: 'center', marginVertical: spacing.xs }}>
            {errorMsg}
          </Text>
          <AppButton
            title="Retry Connection"
            onPress={fetchNearby}
            leftIcon={<RefreshCw size={14} color="#FFF" />}
            style={{ marginTop: spacing.md }}
          />
        </View>
      ) : centers.length === 0 ? (
        <View style={[styles.centerContainer, { paddingHorizontal: spacing.xl }]}>
          <MapPin size={40} color={colors.textSecondary} style={{ marginBottom: spacing.sm }} />
          <Text style={{ color: colors.text, fontSize: typography.sizes.sm, fontWeight: '700', textAlign: 'center' }}>
            No Clinics Found
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, textAlign: 'center', marginVertical: spacing.xs }}>
            There are no clinics within 15 km of your current position, or center coordinates are not set in the system yet.
          </Text>
          <AppButton
            title="Search All Clinics"
            onPress={() => navigation.navigate('Centers')}
            style={{ marginTop: spacing.md }}
          />
        </View>
      ) : (
        <FlatList
          data={centers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xl }}
          renderItem={({ item }) => (
            <Card
              onPress={() =>
                navigation.navigate('CenterDetails', {
                  centerId: item.id,
                })
              }
              variant="elevated"
              style={[styles.clinicCard, { padding: spacing.md, borderRadius: radius.xl }]}
              containerStyle={{ marginBottom: spacing.md }}
            >
              <View style={styles.clinicRow}>
                <View style={[styles.clinicIconCircle, { backgroundColor: colors.primary + '12' }]}>
                  <MapPin size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.clinicName, { color: colors.text, fontSize: typography.sizes.md, fontWeight: '800' }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.distance_km != null && (
                      <Badge
                        label={`${parseFloat(item.distance_km).toFixed(1)} km`}
                        variant="info"
                      />
                    )}
                  </View>
                  <Text style={[styles.clinicAddress, { color: colors.textSecondary, fontSize: typography.sizes.xs, marginTop: 2 }]} numberOfLines={1}>
                    {item.address}, {item.city}
                  </Text>
                  {item.category && (
                    <Text style={{ color: colors.primary, fontSize: typography.sizes.xs - 1, fontWeight: '800', marginTop: spacing.xs }}>
                      Category: {item.category}
                    </Text>
                  )}
                </View>
              </View>
            </Card>
          )}
        />
      )}
    </ScreenWrapper>
  );
};

export default NearbyClinicsScreen;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    fontWeight: '700',
  },
  titleSection: {
    gap: 4,
  },
  title: {},
  subtitle: {},
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 50,
  },
  clinicCard: {},
  clinicRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clinicIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clinicName: {
    maxWidth: '70%',
  },
  clinicAddress: {},
});
