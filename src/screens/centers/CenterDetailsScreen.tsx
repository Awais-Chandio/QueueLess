import React, { useCallback, useEffect, useState } from 'react';

import {
  View,
  StyleSheet,
  Text,
  FlatList,
} from 'react-native';

import { useNavigation, useRoute } from '@react-navigation/native';

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import ScreenWrapper from '../../components/common/ScreenWrapper';
import Loader from '../../components/common/Loader';
import ErrorState from '../../components/common/ErrorState';
import EmptyState from '../../components/common/EmptyState';
import AppButton from '../../components/common/AppButton';

import { colors, spacing, typography } from '../../theme';

import type { AppStackParamList } from '../../navigation/types';

import {
  centersService,
} from '../../services/centers/centersService';

import type {
  Center,
  CenterService,
} from '../../types/center';

type NavigationProp = NativeStackNavigationProp<
  AppStackParamList,
  'CenterDetails'
>;

type CenterDetailsRouteProp = RouteProp<
  AppStackParamList,
  'CenterDetails'
>;

const CenterDetailsScreen = () => {
  const navigation =
    useNavigation<NavigationProp>();

  const route =
    useRoute<CenterDetailsRouteProp>();

  const { centerId } = route.params as { centerId: string };

  const [center, setCenter] =
    useState<Center | null>(null);

  const [services, setServices] =
    useState<CenterService[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const fetchCenterDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const centerData =
        await centersService.getCenterById(
          centerId,
        );

      const servicesData =
        await centersService.getCenterServices(
          centerId,
        );

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
          onButtonPress={() =>
            navigation.goBack()
          }
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <FlatList
        data={services}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={
          styles.contentContainer
        }
        ListHeaderComponent={
          <>
            <Text style={styles.title}>
              {center.name}
            </Text>

            <Text style={styles.subtitle}>
              {center.city}
            </Text>

            {!!center.category && (
              <Text style={styles.category}>
                {center.category}
              </Text>
            )}

            <Text style={styles.address}>
              {center.address}
            </Text>

            {!!center.description && (
              <Text style={styles.description}>
                {center.description}
              </Text>
            )}

            {openingTime && closingTime && (
              <View style={styles.timingCard}>
                <Text style={styles.timingLabel}>
                  Timings
                </Text>

                <Text style={styles.timingValue}>
                  {openingTime}
                  {' - '}
                  {closingTime}
                </Text>
              </View>
            )}

            <Text style={styles.sectionTitle}>
              Available Services
            </Text>
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.serviceCard}>
            <Text style={styles.serviceName}>
              {item.name}
            </Text>

            {!!item.description && (
              <Text style={styles.description}>
                {item.description}
              </Text>
            )}

            <Text style={styles.meta}>
              Duration:
              {' '}
              {item.duration_minutes}
              {' '}
              mins
            </Text>

            <Text style={styles.meta}>
              Price:
              {' '}
              Rs.
              {' '}
              {item.price}
            </Text>
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
  contentContainer: {
    paddingBottom: spacing.xl,
  },

  title: {
    fontSize: typography.h1,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.xs,
  },

  subtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },

  category: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: 999,
    color: colors.primary,
    fontSize: typography.caption,
    fontWeight: '700',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },

  address: {
    fontSize: typography.small,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },

  timingCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: spacing.lg,
    padding: spacing.md,
  },

  timingLabel: {
    color: colors.textSecondary,
    fontSize: typography.caption,
    marginBottom: spacing.xs,
  },

  timingValue: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '700',
  },

  sectionTitle: {
    fontSize: typography.body,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.md,
  },

  serviceCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.md,
  },

  serviceName: {
    fontSize: typography.body,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.xs,
  },

  description: {
    fontSize: typography.small,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },

  meta: {
    fontSize: typography.small,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
});
