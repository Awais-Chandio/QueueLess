import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  FlatList,
  Pressable,
} from 'react-native';

import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import Loader from '../../../components/ui/Loader';
import ErrorState from '../../../components/ui/ErrorState';
import EmptyState from '../../../components/ui/EmptyState';
import AppButton from '../../../components/ui/AppButton';
import Badge from '../../../components/ui/Badge';
import { Clock, MapPin, Sparkles, ChevronLeft, CreditCard, Hourglass } from 'lucide-react-native';

import { useTheme } from '../../../hooks/useTheme';

import type { AppStackParamList } from '../../../navigation/types';

import { centersService } from '../api/centersService';

import type {
  Center,
  CenterService,
} from '../../../types/center';

type NavigationProp = NativeStackNavigationProp<
  AppStackParamList,
  'CenterDetails'
>;

type CenterDetailsRouteProp = RouteProp<
  AppStackParamList,
  'CenterDetails'
>;

const CenterDetailsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<CenterDetailsRouteProp>();
  const { colors, radius, spacing, typography } = useTheme();

  const { centerId } = route.params as { centerId: string };

  const [center, setCenter] = useState<Center | null>(null);
  const [services, setServices] = useState<CenterService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          : 'Failed to load center details',
      );
    } finally {
      setLoading(false);
    }
  }, [centerId]);

  useEffect(() => {
    fetchCenterDetails();
  }, [fetchCenterDetails]);

  const formatTime = (time: string | null) => {
    if (!time) {
      return null;
    }

    const [hours, minutes] = time.split(':');
    const date = new Date();
    date.setHours(Number(hours), Number(minutes), 0, 0);

    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const openingTime = formatTime(center?.open_time ?? null);
  const closingTime = formatTime(center?.close_time ?? null);

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
          title="Failed To Load Center"
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
          title="Center Not Found"
          subtitle="Unable to find this center"
          buttonTitle="Go Back"
          onButtonPress={() => navigation.goBack()}
        />
      </ScreenWrapper>
    );
  }

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
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.lg }}>
            <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl, marginBottom: spacing.xs }]}>
              {center.name}
            </Text>

            <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.sm, marginBottom: spacing.sm }]}>
              {center.city}
            </Text>

            {!!center.category && (
              <Badge label={center.category} variant="info" style={{ marginBottom: spacing.md }} />
            )}

            <View style={styles.addressContainer}>
              <MapPin size={16} color={colors.primary} style={{ marginRight: spacing.xs, marginTop: 2 }} />
              <Text style={[styles.address, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
                {center.address}
              </Text>
            </View>

            {!!center.description && (
              <Text style={[styles.description, { color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: spacing.md }]}>
                {center.description}
              </Text>
            )}

            {openingTime && closingTime && (
              <View style={[styles.timingCard, { backgroundColor: colors.surface, borderRadius: radius.lg, borderColor: colors.border, borderWidth: 1, padding: spacing.lg, marginTop: spacing.lg }]}>
                <View style={styles.cardRow}>
                  <Clock size={18} color={colors.primary} style={{ marginRight: spacing.xs }} />
                  <Text style={[styles.timingLabel, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                    Working Hours
                  </Text>
                </View>

                <Text style={[styles.timingValue, { color: colors.text, fontSize: typography.sizes.md, marginTop: spacing.xs }]}>
                  {openingTime} - {closingTime}
                </Text>
              </View>
            )}

            <View style={[styles.sectionTitleRow, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>
              <Sparkles size={18} color={colors.primary} style={{ marginRight: spacing.xs }} />
              <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.md }]}>
                Available Services
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.serviceCard, { backgroundColor: colors.surface, borderRadius: radius.lg, borderColor: colors.border, borderWidth: 1, padding: spacing.lg, marginBottom: spacing.md }]}>
            <Text style={[styles.serviceName, { color: colors.text, fontSize: typography.sizes.md, marginBottom: spacing.xs }]}>
              {item.name}
            </Text>

            {!!item.description && (
              <Text style={[styles.serviceDescription, { color: colors.textSecondary, fontSize: typography.sizes.xs, marginBottom: spacing.sm }]}>
                {item.description}
              </Text>
            )}

            <View style={styles.metaRow}>
              <View style={[styles.metaItem, { backgroundColor: colors.border + '15', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }]}>
                <Hourglass size={14} color={colors.textSecondary} style={{ marginRight: 4 }} />
                <Text style={[styles.metaText, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                  {item.duration_minutes} mins
                </Text>
              </View>

              <View style={[styles.metaItem, { backgroundColor: colors.border + '15', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }]}>
                <CreditCard size={14} color={colors.textSecondary} style={{ marginRight: 4 }} />
                <Text style={[styles.metaText, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                  Rs. {item.price}
                </Text>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            title="No Services Found"
            subtitle="No services available for this center"
          />
        }
        ListFooterComponent={
          <AppButton
            title="Book Appointment"
            style={{ marginTop: spacing.md }}
            onPress={() =>
              navigation.navigate(
                'BookAppointment',
                {
                  centerId: center.id,
                },
              )
            }
          />
        }
      />
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
    fontWeight: '600',
  },
  title: {
    fontWeight: '800',
  },
  subtitle: {
    fontWeight: '500',
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
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timingLabel: {
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  timingValue: {
    fontWeight: '700',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontWeight: '700',
  },
  serviceCard: {
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
  },
  serviceName: {
    fontWeight: '700',
  },
  serviceDescription: {
    lineHeight: 16,
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
    fontWeight: '600',
  },
});
