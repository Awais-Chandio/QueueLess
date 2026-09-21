import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarOff, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import AppText from '../../../components/ui/AppText';
import { Card } from '../../../components/ui/Card';
import ErrorState from '../../../components/ui/ErrorState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { toastService } from '../../../services/toastService';
import { useDoctorAvailability, ScheduleRow } from '../hooks/useDoctorAvailability';
import { AvailabilityCard } from '../components/AvailabilityCard';
import { DayScheduleCard } from '../components/DayScheduleCard';
import { DayHoursSheet, DayHoursValue } from '../components/DayHoursSheet';
import type { AvailabilityStackParamList } from '../navigation/DoctorNavigator';
import { WEEKDAYS, WEEKDAY_ORDER, formatDateKey, parseDateKey, todayKey } from '../utils/doctorFormat';

const DEFAULT_HOURS: DayHoursValue = { start_time: '09:00:00', end_time: '17:00:00', slot_duration: 15 };

export default function AvailabilityScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<AvailabilityStackParamList>>();
  const {
    isLoading,
    isRefetching,
    error,
    isOnBreak,
    isTogglingBreak,
    schedule,
    leaves,
    bookingCounts,
    toggleBreakMode,
    saveDay,
    refresh,
  } = useDoctorAvailability();

  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const byDay = useMemo(() => {
    const map = new Map<number, ScheduleRow>();
    schedule.forEach(row => map.set(row.day_of_week, row));
    return map;
  }, [schedule]);

  const today = todayKey();
  const upcomingLeaves = leaves.filter(leave => leave.leave_date >= today);
  const workingDays = schedule.filter(row => row.is_available).length;

  const hoursFor = (day: number): DayHoursValue => {
    const row = byDay.get(day);
    return row
      ? {
          start_time: row.start_time || DEFAULT_HOURS.start_time,
          end_time: row.end_time || DEFAULT_HOURS.end_time,
          slot_duration: row.slot_duration || DEFAULT_HOURS.slot_duration,
        }
      : DEFAULT_HOURS;
  };

  const handleBreak = async (value: boolean) => {
    try {
      await toggleBreakMode(value);
      toastService.success(value ? 'Break started. Your queue shows you as on break.' : 'Welcome back. You are active again.');
    } catch (err) {
      toastService.error('Could not update break status.', err instanceof Error ? err.message : undefined);
    }
  };

  const persistDay = async (day: number, updates: DayHoursValue & { is_available: boolean }, message: string) => {
    try {
      await saveDay(day, updates);
      toastService.success(message);
      return true;
    } catch (err) {
      toastService.error(`Could not update ${WEEKDAYS[day]}.`, err instanceof Error ? err.message : undefined);
      return false;
    }
  };

  const handleToggleDay = (day: number, value: boolean) => {
    const hours = hoursFor(day);
    if (value) {
      persistDay(day, { ...hours, is_available: true }, `${WEEKDAYS[day]} is now open for booking.`);
      return;
    }

    // Closing a day does not cancel what is already booked on it — say so.
    const booked = Object.entries(bookingCounts)
      .filter(([key]) => parseDateKey(key).getDay() === day)
      .reduce((sum, [, count]) => sum + count, 0);

    const close = () =>
      persistDay(day, { ...hours, is_available: false }, `${WEEKDAYS[day]} is now marked off.`);

    if (booked > 0) {
      Alert.alert(
        `Turn off ${WEEKDAYS[day]}s?`,
        `You have ${booked} active booking${booked === 1 ? '' : 's'} on upcoming ${WEEKDAYS[day]}s. They will not be cancelled automatically — new bookings will stop.`,
        [
          { text: 'Keep open', style: 'cancel' },
          { text: 'Turn off', style: 'destructive', onPress: close },
        ],
      );
      return;
    }
    close();
  };

  const handleSaveHours = async (value: DayHoursValue) => {
    if (editingDay === null) return;
    setSaving(true);
    const ok = await persistDay(editingDay, { ...value, is_available: true }, `${WEEKDAYS[editingDay]} hours saved.`);
    setSaving(false);
    if (ok) setEditingDay(null);
  };

  if (error && schedule.length === 0) {
    return (
      <ScreenWrapper edges={['top']}>
        <ErrorState
          title="Couldn't load your availability"
          message={error}
          fallbackMessage="Check your connection and try again."
          onRetry={refresh}
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper scrollable edges={['top']} onRefresh={refresh} refreshing={isRefetching}>
      <View style={{ marginBottom: spacing.lg }}>
        <AppText variant="heading">Availability</AppText>
        <AppText variant="label" tone="secondary">
          Your live status, weekly hours and time off.
        </AppText>
      </View>

      {isLoading ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={88} borderRadius={radius.card} />
          <Skeleton height={72} borderRadius={radius.card} />
          <Skeleton height={420} borderRadius={radius.card} />
        </View>
      ) : (
        <>
          <AvailabilityCard isOnBreak={isOnBreak} busy={isTogglingBreak} onToggleBreak={handleBreak} />

          <Card
            variant="outlined"
            padding="md"
            onPress={() => navigation.navigate('LeaveManagement')}
            accessibilityLabel="Time off"
            style={{ marginBottom: spacing.lg }}
          >
            <View style={styles.row}>
              <View style={[styles.icon, { backgroundColor: colors.tint.error, borderRadius: radius.pill }]}>
                <CalendarOff size={20} color={colors.error} />
              </View>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">Time off</AppText>
                <AppText variant="caption" tone="secondary">
                  {upcomingLeaves.length === 0
                    ? 'No upcoming leave scheduled'
                    : `${upcomingLeaves.length} upcoming day${upcomingLeaves.length === 1 ? '' : 's'} · next ${formatDateKey(upcomingLeaves[0].leave_date)}`}
                </AppText>
              </View>
              <ChevronRight size={20} color={colors.textTertiary} />
            </View>
          </Card>

          <View style={[styles.sectionHeader, { marginBottom: spacing.sm }]}>
            <AppText variant="subtitle">Weekly hours</AppText>
            <AppText variant="caption" tone="secondary">
              {workingDays} working day{workingDays === 1 ? '' : 's'}
            </AppText>
          </View>
          <Card variant="elevated" padding="none" style={{ paddingHorizontal: spacing.lg }}>
            {WEEKDAY_ORDER.map((day, index) => {
              const row = byDay.get(day);
              return (
                <DayScheduleCard
                  key={day}
                  dayOfWeek={day}
                  startTime={row?.start_time}
                  endTime={row?.end_time}
                  slotDuration={row?.slot_duration}
                  isAvailable={row?.is_available ?? false}
                  isToday={new Date().getDay() === day}
                  isLast={index === WEEKDAY_ORDER.length - 1}
                  onToggle={value => handleToggleDay(day, value)}
                  onEdit={() => setEditingDay(day)}
                />
              );
            })}
          </Card>
          <AppText variant="caption" tone="tertiary" style={{ marginTop: spacing.sm }}>
            Existing appointments are not changed or cancelled when you edit your hours.
          </AppText>
        </>
      )}

      <DayHoursSheet
        dayOfWeek={editingDay}
        initial={editingDay !== null ? hoursFor(editingDay) : DEFAULT_HOURS}
        saving={saving}
        onClose={() => setEditingDay(null)}
        onSave={handleSaveHours}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
});

