import React, { useEffect, useState } from 'react';

import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useNavigation,
  useRoute,
} from '@react-navigation/native';

import type { RouteProp } from '@react-navigation/native';

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import DateTimePicker from '@react-native-community/datetimepicker';

import AppButton from '../../components/common/AppButton';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Loader from '../../components/common/Loader';
import ScreenWrapper from '../../components/common/ScreenWrapper';

import {
  colors,
  radius,
  spacing,
  typography,
} from '../../theme';

import type { AppStackParamList } from '../../navigation/types';

import { useAuthStore } from '../../store/authStore';
import { useBookingsStore } from '../../store/bookingsStore';
import { useCentersStore } from '../../store/centersStore';

import type { CenterService } from '../../types/center';

type BookAppointmentRouteProp = RouteProp<
  AppStackParamList,
  'BookAppointment'
>;

type BookAppointmentNavigationProp =
  NativeStackNavigationProp<
    AppStackParamList,
    'BookAppointment'
  >;

const BookAppointmentScreen = () => {
  const route =
    useRoute<BookAppointmentRouteProp>();

  const navigation =
    useNavigation<BookAppointmentNavigationProp>();

  const centerId = route.params?.centerId;

  const initialServiceId =
    route.params?.serviceId;

  const user = useAuthStore(
    state => state.user,
  );

  const createBooking = useBookingsStore(
    state => state.createBooking,
  );

  const bookingLoading = useBookingsStore(
    state => state.loading,
  );

  const centerServices = useCentersStore(
    state => state.centerServices,
  );

  const fetchCenterServices =
    useCentersStore(
      state => state.fetchCenterServices,
    );

  const loading = useCentersStore(
    state => state.loading,
  );

  const error = useCentersStore(
    state => state.error,
  );

  const [
    selectedServiceId,
    setSelectedServiceId,
  ] = useState<string | null>(
    initialServiceId ?? null,
  );

  const [date, setDate] = useState(
    new Date(),
  );

  const [showDatePicker, setShowDatePicker] =
    useState(false);

  const [showTimePicker, setShowTimePicker] =
    useState(false);

  useEffect(() => {
    setSelectedServiceId(
      initialServiceId ?? null,
    );

    if (centerId) {
      fetchCenterServices(centerId);
    }
  }, [
    centerId,
    fetchCenterServices,
    initialServiceId,
  ]);

  const handleBook = async () => {
    if (
      !centerId ||
      !selectedServiceId ||
      !user?.id
    ) {
      return;
    }

    try {
      await createBooking({
        user_id: user.id,
        center_id: centerId,
        service_id: selectedServiceId,

        booking_date:
          date.toISOString().split('T')[0],

        booking_time:
          date.toLocaleTimeString(),
      });

      navigation.navigate('MainTabs');
    } catch (error) {
      console.log(error);
    }
  };

  const renderService = ({
    item,
  }: {
    item: CenterService;
  }) => {
    const selected =
      selectedServiceId === item.id;

    return (
      <Pressable
        style={[
          styles.serviceCard,
          selected && styles.selectedCard,
        ]}
        onPress={() =>
          setSelectedServiceId(item.id)
        }
        accessibilityRole="button"
        accessibilityState={{
          selected,
        }}>
        <View style={styles.serviceHeader}>
          <Text style={styles.serviceName}>
            {item.name}
          </Text>

          <Text style={styles.price}>
            Rs. {item.price}
          </Text>
        </View>

        {!!item.description && (
          <Text style={styles.description}>
            {item.description}
          </Text>
        )}

        <Text style={styles.meta}>
          {item.duration_minutes} min
        </Text>
      </Pressable>
    );
  };

  if (!centerId) {
    return (
      <ScreenWrapper>
        <EmptyState
          title="Center Missing"
          subtitle="Please select a center before booking an appointment."
          buttonTitle="Go Back"
          onButtonPress={navigation.goBack}
        />
      </ScreenWrapper>
    );
  }

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
          title="Failed To Load Services"
          message={error}
          buttonTitle="Retry"
          onRetry={() =>
            fetchCenterServices(centerId)
          }
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <FlatList
        data={centerServices}
        keyExtractor={item => item.id}
        renderItem={renderService}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>
              Book Appointment
            </Text>

            <Text style={styles.subtitle}>
              Select a service to continue.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No Services"
            subtitle="No services available for this center."
          />
        }
        ListFooterComponent={
          <View>
            <View style={styles.dateContainer}>
              <Text style={styles.label}>
                Selected Date
              </Text>

              <Pressable
                style={styles.dateButton}
                onPress={() =>
                  setShowDatePicker(true)
                }>
                <Text style={styles.dateText}>
                  {date.toDateString()}
                </Text>
              </Pressable>

              <Text style={styles.label}>
                Selected Time
              </Text>

              <Pressable
                style={styles.dateButton}
                onPress={() =>
                  setShowTimePicker(true)
                }>
                <Text style={styles.dateText}>
                  {date.toLocaleTimeString()}
                </Text>
              </Pressable>

              {showDatePicker && (
                <DateTimePicker
                  value={date}
                  mode="date"
                  onChange={(
                    event,
                    selectedDate,
                  ) => {
                    setShowDatePicker(false);

                    if (selectedDate) {
                      setDate(selectedDate);
                    }
                  }}
                />
              )}

              {showTimePicker && (
                <DateTimePicker
                  value={date}
                  mode="time"
                  onChange={(
                    event,
                    selectedDate,
                  ) => {
                    setShowTimePicker(false);

                    if (selectedDate) {
                      setDate(selectedDate);
                    }
                  }}
                />
              )}
            </View>

            <AppButton
              title={
                bookingLoading
                  ? 'Booking...'
                  : 'Confirm Booking'
              }
              loading={bookingLoading}
              disabled={
                !selectedServiceId ||
                bookingLoading ||
                centerServices.length === 0
              }
              onPress={handleBook}
            />
          </View>
        }
      />
    </ScreenWrapper>
  );
};

export default BookAppointmentScreen;

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingBottom: spacing.xl,
  },

  header: {
    marginBottom: spacing.lg,
  },

  title: {
    color: colors.text,
    fontSize: typography.h1,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
  },

  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.body,
  },

  serviceCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.md,
  },

  selectedCard: {
    borderColor: colors.primary,
    borderWidth: 2,
  },

  serviceHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },

  serviceName: {
    color: colors.text,
    flex: 1,
    fontSize: typography.body,
    fontWeight: 'bold',
  },

  price: {
    color: colors.primary,
    fontSize: typography.body,
    fontWeight: '700',
  },

  description: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xs,
  },

  meta: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.sm,
  },

  dateContainer: {
    marginBottom: spacing.lg,
  },

  label: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },

  dateButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },

  dateText: {
    color: colors.text,
    fontSize: typography.body,
  },
});