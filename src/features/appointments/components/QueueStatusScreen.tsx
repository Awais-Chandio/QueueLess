import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, Pressable } from 'react-native';
import { useRoute, useIsFocused, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import AppButton from '../../../components/ui/AppButton';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Card } from '../../../components/ui/Card';
import { StatusChip } from '../../../components/ui/StatusChip';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { CircularProgress } from '../../../components/ui/CircularProgress';
import { CardFadeIn } from '../../../components/animations/CardFadeIn';
import { useTheme } from '../../../hooks/useTheme';
import { appointmentsService } from '../api/appointmentsService';
import { useRealtimeQueue } from '../../queue/hooks/useRealtimeQueue';
import { useAppointmentsStore } from '../../../store/appointmentsStore';
import type { AppStackParamList } from '../../../navigation/types';
import type { AppointmentFull } from '../../../types/appointment';
import { getAppointmentStatusState, getStatusDisplayProperties } from '../../../services/bookingService';
import {
  BellRing,
  Calendar,
  CircleDot,
  Clock,
  Info,
  MapPin,
  Users,
  Hash,
  CheckCircle2,
  ChevronLeft,
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
  const navigation = useNavigation();
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
          <Skeleton height={200} />
          <Skeleton height={150} />
          <Skeleton height={140} />
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
  const now = new Date();
  const { isExpired, isNoShow, resolvedStatus } = getAppointmentStatusState(appointment, now);
  const status = resolvedStatus;
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
    status !== 'completed' &&
    !isExpired &&
    !isNoShow;
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

  const { label: statusLabel } = getStatusDisplayProperties(status);

  const estimatedWaitLabel =
    appointmentTimePassed
      ? '--'
      : showQueueMetrics
        ? waitMins != null
          ? `${waitMins} min`
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

  // Circular progress: how far currentToken is toward your token
  const yourToken = appointment.token_number ?? 0;
  const currentToken = currentServingToken ?? 0;
  const circularProgress = showQueueMetrics && yourToken > 0
    ? Math.min(1, Math.max(0, currentToken / yourToken))
    : progress;

  return (
    <ScreenWrapper scrollable>
      <View style={styles.container}>
        {/* Header row */}
        <CardFadeIn delay={0}>
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

          <View style={{ marginBottom: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
            <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl }]}>
              Queue Status
            </Text>
            <StatusChip status={status} label={statusLabel} />
          </View>
        </CardFadeIn>

        {/* Circular Progress Card */}
        <CardFadeIn delay={60}>
          <Card style={{ marginBottom: spacing.lg }}>
            <View style={styles.circularSection}>
              <CircularProgress
                progress={circularProgress}
                size={scaleFont(130)}
                strokeWidth={scaleFont(10)}
                color={
                  status === 'called' || status === 'in_progress'
                    ? colors.warning
                    : status === 'checked_in'
                    ? colors.success
                    : colors.primary
                }
                trackColor={colors.border}
                centerLabel={showQueueMetrics ? peopleAheadLabel : '--'}
                centerCaption="Ahead"
                centerLabelColor={colors.text}
                centerCaptionColor={colors.textSecondary}
              />
              <View style={styles.circularMeta}>
                <View style={styles.circularMetaItem}>
                  <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, fontWeight: '500' }}>
                    Est. Wait
                  </Text>
                  <Text style={{ color: colors.text, fontSize: typography.sizes.xl, fontWeight: '800' }}>
                    {estimatedWaitLabel}
                  </Text>
                </View>
                <View style={[styles.circularMetaItem, { marginTop: spacing.sm }]}>
                  <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, fontWeight: '500' }}>
                    Queue Position
                  </Text>
                  <Text style={{ color: colors.text, fontSize: typography.sizes.xl, fontWeight: '800' }}>
                    {currentPositionLabel}
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ marginTop: spacing.md }}>
              <ProgressBar progress={progress} color={colors.primary} />
            </View>

            <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginTop: spacing.sm, textAlign: 'center' }}>
              {isNoShow
                ? 'You missed your 15-minute check-in grace period. The appointment is marked as No-Show.'
                : isExpired
                  ? 'This appointment slot has expired.'
                  : appointmentTimePassed
                    ? 'This appointment time has passed. Please contact the clinic.'
                    : !showQueueMetrics
                      ? `Appointment starts at ${getAppointmentTimeLabel(appointment)}.`
                      : !hasQueueMetrics
                        ? 'Waiting for live queue data…'
                        : status === 'called' || status === 'in_progress'
                          ? '🔔 Your token has been called. Please proceed to the counter.'
                          : peopleAhead === 0
                            ? "🎉 You're next!"
                            : `${peopleAhead} ${peopleAhead === 1 ? 'person' : 'people'} ahead of you`}
            </Text>
          </Card>
        </CardFadeIn>

        {/* Token + Queue Metrics Card */}
        <CardFadeIn delay={120}>
          <Card style={{ marginBottom: spacing.lg }}>
            {/* Token boxes */}
            <View style={styles.tokenSummary}>
              <View style={[styles.tokenBox, { backgroundColor: colors.border + '40', borderColor: colors.border }]}>
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, fontWeight: '500' }}>
                  Now Serving
                </Text>
                <Text style={{ color: colors.text, fontSize: typography.sizes.xxl, fontWeight: '800', marginTop: scaleFont(2) }}>
                  {currentServingToken != null ? `#${currentServingToken}` : '--'}
                </Text>
              </View>
              <View style={[styles.tokenBox, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '40' }]}>
                <Text style={{ color: colors.primary, fontSize: typography.sizes.xs, fontWeight: '500' }}>
                  Your Token
                </Text>
                <Text style={{ color: colors.primary, fontSize: typography.sizes.xxl, fontWeight: '800', marginTop: scaleFont(2) }}>
                  {appointment.token_number != null ? `#${appointment.token_number}` : '--'}
                </Text>
              </View>
            </View>

            {/* Queue metric rows */}
            <View style={[styles.queueCardRows, { marginTop: spacing.lg }]}>
              <View style={styles.queueCardRow}>
                <View style={[styles.metricIconPill, { backgroundColor: `${colors.warning}15` }]}>
                  <Users color={colors.warning} size={scaleFont(16)} />
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, flex: 1 }}>
                  People Ahead
                </Text>
                <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '700' }}>
                  {peopleAheadLabel}
                </Text>
              </View>

              <View style={styles.queueCardRow}>
                <View style={[styles.metricIconPill, { backgroundColor: `${colors.info}15` }]}>
                  <Clock color={colors.info} size={scaleFont(16)} />
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, flex: 1 }}>
                  Estimated Wait
                </Text>
                <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '700' }}>
                  {estimatedWaitLabel}
                </Text>
              </View>

              <View style={styles.queueCardRow}>
                <View style={[styles.metricIconPill, {
                  backgroundColor: queueStatusLabel === 'Called'
                    ? `${colors.warning}15`
                    : queueStatusLabel === 'Arrived'
                    ? `${colors.success}15`
                    : `${colors.primary}15`,
                }]}>
                  <BellRing
                    color={
                      queueStatusLabel === 'Called'
                        ? colors.warning
                        : queueStatusLabel === 'Arrived'
                        ? colors.success
                        : colors.primary
                    }
                    size={scaleFont(16)}
                  />
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, flex: 1 }}>
                  Status
                </Text>
                <Text
                  style={{
                    color: queueStatusLabel === 'Called'
                      ? colors.warning
                      : queueStatusLabel === 'Arrived'
                      ? colors.success
                      : colors.text,
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
                style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}
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
              <View style={[styles.checkedInRow, { marginTop: spacing.md, backgroundColor: `${colors.success}10`, borderRadius: scaleFont(8), padding: spacing.sm }]}>
                <CheckCircle2 color={colors.success} size={scaleFont(16)} />
                <Text style={{ color: colors.success, fontSize: typography.sizes.sm, fontWeight: '600', flex: 1 }}>
                  Checked in successfully. Keep this screen open for live updates.
                </Text>
              </View>
            )}
          </Card>
        </CardFadeIn>

        {!!queueError && (
          <Text style={{ color: colors.error, fontSize: typography.sizes.sm, marginBottom: spacing.md }}>
            Live updates are temporarily unavailable: {queueError}
          </Text>
        )}

        {queueLoading && (
          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, marginBottom: spacing.md, textAlign: 'center' }}>
            Connecting to live queue…
          </Text>
        )}

        {/* Details Card */}
        <CardFadeIn delay={180}>
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={{ color: colors.text, fontSize: typography.sizes.lg, fontWeight: '600', marginBottom: spacing.md }}>
              Appointment Details
            </Text>
            <View style={{ gap: spacing.md }}>
              <View style={styles.detailRow}>
                <View style={[styles.detailIconPill, { backgroundColor: `${colors.primary}12` }]}>
                  <Hash color={colors.primary} size={scaleFont(16)} />
                </View>
                <View style={styles.detailText}>
                  <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>Token Number</Text>
                  <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '500' }}>
                    #{appointment.token_number || 'N/A'}
                  </Text>
                </View>
              </View>
              <View style={styles.detailRow}>
                <View style={[styles.detailIconPill, { backgroundColor: `${colors.primary}12` }]}>
                  <Calendar color={colors.primary} size={scaleFont(16)} />
                </View>
                <View style={styles.detailText}>
                  <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>Date & Time</Text>
                  <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '500' }}>
                    {getAppointmentDateLabel(appointment)} • {getAppointmentTimeLabel(appointment)}
                  </Text>
                </View>
              </View>
              <View style={styles.detailRow}>
                <View style={[styles.detailIconPill, { backgroundColor: `${colors.primary}12` }]}>
                  <MapPin color={colors.primary} size={scaleFont(16)} />
                </View>
                <View style={styles.detailText}>
                  <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>Center</Text>
                  <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '500' }}>{appointment.center_name}</Text>
                </View>
              </View>
              {status === 'cancelled' && appointment.cancel_reason && (
                <View style={styles.detailRow}>
                  <View style={[styles.detailIconPill, { backgroundColor: `${colors.error}12` }]}>
                    <Info color={colors.error} size={scaleFont(16)} />
                  </View>
                  <View style={styles.detailText}>
                    <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>Cancellation Reason</Text>
                    <Text style={{ color: colors.error, fontSize: typography.sizes.md, fontWeight: '500' }}>{appointment.cancel_reason}</Text>
                  </View>
                </View>
              )}
            </View>
          </Card>
        </CardFadeIn>
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
  circularSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(20),
  },
  circularMeta: {
    flex: 1,
  },
  circularMetaItem: {},
  tokenSummary: {
    flexDirection: 'row',
    gap: scaleFont(12),
  },
  tokenBox: {
    flex: 1,
    borderRadius: scaleFont(12),
    borderWidth: 1,
    paddingHorizontal: scaleFont(16),
    paddingVertical: scaleFont(12),
    alignItems: 'center',
  },
  queueCardRows: {
    gap: scaleFont(12),
  },
  queueCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(10),
  },
  metricIconPill: {
    width: scaleFont(34),
    height: scaleFont(34),
    borderRadius: scaleFont(17),
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkedInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(8),
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(12),
  },
  detailIconPill: {
    width: scaleFont(36),
    height: scaleFont(36),
    borderRadius: scaleFont(18),
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailText: {
    flex: 1,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: scaleFont(12),
    alignSelf: 'flex-start',
    paddingVertical: scaleFont(4),
  },
  backButtonText: {
    fontWeight: '600',
  },
});
