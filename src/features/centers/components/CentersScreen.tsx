import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  FlatList,
  Image,
} from 'react-native';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import Loader from '../../../components/ui/Loader';
import ErrorState from '../../../components/ui/ErrorState';
import EmptyState from '../../../components/ui/EmptyState';
import Badge from '../../../components/ui/Badge';
import Card from '../../../components/ui/Card';
import { Hospital, MapPin, Star } from 'lucide-react-native';

import { useTheme } from '../../../hooks/useTheme';

import type { AppStackParamList } from '../../../navigation/types';

import { useCentersStore } from '../../../store/centersStore';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

const CentersScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors, radius, spacing, typography } = useTheme();

  const {
    centers,
    loading,
    error,
    fetchCenters,
  } = useCentersStore();

  useEffect(() => {
    fetchCenters();
  }, [fetchCenters]);

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
          title="Failed To Load Clinics"
          message={error}
          buttonTitle="Retry"
          onRetry={fetchCenters}
        />
      </ScreenWrapper>
    );
  }

  if (centers.length === 0) {
    return (
      <ScreenWrapper>
        <EmptyState
          title="No Clinics Found"
          subtitle="No clinics available right now"
          buttonTitle="Reload"
          onButtonPress={fetchCenters}
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl, marginBottom: spacing.lg }]}>
          Clinics
        </Text>

        <FlatList
          data={centers}
          keyExtractor={item => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          renderItem={({ item }) => (
            <Card
              onPress={() =>
                navigation.navigate(
                  'CenterDetails',
                  {
                    centerId: item.id,
                  },
                )
              }
              variant="elevated"
              style={[
                styles.card,
                {
                  padding: spacing.md,
                },
              ]}
              containerStyle={{ marginBottom: spacing.md }}
            >
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={[styles.clinicImage, { borderRadius: radius.lg }]} />
              ) : (
                <View style={[styles.clinicImagePlaceholder, { backgroundColor: colors.primary + '10', borderRadius: radius.lg }]}>
                  <Hospital size={36} color={colors.primary} />
                </View>
              )}

              <View style={[styles.infoContainer, { marginTop: spacing.sm }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.name, { color: colors.text, fontSize: typography.sizes.md }]}>
                    {item.name}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Star size={12} color="#FBBF24" fill="#FBBF24" />
                    <Text style={{ fontSize: typography.sizes.xs, color: colors.text, fontWeight: '700' }}>4.8</Text>
                  </View>
                </View>

                <View style={[styles.addressContainer, { marginTop: spacing.xs }]}>
                  <MapPin size={14} color={colors.textSecondary} style={{ marginRight: spacing.xs }} />
                  <Text style={[styles.address, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                    {item.address}, {item.city}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.sm, flexWrap: 'wrap' }}>
                  {!!item.category && <Badge label={item.category} variant="info" />}
                  {!!item.open_time && !!item.close_time && (
                    <Badge label={`${item.open_time} - ${item.close_time}`} variant="success" />
                  )}
                </View>
              </View>
            </Card>
          )}
        />
      </View>
    </ScreenWrapper>
  );
};

export default CentersScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  card: {
    flexDirection: 'column',
  },
  clinicImage: {
    width: '100%',
    height: 140,
  },
  clinicImagePlaceholder: {
    width: '100%',
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContainer: {
    flexDirection: 'column',
  },
  name: {
    fontWeight: '800',
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  address: {
    fontWeight: '500',
  },
});
