import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Text, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Clock, Calendar as CalendarIcon, MapPin, Stethoscope, User, AlignLeft, ShieldCheck, CreditCard } from 'lucide-react-native';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import AppButton from '../../../components/ui/AppButton';
import Card from '../../../components/ui/Card';
import { useTheme } from '../../../hooks/useTheme';
import { supabase } from '../../../lib/supabase';
import { doctorService } from '../../../services/doctorService';
import { centerService } from '../../../services/centerService';
import type { AppStackParamList } from '../../../navigation/types';

type ConfirmBookingRouteProp = RouteProp<AppStackParamList, 'ConfirmBooking'>;
type NavigationProp = NativeStackNavigationProp<AppStackParamList, 'ConfirmBooking'>;

const ConfirmBookingScreen = () => {
  const route = useRoute<ConfirmBookingRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { colors, spacing, typography, radius } = useTheme();
  const queryClient = useQueryClient();

  const { lockId, doctorId, centerId, serviceId, selectedDate, slot, notes, expiryTime, patientName, patientPhone } = route.params;

  const [doctor, setDoctor] = useState<any>(null);
  const [center, setCenter] = useState<any>(null);
  const [service, setService] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);

  const [timeLeft, setTimeLeft] = useState(Math.max(0, Math.floor((expiryTime - Date.now()) / 1000)));

  const shouldReleaseRef = useRef(true);
  const lockExpiredRef = useRef(false);

  // Timer loop
  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiryTime - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0 && !lockExpiredRef.current) {
        lockExpiredRef.current = true;
        clearInterval(timer);
        handleTimeout();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [expiryTime]);

  const handleTimeout = async () => {
    shouldReleaseRef.current = false;
    try {
      await supabase.rpc('release_slot', { p_lock_id: lockId });
    } catch (e) {
      console.warn('Error releasing slot on timeout:', e);
    }
    Alert.alert('Lock Expired', 'Your slot lock has expired. Please select a slot again.', [
      {
        text: 'OK',
        onPress: () => navigation.navigate('SelectSlot', { doctorId, centerId, serviceId }),
      },
    ]);
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (shouldReleaseRef.current) {
        supabase.rpc('release_slot', { p_lock_id: lockId }).then(({ error }) => {
          if (error) console.warn('Error releasing slot:', error);
        });
      }
    });

    return unsubscribe;
  }, [navigation, lockId]);

  const loadDetails = async () => {
    try {
      setLoading(true);
      const [doctorData, centerData, servicesData] = await Promise.all([
        doctorService.getDoctorById(doctorId),
        centerService.getCenterById(centerId),
        centerService.getCenterServices(centerId),
      ]);
      setDoctor(doctorData);
      setCenter(centerData);
      const matchedService = servicesData.find(s => s.id === serviceId);
      setService(matchedService);
    } catch (err) {
      console.warn('Error loading details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [doctorId, centerId]);

  const formatTimeLeft = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleConfirm = async () => {
    if (timeLeft <= 0) {
      Alert.alert('Slot expired', 'That slot timed out — please choose another.');
      navigation.navigate('SelectSlot', { doctorId, centerId, serviceId });
      return;
    }

    try {
      setBooking(true);
      const { data: appointmentId, error } = await supabase.rpc('book_appointment', {
        p_lock_id: lockId,
        p_service_id: serviceId,
        p_notes: notes.trim() || null,
      });

      if (error || !appointmentId) {
        console.warn('Booking error details:', error);
        Alert.alert('Slot expired', 'That slot timed out — please choose another.');
        shouldReleaseRef.current = false;
        navigation.navigate('SelectSlot', { doctorId, centerId, serviceId });
        return;
      }

      // Success
      shouldReleaseRef.current = false;
      
      // Invalidate react-query cache to refresh lists
      await queryClient.refetchQueries({ queryKey: ['appointments'] });
      await queryClient.refetchQueries({ queryKey: ['dashboard-stats'] });

      navigation.replace('Receipt', { appointmentId });
    } catch (err) {
      console.warn('Confirm booking exception:', err);
      Alert.alert('Error', 'Failed to confirm booking. Please try again.');
    } finally {
      setBooking(false);
    }
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            shouldReleaseRef.current = true;
            navigation.goBack();
          }}
          style={styles.backButton}
        >
          <ChevronLeft size={24} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary, fontSize: typography.sizes.md, marginLeft: spacing.xs }]}>
            Back
          </Text>
        </Pressable>

        <View style={[styles.timerBadge, { backgroundColor: colors.warning + '15', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }]}>
          <Clock size={14} color={colors.warning} style={{ marginRight: 6 }} />
          <Text style={[styles.timerText, { color: colors.warning, fontSize: typography.sizes.xs, fontWeight: '800' }]}>
            {formatTimeLeft(timeLeft)}
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.md }}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xl, fontWeight: '800', marginBottom: spacing.lg }]}>
          Confirm Booking
        </Text>

        {loading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {/* Booking Summary Card */}
            <Card variant="flat" style={[styles.summaryCard, { backgroundColor: colors.surface, padding: spacing.md }]}>
              <View style={styles.cardHeader}>
                <ShieldCheck size={18} color={colors.primary} style={{ marginRight: spacing.xs }} />
                <Text style={[styles.cardHeaderTitle, { color: colors.primary, fontSize: typography.sizes.sm, fontWeight: '800' }]}>
                  Appointment Summary
                </Text>
              </View>

              {/* Service */}
              <View style={styles.row}>
                <Stethoscope size={16} color={colors.textSecondary} style={styles.icon} />
                <View>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Department / Service</Text>
                  <Text style={[styles.value, { color: colors.text }]}>{service?.name || 'General Service'}</Text>
                </View>
              </View>

              {/* Doctor */}
              <View style={[styles.row, { marginTop: spacing.md }]}>
                <User size={16} color={colors.textSecondary} style={styles.icon} />
                <View>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Doctor</Text>
                  <Text style={[styles.value, { color: colors.text }]}>{doctor?.name || 'Doctor'}</Text>
                </View>
              </View>

              {/* Center */}
              <View style={[styles.row, { marginTop: spacing.md }]}>
                <MapPin size={16} color={colors.textSecondary} style={styles.icon} />
                <View>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Clinic Location</Text>
                  <Text style={[styles.value, { color: colors.text }]}>{center?.name || 'Clinic'}</Text>
                  <Text style={[styles.subValue, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                    {center?.address}, {center?.city}
                  </Text>
                </View>
              </View>

              {/* Date & Time */}
              <View style={[styles.row, { marginTop: spacing.md }]}>
                <CalendarIcon size={16} color={colors.textSecondary} style={styles.icon} />
                <View>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Date & Time</Text>
                  <Text style={[styles.value, { color: colors.text }]}>
                    {selectedDate} @ {slot}
                  </Text>
                </View>
              </View>

              {/* Patient details summary */}
              {!!patientName && (
                <View style={[styles.row, { marginTop: spacing.md }]}>
                  <User size={16} color={colors.textSecondary} style={styles.icon} />
                  <View>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>Patient</Text>
                    <Text style={[styles.value, { color: colors.text }]}>
                      {patientName} ({patientPhone})
                    </Text>
                  </View>
                </View>
              )}

              {/* Consultation Fee */}
              <View style={[styles.row, { marginTop: spacing.md }]}>
                <CreditCard size={16} color={colors.textSecondary} style={styles.icon} />
                <View>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Consultation Fee</Text>
                  <Text style={[styles.value, { color: colors.text }]}>
                    Rs. {service?.price || doctor?.fee || '1500'}
                  </Text>
                </View>
              </View>

              {/* Notes */}
              {notes.trim().length > 0 && (
                <View style={[styles.row, { marginTop: spacing.md }]}>
                  <AlignLeft size={16} color={colors.textSecondary} style={styles.icon} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>Notes / Symptoms</Text>
                    <Text style={[styles.value, { color: colors.text }]} numberOfLines={3}>
                      {notes}
                    </Text>
                  </View>
                </View>
              )}
            </Card>

            <View style={{ marginTop: spacing.xl }}>
              <AppButton
                title="Confirm Appointment"
                onPress={handleConfirm}
                variant="primary"
                loading={booking}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
};

export default ConfirmBookingScreen;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timerText: {},
  title: {},
  loaderContainer: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryCard: {},
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardHeaderTitle: {},
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  icon: {
    marginRight: 12,
    marginTop: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
  },
  subValue: {
    marginTop: 2,
  },
});
