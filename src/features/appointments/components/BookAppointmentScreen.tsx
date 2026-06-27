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
import { ChevronLeft } from 'lucide-react-native';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { bookingSchema, BookingFormData } from '../../../validations/bookingSchema';

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
  timeToMinutes,
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
  const route = useRoute<BookAppointmentRouteProp>();
  const navigation = useNavigation<BookAppointmentNavigationProp>();

  const centerId = route.params?.centerId;
  const initialServiceId = route.params?.serviceId;

  const user = useAuthStore(state => state.user);
  const createAppointment = useAppointmentsStore(state => state.createAppointment);
  const appointmentLoading = useAppointmentsStore(state => state.loading);

  const centerServices = useCentersStore(state => state.centerServices);
  const selectedCenter = useCentersStore(state => state.selectedCenter);
  
  const fetchCenterServices = useCentersStore(state => state.fetchCenterServices);
  const fetchCenterById = useCentersStore(state => state.fetchCenterById);
  const loading = useCentersStore(state => state.loading);
  const error = useCentersStore(state => state.error);

  const queryClient = useQueryClient();

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  // Initialize React Hook Form with Zod validation
  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      serviceId: initialServiceId ?? '',
      date: new Date(),
      slot: '',
    },
  });

  const selectedServiceId = watch('serviceId');
  const date = watch('date');
  const selectedSlot = watch('slot');

  const appointmentDate = formatAppointmentDateInput(date);

  // Load center details and services on mount
  useEffect(() => {
    if (centerId) {
      fetchCenterServices(centerId);
      fetchCenterById(centerId);
    }
  }, [centerId, fetchCenterServices, fetchCenterById]);

  // Set default initial service if navigation params passed it
  useEffect(() => {
    if (initialServiceId) {
      setValue('serviceId', initialServiceId, { shouldValidate: true });
    }
  }, [initialServiceId, setValue]);

  // Fetch available slots from backend whenever date or service changes
  useEffect(() => {
    if (!centerId) return;

    let cancelled = false;

    const loadSlots = async () => {
      try {
        setSlotsLoading(true);
        setSlotsError(null);

        const slots = await appointmentsService.getAvailableSlots(
          appointmentDate,
          centerId,
        );

        if (cancelled) return;

        setAvailableSlots(slots);
        
        // Reset selected slot if it is no longer available in the newly loaded slots
        if (selectedSlot && !slots.includes(selectedSlot)) {
          setValue('slot', '');
        }
      } catch (slotError) {
        if (cancelled) return;

        const message =
          slotError instanceof Error ? slotError.message : 'Failed to load slots.';

        console.error('[SLOTS] Failed to load booking slots:', {
          appointmentDate,
          centerId,
          message,
        });
        setSlotsError(message);
        setAvailableSlots([]);
        setValue('slot', '');
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
  }, [appointmentDate, centerId, setValue, selectedSlot]);

  // Submit appointment booking
  const onSubmit = async (formData: BookingFormData) => {
    if (!centerId || !user?.id) {
      return;
    }

    try {
      const scheduledAt = getScheduledAtFromSlot(
        appointmentDate,
        formData.slot,
      );

      console.log('[DEBUG] BookAppointmentScreen: Creating appointment with slot:', {
        appointmentDate,
        appointmentTime: formData.slot,
        scheduledAt,
      });

      const appointment = await createAppointment({
        user_id: user.id,
        center_id: centerId,
        service_id: formData.serviceId,
        scheduled_at: scheduledAt,
        appointment_date: appointmentDate,
        appointment_time: formData.slot,
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

      // Navigate immediately to QueueStatus to ensure an instant, fluid transition
      toastService.success('Appointment booked successfully');
      navigation.navigate('QueueStatus', {
        appointmentId: appointment.id,
      });

      // Perform invalidations and available slot refreshes in the background (no awaiting!)
      queryClient.invalidateQueries({
        queryKey: ['appointments', user.id],
        refetchType: 'all',
      }).catch(err => console.warn('[Appt Invalidation] Error:', err));

      queryClient.invalidateQueries({
        queryKey: ['staff-dashboard'],
      }).catch(err => console.warn('[Staff Invalidation] Error:', err));

      appointmentsService.getAvailableSlots(
        appointmentDate,
        centerId,
      ).then(slots => {
        setAvailableSlots(slots);
        setValue('slot', '');
      }).catch(err => console.warn('[Slots Reload] Error:', err));
    } catch (createError) {
      console.error('[DEBUG] BookAppointmentScreen: Failed to create appointment:', createError);
      toastService.error(
        createError instanceof Error
          ? `Failed to book appointment: ${createError.message}`
          : 'Failed to book appointment. Please try again.',
      );
    }
  };

  const renderService = ({ item }: { item: CenterService }) => {
    const selected = selectedServiceId === item.id;

    return (
      <Pressable
        style={[
          styles.serviceCard,
          selected && styles.selectedCard,
        ]}
        onPress={() => {
          setValue('serviceId', item.id, { shouldValidate: true });
          setValue('slot', '');
        }}
        accessibilityRole="button"
        accessibilityState={{ selected }}>
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
          onRetry={() => fetchCenterServices(centerId)}
        />
      </ScreenWrapper>
    );
  }

  // Calculate center's opening & closing hours in 24h minutes
  const openMin = selectedCenter?.open_time ? timeToMinutes(selectedCenter.open_time) : 0;
  const closeMin = selectedCenter?.close_time ? timeToMinutes(selectedCenter.close_time) : 1440;

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
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [
                styles.backButton,
                pressed && { opacity: 0.7 }
              ]}
            >
              <ChevronLeft size={24} color={colors.primary} />
              <Text style={[styles.backButtonText, { color: colors.primary, fontSize: typography.sizes.md }]}>Back</Text>
            </Pressable>
            
            <Text style={styles.title}>
              Book Appointment
            </Text>

            <Text style={styles.subtitle}>
              Select a service to continue.
            </Text>
            
            {errors.serviceId && (
              <Text style={[styles.slotError, { marginTop: spacing.xs }]}>
                {errors.serviceId.message}
              </Text>
            )}
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
                onPress={() => setShowDatePicker(true)}>
                <Text style={styles.dateText}>
                  {date.toDateString()}
                </Text>
              </Pressable>

              {errors.date && (
                <Text style={styles.slotError}>{errors.date.message}</Text>
              )}

              <Text style={styles.label}>
                Available Slots
              </Text>
              
              {selectedCenter && (
                <Text style={[styles.slotHint, { fontStyle: 'italic', marginBottom: spacing.xs }]}>
                  Operating Hours: {selectedCenter.open_time || 'N/A'} - {selectedCenter.close_time || 'N/A'}
                </Text>
              )}

              {slotsLoading ? (
                <Text style={styles.slotHint}>
                  Loading slots...
                </Text>
              ) : slotsError ? (
                <Text style={styles.slotError}>
                  {slotsError}
                </Text>
              ) : (
                <View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.slotRow}
                  >
                    {APPOINTMENT_SLOT_LABELS.map(slot => {
                      const slotMin = timeToMinutes(slot);
                      const isWithinHours = slotMin >= openMin && slotMin <= closeMin;
                      
                      const pastSlot = isPastAppointmentSlot(
                        appointmentDate,
                        slot,
                      );
                      const booked = !availableSlots.includes(slot);
                      
                      const disabled = pastSlot || booked || !isWithinHours;
                      const selected = selectedSlot === slot;

                      return (
                        <Pressable
                          key={slot}
                          disabled={disabled}
                          onPress={() => setValue('slot', slot, { shouldValidate: true })}
                          style={[
                            styles.slotChip,
                            selected && styles.selectedSlotChip,
                            disabled && styles.bookedSlotChip,
                          ]}
                        >
                          <Text
                            style={[
                              styles.slotText,
                              selected && styles.selectedSlotText,
                              disabled && styles.bookedSlotText,
                            ]}
                          >
                            {slot}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  
                  {errors.slot && (
                    <Text style={[styles.slotError, { marginTop: spacing.xs }]}>
                      {errors.slot.message}
                    </Text>
                  )}
                </View>
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
                      setValue('date', selectedDate, { shouldValidate: true });
                      setValue('slot', '');
                    }
                  }}
                  onDismiss={() => setShowDatePicker(false)}
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
                appointmentLoading ||
                slotsLoading ||
                centerServices.length === 0
              }
              onPress={handleSubmit(onSubmit)}
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

  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },

  backButtonText: {
    fontWeight: '600',
    marginLeft: spacing.xs,
  },
});
