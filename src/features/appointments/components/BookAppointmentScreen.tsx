import React, { useEffect, useState, useRef, useMemo } from 'react';

import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const AnimatedSlotChip = ({
  slot,
  selected,
  disabled,
  onPress,
  colors,
  radius,
  spacing,
  typography,
  styles,
}: {
  slot: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  colors: any;
  radius: any;
  spacing: any;
  typography: any;
  styles: any;
}) => {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        { marginRight: spacing.sm },
        !disabled && pressed && { transform: [{ scale: 0.92 }] },
      ]}
    >
      <View
        style={[
          styles.slotChip,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radius.full,
            borderWidth: 1.2,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
          },
          selected && {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
          },
          disabled && {
            backgroundColor: colors.border + '30',
            borderColor: colors.border + '20',
            opacity: 0.4,
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
      </View>
    </Pressable>
  );
};

import {
  useNavigation,
  useRoute,
} from '@react-navigation/native';

import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ChevronLeft, Calendar as CalendarIcon, Hourglass, ShieldAlert, Stethoscope, UserCheck, Users } from 'lucide-react-native';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { bookingSchema, BookingFormData } from '../../../validations/bookingSchema';

import AppButton from '../../../components/ui/AppButton';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import Loader from '../../../components/ui/Loader';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import Card from '../../../components/ui/Card';

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
import { hp } from '../../../utils/responsive';

import type { AppointmentFull } from '../../../types/appointment';
import type { CenterService } from '../../../types/center';
import { doctorsService } from '../api/doctorsService';
import type { Doctor } from '../api/doctorsService';

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

  // Doctor selection state
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null | 'any'>('any');
  const [doctorsLoading, setDoctorsLoading] = useState(false);

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

    } catch {
      setValue('slot', '');
      toastService.error('This slot was recently locked or booked by another patient. Please choose another slot.');
    }
  };

  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      serviceId: initialServiceId || '',
      date: new Date(),
      slot: '',
    },
  });

  const selectedServiceId = watch('serviceId');
  const date = watch('date');
  const selectedSlot = watch('slot');

  // Fetch active doctors when service selection changes
  useEffect(() => {
    if (!selectedServiceId) {
      setDoctors([]);
      setSelectedDoctorId('any');
      return;
    }
    let cancelled = false;
    setDoctorsLoading(true);
    setSelectedDoctorId('any');
    doctorsService
      .getByServiceId(selectedServiceId)
      .then(data => {
        if (!cancelled) setDoctors(data);
      })
      .catch(() => {
        if (!cancelled) setDoctors([]);
      })
      .finally(() => {
        if (!cancelled) setDoctorsLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedServiceId]);

  const appointmentDate = useMemo(() => {
    return formatAppointmentDateInput(date);
  }, [date]);

  useEffect(() => {
    if (centerId) {
      fetchCenterServices(centerId);
      fetchCenterById(centerId);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      appointmentsService.unlockSlot().catch(console.warn);
    };
  }, [centerId, fetchCenterServices, fetchCenterById]);

  // Fetch available slots from backend
  useEffect(() => {
    const fetchSlots = async () => {
      if (!centerId) return;
      try {
        setSlotsLoading(true);
        setSlotsError(null);
        setValue('slot', ''); // clear selected slot on date change
        const booked = await appointmentsService.getAvailableSlots(
          appointmentDate,
          centerId,
        );
        setAvailableSlots(booked);
      } catch {
        setSlotsError('Failed to load available slots. Please try changing the date.');
      } finally {
        setSlotsLoading(false);
      }
    };

    fetchSlots();
  }, [centerId, appointmentDate, setValue]);

  const onBook = async (formData: BookingFormData) => {
    if (!user || !centerId) {
      toastService.error('You must be logged in to book slots');
      return;
    }

    try {
      const scheduledAt = getScheduledAtFromSlot(
        appointmentDate,
        formData.slot,
      );

      const payload = {
        user_id: user.id,
        center_id: centerId,
        service_id: formData.serviceId,
        // null = "Any Available Doctor" (default behavior preserved)
        doctor_id: selectedDoctorId === 'any' || !selectedDoctorId ? null : selectedDoctorId,
        scheduled_at: scheduledAt,
        appointment_date: appointmentDate,
        appointment_time: formData.slot,
      };

      const result = await createAppointment(payload);
      if (result) {
        if (timerRef.current) clearInterval(timerRef.current);
        await queryClient.refetchQueries({ queryKey: ['appointments'] });
        await queryClient.refetchQueries({ queryKey: ['dashboard-stats'] });

        toastService.success('Appointment booked successfully!');

        navigation.replace('AppointmentDetails', {
          appointmentId: (result as AppointmentFull).id,
        });
      }
    } catch (createError) {
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
      <Card
        onPress={() => {
          setValue('serviceId', item.id, { shouldValidate: true });
          setValue('slot', '');
        }}
        variant={selected ? 'flat' : 'elevated'}
        style={[
          styles.serviceCard,
          {
            borderColor: selected ? colors.primary : colors.border + '30',
            borderWidth: selected ? 2 : 0.5,
            padding: spacing.md,
            backgroundColor: selected ? colors.primary + '06' : colors.surface,
          },
        ]}
        containerStyle={{ marginBottom: spacing.md }}
      >
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

        <View style={[styles.metaContainer, { backgroundColor: colors.border + '20', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs / 2 }]}>
          <Hourglass size={12} color={colors.textSecondary} style={{ marginRight: 4 }} />
          <Text style={[styles.meta, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
            {item.duration_minutes} min
          </Text>
        </View>
      </Card>
    );
  };

  if (!centerId) {
    return (
      <ScreenWrapper>
        <EmptyState
          title="Clinic Missing"
          subtitle="Please select a clinic before booking a consultation."
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
          title="Failed To Load Departments"
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
              Book a Consultation
            </Text>

            <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.sm, marginBottom: spacing.md }]}>
              Select a department to continue.
            </Text>

            {errors.serviceId && (
              <Text style={[styles.slotError, { color: colors.error, fontSize: typography.sizes.xs, marginBottom: spacing.sm }]}>
                {errors.serviceId.message}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No Departments"
            subtitle="No departments available for this clinic."
          />
        }
        ListFooterComponent={
          <View style={{ marginTop: spacing.md }}>

            {/* ─── Doctor Selection (Phase B) ────────────────────────────── */}
            {selectedServiceId !== '' && !doctorsLoading && doctors.length > 0 && (
              <View style={{ marginBottom: spacing.lg }}>
                <Text style={[styles.label, { color: colors.text, fontSize: typography.sizes.md, marginBottom: spacing.sm }]}>
                  Choose a Doctor
                </Text>

                {/* Any Available Doctor card */}
                <Pressable
                  onPress={() => setSelectedDoctorId('any')}
                  style={({ pressed }) => [
                    styles.doctorCard,
                    {
                      backgroundColor: selectedDoctorId === 'any' ? colors.primary + '08' : colors.surface,
                      borderColor: selectedDoctorId === 'any' ? colors.primary : colors.border + '40',
                      borderRadius: radius.xl,
                      borderWidth: selectedDoctorId === 'any' ? 2 : 1,
                      padding: spacing.md,
                      marginBottom: spacing.sm,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <View style={[styles.doctorAvatarCircle, { backgroundColor: colors.primary + '12' }]}>
                    <Users size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.doctorName, { color: colors.text, fontSize: typography.sizes.md }]}>
                        Any Available Doctor
                      </Text>
                      <View style={[styles.recommendedBadge, { backgroundColor: colors.success + '15', borderColor: colors.success + '30' }]}>
                        <Text style={{ color: colors.success, fontSize: typography.sizes.xs - 1, fontWeight: '700' }}>Fastest</Text>
                      </View>
                    </View>
                    <Text style={[styles.doctorSpec, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                      Assigned by the clinic on arrival
                    </Text>
                  </View>
                  {selectedDoctorId === 'any' && (
                    <UserCheck size={18} color={colors.primary} />
                  )}
                </Pressable>

                {/* Individual doctor cards */}
                {doctors.map(doc => (
                  <Pressable
                    key={doc.id}
                    onPress={() => setSelectedDoctorId(doc.id)}
                    style={({ pressed }) => [
                      styles.doctorCard,
                      {
                        backgroundColor: selectedDoctorId === doc.id ? colors.primary + '08' : colors.surface,
                        borderColor: selectedDoctorId === doc.id ? colors.primary : colors.border + '40',
                        borderRadius: radius.xl,
                        borderWidth: selectedDoctorId === doc.id ? 2 : 1,
                        padding: spacing.md,
                        marginBottom: spacing.sm,
                      },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <View style={[styles.doctorAvatarCircle, { backgroundColor: colors.primary + '12' }]}>
                      <Stethoscope size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <Text style={[styles.doctorName, { color: colors.text, fontSize: typography.sizes.md }]}>
                        {doc.name}
                      </Text>
                      {!!doc.specialization && (
                        <Text style={[styles.doctorSpec, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                          {doc.specialization}
                        </Text>
                      )}
                    </View>
                    {selectedDoctorId === doc.id && (
                      <UserCheck size={18} color={colors.primary} />
                    )}
                  </Pressable>
                ))}
              </View>
            )}
            {/* ───────────────────────────────────────────────────────────── */}

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
                    borderWidth: 1.2,
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
                        <AnimatedSlotChip
                          key={slot}
                          slot={slot}
                          selected={selected}
                          disabled={disabled}
                          onPress={() => handleSelectSlot(slot)}
                          colors={colors}
                          radius={radius}
                          spacing={spacing}
                          typography={typography}
                          styles={styles}
                        />
                      );
                    })}
                  </ScrollView>

                  {lockTimeLeft !== null && selectedSlot !== '' && (
                    <View style={[styles.timerContainer, { backgroundColor: `${colors.warning}10`, borderColor: `${colors.warning}30`, borderWidth: 1, borderRadius: radius.lg, padding: spacing.sm, marginTop: spacing.md }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <ShieldAlert size={16} color={colors.warning} />
                        <Text style={[styles.timerText, { color: colors.warning, fontSize: typography.sizes.xs, fontWeight: '700' }]}>
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
                  onChange={(
                    _event,
                    selectedDate,
                  ) => {
                    setShowDatePicker(false);
                    if (selectedDate) {
                      setValue('date', selectedDate, { shouldValidate: true });
                      setValue('slot', '');
                    }
                  }}
                />
              )}
            </View>

            {!slotsLoading && !slotsError && availableSlots.length === 0 && (
              <Text style={[styles.slotHint, { color: colors.textSecondary, marginTop: spacing.sm }]}>
                No available slots for this center on the selected date.
              </Text>
            )}

            <AppButton
              title="Confirm Booking"
              loading={appointmentLoading}
              disabled={appointmentLoading || selectedSlot === '' || slotsLoading}
              onPress={handleSubmit(onBook)}
              style={{ marginTop: spacing.lg }}
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
    marginBottom: hp(1),
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    marginBottom: 8,
  },
  backButtonText: {
    fontWeight: '700',
  },
  title: {
    fontWeight: '800',
  },
  subtitle: {
    fontWeight: '500',
  },
  serviceCard: {
    flexDirection: 'column',
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceName: {
    fontWeight: '800',
    flex: 1,
    paddingRight: 10,
  },
  price: {
    fontWeight: '800',
  },
  description: {
    marginTop: 4,
    lineHeight: 16,
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  meta: {
    fontWeight: '700',
  },
  dateContainer: {
    marginTop: hp(1),
  },
  label: {
    fontWeight: '800',
  },
  dateButton: {
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
  },
  dateText: {
    fontWeight: '700',
  },
  slotRow: {
    paddingVertical: 4,
  },
  slotChip: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
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
  timerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    textAlign: 'center',
  },
  doctorCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  doctorAvatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doctorName: {
    fontWeight: '800',
  },
  doctorSpec: {
    marginTop: 2,
    fontWeight: '500',
  },
  recommendedBadge: {
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
