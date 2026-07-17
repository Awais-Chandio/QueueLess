import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import {
  useRoute,
  useIsFocused,
  useNavigation,
} from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import AppButton from '../../../components/ui/AppButton';
import Loader from '../../../components/ui/Loader';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Card } from '../../../components/ui/Card';
import { StatusChip } from '../../../components/ui/StatusChip';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { CircularProgress } from '../../../components/ui/CircularProgress';
import AnimatedCard from '../../../components/ui/AnimatedCard';
import { useTheme } from '../../../hooks/useTheme';
import { appointmentService } from '../../../services/appointmentService';
import { useQueue } from '../../../hooks/useQueue';
import { useAppointmentsStore } from '../../../store/appointmentStore';
import type { AppStackParamList } from '../../../navigation/types';
import type { AppointmentFull } from '../../../types/appointment';
import {
  getAppointmentStatusState,
  getStatusDisplayProperties,
} from '../../../services/bookingService';
import {
  BellRing,
  Calendar,
  CircleDot,
  Info,
  MapPin,
  Hash,
  CheckCircle2,
  ChevronLeft,
  Stethoscope,
  Hourglass,
} from 'lucide-react-native';
import { Image } from 'react-native';
import { supabase } from '../../../lib/supabase';
import type { DoctorAvailabilityStatus } from '../../../types/doctor';
import { scaleFont, wp } from '../../../utils/responsive';
import { toastService } from '../../../services/toastService';
import {
  formatWaitDuration,
  getAppointmentDateTime,
  getAppointmentDateLabel,
  getAppointmentTimeLabel,
  getMinutesUntilAppointment,
  getPakistanTodayDateString,
} from '../utils/appointmentTime';

type QueueStatusRouteProp = RouteProp<AppStackParamList, 'QueueStatus'>;

const QueueStatusScreen = () => {
  const route = useRoute<QueueStatusRouteProp>();
  const navigation = useNavigation<any>();
  const appointmentId = route.params?.appointmentId;
  const doctorId = route.params?.doctorId;
  const centerId = route.params?.centerId;
  const serviceId = route.params?.serviceId;

  const { colors, spacing, typography, radius } = useTheme();
  const isFocused = useIsFocused();
  const pulseVal = useSharedValue(1);

  useEffect(() => {
    pulseVal.value = withRepeat(
      withSequence(
        withTiming(1.25, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      -1,
      true
    );
  }, [pulseVal]);

  const pulseStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: pulseVal.value }],
      opacity: 0.35 * (1.25 - pulseVal.value) / 0.25,
    };
  });

  const [appointment, setAppointment] = useState<AppointmentFull | null>(null);
  const [loading, setLoading] = useState(!doctorId);

  // Doctor preview queue state
  const [doctor, setDoctor] = useState<any>(null);
  const [doctorQueue, setDoctorQueue] = useState<any>(null);
  const [doctorAvailability, setDoctorAvailability] = useState<any>(null);
  const [doctorLoading, setDoctorLoading] = useState(!!doctorId);

  const fetchDoctorQueueData = useCallback(async () => {
    const isUuid = typeof doctorId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(doctorId);
    if (!isUuid) {
      console.warn("fetchDoctorQueueData skipped: doctorId is not a valid UUID:", doctorId);
      return;
    }
    try {
      setDoctorLoading(true);
      // Fetch Doctor Details
      const { data: docData, error: docErr } = await supabase
        .from('doctors')
        .select('*')
        .eq('id', doctorId)
        .single();
      if (docErr) throw docErr;
      setDoctor(docData);

      // Fetch Doctor Queue Snapshot
      console.log("RPC: get_doctor_queue_snapshot");
      console.log("RPC:", doctorId);
      const { data: qData, error: qErr } = await supabase
        .rpc('get_doctor_queue_snapshot', {
          p_doctor_id: doctorId,
          p_queue_date: getPakistanTodayDateString()
        });
      console.log(qData, qErr);
      if (qErr) throw qErr;
      setDoctorQueue(qData);

      // Fetch Doctor Availability
      console.log("RPC: get_doctor_availability");
      console.log("RPC:", doctorId);
      const { data: availData, error: availErr } = await supabase
        .rpc('get_doctor_availability', {
          p_doctor_id: doctorId
        });
      console.log(availData, availErr);
      if (availErr) throw availErr;
      setDoctorAvailability(availData && availData.length > 0 ? availData[0] : null);

    } catch (err) {
      console.error('Failed to fetch doctor queue preview:', err);
    } finally {
      setDoctorLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    if (doctorId && isFocused) {
      fetchDoctorQueueData();

      // Realtime subscription on appointments for this doctor to auto-refresh queue
      const channel = supabase
        .channel(`doctor-queue-realtime-${doctorId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'appointments', filter: `doctor_id=eq.${doctorId}` },
          () => fetchDoctorQueueData()
        )
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'doctors', filter: `id=eq.${doctorId}` },
          () => fetchDoctorQueueData()
        )
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'queue_updates' },
          () => fetchDoctorQueueData()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [doctorId, isFocused, fetchDoctorQueueData]);

  const checkInAppointment = useAppointmentsStore(
    state => state.checkInAppointment,
  );
  const checkingInId = useAppointmentsStore(state => state.checkingInId);
  const cancelAppointment = useAppointmentsStore(
    state => state.cancelAppointment,
  );
  const cancellingId = useAppointmentsStore(state => state.cancellingId);

  const fetchAppointment = useCallback(async () => {
    if (!appointmentId) return;
    try {
      const data = await appointmentService.fetchAppointmentById(
        appointmentId,
      );
      setAppointment(data);
    } catch (error) {
      console.error('Failed to fetch appointment:', error);
    }
    setLoading(false);
  }, [appointmentId]);

  useEffect(() => {
    if (appointmentId) {
      fetchAppointment();
    }
  }, [appointmentId, fetchAppointment]);

  const {
    queueData,
    refresh: refreshQueue,
  } = useQueue(
    appointment?.token_number ?? null,
    fetchAppointment,
    {
      appointmentId,
      centerId: appointment?.center_id,
      scheduledAt: appointment?.scheduled_at,
    },
    isFocused && !doctorId,
  );

  // If viewing doctor queue preview
  if (doctorId) {
    if (doctorLoading) {
      return (
        <ScreenWrapper>
          <Loader message="Loading live doctor queue..." />
        </ScreenWrapper>
      );
    }

    if (!doctor || !doctorQueue) {
      return (
        <ScreenWrapper>
          <EmptyState
            title="Queue Preview Unavailable"
            subtitle="Unable to load this doctor's live queue details."
            buttonTitle="Go Back"
            onButtonPress={() => navigation.goBack()}
          />
        </ScreenWrapper>
      );
    }

    const isDoctorOnBreak = doctorQueue.is_on_break;
    const currentServingToken = doctorQueue.current_token;
    const nextToken = doctorQueue.next_token;
    const averageConsultationTime = doctorQueue.average_consultation_time;
    const status = (doctorAvailability?.status || 'available') as DoctorAvailabilityStatus;
    const waitMins = doctorAvailability?.estimated_wait_minutes || 0;

    const statusLabel =
      status === 'available' ? 'Available' :
      status === 'busy' ? 'Busy' :
      status === 'on_break' ? 'On Break' :
      status === 'on_leave' ? 'On Leave' :
      status === 'not_working' ? 'Not Working' :
      status === 'fully_booked' ? 'Fully Booked' : 'Offline';

    const statusChipStatus: any =
      isDoctorOnBreak ? 'doctor_on_break' :
      status === 'available' ? 'confirmed' :
      status === 'busy' ? 'warning' :
      status === 'on_break' ? 'doctor_on_break' :
      status === 'on_leave' ? 'cancelled' :
      status === 'not_working' ? 'pending' :
      status === 'fully_booked' ? 'error' : 'default';

    const queueHelperText =
      isDoctorOnBreak ? `Dr. ${doctor.name} is currently on break. You can still book, but consultations will resume after the break.` :
      status === 'on_leave' ? `Dr. ${doctor.name} is on leave today.` :
      status === 'not_working' ? `Dr. ${doctor.name} is not working today.` :
      status === 'fully_booked' ? `Dr. ${doctor.name} is fully booked for today.` :
      status === 'busy' ? 'High volume of tokens. Expect longer wait times.' :
      `You can book token #${nextToken} now. Expected wait is about ${waitMins} minutes.`;

    const canBook = status !== 'fully_booked' && status !== 'on_leave' && status !== 'not_working';

    return (
      <ScreenWrapper scrollable>
        <View style={[styles.container, { paddingHorizontal: wp(1) }]}>
          {/* Header row */}
          <AnimatedCard delay={0}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [
                styles.backButton,
                pressed && { opacity: 0.7 },
              ]}
            >
              <ChevronLeft size={24} color={colors.primary} />
              <Text style={[styles.backButtonText, { color: colors.primary, fontSize: typography.sizes.md, marginLeft: spacing.xs }]}>
                Back
              </Text>
            </Pressable>

            <View style={{ marginBottom: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
              <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl }]}>
                Live Queue
              </Text>
              <StatusChip status={statusChipStatus} label={statusLabel} />
            </View>
          </AnimatedCard>

          {/* Doctor Info Card */}
          <AnimatedCard delay={60}>
            <Card style={{ marginBottom: spacing.md, padding: spacing.md, borderRadius: 16 }}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                {doctor.photo_url ? (
                  <Image source={{ uri: doctor.photo_url }} style={{ width: 50, height: 50, borderRadius: radius.md }} />
                ) : (
                  <View style={{ width: 50, height: 50, backgroundColor: colors.primaryLight, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }}>
                    <Stethoscope size={20} color={colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '800' }}>
                    {doctor.name}
                  </Text>
                  <Text style={{ color: colors.primary, fontSize: typography.sizes.xs, fontWeight: '700' }}>
                    {doctor.specialty}
                  </Text>
                  {doctor.qualification && (
                    <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>
                      {doctor.qualification}
                    </Text>
                  )}
                </View>
              </View>
            </Card>
          </AnimatedCard>

          {/* Live Queue status Card */}
          <AnimatedCard delay={120}>
            <Card style={{ marginBottom: spacing.lg, padding: spacing.md, borderRadius: 20 }}>
              {isDoctorOnBreak && (
                <View style={[styles.breakBanner, { backgroundColor: `${colors.warning}12`, borderColor: `${colors.warning}30`, borderWidth: 1, padding: spacing.sm, borderRadius: radius.md, marginBottom: spacing.md }]}>
                  <Text style={{ color: colors.warning, fontWeight: '700', fontSize: typography.sizes.xs }}>
                    Dr. {doctor.name} is on a break
                  </Text>
                </View>
              )}

              <View style={{ alignItems: 'center', justifyContent: 'center', marginVertical: spacing.md }}>
                <CircularProgress
                  progress={0}
                  size={scaleFont(110)}
                  strokeWidth={scaleFont(8)}
                  color={colors.primary}
                  trackColor={colors.border + '30'}
                  centerLabel={currentServingToken ? `#${currentServingToken}` : '--'}
                  centerCaption="Serving"
                  centerLabelColor={colors.text}
                  centerCaptionColor={colors.textSecondary}
                />
              </View>

              <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, textAlign: 'center', marginHorizontal: spacing.md, lineHeight: 16 }}>
                {queueHelperText}
              </Text>

              {/* Token boxes */}
              <View style={[styles.tokenSummary, { marginTop: spacing.lg }]}>
                <Card variant="flat" style={[styles.tokenBox, { backgroundColor: colors.border + '30' }]}>
                  <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs - 1, fontWeight: '700', textTransform: 'uppercase' }}>
                    Currently Serving
                  </Text>
                  <Text style={{ color: colors.text, fontSize: typography.sizes.xxl, fontWeight: '800', marginTop: scaleFont(4) }}>
                    {currentServingToken != null ? `#${currentServingToken}` : '--'}
                  </Text>
                </Card>
                <Card variant="flat" style={[styles.tokenBox, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30', borderWidth: 1 }]}>
                  <Text style={{ color: colors.primary, fontSize: typography.sizes.xs - 1, fontWeight: '700', textTransform: 'uppercase' }}>
                    Next Token
                  </Text>
                  <Text style={{ color: colors.primary, fontSize: typography.sizes.xxl, fontWeight: '800', marginTop: scaleFont(4) }}>
                    {nextToken != null ? `#${nextToken}` : '--'}
                  </Text>
                </Card>
              </View>

              {/* Queue metric rows */}
              <View style={[styles.queueCardRows, { marginTop: spacing.xl }]}>
                <View style={[styles.queueCardRow, { borderBottomWidth: 0.5, borderBottomColor: colors.border + '50', paddingBottom: spacing.sm }]}>
                  <View style={[styles.metricIconPill, { backgroundColor: `${colors.primary}12` }]}>
                    <CircleDot color={colors.primary} size={scaleFont(16)} />
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, flex: 1, fontWeight: '600' }}>
                    Consultation Avg
                  </Text>
                  <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '800' }}>
                    {averageConsultationTime ? `${Math.round(averageConsultationTime)} min` : '10 min'}
                  </Text>
                </View>

                <View style={styles.queueCardRow}>
                  <View style={[styles.metricIconPill, { backgroundColor: `${colors.primary}12` }]}>
                    <Hourglass color={colors.primary} size={scaleFont(16)} />
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, flex: 1, fontWeight: '600' }}>
                    Est. Wait Time
                  </Text>
                  <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '800' }}>
                    {waitMins} mins
                  </Text>
                </View>
              </View>

              {/* Book Token Button */}
              <AppButton
                title={canBook ? "Book Token" : "Booking Unavailable"}
                disabled={!canBook}
                onPress={() => {
                  navigation.navigate('BookAppointment', {
                    centerId,
                    serviceId,
                    doctorId,
                  });
                }}
                style={{ marginTop: spacing.lg }}
              />
            </Card>
          </AnimatedCard>
        </View>
      </ScreenWrapper>
    );
  }

  // Normal appointment mode logic starts here:
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

  if (!appointment) {
    return (
      <ScreenWrapper>
        <EmptyState
          title="Appointment Not Found"
          subtitle="Unable to load queue status."
        />
      </ScreenWrapper>
    );
  }

  const waitMins = queueData?.estimatedWaitMins;
  const peopleAhead = queueData?.peopleAhead ?? 0;
  const currentPosition = queueData?.currentPosition;
  const currentServingToken = queueData?.currentToken;
  const doctorAverageTime = queueData?.averageConsultationTime;
  const isDoctorOnBreak =
    Boolean(queueData?.isOnBreak) ||
    queueData?.queueStatus === 'doctor_on_break';
  const now = new Date();
  const { isExpired, isNoShow, resolvedStatus } = getAppointmentStatusState(
    appointment,
    now,
  );
  const status = resolvedStatus;
  const appointmentDateTime = getAppointmentDateTime(appointment);
  const minutesUntilAppointment = getMinutesUntilAppointment(appointment, now);
  const activeQueueStatus =
    status === 'checked_in' || status === 'called' || status === 'in_progress';
  const appointmentStarted =
    activeQueueStatus || appointmentDateTime.getTime() <= now.getTime();
  const appointmentTimePassed =
    appointmentStarted &&
    (status === 'pending' || status === 'confirmed') &&
    appointmentDateTime.getTime() < now.getTime();
  const showQueueMetrics =
    appointmentStarted &&
    -appointmentTimePassed &&
    status !== 'cancelled' &&
    status !== 'completed' &&
    !isExpired &&
    !isNoShow;
  const queueStatusLabel = isDoctorOnBreak
    ? 'Department on Break'
    : status === 'called' || status === 'in_progress'
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
  const canCancel =
    appointment.status === 'pending' || appointment.status === 'confirmed';
  const cancelling = cancellingId === appointmentId;

  const handleCheckIn = async () => {
    try {
      const updatedAppointment = await checkInAppointment(appointment.id);
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
              const updatedAppointment = await cancelAppointment(
                appointment.id,
                'Patient Requested',
              );
              setAppointment(updatedAppointment);
              toastService.success('Appointment cancelled successfully.');
            } catch (error) {
              toastService.error(
                error instanceof Error
                  ? error.message
                  : 'Failed to cancel appointment.',
              );
            }
          },
        },
      ],
    );
  };

  const { label: statusLabel } = getStatusDisplayProperties(status);

  const estimatedWaitLabel = appointmentTimePassed
    ? '--'
    : showQueueMetrics
      ? waitMins != null
        ? `${waitMins} min`
        : '--'
      : formatWaitDuration(minutesUntilAppointment);
  const peopleAheadLabel = showQueueMetrics ? `${peopleAhead}` : '--';
  const currentPositionLabel = showQueueMetrics
    ? `${currentPosition ?? '--'}`
    : '--';
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
  const circularProgress =
    showQueueMetrics && yourToken > 0
      ? Math.min(1, Math.max(0, currentToken / yourToken))
      : progress;
  const queueHelperText = isNoShow
    ? 'You missed your 15-minute check-in grace period. The appointment is marked as No-Show.'
    : isExpired
      ? 'This appointment slot has expired.'
      : appointmentTimePassed
        ? 'This appointment time has passed. Please contact the clinic.'
        : !showQueueMetrics
          ? `Appointment starts at ${getAppointmentTimeLabel(appointment)}.`
          : !hasQueueMetrics
            ? 'Waiting for live queue data...'
            : isDoctorOnBreak
              ? 'Service is on break. Your position is saved and ETA will resume after the break.'
              : status === 'called' || status === 'in_progress'
                ? 'Your token has been called. Please proceed to the counter.'
                : peopleAhead === 0
                  ? "You're next!"
                  : `${peopleAhead} ${peopleAhead === 1 ? 'person' : 'people'} ahead of you`;

  return (
    <ScreenWrapper scrollable>
      <View style={[styles.container, { paddingHorizontal: wp(1) }]}>
        {/* Header row */}
        <AnimatedCard delay={0}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.backButton,
              pressed && { opacity: 0.7 },
            ]}
          >
            <ChevronLeft size={24} color={colors.primary} />
            <Text
              style={[
                styles.backButtonText,
                {
                  color: colors.primary,
                  fontSize: typography.sizes.md,
                  marginLeft: spacing.xs,
                },
              ]}
            >
              Back
            </Text>
          </Pressable>

          <View
            style={{
              marginBottom: spacing.lg,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: spacing.sm,
            }}
          >
            <Text
              style={[
                styles.title,
                { color: colors.text, fontSize: typography.sizes.xxl },
              ]}
            >
              Queue Status
            </Text>
            <StatusChip status={status} label={statusLabel} />
          </View>
        </AnimatedCard>

        {/* Circular Progress Card */}
        <AnimatedCard delay={60}>
          <Card style={{ marginBottom: spacing.lg, padding: spacing.md, borderRadius: 20 }}>
            {isDoctorOnBreak && (
              <View
                style={[
                  styles.breakBanner,
                  {
                    backgroundColor: `${colors.warning}12`,
                    borderColor: `${colors.warning}30`,
                    marginBottom: spacing.md,
                    borderRadius: radius.md,
                  },
                ]}
              >
                <Info color={colors.warning} size={scaleFont(18)} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.warning,
                      fontSize: typography.sizes.sm,
                      fontWeight: '800',
                    }}
                  >
                    Department on Break
                  </Text>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: typography.sizes.xs,
                      marginTop: scaleFont(2),
                    }}
                  >
                    Queue ETA is paused until service resumes.
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.circularSection}>
              <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative', width: scaleFont(120), height: scaleFont(120) }}>
                {(status === 'called' || status === 'in_progress') && (
                  <Animated.View
                    style={[
                      {
                        position: 'absolute',
                        width: scaleFont(112),
                        height: scaleFont(112),
                        borderRadius: scaleFont(56),
                        backgroundColor: colors.warning,
                      },
                      pulseStyle,
                    ]}
                  />
                )}
                <CircularProgress
                  progress={circularProgress}
                  size={scaleFont(110)}
                  strokeWidth={scaleFont(8)}
                  color={
                    status === 'called' || status === 'in_progress'
                      ? colors.warning
                      : status === 'checked_in'
                        ? colors.primary
                        : colors.primary
                  }
                  trackColor={colors.border + '30'}
                  centerLabel={showQueueMetrics ? peopleAheadLabel : '--'}
                  centerCaption="Ahead"
                  centerLabelColor={colors.text}
                  centerCaptionColor={colors.textSecondary}
                />
              </View>
              <View style={styles.circularMeta}>
                <View style={[styles.metaDataRow, { backgroundColor: colors.border + '15', borderRadius: radius.md, padding: spacing.sm }]}>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: typography.sizes.xs - 1,
                      fontWeight: '700',
                      textTransform: 'uppercase',
                    }}
                  >
                    Estimated Waiting
                  </Text>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: typography.sizes.md,
                      fontWeight: '800',
                      marginTop: 2,
                    }}
                  >
                    {estimatedWaitLabel.includes('min') ? estimatedWaitLabel.replace('min', 'minutes') : estimatedWaitLabel}
                  </Text>
                </View>
                <View
                  style={[styles.metaDataRow, { backgroundColor: colors.border + '15', borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.xs }]}
                >
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: typography.sizes.xs - 1,
                      fontWeight: '700',
                      textTransform: 'uppercase',
                    }}
                  >
                    Patients Ahead
                  </Text>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: typography.sizes.md,
                      fontWeight: '800',
                      marginTop: 2,
                    }}
                  >
                    {peopleAheadLabel}
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ marginTop: spacing.lg }}>
              <ProgressBar progress={progress} color={colors.primary} height={6} />
            </View>

            <Text
              style={{
                color: colors.textSecondary,
                fontSize: typography.sizes.xs,
                marginTop: spacing.md,
                textAlign: 'center',
                fontWeight: '600',
              }}
            >
              {queueHelperText}
            </Text>
          </Card>
        </AnimatedCard>

        {/* Token + Queue Metrics Card */}
        <AnimatedCard delay={120}>
          <Card style={{ marginBottom: spacing.lg, padding: spacing.md, borderRadius: 20 }}>
            {/* Token boxes */}
            <View style={styles.tokenSummary}>
              <Card
                variant="flat"
                style={styles.tokenBox}
              >
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: typography.sizes.xs - 1,
                    fontWeight: '700',
                    textTransform: 'uppercase',
                  }}
                >
                  Current Token
                </Text>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: typography.sizes.xxl,
                    fontWeight: '800',
                    marginTop: scaleFont(4),
                  }}
                >
                  {currentServingToken != null
                    ? `A-${currentServingToken}`
                    : '--'}
                </Text>
              </Card>
              <Card
                variant="flat"
                style={[
                  styles.tokenBox,
                  {
                    backgroundColor: colors.primary + '12',
                    borderColor: colors.primary + '30',
                    borderWidth: 1,
                  },
                ]}
              >
                <Text
                  style={{
                    color: colors.primary,
                    fontSize: typography.sizes.xs - 1,
                    fontWeight: '700',
                    textTransform: 'uppercase',
                  }}
                >
                  Your Token
                </Text>
                <Text
                  style={{
                    color: colors.primary,
                    fontSize: typography.sizes.xxl,
                    fontWeight: '800',
                    marginTop: scaleFont(4),
                  }}
                >
                  {appointment.token_number != null
                    ? `A-${appointment.token_number}`
                    : '--'}
                </Text>
              </Card>
            </View>

            {/* Queue metric rows */}
            <View style={[styles.queueCardRows, { marginTop: spacing.xl }]}>

              <View style={[styles.queueCardRow, { borderBottomWidth: 0.5, borderBottomColor: colors.border + '50', paddingBottom: spacing.sm }]}>
                <View
                  style={[
                    styles.metricIconPill,
                    { backgroundColor: `${colors.primary}12` },
                  ]}
                >
                  <CircleDot color={colors.primary} size={scaleFont(16)} />
                </View>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: typography.sizes.sm,
                    flex: 1,
                    fontWeight: '600',
                  }}
                >
                  Service Avg. Time
                </Text>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: typography.sizes.md,
                    fontWeight: '800',
                  }}
                >
                  {doctorAverageTime != null
                    ? `${Math.round(doctorAverageTime)} min`
                    : '--'}
                </Text>
              </View>

              <View style={styles.queueCardRow}>
                <View
                  style={[
                    styles.metricIconPill,
                    {
                      backgroundColor:
                        queueStatusLabel === 'Called' ||
                          queueStatusLabel === 'Department on Break'
                          ? `${colors.warning}12`
                          : queueStatusLabel === 'Arrived'
                            ? `${colors.primary}12`
                            : `${colors.primary}12`,
                    },
                  ]}
                >
                  <BellRing
                    color={
                      queueStatusLabel === 'Called' ||
                        queueStatusLabel === 'Department on Break'
                        ? colors.warning
                        : queueStatusLabel === 'Arrived'
                          ? colors.primary
                          : colors.primary
                    }
                    size={scaleFont(16)}
                  />
                </View>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: typography.sizes.sm,
                    flex: 1,
                    fontWeight: '600',
                  }}
                >
                  Status
                </Text>
                <Text
                  style={{
                    color:
                      queueStatusLabel === 'Called' ||
                        queueStatusLabel === 'Department on Break'
                        ? colors.warning
                        : queueStatusLabel === 'Arrived'
                          ? colors.primary
                          : colors.text,
                    fontSize: typography.sizes.md,
                    fontWeight: '800',
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
                style={{ marginTop: canCheckIn ? 0 : spacing.lg }}
              />
            )}

            {status === 'checked_in' && (
              <View
                style={[
                  styles.checkedInRow,
                  {
                    marginTop: spacing.lg,
                    backgroundColor: `${colors.primary}08`,
                    borderRadius: radius.md,
                    padding: spacing.md,
                    borderWidth: 1,
                    borderColor: `${colors.primary}20`,
                  },
                ]}
              >
                <CheckCircle2 color={colors.primary} size={scaleFont(18)} />
                <Text
                  style={{
                    color: colors.primary,
                    fontSize: typography.sizes.sm,
                    fontWeight: '700',
                    flex: 1,
                    lineHeight: 18,
                  }}
                >
                  Checked in successfully. Keep this screen open for live updates.
                </Text>
              </View>
            )}
          </Card>
        </AnimatedCard>

        {/* Details Card */}
        <AnimatedCard delay={180}>
          <Card style={{ marginBottom: spacing.xl, padding: spacing.md, borderRadius: 20 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: typography.sizes.md,
                fontWeight: '800',
                marginBottom: spacing.md,
              }}
            >
              Appointment Details
            </Text>
            <View style={{ gap: spacing.md }}>
              <View style={styles.detailRow}>
                <View
                  style={[
                    styles.detailIconPill,
                    { backgroundColor: `${colors.primary}12` },
                  ]}
                >
                  <Hash color={colors.primary} size={scaleFont(16)} />
                </View>
                <View style={styles.detailText}>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: typography.sizes.xs,
                      fontWeight: '600',
                    }}
                  >
                    Token Number
                  </Text>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: typography.sizes.md,
                      fontWeight: '700',
                      marginTop: 2,
                    }}
                  >
                    #{appointment.token_number || 'N/A'}
                  </Text>
                </View>
              </View>
              <View style={styles.detailRow}>
                <View
                  style={[
                    styles.detailIconPill,
                    { backgroundColor: `${colors.primary}12` },
                  ]}
                >
                  <Calendar color={colors.primary} size={scaleFont(16)} />
                </View>
                <View style={styles.detailText}>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: typography.sizes.xs,
                      fontWeight: '600',
                    }}
                  >
                    Date & Time
                  </Text>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: typography.sizes.md,
                      fontWeight: '700',
                      marginTop: 2,
                    }}
                  >
                    {getAppointmentDateLabel(appointment)} •{' '}
                    {getAppointmentTimeLabel(appointment)}
                  </Text>
                </View>
              </View>
              <View style={styles.detailRow}>
                <View
                  style={[
                    styles.detailIconPill,
                    { backgroundColor: `${colors.primary}12` },
                  ]}
                >
                  <MapPin color={colors.primary} size={scaleFont(16)} />
                </View>
                <View style={styles.detailText}>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: typography.sizes.xs,
                      fontWeight: '600',
                    }}
                  >
                    Clinic
                  </Text>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: typography.sizes.md,
                      fontWeight: '700',
                      marginTop: 2,
                    }}
                  >
                    {appointment.center_name}
                  </Text>
                </View>
              </View>
              {!!appointment.doctor_name && (
                <View style={styles.detailRow}>
                  <View
                    style={[
                      styles.detailIconPill,
                      { backgroundColor: `${colors.info}12` },
                    ]}
                  >
                    <Stethoscope color={colors.info} size={scaleFont(16)} />
                  </View>
                  <View style={styles.detailText}>
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: typography.sizes.xs,
                        fontWeight: '600',
                      }}
                    >
                      Doctor
                    </Text>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: typography.sizes.md,
                        fontWeight: '700',
                        marginTop: 2,
                      }}
                    >
                      {appointment.doctor_name}
                    </Text>
                  </View>
                </View>
              )}
              {status === 'cancelled' && appointment.cancel_reason && (
                <View style={styles.detailRow}>
                  <View
                    style={[
                      styles.detailIconPill,
                      { backgroundColor: `${colors.error}12` },
                    ]}
                  >
                    <Info color={colors.error} size={scaleFont(16)} />
                  </View>
                  <View style={styles.detailText}>
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: typography.sizes.xs,
                        fontWeight: '600',
                      }}
                    >
                      Cancellation Reason
                    </Text>
                    <Text
                      style={{
                        color: colors.error,
                        fontSize: typography.sizes.md,
                        fontWeight: '700',
                        marginTop: 2,
                      }}
                    >
                      {appointment.cancel_reason}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </Card>
        </AnimatedCard>
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
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  circularSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(16),
  },
  circularMeta: {
    flex: 1,
  },
  metaDataRow: {
    justifyContent: 'center',
  },
  breakBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    gap: scaleFont(10),
    paddingHorizontal: scaleFont(12),
    paddingVertical: scaleFont(10),
  },
  tokenSummary: {
    flexDirection: 'row',
    gap: scaleFont(12),
  },
  tokenBox: {
    flex: 1,
    padding: scaleFont(12),
    alignItems: 'center',
    borderRadius: 16,
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
    borderRadius: 8,
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
    borderRadius: 8,
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
    fontWeight: '700',
  },
});
