import React, { useEffect, useState, useRef } from 'react';

import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';

import {
  useNavigation,
  useRoute,
} from '@react-navigation/native';

import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ChevronLeft, Calendar as CalendarIcon, Clock, Hourglass, ShieldAlert } from 'lucide-react-native';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { bookingSchema, BookingFormData } from '../../../validations/bookingSchema';

import AppButton from '../../../components/ui/AppButton';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import Loader from '../../../components/ui/Loader';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';

import { useTheme } from '../../../hooks/useTheme';

import type { AppStackParamList } from '../../../navigation/types';

import { useAuthStore } from '../../../store/authStore';
import { useAppointmentsStore } from '../../../store/appointmentsStore';
import { useCentersStore } from '../../../store/centersStore';
import { toastService } from '../../../services/toastService';
import { appointmentsService } from '../api/appointmentsService';
import {
  APPOINTMENT_SLOT_LABELS,
  formatAppointmentDateInput,
  getScheduledAtFromSlot,
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
  const { colors, spacing, typography, radius } = useTheme();

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

  const [lockTimeLeft, setLockTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<any>(null);

  const formatTimeLeft = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleSelectSlot = async (slot: string) => {
    if (!centerId) return;
    try {
      setValue('slot', slot, { shouldValidate: true });
      await appointmentsService.lockSlot(centerId, appointmentDate, slot);
      
      // Reset and start countdown timer (10 mins = 600 secs)
      if (timerRef.current) clearInterval(timerRef.current);
      setLockTimeLeft(600);

      timerRef.current = setInterval(() => {
        setLockTimeLeft(prev => {
          if (prev === null || prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            setValue('slot', '');
            appointmentsService.unlockSlot().catch(console.warn);
            Alert.alert('Lock Expired', 'Your time-slot lock has expired. Please select a slot again to book.');
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      toastService.error(err.message || 'Failed to lock slot');
      setValue('slot', '');
    }
  };

  // Cleanup timer and slot lock on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      appointmentsService.unlockSlot().catch(console.warn);
    };
  }, []);

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
        style={({ pressed }) => [
          styles.serviceCard,
          {
            backgroundColor: colors.surface,
            borderColor: selected ? colors.primary : colors.border,
            borderWidth: selected ? 2 : 1,
            borderRadius: radius.lg,
            padding: spacing.md,
            marginBottom: spacing.md,
            shadowColor: colors.text,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: selected ? 0.04 : 0.01,
            shadowRadius: 6,
          },
          pressed && { opacity: 0.95 }
        ]}
        onPress={() => {
          setValue('serviceId', item.id, { shouldValidate: true });
          setValue('slot', '');
        }}
        accessibilityRole="button"
        accessibilityState={{ selected }}>
        <View style={styles.serviceHeader}>
          <Text style={[styles.serviceName, { color: colors.text, fontSize: typography.sizes.md }]}>
            {item.name}
          </Text>

          <Text style={[styles.price, { color: colors.primary, fontSize: typography.sizes.md }]}>
            Rs. {item.price}
          </Text>
        </View>

        {!!item.description && (
          <Text style={[styles.description, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
            {item.description}
          </Text>
        )}

        <View style={[styles.metaContainer, { backgroundColor: colors.border + '15', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs / 2 }]}>
          <Hourglass size={12} color={colors.textSecondary} style={{ marginRight: 4 }} />
          <Text style={[styles.meta, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
            {item.duration_minutes} min
          </Text>
        </View>
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
        contentContainerStyle={{ paddingBottom: spacing.xl }}
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
              <Text style={[styles.backButtonText, { color: colors.primary, fontSize: typography.sizes.md, marginLeft: spacing.xs }]}>Back</Text>
            </Pressable>
            
            <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl, marginBottom: spacing.xs }]}>
              Book Appointment
            </Text>

            <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.sm, marginBottom: spacing.md }]}>
              Select a service to continue.
            </Text>
            
            {errors.serviceId && (
              <Text style={[styles.slotError, { color: colors.error, fontSize: typography.sizes.xs }]}>
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
          <View style={{ marginTop: spacing.md }}>
            <View style={styles.dateContainer}>
              <Text style={[styles.label, { color: colors.text, fontSize: typography.sizes.md, marginBottom: spacing.sm }]}>
                Selected Date
              </Text>

              <Pressable
                style={({ pressed }) => [
                  styles.dateButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderWidth: 1.5,
                    borderRadius: radius.xl,
                    padding: spacing.md,
                    marginBottom: spacing.md,
                    flexDirection: 'row',
                    alignItems: 'center',
                  },
                  pressed && { opacity: 0.85 }
                ]}
                onPress={() => setShowDatePicker(true)}>
                <CalendarIcon size={18} color={colors.primary} style={{ marginRight: spacing.sm }} />
                <Text style={[styles.dateText, { color: colors.text, fontSize: typography.sizes.md }]}>
                  {date.toDateString()}
                </Text>
              </Pressable>

              {errors.date && (
                <Text style={[styles.slotError, { color: colors.error }]}>{errors.date.message}</Text>
              )}

              <Text style={[styles.label, { color: colors.text, fontSize: typography.sizes.md, marginBottom: spacing.xs }]}>
                Available Slots
              </Text>
              
              {selectedCenter && (
                <Text style={[styles.slotHint, { color: colors.textSecondary, fontSize: typography.sizes.xs, fontStyle: 'italic', marginBottom: spacing.sm }]}>
                  Operating Hours: {selectedCenter.open_time || 'N/A'} - {selectedCenter.close_time || 'N/A'}
                </Text>
              )}

              {slotsLoading ? (
                <Text style={[styles.slotHint, { color: colors.textSecondary }]}>
                  Loading slots...
                </Text>
              ) : slotsError ? (
                <Text style={[styles.slotError, { color: colors.error }]}>
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
                          onPress={() => handleSelectSlot(slot)}
                          style={[
                            styles.slotChip,
                            {
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                              borderRadius: radius.full,
                              borderWidth: 1.5,
                              paddingHorizontal: spacing.lg,
                              paddingVertical: spacing.sm,
                              marginRight: spacing.sm,
                            },
                            selected && {
                              backgroundColor: colors.primary,
                              borderColor: colors.primary,
                            },
                            disabled && {
                              backgroundColor: colors.border + '50',
                              borderColor: colors.border + '30',
                              opacity: 0.5,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.slotText,
                              {
                                color: colors.text,
                                fontSize: typography.sizes.xs,
                                fontWeight: '700',
                              },
                              selected && { color: '#FFF' },
                              disabled && { color: colors.textSecondary },
                            ]}
                          >
                            {slot}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  
                  {lockTimeLeft !== null && selectedSlot !== '' && (
                    <View style={[styles.timerContainer, { backgroundColor: `${colors.warning}08`, borderColor: `${colors.warning}20`, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.md }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <ShieldAlert size={16} color={colors.warning} />
                        <Text style={[styles.timerText, { color: colors.warning, fontSize: typography.sizes.xs }]}>
                          Slot locked for {formatTimeLeft(lockTimeLeft)}. Book now!
                        </Text>
                      </View>
                    </View>
                  )}

                  {errors.slot && (
                    <Text style={[styles.slotError, { color: colors.error, marginTop: spacing.xs }]}>
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
              <Text style={[styles.slotHint, { color: colors.textSecondary, marginTop: spacing.sm }]}>
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
              style={{ marginTop: spacing.lg }}
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
  header: {
    marginBottom: 8,
  },
  title: {
    fontWeight: '800',
  },
  subtitle: {
    fontWeight: '500',
  },
  serviceCard: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  serviceHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  serviceName: {
    flex: 1,
    fontWeight: '700',
  },
  price: {
    fontWeight: '800',
    flexShrink: 0,
  },
  description: {
    marginTop: 4,
    lineHeight: 16,
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  meta: {
    fontWeight: '600',
  },
  dateContainer: {
    marginTop: 8,
  },
  label: {
    fontWeight: '700',
  },
  dateButton: {
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
  },
  dateText: {
    fontWeight: '600',
  },
  slotRow: {
    paddingVertical: 4,
  },
  slotChip: {
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
  },
  slotText: {
    textAlign: 'center',
  },
  slotHint: {
    fontWeight: '500',
  },
  slotError: {
    fontWeight: '600',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  backButtonText: {
    fontWeight: '600',
  },
  timerContainer: {
    // flat warning card style
  },
  timerText: {
    fontWeight: '700',
    textAlign: 'center',
  },
});
