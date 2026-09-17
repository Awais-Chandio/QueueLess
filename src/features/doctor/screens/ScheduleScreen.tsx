import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CalendarOff, Users } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import { CardFadeIn } from '../../../components/animations/CardFadeIn';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import AppText from '../../../components/ui/AppText';
import AppButton from '../../../components/ui/AppButton';
import { Card } from '../../../components/ui/Card';
import ErrorState from '../../../components/ui/ErrorState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useDoctorAvailability } from '../hooks/useDoctorAvailability';
import type { DoctorTabParamList } from '../navigation/DoctorNavigator';
import { formatTime12h, toDateKey } from '../utils/doctorFormat';

const DAYS_AHEAD = 14;

type AgendaDay = {
  key: string;
  date: Date;
  state: 'working' | 'off' | 'leave';
  hours?: string;
  leaveReason?: string | null;
  booked: number;
};

/**
 * The next two weeks as a doctor actually plans them: which dates they work,
 * which are off or on leave, and how many patients are already booked.
 *
 * This tab used to repeat the weekly hours from Availability as a read-only
 * list, and it ignored `is_available`, so days switched off still showed hours.
 */
export default function ScheduleScreen() {
  const { colors, spacing, radius, motion } = useTheme();
  const navigation = useNavigation<BottomTabNavigationProp<DoctorTabParamList>>();
  const { isLoading, isRefetching, error, schedule, leaves, bookingCounts, refresh } = useDoctorAvailability();

  const agenda = useMemo<AgendaDay[]>(() => {
    const leaveByDate = new Map(leaves.map(leave => [leave.leave_date, leave]));
    const scheduleByDay = new Map(schedule.map(row => [row.day_of_week, row]));
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    return Array.from({ length: DAYS_AHEAD }, (_, offset) => {
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      const key = toDateKey(date);
      const leave = leaveByDate.get(key);
      const row = scheduleByDay.get(date.getDay());
      const booked = bookingCounts[key] ?? 0;

      if (leave) return { key, date, state: 'leave', leaveReason: leave.reason, booked };
      if (row?.is_available) {
        return {
          key,
          date,
          state: 'working',
          hours: `${formatTime12h(row.start_time)} – ${formatTime12h(row.end_time)}`,
          booked,
        };
      }
      return { key, date, state: 'off', booked };
    });
  }, [bookingCounts, leaves, schedule]);

  const totals = useMemo(
    () => ({
      working: agenda.filter(day => day.state === 'working').length,
      booked: agenda.reduce((sum, day) => sum + day.booked, 0),
      leave: agenda.filter(day => day.state === 'leave').length,
    }),
    [agenda],
  );

  if (error && schedule.length === 0) {
    return (
      <ScreenWrapper edges={['top']}>
        <ErrorState title="Couldn't load your schedule" message={error} onRetry={refresh} />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper scrollable edges={['top']} onRefresh={refresh} refreshing={isRefetching}>
      <View style={{ marginBottom: spacing.lg }}>
        <AppText variant="heading">Schedule</AppText>
        <AppText variant="label" tone="secondary">
          Your next two weeks at a glance.
        </AppText>
      </View>

      {isLoading ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={72} borderRadius={radius.card} />
          {[0, 1, 2, 3, 4].map(i => (
            <Skeleton key={i} height={64} borderRadius={radius.card} />
          ))}
        </View>
      ) : (
        <>
          <View style={[styles.totals, { gap: spacing.sm, marginBottom: spacing.lg }]}>
            {[
              { label: 'Working days', value: totals.working, color: colors.primary, bg: colors.tint.primary },
              { label: 'Booked patients', value: totals.booked, color: colors.success, bg: colors.tint.success },
              { label: 'Leave days', value: totals.leave, color: colors.error, bg: colors.tint.error },
            ].map(item => (
              <View key={item.label} style={[styles.total, { backgroundColor: item.bg, borderRadius: radius.lg, padding: spacing.md }]}>
                <AppText variant="heading" style={{ color: item.color }}>
                  {item.value}
                </AppText>
                <AppText variant="caption" tone="secondary" weight="600">
                  {item.label}
                </AppText>
              </View>
            ))}
          </View>

          {agenda.map((day, index) => {
            const isToday = index === 0;
            const accent =
              day.state === 'working' ? colors.primary : day.state === 'leave' ? colors.error : colors.textTertiary;
            return (
              <CardFadeIn key={day.key} delay={Math.min(index, 8) * motion.stagger}>
                <Card
                  variant={isToday ? 'elevated' : 'outlined'}
                  padding="md"
                  // Only override the border for today. Passing undefined border
                  // props over the outlined variant clipped the card's content
                  // to nothing on Android (Fabric + overflow hidden).
                  style={
                    isToday
                      ? { marginBottom: spacing.sm, borderColor: colors.primary, borderWidth: 1 }
                      : { marginBottom: spacing.sm }
                  }
                >
                  <View style={styles.row}>
                    <View style={[styles.dateBlock, { borderRadius: radius.md, backgroundColor: isToday ? colors.primary : colors.surfaceSunken }]}>
                      <AppText variant="caption" weight="600" tone={isToday ? 'onPrimary' : 'secondary'}>
                        {day.date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
                      </AppText>
                      <AppText variant="subtitle" weight="800" tone={isToday ? 'onPrimary' : 'primary'}>
                        {day.date.getDate()}
                      </AppText>
                    </View>

                    <View style={styles.flex}>
                      <AppText variant="bodyStrong" style={{ color: day.state === 'working' ? colors.text : accent }}>
                        {day.state === 'working' ? day.hours : day.state === 'leave' ? 'On leave' : 'Day off'}
                      </AppText>
                      <AppText variant="caption" tone="secondary" numberOfLines={1}>
                        {isToday ? 'Today · ' : ''}
                        {day.state === 'leave'
                          ? day.leaveReason || 'Time off'
                          : day.date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
                      </AppText>
                    </View>

                    {day.booked > 0 ? (
                      <View
                        style={[
                          styles.booked,
                          {
                            borderRadius: radius.pill,
                            backgroundColor: day.state === 'working' ? colors.tint.success : colors.tint.warning,
                          },
                        ]}
                      >
                        <Users size={12} color={day.state === 'working' ? colors.success : colors.warning} />
                        <AppText
                          variant="caption"
                          weight="600"
                          tone={day.state === 'working' ? 'success' : 'warning'}
                          style={{ marginLeft: 4 }}
                        >
                          {day.booked}
                        </AppText>
                      </View>
                    ) : day.state !== 'working' ? (
                      <CalendarOff size={16} color={colors.textTertiary} />
                    ) : null}
                  </View>
                </Card>
              </CardFadeIn>
            );
          })}

          <AppButton
            title="Edit hours & time off"
            variant="outline"
            onPress={() => navigation.navigate('Availability')}
            containerStyle={{ marginTop: spacing.sm }}
          />
        </>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  totals: {
    flexDirection: 'row',
  },
  total: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateBlock: {
    width: 52,
    paddingVertical: 6,
    alignItems: 'center',
    marginRight: 12,
  },
  booked: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});
