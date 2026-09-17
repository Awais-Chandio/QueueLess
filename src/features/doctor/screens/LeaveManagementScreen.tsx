import React, { useMemo, useState } from 'react';
import { View, Pressable, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, Plus } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import AppButton from '../../../components/ui/AppButton';
import AppText from '../../../components/ui/AppText';
import { EmptyState } from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { toastService } from '../../../services/toastService';
import { useDoctorAvailability } from '../hooks/useDoctorAvailability';
import type { DoctorLeave } from '../services/doctorAvailabilityService';
import { LeaveCard, LeaveGroup } from '../components/LeaveCard';
import { RequestLeaveSheet } from '../components/RequestLeaveSheet';
import { parseDateKey, toDateKey, todayKey } from '../utils/doctorFormat';

const PAST_LIMIT = 10;

/** Collapses consecutive days with the same reason into one entry. */
const groupLeaves = (leaves: DoctorLeave[]): LeaveGroup[] => {
  const groups: LeaveGroup[] = [];
  [...leaves]
    .sort((a, b) => a.leave_date.localeCompare(b.leave_date))
    .forEach(leave => {
      const last = groups[groups.length - 1];
      if (last) {
        const next = parseDateKey(last.dates[last.dates.length - 1]);
        next.setDate(next.getDate() + 1);
        if (toDateKey(next) === leave.leave_date && (last.reason ?? '') === (leave.reason ?? '')) {
          last.ids.push(leave.id);
          last.dates.push(leave.leave_date);
          return;
        }
      }
      groups.push({ ids: [leave.id], dates: [leave.leave_date], reason: leave.reason });
    });
  return groups;
};

export default function LeaveManagementScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation();
  const {
    isLoading,
    isRefetching,
    error,
    leaves,
    bookingCounts,
    requestLeaveRange,
    isRequestingLeave,
    cancelLeaves,
    cancellingLeaveIds,
    refresh,
  } = useDoctorAvailability();

  const [sheetOpen, setSheetOpen] = useState(false);

  const today = todayKey();
  const { upcoming, past } = useMemo(() => {
    const groups = groupLeaves(leaves);
    return {
      upcoming: groups.filter(group => group.dates[group.dates.length - 1] >= today),
      past: groups.filter(group => group.dates[group.dates.length - 1] < today).reverse().slice(0, PAST_LIMIT),
    };
  }, [leaves, today]);

  const existingLeaveDates = useMemo(() => new Set(leaves.map(leave => leave.leave_date)), [leaves]);

  const handleSubmit = async (start: Date, end: Date, reason: string) => {
    try {
      const added = await requestLeaveRange(start, end, reason);
      setSheetOpen(false);
      toastService.success(added === 1 ? 'Day off added.' : `${added} days off added.`);
    } catch (err) {
      toastService.error('Could not save your time off.', err instanceof Error ? err.message : undefined);
    }
  };

  const handleCancel = (group: LeaveGroup) => {
    // Only days that have not started yet can be withdrawn; past days are history.
    const ids = group.ids.filter((_, index) => group.dates[index] >= today);
    Alert.alert(
      ids.length === 1 ? 'Cancel this day off?' : `Cancel ${ids.length} days off?`,
      'You will be shown as working on these dates again.',
      [
        { text: 'Keep leave', style: 'cancel' },
        {
          text: 'Cancel leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelLeaves(ids);
              toastService.success('Leave cancelled.');
            } catch (err) {
              toastService.error('Could not cancel leave.', err instanceof Error ? err.message : undefined);
            }
          },
        },
      ],
    );
  };

  const header = (
    <View style={[styles.header, { marginBottom: spacing.lg }]}>
      <Pressable
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        style={[styles.back, { borderRadius: radius.pill, backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <ChevronLeft size={22} color={colors.text} />
      </Pressable>
      <View style={styles.flex}>
        <AppText variant="heading">Time off</AppText>
        <AppText variant="label" tone="secondary">
          Days you are not seeing patients.
        </AppText>
      </View>
    </View>
  );

  if (error && leaves.length === 0) {
    return (
      <ScreenWrapper edges={['top']}>
        {header}
        <ErrorState title="Couldn't load your leave" message={error} onRetry={refresh} />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper scrollable edges={['top']} onRefresh={refresh} refreshing={isRefetching}>
      {header}

      <AppButton
        title="Request time off"
        leftIcon={<Plus size={18} color={colors.onPrimary} />}
        onPress={() => setSheetOpen(true)}
        disabled={isLoading}
        containerStyle={{ marginTop: 0, marginBottom: spacing.lg }}
      />

      {isLoading ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={76} borderRadius={radius.card} />
          <Skeleton height={76} borderRadius={radius.card} />
        </View>
      ) : (
        <>
          <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>
            Upcoming
          </AppText>
          {upcoming.length === 0 ? (
            <EmptyState
              illustrationKind="appointment"
              title="No time off scheduled"
              subtitle="Plan ahead so the front desk can reschedule patients."
            />
          ) : (
            upcoming.map(group => (
              <LeaveCard
                key={group.ids[0]}
                group={group}
                past={false}
                bookedCount={group.dates.reduce((sum, key) => sum + (bookingCounts[key] ?? 0), 0)}
                cancelling={group.ids.some(id => cancellingLeaveIds.includes(id))}
                onCancel={() => handleCancel(group)}
              />
            ))
          )}

          {past.length > 0 && (
            <>
              <AppText variant="subtitle" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
                Past
              </AppText>
              {past.map(group => (
                <LeaveCard key={group.ids[0]} group={group} past bookedCount={0} cancelling={false} />
              ))}
            </>
          )}
        </>
      )}

      <RequestLeaveSheet
        visible={sheetOpen}
        existingLeaveDates={existingLeaveDates}
        bookingCounts={bookingCounts}
        submitting={isRequestingLeave}
        onClose={() => setSheetOpen(false)}
        onSubmit={handleSubmit}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  back: {
    width: 40,
    height: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
