import React, { useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Pressable, ScrollView, Alert } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BellRing, Search } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import { useTabBarInset } from '../../../hooks/useTabBarInset';
import { useDoctorQueue, QueueAction } from '../hooks/useDoctorQueue';
import { QueueAppointmentRow } from '../components/QueueAppointmentRow';
import { NowServingCard } from '../components/NowServingCard';
import AppInput from '../../../components/ui/AppInput';
import AppText from '../../../components/ui/AppText';
import { AppBottomSheet } from '../../../components/ui/AppBottomSheet';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import { Skeleton } from '../../../components/ui/Skeleton';
import type { AppointmentFull, CancelReason } from '../../../types/appointment';

const cancelReasons: CancelReason[] = [
  'Patient Requested',
  'No Show',
  'Duplicate Booking',
  'Center Closed',
  'Other',
];

const FILTERS = [
  { id: 'queue', label: 'Waiting' },
  { id: 'serving', label: 'In Room' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Missed / Cancelled' },
] as const;

const EMPTY_COPY: Record<string, { title: string; subtitle: string }> = {
  queue: { title: 'Queue is clear', subtitle: 'Confirmed patients for today will appear here.' },
  checked_in: { title: 'No one checked in', subtitle: 'Patients appear here once front desk checks them in.' },
  serving: { title: 'No active consultation', subtitle: 'Call in the next patient to start.' },
  completed: { title: 'Nothing completed yet', subtitle: 'Finished consultations for today show up here.' },
  cancelled: { title: 'No missed appointments', subtitle: 'Cancelled and no-show appointments show up here.' },
};

export default function PatientsScreen() {
  const { colors, spacing, radius, motion } = useTheme();
  const tabBarInset = useTabBarInset();
  const {
    isLoading,
    isError,
    isRefetching,
    error,
    refetch,
    appointments,
    stats,
    currentPatient,
    nextPatient,
    hasActiveService,
    nextCallableAppointmentId,
    pendingAppointments,
    filteredQueueAppointments,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    cancelTarget,
    setCancelTarget,
    runActionMutation,
  } = useDoctorQueue();

  const busyActionFor = useCallback(
    (appointmentId: string): QueueAction | null =>
      runActionMutation.isPending && runActionMutation.variables?.appointment.id === appointmentId
        ? runActionMutation.variables.action
        : null,
    [runActionMutation.isPending, runActionMutation.variables],
  );

  // Calling in, confirming and completing are the doctor's routine flow and run
  // immediately with a toast. Only the actions that end an appointment for the
  // patient ask first.
  const handleAction = useCallback(
    (action: QueueAction, appointment: AppointmentFull) => {
      if (action === 'cancel') {
        setCancelTarget(appointment);
        return;
      }
      if (action === 'no_show') {
        Alert.alert(
          'Mark as No Show?',
          `${appointment.patient_name || 'This patient'} (token ${appointment.token_number ?? '—'}) will be removed from today's queue.`,
          [
            { text: 'Keep', style: 'cancel' },
            {
              text: 'Mark No Show',
              style: 'destructive',
              onPress: () => runActionMutation.mutate({ action, appointment }),
            },
          ],
        );
        return;
      }
      runActionMutation.mutate({ action, appointment });
    },
    [runActionMutation, setCancelTarget],
  );

  const counts = useMemo(
    () => ({
      waiting: appointments.filter(a => a.status === 'confirmed' || a.status === 'checked_in').length,
      done: stats?.completed ?? 0,
      pending: pendingAppointments.length,
    }),
    [appointments, pendingAppointments.length, stats?.completed],
  );

  const renderRow = useCallback(
    ({ item, index }: { item: AppointmentFull; index: number }) => (
      <Animated.View entering={FadeInDown.duration(motion.duration.normal).delay(Math.min(index, 8) * motion.stagger)}>
        <QueueAppointmentRow
          appointment={item}
          isCallBlocked={hasActiveService || item.id !== nextCallableAppointmentId}
          disabledAll={runActionMutation.isPending}
          busyAction={busyActionFor(item.id)}
          onAction={handleAction}
        />
      </Animated.View>
    ),
    [busyActionFor, handleAction, hasActiveService, motion, nextCallableAppointmentId, runActionMutation.isPending],
  );

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const header = (
    <View>
      <View style={{ marginBottom: spacing.lg }}>
        <AppText variant="heading">Today's Queue</AppText>
        <AppText variant="label" tone="secondary">
          {today}
        </AppText>
      </View>

      {!isLoading && (
        <View style={[styles.statsRow, { gap: spacing.sm, marginBottom: spacing.lg }]}>
          {[
            { label: 'Waiting', value: counts.waiting, tone: colors.primary, bg: colors.tint.primary },
            { label: 'To confirm', value: counts.pending, tone: colors.warning, bg: colors.tint.warning },
            { label: 'Completed', value: counts.done, tone: colors.success, bg: colors.tint.success },
          ].map(item => (
            <View key={item.label} style={[styles.stat, { backgroundColor: item.bg, borderRadius: radius.lg, padding: spacing.md }]}>
              <AppText variant="heading" style={{ color: item.tone }}>
                {item.value}
              </AppText>
              <AppText variant="caption" tone="secondary" weight="600">
                {item.label}
              </AppText>
            </View>
          ))}
        </View>
      )}

      {isLoading ? (
        <Card variant="elevated" padding="lg" style={{ marginBottom: spacing.lg }}>
          <Skeleton width="40%" height={14} />
          <View style={[styles.statsRow, { marginTop: spacing.md, gap: spacing.md }]}>
            <Skeleton width={88} height={72} borderRadius={radius.lg} />
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Skeleton width="70%" height={20} />
              <Skeleton width="45%" height={14} />
            </View>
          </View>
        </Card>
      ) : (
        <NowServingCard
          currentPatient={currentPatient}
          nextPatient={nextPatient}
          busyAction={busyActionFor}
          disabled={runActionMutation.isPending}
          onAction={handleAction}
        />
      )}

      {pendingAppointments.length > 0 && (
        <View style={{ marginBottom: spacing.lg }}>
          <View style={[styles.sectionTitle, { marginBottom: spacing.sm }]}>
            <BellRing size={16} color={colors.warning} />
            <AppText variant="subtitle" style={{ marginLeft: spacing.xs }}>
              Awaiting confirmation
            </AppText>
          </View>
          {pendingAppointments.map(item => (
            <QueueAppointmentRow
              key={item.id}
              appointment={item}
              isCallBlocked
              disabledAll={runActionMutation.isPending}
              busyAction={busyActionFor(item.id)}
              onAction={handleAction}
            />
          ))}
        </View>
      )}

      <AppInput
        placeholder="Search by patient, service or token"
        value={searchQuery}
        onChangeText={setSearchQuery}
        leftIcon={Search}
        autoCorrect={false}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}
      >
        {FILTERS.map(tab => {
          const selected = statusFilter === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => setStatusFilter(tab.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[
                styles.chip,
                {
                  borderRadius: radius.pill,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primary : colors.surface,
                },
              ]}
            >
              <AppText variant="label" weight="600" tone={selected ? 'onPrimary' : 'secondary'}>
                {tab.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  if (isError && appointments.length === 0) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
        <ErrorState
          title="Couldn't load your queue"
          message={error}
          fallbackMessage="Check your connection and try again."
          onRetry={() => refetch()}
        />
      </SafeAreaView>
    );
  }

  const emptyCopy = searchQuery.trim()
    ? { title: 'No matches', subtitle: 'Try a different name, service or token number.' }
    : EMPTY_COPY[statusFilter];

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={isLoading ? [] : filteredQueueAppointments}
        keyExtractor={item => item.id}
        contentContainerStyle={{
          paddingHorizontal: spacing.screen,
          paddingTop: spacing.lg,
          paddingBottom: tabBarInset + spacing.lg,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        }
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ListEmptyComponent={
          isLoading ? (
            <View style={{ gap: spacing.sm }}>
              {[0, 1, 2].map(i => (
                <Skeleton key={i} height={96} borderRadius={radius.card} />
              ))}
            </View>
          ) : (
            <EmptyState illustrationKind="queue" title={emptyCopy.title} subtitle={emptyCopy.subtitle} />
          )
        }
        renderItem={renderRow}
      />

      <AppBottomSheet
        visible={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        title="Cancel appointment"
        maxHeightPercent={0.6}
      >
        <AppText variant="body" tone="secondary" style={{ marginBottom: spacing.md }}>
          {cancelTarget
            ? `Why is ${cancelTarget.patient_name || 'this patient'}'s appointment (token ${cancelTarget.token_number ?? '—'}) being cancelled? The patient will be notified.`
            : ''}
        </AppText>
        {cancelReasons.map(reason => (
          <Pressable
            key={reason}
            disabled={runActionMutation.isPending}
            onPress={() => {
              if (cancelTarget) {
                runActionMutation.mutate({ action: 'cancel', appointment: cancelTarget, reason });
              }
            }}
            style={({ pressed }) => [
              styles.reason,
              {
                borderColor: colors.border,
                borderRadius: radius.control,
                backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
                marginBottom: spacing.sm,
              },
            ]}
          >
            <AppText variant="bodyStrong">{reason}</AppText>
          </Pressable>
        ))}
      </AppBottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
  },
  stat: {
    flex: 1,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  reason: {
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
});
