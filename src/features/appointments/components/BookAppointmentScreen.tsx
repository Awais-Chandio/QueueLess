import React, { useEffect, useState } from 'react';

import {
  FlatList,
  Pressable,
  ScrollView,
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

import { useQueryClient } from '@tanstack/react-query';

import DateTimePicker from '@react-native-community/datetimepicker';

import AppButton from '../../../components/ui/AppButton';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import Loader from '../../../components/ui/Loader';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';

import {
  colors,
  radius,
  spacing,
  typography,
} from '../../../theme';

import type { AppStackParamList } from '../../../navigation/types';

import { useAuthStore } from '../../../store/authStore';
import { useAppointmentsStore } from '../../../store/appointmentsStore';
import { useCentersStore } from '../../../store/centersStore';
import { toastService } from '../../../services/toastService';
import { appointmentsService } from '../api/appointmentsService';
import {
  APPOINTMENT_SLOT_LABELS,
  AppointmentSlotLabel,
  formatAppointmentDateInput,
  getScheduledAtFromSlot,
  isPastAppointmentDate,
  isPastAppointmentSlot,
} from '../utils/appointmentTime';

import type { AppointmentFull } from '../../../types/appointment';
import type { CenterService } from '../../../types/center';

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

  const createAppointment = useAppointmentsStore(
    state => state.createAppointment,
  );

  const appointmentLoading = useAppointmentsStore(
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

  const queryClient = useQueryClient();

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

  const [selectedSlot, setSelectedSlot] =
    useState<AppointmentSlotLabel | null>(null);

  const [availableSlots, setAvailableSlots] =
    useState<string[]>([]);

  const [slotsLoading, setSlotsLoading] =
    useState(false);

  const [slotsError, setSlotsError] =
    useState<string | null>(null);

  const appointmentDate =
    formatAppointmentDateInput(date);

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

  useEffect(() => {
    if (!centerId) {
      return;
    }

    let cancelled = false;

    const loadSlots = async () => {
      try {
        setSlotsLoading(true);
        setSlotsError(null);

        const slots = await appointmentsService.getAvailableSlots(
          appointmentDate,
          centerId,
        );

        if (cancelled) {
          return;
        }

        setAvailableSlots(slots);
        setSelectedSlot(current =>
          current && slots.includes(current) ? current : null,
        );
      } catch (slotError) {
        if (cancelled) {
          return;
        }

        const message =
          slotError instanceof Error
            ? slotError.message
            : 'Failed to load slots.';

        console.error('[SLOTS] Failed to load booking slots:', {
          appointmentDate,
          centerId,
          message,
        });
        setSlotsError(message);
        setAvailableSlots([]);
        setSelectedSlot(null);
      } finally {
        if (!cancelled) {
          setSlotsLoading(false);
        }
      }
    };

    loadSlots();

    return () => {
      cancelled = true;
    };
  }, [appointmentDate, centerId]);

  const handleBook = async () => {
    if (!centerId || !user?.id) {
      return;
    }

    if (!selectedServiceId) {
      toastService.error('Please select a service.');
      return;
    }

    if (!selectedSlot) {
      toastService.error('Please select an available time slot.');
      return;
    }

    if (
      isPastAppointmentDate(appointmentDate) ||
      isPastAppointmentSlot(appointmentDate, selectedSlot)
    ) {
      toastService.error('Please select a future time slot.');
      return;
    }

    try {
      const scheduledAt = getScheduledAtFromSlot(
        appointmentDate,
        selectedSlot,
      );

      console.log('[DEBUG] BookAppointmentScreen: Creating appointment with slot:', {
        appointmentDate,
        appointmentTime: selectedSlot,
        scheduledAt,
      });
      const appointment = await createAppointment({
        user_id: user.id,
        center_id: centerId,
        service_id: selectedServiceId,
        scheduled_at: scheduledAt,
        appointment_date: appointmentDate,
        appointment_time: selectedSlot,
      });

      queryClient.setQueryData<AppointmentFull[]>(
        ['appointments', user.id],
        currentAppointments => {
          const nextAppointment: AppointmentFull = {
            ...appointment,
          };

          const appointments = currentAppointments ?? [];
          return [
            nextAppointment,
            ...appointments.filter(item => item.id !== appointment.id),
          ].sort(
            (a, b) =>
              new Date(a.scheduled_at).getTime() -
              new Date(b.scheduled_at).getTime(),
          );
        },
      );

      await queryClient.invalidateQueries({
        queryKey: ['appointments', user.id],
        refetchType: 'all',
      });
      await queryClient.invalidateQueries({
        queryKey: ['staff-dashboard'],
      });

      const slots = await appointmentsService.getAvailableSlots(
        appointmentDate,
        centerId,
      );
      setAvailableSlots(slots);
      setSelectedSlot(null);

      toastService.success('Appointment booked successfully');
      navigation.navigate('QueueStatus', {
        appointmentId: appointment.id,
      });
    } catch (createError) {
      console.error('[DEBUG] BookAppointmentScreen: Failed to create appointment:', createError);
      toastService.error(
        createError instanceof Error
          ? `Failed to book appointment: ${createError.message}`
          : 'Failed to book appointment. Please try again.',
      );
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
                Available Slots
              </Text>

              {slotsLoading ? (
                <Text style={styles.slotHint}>
                  Loading slots...
                </Text>
              ) : slotsError ? (
                <Text style={styles.slotError}>
                  {slotsError}
                </Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.slotRow}
                >
                  {APPOINTMENT_SLOT_LABELS.map(slot => {
                    const pastSlot = isPastAppointmentSlot(
                      appointmentDate,
                      slot,
                    );
                    const booked =
                      !availableSlots.includes(slot) || pastSlot;
                    const selected = selectedSlot === slot;

                    return (
                      <Pressable
                        key={slot}
                        disabled={booked}
                        onPress={() => setSelectedSlot(slot)}
                        style={[
                          styles.slotChip,
                          selected && styles.selectedSlotChip,
                          booked && styles.bookedSlotChip,
                        ]}
                      >
                        <Text
                          style={[
                            styles.slotText,
                            selected && styles.selectedSlotText,
                            booked && styles.bookedSlotText,
                          ]}
                        >
                          {slot}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              {showDatePicker && (
                <DateTimePicker
                  value={date}
                  mode="date"
                  minimumDate={new Date()}
                  onValueChange={(
                    _event,
                    selectedDate,
                  ) => {
                    setShowDatePicker(false);
                    if (selectedDate) {
                      setDate(selectedDate);
                      setSelectedSlot(null);
                    }
                  }}
                  onDismiss={() =>
                    setShowDatePicker(false)
                  }
                />
              )}
            </View>

            {!slotsLoading && !slotsError && availableSlots.length === 0 && (
              <Text style={styles.slotHint}>
                No available slots for this center on the selected date.
              </Text>
            )}

            <AppButton
              title={
                appointmentLoading
                  ? 'Scheduling...'
                  : 'Confirm Appointment'
              }
              loading={appointmentLoading}
              disabled={
                !selectedServiceId ||
                !selectedSlot ||
                appointmentLoading ||
                slotsLoading ||
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
    flexWrap: 'wrap',
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
    flexShrink: 0,
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

  slotRow: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
  },

  slotChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },

  selectedSlotChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  bookedSlotChip: {
    backgroundColor: colors.border,
    opacity: 0.55,
  },

  slotText: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '700',
  },

  selectedSlotText: {
    color: '#FFF',
  },

  bookedSlotText: {
    color: colors.textSecondary,
  },

  slotHint: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginBottom: spacing.md,
  },

  slotError: {
    color: colors.error,
    fontSize: typography.small,
    marginBottom: spacing.md,
  },
});
