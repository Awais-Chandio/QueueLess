import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useTheme } from '../../../../hooks/useTheme';
import AppButton from '../../../../components/ui/AppButton';
import { EmptyState } from '../../../../components/ui/EmptyState';
import ScreenWrapper from '../../../../components/ui/ScreenWrapper';
import { Skeleton } from '../../../../components/ui/Skeleton';
import { useQueue } from '../../../../hooks/useQueue';
import { appointmentService } from '../../../../services/appointmentService';
import { getStatusDisplayProperties } from '../../../../services/bookingService';
import { toastService } from '../../../../services/toastService';
import { useAppointmentsStore } from '../../../../store/appointmentStore';
import type { AppointmentFull } from '../../../../types/appointment';
import { logger } from '../../../../utils/logger';
import { wp } from '../../../../utils/responsive';
import { AppointmentInfoCard } from './AppointmentInfoCard';
import { QueueProgressCard } from './QueueProgressCard';
import { QueueStatusHeader } from './QueueStatusHeader';
import { TokenMetricsCard } from './TokenMetricsCard';
import { buildQueueStatusView } from './queueStatusView';

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/** The patient's own appointment: live position, ETA, check-in and cancel. */
export const AppointmentQueueStatus = ({ appointmentId }: { appointmentId: string }) => {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { spacing, radius } = useTheme();

  const [appointment, setAppointment] = useState<AppointmentFull | null>(null);
  const [loading, setLoading] = useState(true);

  const checkInAppointment = useAppointmentsStore(state => state.checkInAppointment);
  const checkingIn = useAppointmentsStore(state => state.checkingInId) === appointmentId;
  const cancelAppointment = useAppointmentsStore(state => state.cancelAppointment);
  const cancelling = useAppointmentsStore(state => state.cancellingId) === appointmentId;

  const fetchAppointment = useCallback(async () => {
    try {
      setAppointment(await appointmentService.fetchAppointmentById(appointmentId));
    } catch (error) {
      logger.error('Failed to fetch appointment:', error);
    }
    setLoading(false);
  }, [appointmentId]);

  useEffect(() => {
    fetchAppointment();
  }, [fetchAppointment]);

  const { queueData, refresh: refreshQueue } = useQueue(
    appointment?.token_number ?? null,
    fetchAppointment,
    { appointmentId, centerId: appointment?.center_id, scheduledAt: appointment?.scheduled_at },
    isFocused,
  );

  const view = useMemo(() => (appointment ? buildQueueStatusView(appointment, queueData) : null), [appointment, queueData]);

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={{ gap: spacing.md, padding: spacing.md }}>
          <Skeleton height={200} borderRadius={radius.lg} />
          <Skeleton height={150} borderRadius={radius.lg} />
          <Skeleton height={140} borderRadius={radius.lg} />
        </View>
      </ScreenWrapper>
    );
  }

  if (!appointment || !view) {
    return (
      <ScreenWrapper>
        <EmptyState title="Appointment Not Found" subtitle="Unable to load queue status." />
      </ScreenWrapper>
    );
  }

  const handleCheckIn = async () => {
    try {
      const updated = await checkInAppointment(appointment.id);
      await refreshQueue();
      setAppointment(updated);
      toastService.success('Successfully checked in.');
    } catch (error) {
      toastService.error(errorMessage(error, 'Unable to check in. Please try again.'));
    }
  };

  const handleCancel = () => {
    Alert.alert('Cancel Appointment', 'Are you sure you want to cancel this appointment? This action cannot be undone.', [
      { text: 'Keep Appointment', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          try {
            setAppointment(await cancelAppointment(appointment.id, 'Patient Requested'));
            toastService.success('Appointment cancelled successfully.');
          } catch (error) {
            toastService.error(errorMessage(error, 'Failed to cancel appointment.'));
          }
        },
      },
    ]);
  };

  return (
    <ScreenWrapper scrollable>
      <View style={styles.container}>
        <QueueStatusHeader
          title="Queue Status"
          status={view.status}
          statusLabel={getStatusDisplayProperties(view.status).label}
          onBack={() => navigation.goBack()}
        />
        <QueueProgressCard view={view} />
        <TokenMetricsCard
          view={view}
          tokenNumber={appointment.token_number}
          checkingIn={checkingIn}
          cancelling={cancelling}
          onCheckIn={handleCheckIn}
          onCancel={handleCancel}
        />
        <AppointmentInfoCard appointment={appointment} status={view.status} />
        <AppButton
          title="Go to Home"
          variant="outline"
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] })}
          style={{ marginTop: spacing.md, marginBottom: spacing.xl }}
        />
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: wp(1),
  },
});
