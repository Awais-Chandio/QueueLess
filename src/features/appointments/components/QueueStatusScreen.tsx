import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRoute, useIsFocused } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import AppButton from '../../../components/ui/AppButton';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { useTheme } from '../../../hooks/useTheme';
import { appointmentsService } from '../api/appointmentsService'; // adjusted path
import { useRealtimeQueue } from '../../queue/hooks/useRealtimeQueue';
import { useAppointmentsStore } from '../../../store/appointmentsStore';
import type { AppStackParamList } from '../../../navigation/types'; // adjusted path
import type { AppointmentFull } from '../../../types/appointment'; // adjusted path
import {
  BellRing,
  Calendar,
  CircleDot,
  Clock,
  Info,
  MapPin,
  Users,
} from 'lucide-react-native';
import { scaleFont } from '../../../utils/responsive';
import { toastService } from '../../../services/toastService';
import {
  formatWaitDuration,
  getAppointmentDateTime,
  getAppointmentDateLabel,
  getAppointmentTimeLabel,
  getMinutesUntilAppointment,
} from '../utils/appointmentTime';

type QueueStatusRouteProp = RouteProp<AppStackParamList, 'QueueStatus'>;

const QueueStatusScreen = () => {
  const route = useRoute<QueueStatusRouteProp>();
  const { appointmentId } = route.params;
  const { colors, spacing, typography } = useTheme();
  const isFocused = useIsFocused();

  const [appointment, setAppointment] = useState<AppointmentFull | null>(null);
  const [loading, setLoading] = useState(true);
  const checkInAppointment = useAppointmentsStore(
    state => state.checkInAppointment,
  );
  const checkingInId = useAppointmentsStore(state => state.checkingInId);
  const cancelAppointment = useAppointmentsStore(state => state.cancelAppointment);
  const cancellingId = useAppointmentsStore(state => state.cancellingId);

  const fetchAppointment = useCallback(async () => {
    try {
      const data = await appointmentsService.fetchAppointmentById(appointmentId);
      setAppointment(data);
    } catch (error) {
      console.error('Failed to fetch appointment:', error);
    }
    setLoading(false);
  }, [appointmentId]);

  useEffect(() => {
    fetchAppointment();
  }, [fetchAppointment]);

  const {
    queueData,
    loading: queueLoading,
    error: queueError,
    refresh: refreshQueue,
  } = useRealtimeQueue(
    appointment?.token_number ?? null,
    fetchAppointment,
    {
      centerId: appointment?.center_id,
      scheduledAt: appointment?.scheduled_at,
    },
    isFocused,
  );

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={{ gap: spacing.md }}>
          <Skeleton height={150} />
          <Skeleton height={100} />
          <Skeleton height={100} />
        </View>
      </ScreenWrapper>
    );
  }

  if (!appointment) {
    return (
      <ScreenWrapper>
        <EmptyState title="Appointment Not Found" subtitle="Unable to load queue status." />
      </ScreenWrapper>
    );
  }

  const waitMins = queueData?.estimatedWaitMins;
  const peopleAhead = queueData?.peopleAhead ?? 0;
  const currentPosition = queueData?.currentPosition;
  const currentServingToken = queueData?.currentToken;
  const status = appointment.status;
  const now = new Date();
  const appointmentDateTime = getAppointmentDateTime(appointment);
  const minutesUntilAppointment = getMinutesUntilAppointment(appointment, now);
  const activeQueueStatus =
    status === 'checked_in' ||
    status === 'called' ||
    status === 'in_progress';
  const appointmentStarted =
    activeQueueStatus ||
    appointmentDateTime.getTime() <= now.getTime();
  const appointmentTimePassed =
    appointmentStarted &&
    (status === 'pending' || status === 'confirmed') &&
    appointmentDateTime.getTime() < now.getTime();
  const showQueueMetrics =
    appointmentStarted &&
    !appointmentTimePassed &&
    status !== 'cancelled' &&
    status !== 'completed';
  const queueStatusLabel =
    status === 'called' || status === 'in_progress'
      ? 'Called'
      : status === 'checked_in'
        ? 'Arrived'
        : status === 'completed'
          ? 'Completed'
          : status === 'cancelled'
            ? 'Cancelled'
            : appointmentTimePassed
              ? 'Time Passed'
              : 'Scheduled';
  const hasQueueMetrics = queueData != null;
  const canCheckIn = appointment.status === 'confirmed';
  const checkingIn = checkingInId === appointmentId;
  const canCancel = appointment.status === 'pending' || appointment.status === 'confirmed';
  const cancelling = cancellingId === appointmentId;

  const handleCheckIn = async () => {
    try {
      const updatedAppointment = await checkInAppointment(appointmentId);
      await refreshQueue();
      setAppointment(updatedAppointment);
      toastService.success('Successfully checked in.');
    } catch (checkInError) {
      toastService.error(
        checkInError instanceof Error
          ? checkInError.message
          : 'Unable to check in. Please try again.',
      );
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Appointment',
      'Are you sure you want to cancel this appointment? This action cannot be undone.',
      [
        { text: 'Keep Appointment', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedAppointment = await cancelAppointment(appointmentId, 'Patient Requested');
              setAppointment(updatedAppointment);
              toastService.success('Appointment cancelled successfully.');
            } catch (error) {
              toastService.error(
                error instanceof Error ? error.message : 'Failed to cancel appointment.'
              );
            }
          },
        },
      ]
    );
  };

  const badgeVariant =
    ['completed'].includes(status)
      ? 'success'
      : ['cancelled'].includes(status)
        ? 'error'
        : ['called', 'in_progress'].includes(status)
          ? 'info'
          : 'warning';
  
  const estimatedWaitLabel =
    appointmentTimePassed
      ? '--'
      : showQueueMetrics
        ? waitMins != null
          ? `${waitMins} mins`
          : '--'
        : formatWaitDuration(minutesUntilAppointment);
  const peopleAheadLabel =
    showQueueMetrics ? `${peopleAhead}` : '--';
  const currentPositionLabel =
    showQueueMetrics ? `${currentPosition ?? '--'}` : '--';
  const initialWait = Math.max(
    waitMins ?? 0,
    appointment.estimated_wait_mins ?? 0,
    1,
  );
  const progress =
    showQueueMetrics && waitMins != null
      ? Math.max(0, 1 - waitMins / initialWait)
      : 0;

  return (
    <ScreenWrapper scrollable>
      <View style={styles.container}>
        <View style={{ marginBottom: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
          <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl }]}>
            Queue Status
          </Text>
          <Badge
            label={status.replace('_', ' ').toUpperCase()}
            variant={badgeVariant}
          />
        </View>

        {/* Progress Card */}
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md, flexWrap: 'wrap', gap: spacing.md }}>
            <View>
              <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>Estimated Wait</Text>
              <Text style={{ color: colors.text, fontSize: typography.sizes.xxl, fontWeight: '700' }}>
                {estimatedWaitLabel}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>Queue Position</Text>
              <Text style={{ color: colors.text, fontSize: typography.sizes.xxl, fontWeight: '700' }}>
                {currentPositionLabel}
              </Text>
            </View>
          </View>
          <ProgressBar progress={progress} color={colors.primary} />
          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginTop: spacing.sm, textAlign: 'center' }}>
            {appointmentTimePassed
              ? 'This appointment time has passed. Please contact the clinic.'
              : !showQueueMetrics
                ? `Appointment starts at ${getAppointmentTimeLabel(appointment)}.`
                : !hasQueueMetrics
              ? 'Waiting for live queue data'
              : status === 'called' || status === 'in_progress'
              ? 'Your token has been called. Please proceed to the counter.'
              : peopleAhead === 0
                ? "You're next!"
                : `${peopleAhead} ${peopleAhead === 1 ? 'person' : 'people'} ahead of you`}
          </Text>
        </Card>

        <Card style={{ marginBottom: spacing.lg }}>
          <View style={styles.tokenSummary}>
            <View style={styles.tokenColumn}>
              <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>
                Current Token
              </Text>
              <Text style={{ color: colors.text, fontSize: typography.sizes.xxl, fontWeight: '700' }}>
                {currentServingToken || '--'}
              </Text>
            </View>
            <View style={styles.tokenColumn}>
              <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>
                Your Token
              </Text>
              <Text style={{ color: colors.primary, fontSize: typography.sizes.xxl, fontWeight: '700' }}>
                {appointment.token_number ?? '--'}
              </Text>
            </View>
          </View>

          <View style={[styles.queueCardRows, { marginTop: spacing.lg }]}>
            <View style={styles.queueCardRow}>
              <Users color={colors.primary} size={scaleFont(18)} />
              <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, flex: 1 }}>
                People Ahead
              </Text>
              <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '700' }}>
                {peopleAheadLabel}
              </Text>
            </View>

            <View style={styles.queueCardRow}>
              <Clock color={colors.primary} size={scaleFont(18)} />
              <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, flex: 1 }}>
                Estimated Wait
              </Text>
              <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '700' }}>
                {estimatedWaitLabel}
              </Text>
            </View>

            <View style={styles.queueCardRow}>
              <BellRing
                color={queueStatusLabel === 'Called' ? colors.info : colors.primary}
                size={scaleFont(18)}
              />
              <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, flex: 1 }}>
                Status
              </Text>
              <Text
                style={{
                  color: queueStatusLabel === 'Called' ? colors.info : colors.text,
                  fontSize: typography.sizes.md,
                  fontWeight: '700',
                }}
              >
                {queueStatusLabel}
              </Text>
            </View>
          </View>

          {canCheckIn && (
            <AppButton
              title="I'm Here — Check In"
              loading={checkingIn}
              onPress={handleCheckIn}
              style={{ marginBottom: spacing.md }}
            />
          )}

          {canCancel && (
            <AppButton
              title="Cancel Appointment"
              variant="danger"
              loading={cancelling}
              onPress={handleCancel}
              disabled={checkingIn || cancelling}
            />
          )}

          {status === 'checked_in' && (
            <Text style={{ color: colors.success, fontSize: typography.sizes.sm, marginTop: spacing.md, textAlign: 'center', fontWeight: '600' }}>
              Checked in successfully. Keep this screen open for live updates.
            </Text>
          )}
        </Card>

        {!!queueError && (
          <Text style={{ color: colors.error, fontSize: typography.sizes.sm, marginBottom: spacing.md }}>
            Live updates are temporarily unavailable: {queueError}
          </Text>
        )}

        {queueLoading && (
          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, marginBottom: spacing.md }}>
            Connecting to live queue…
          </Text>
        )}

        {/* Details Card */}
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={{ color: colors.text, fontSize: typography.sizes.lg, fontWeight: '600', marginBottom: spacing.md }}>
            Appointment Details
          </Text>
          <View style={{ gap: spacing.md }}>
            <View style={styles.detailRow}>
              <CircleDot color={colors.primary} size={scaleFont(20)} />
              <View style={styles.detailText}>
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>Token</Text>
                <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '500' }}>#{appointment.token_number || 'N/A'}</Text>
              </View>
            </View>
            <View style={styles.detailRow}>
              <Calendar color={colors.primary} size={scaleFont(20)} />
              <View style={styles.detailText}>
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>Date & Time</Text>
                <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '500' }}>
                  {getAppointmentDateLabel(appointment)} • {getAppointmentTimeLabel(appointment)}
                </Text>
              </View>
            </View>
            <View style={styles.detailRow}>
              <MapPin color={colors.primary} size={scaleFont(20)} />
              <View style={styles.detailText}>
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>Center</Text>
                <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '500' }}>{appointment.center_name}</Text>
              </View>
            </View>
            {status === 'cancelled' && appointment.cancel_reason && (
              <View style={styles.detailRow}>
                <Info color={colors.error} size={scaleFont(20)} />
                <View style={styles.detailText}>
                  <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>Cancellation Reason</Text>
                  <Text style={{ color: colors.error, fontSize: typography.sizes.md, fontWeight: '500' }}>{appointment.cancel_reason}</Text>
                </View>
              </View>
            )}
          </View>
        </Card>

      </View>
    </ScreenWrapper>
  );
};

export default QueueStatusScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontWeight: 'bold',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(12),
  },
  detailText: {
    flex: 1,
  },
  tokenColumn: {
    alignItems: 'center',
    flex: 1,
  },
  tokenSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  queueCardRows: {
    gap: scaleFont(12),
  },
  queueCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(10),
  },
});
