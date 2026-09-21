import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { ArrowRight, CalendarClock, CalendarOff, CheckCircle2, Clock, Coffee, Users, Wallet } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import AppButton from '../../../components/ui/AppButton';
import AppText from '../../../components/ui/AppText';
import { Card } from '../../../components/ui/Card';
import { StatusChip } from '../../../components/ui/StatusChip';
import ErrorState from '../../../components/ui/ErrorState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { CardFadeIn } from '../../../components/animations/CardFadeIn';
import type { AppointmentStatus } from '../../../types/appointment';
import { useDoctorDashboard } from '../hooks/useDoctorDashboard';
import { useDoctorAvailability } from '../hooks/useDoctorAvailability';
import type { DoctorTabParamList } from '../navigation/DoctorNavigator';
import { doctorDisplayName, formatDateKey, formatTime12h, greetingForHour, todayKey } from '../utils/doctorFormat';

const WAITING: string[] = ['confirmed', 'checked_in'];
const IN_ROOM: string[] = ['called', 'in_progress'];

const statusLabel = (status: string) =>
  status
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export default function DashboardScreen() {
  console.log('[TMP] Dashboard render');
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<BottomTabNavigationProp<DoctorTabParamList>>();
  const { isLoading, isRefetching, error, doctorProfile, todayAppointments, recentPatients, incomeSummary, refresh } =
    useDoctorDashboard();
  const { schedule, leaves, isOnBreak } = useDoctorAvailability();

  const counts = useMemo(
    () => ({
      booked: todayAppointments.filter(a => a.status !== 'cancelled').length,
      waiting: todayAppointments.filter(a => WAITING.includes(a.status)).length,
      inRoom: todayAppointments.filter(a => IN_ROOM.includes(a.status)).length,
      pending: todayAppointments.filter(a => a.status === 'pending').length,
    }),
    [todayAppointments],
  );

  // Today's hours come from doctor_schedules including is_available and leave;
  // the old card used get_doctor_schedule, which has neither, so days off and
  // leave days still showed working hours.
  const today = todayKey();
  const todayRow = schedule.find(row => row.day_of_week === new Date().getDay());
  const onLeaveToday = leaves.some(leave => leave.leave_date === today);

  if (error && !doctorProfile) {
    return (
      <ScreenWrapper edges={['top']}>
        <ErrorState title="Couldn't load your dashboard" message={error} onRetry={refresh} />
      </ScreenWrapper>
    );
  }

  const stats: { label: string; value: string | number; icon: LucideIcon; tone: string; tint: string }[] = [
    { label: 'Booked today', value: counts.booked, icon: Users, tone: colors.primary, tint: colors.tint.primary },
    { label: 'Waiting', value: counts.waiting, icon: Clock, tone: colors.warning, tint: colors.tint.warning },
    {
      label: 'Completed',
      value: incomeSummary?.completed_count ?? 0,
      icon: CheckCircle2,
      tone: colors.success,
      tint: colors.tint.success,
    },
    {
      label: "Today's earnings",
      value: `Rs. ${Number(incomeSummary?.total_fee ?? 0).toLocaleString()}`,
      icon: Wallet,
      tone: colors.info,
      tint: colors.tint.info,
    },
  ];

  return (
    <ScreenWrapper scrollable edges={['top']} onRefresh={refresh} refreshing={isRefetching}>
      <View style={[styles.header, { marginBottom: spacing.lg }]}>
        <View style={styles.flex}>
          <AppText variant="label" tone="secondary">
            {greetingForHour()}
          </AppText>
          {isLoading || !doctorProfile ? (
            <Skeleton width="70%" height={28} style={{ marginTop: 4 }} />
          ) : (
            <AppText variant="heading" numberOfLines={1}>
              {doctorDisplayName(doctorProfile.name)}
            </AppText>
          )}
          <AppText variant="caption" tone="tertiary">
            {formatDateKey(today, { weekday: 'long', month: 'long', day: 'numeric' })}
          </AppText>
        </View>
        {isOnBreak ? <StatusChip status="doctor_on_break" label="On break" /> : null}
      </View>

      {isLoading ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={150} borderRadius={radius.card} />
          <Skeleton height={200} borderRadius={radius.card} />
          <Skeleton height={80} borderRadius={radius.card} />
        </View>
      ) : (
        <>
          <CardFadeIn>
            <Card variant="gradient" gradientColors={colors.gradients.primary} padding="lg" style={{ marginBottom: spacing.lg }}>
              <AppText variant="label" tone="onPrimary" weight="600" style={styles.soft}>
                {counts.inRoom > 0 ? 'CONSULTATION IN PROGRESS' : 'YOUR QUEUE'}
              </AppText>
              <AppText variant="display" tone="onPrimary" style={{ marginTop: spacing.xs }}>
                {counts.waiting} waiting
              </AppText>
              <AppText variant="label" tone="onPrimary" style={styles.soft}>
                {counts.inRoom > 0 ? `${counts.inRoom} in the room · ` : ''}
                {counts.pending > 0 ? `${counts.pending} to confirm` : 'No bookings awaiting confirmation'}
              </AppText>
              <AppButton
                title="Open queue"
                variant="secondary"
                rightIcon={<ArrowRight size={18} color={colors.primary} />}
                containerStyle={{ marginTop: spacing.lg }}
                onPress={() => navigation.navigate('Patients')}
              />
            </Card>
          </CardFadeIn>

          <View style={[styles.grid, { gap: spacing.sm, marginBottom: spacing.lg }]}>
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <CardFadeIn key={stat.label} delay={(index + 1) * 45} style={styles.gridItem}>
                  <Card variant="outlined" padding="md">
                    <View style={[styles.statIcon, { backgroundColor: stat.tint, borderRadius: radius.md }]}>
                      <Icon size={18} color={stat.tone} />
                    </View>
                    <AppText variant="section" numberOfLines={1} style={{ marginTop: spacing.sm }}>
                      {stat.value}
                    </AppText>
                    <AppText variant="caption" tone="secondary">
                      {stat.label}
                    </AppText>
                  </Card>
                </CardFadeIn>
              );
            })}
          </View>

          <Card
            variant="outlined"
            padding="md"
            onPress={() => navigation.navigate('Schedule')}
            accessibilityLabel="Today's hours, open schedule"
            style={{ marginBottom: spacing.lg }}
          >
            <View style={styles.row}>
              <View
                style={[
                  styles.statIcon,
                  {
                    borderRadius: radius.md,
                    backgroundColor: onLeaveToday ? colors.tint.error : colors.tint.primary,
                  },
                ]}
              >
                {onLeaveToday ? (
                  <CalendarOff size={18} color={colors.error} />
                ) : isOnBreak ? (
                  <Coffee size={18} color={colors.warning} />
                ) : (
                  <CalendarClock size={18} color={colors.primary} />
                )}
              </View>
              <View style={[styles.flex, { marginLeft: spacing.md }]}>
                <AppText variant="caption" tone="secondary">
                  Today's hours
                </AppText>
                <AppText variant="bodyStrong">
                  {onLeaveToday
                    ? 'On leave today'
                    : todayRow?.is_available
                      ? `${formatTime12h(todayRow.start_time)} – ${formatTime12h(todayRow.end_time)} · ${todayRow.slot_duration} min slots`
                      : 'Day off'}
                </AppText>
              </View>
              <ArrowRight size={18} color={colors.textTertiary} />
            </View>
          </Card>

          <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>
            Recent patients
          </AppText>
          <Card variant="outlined" padding="none" style={{ paddingHorizontal: spacing.lg }}>
            {recentPatients.length === 0 ? (
              <AppText variant="body" tone="secondary" style={{ paddingVertical: spacing.lg }}>
                Patients you see will appear here.
              </AppText>
            ) : (
              recentPatients.slice(0, 6).map((patient, index) => (
                <View
                  key={`${patient.patient_name}-${patient.last_appointment_date}-${index}`}
                  style={[
                    styles.row,
                    {
                      paddingVertical: spacing.md,
                      borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderTopColor: colors.divider,
                    },
                  ]}
                >
                  <View style={[styles.initial, { backgroundColor: colors.tint.primary, borderRadius: radius.pill }]}>
                    <AppText variant="label" tone="brand" weight="700">
                      {(patient.patient_name || '?').charAt(0).toUpperCase()}
                    </AppText>
                  </View>
                  <View style={[styles.flex, { marginLeft: spacing.md }]}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {patient.patient_name}
                    </AppText>
                    <AppText variant="caption" tone="secondary">
                      Last visit {formatDateKey(patient.last_appointment_date, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </AppText>
                  </View>
                  <StatusChip status={patient.status as AppointmentStatus} label={statusLabel(patient.status)} />
                </View>
              ))
            )}
          </Card>
        </>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  soft: {
    opacity: 0.85,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    width: '48.5%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
