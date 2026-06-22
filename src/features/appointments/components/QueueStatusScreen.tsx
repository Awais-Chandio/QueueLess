import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRoute } from '@react-navigation/native';
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
import { checkInAppointment } from '../../queue/api/queueService';
import { useRealtimeQueue } from '../../queue/hooks/useRealtimeQueue';
import type { AppStackParamList } from '../../../navigation/types'; // adjusted path
import type { AppointmentFull } from '../../../types/appointment'; // adjusted path
import { MapPin, Calendar, CircleDot } from 'lucide-react-native';
import { scaleFont } from '../../../utils/responsive';
import { toastService } from '../../../services/toastService';

type QueueStatusRouteProp = RouteProp<AppStackParamList, 'QueueStatus'>;

const QueueStatusScreen = () => {
  const route = useRoute<QueueStatusRouteProp>();
  const { appointmentId } = route.params;
  const { colors, spacing, typography } = useTheme();

  const [appointment, setAppointment] = useState<AppointmentFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);

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
  const hasQueueMetrics = queueData != null;
  const canCheckIn =
    ['pending', 'confirmed'].includes(appointment.status) &&
    !['checked_in', 'called', 'in_progress'].includes(status);

  const handleCheckIn = async () => {
    try {
      setCheckingIn(true);
      await checkInAppointment(appointmentId);
      await refreshQueue();
      setAppointment(current =>
        current
          ? {
              ...current,
              status: 'checked_in',
              checked_in_at: new Date().toISOString(),
            }
          : current,
      );
      toastService.success("You're checked in and added to the live queue.");
    } catch (checkInError) {
      toastService.error(
        checkInError instanceof Error
          ? checkInError.message
          : 'Unable to check in. Please try again.',
      );
    } finally {
      setCheckingIn(false);
    }
  };

  const badgeVariant =
    ['completed'].includes(status)
      ? 'success'
      : ['cancelled'].includes(status)
        ? 'error'
        : ['called', 'in_progress'].includes(status)
          ? 'info'
          : 'warning';
  
  // Progress calculation (arbitrary max wait of 60 for progress visual if not known)
  const initialWait = appointment.estimated_wait_mins || 60;
  const progress =
    waitMins != null
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
                {waitMins != null ? `${waitMins} mins` : '--'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>Queue Position</Text>
              <Text style={{ color: colors.text, fontSize: typography.sizes.xxl, fontWeight: '700' }}>
                {currentPosition ?? '--'}
              </Text>
            </View>
          </View>
          <ProgressBar progress={progress} color={colors.primary} />
          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginTop: spacing.sm, textAlign: 'center' }}>
            {!hasQueueMetrics
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
                Your Token
              </Text>
              <Text style={{ color: colors.primary, fontSize: typography.sizes.xxl, fontWeight: '700' }}>
                {appointment.token_number ?? '--'}
              </Text>
            </View>
            <View style={styles.tokenColumn}>
              <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>
                Current Token
              </Text>
              <Text style={{ color: colors.text, fontSize: typography.sizes.xxl, fontWeight: '700' }}>
                {currentServingToken ?? '--'}
              </Text>
            </View>
          </View>

          {canCheckIn && (
            <AppButton
              title="I'm Here — Check In"
              loading={checkingIn}
              onPress={handleCheckIn}
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
                  {new Date(appointment.scheduled_at).toLocaleString()}
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
});
