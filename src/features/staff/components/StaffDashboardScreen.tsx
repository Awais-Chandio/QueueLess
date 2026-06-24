import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Clock,
  Hourglass,
  Search,
  Users,
  XCircle,
} from 'lucide-react-native';
import AppButton from '../../../components/ui/AppButton';
import { Badge, BadgeVariant } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useAuth } from '../../../hooks/useAuth';
import { useTheme } from '../../../hooks/useTheme';
import { supabase } from '../../../lib/supabase';
import { useStaffQueueStore } from '../../../store/staffQueueStore';
import type {
  AppointmentFull,
  AppointmentStatus,
  CancelReason,
} from '../../../types/appointment';
import { hp, scaleFont, wp } from '../../../utils/responsive';
import { staffQueueService } from '../api/staffQueueService';
import type { StaffDashboardScope } from '../api/staffQueueService';

type StatusFilter =
  | 'all'
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'called'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

type QueueAction =
  | 'confirm'
  | 'cancel'
  | 'start_service'
  | 'complete_service';

const statusFilters: StatusFilter[] = [
  'all',
  'pending',
  'confirmed',
  'checked_in',
  'called',
  'in_progress',
  'completed',
  'cancelled',
];

const queueScopes: StaffDashboardScope[] = [
  'today',
  'upcoming',
  'history',
];

const cancelReasons: CancelReason[] = [
  'Patient Requested',
  'No Show',
  'Duplicate Booking',
  'Center Closed',
  'Other',
];

const statusLabel = (status: string) =>
  status
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const getStatusVariant = (status: AppointmentStatus): BadgeVariant => {
  switch (status) {
    case 'confirmed':
      return 'info';
    case 'checked_in':
      return 'success';
    case 'called':
    case 'in_progress':
      return 'warning';
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'error';
    case 'pending':
    default:
      return 'default';
  }
};

const getAvailableActions = (status: AppointmentStatus): QueueAction[] => {
  switch (status) {
    case 'pending':
      return ['confirm', 'cancel'];
    case 'confirmed':
      return ['start_service', 'complete_service', 'cancel'];
    case 'checked_in':
      return ['start_service', 'cancel'];
    case 'called':
    case 'in_progress':
      return ['complete_service'];
    default:
      return [];
  }
};

const StaffDashboardScreen = () => {
  const { colors, spacing, typography, radius } = useTheme();
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const setStaffAppointments = useStaffQueueStore(state => state.setAppointments);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('all');
  const [selectedScope, setSelectedScope] =
    useState<StaffDashboardScope>('today');
  const [cancelTarget, setCancelTarget] = useState<AppointmentFull | null>(null);

  const {
    data,
    error,
    isError,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['staff-dashboard', selectedScope],
    queryFn: () => staffQueueService.fetchDashboard(selectedScope),
    refetchInterval: 30000,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const appointments = useMemo(() => data?.appointments ?? [], [data?.appointments]);
  const stats = data?.stats;
  const hasActiveService = appointments.some(
    appointment =>
      appointment.status === 'called' ||
      appointment.status === 'in_progress',
  );
  const nextCallableAppointmentId =
    appointments.find(appointment => appointment.status === 'checked_in')?.id ??
    appointments.find(appointment => appointment.status === 'confirmed')?.id;

  useEffect(() => {
    if (appointments.length || data) {
      setStaffAppointments(appointments);
    }
  }, [appointments, data, setStaffAppointments]);

  useEffect(() => {
    const channel = supabase
      .channel('staff-dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['staff-dashboard'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const refreshDashboard = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const runActionMutation = useMutation({
    mutationFn: async ({
      action,
      appointment,
      reason,
    }: {
      action: QueueAction;
      appointment: AppointmentFull;
      reason?: CancelReason;
    }) => {
      if (action === 'confirm') {
        return staffQueueService.confirmAppointment(appointment);
      }

      if (action === 'cancel') {
        return staffQueueService.cancelAppointment(
          appointment,
          reason ?? 'Other',
        );
      }

      if (action === 'start_service') {
        return staffQueueService.startService(appointment);
      }

      return staffQueueService.completeAppointment(appointment);
    },
    onSuccess: () => {
      setCancelTarget(null);
      queryClient.invalidateQueries({ queryKey: ['staff-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  const filteredAppointments = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return appointments.filter(appointment => {
      const matchesStatus =
        selectedStatus === 'all' || appointment.status === selectedStatus;
      const token = appointment.token_number?.toString() ?? '';
      const patientName = appointment.patient_name?.toLowerCase() ?? '';
      const matchesSearch =
        !normalizedSearch ||
        patientName.includes(normalizedSearch) ||
        token.includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [appointments, searchQuery, selectedStatus]);

  const statCards = [
    {
      label:
        selectedScope === 'today'
          ? 'Total Today'
          : selectedScope === 'upcoming'
            ? 'Upcoming'
            : 'History',
      value: stats?.totalToday ?? 0,
      color: colors.primary,
      Icon: CalendarDays,
    },
    {
      label: 'Pending',
      value: stats?.pending ?? 0,
      color: colors.warning,
      Icon: Hourglass,
    },
    {
      label: 'Confirmed',
      value: stats?.confirmed ?? 0,
      color: colors.info,
      Icon: Clock,
    },
    {
      label: 'Completed',
      value: stats?.completed ?? 0,
      color: colors.success,
      Icon: CheckCircle2,
    },
    {
      label: 'Cancelled',
      value: stats?.cancelled ?? 0,
      color: colors.error,
      Icon: XCircle,
    },
    {
      label: 'Active Queue',
      value: stats?.activeQueue ?? 0,
      color: colors.primary,
      Icon: Users,
    },
  ];

  const renderActionButton = (
    action: QueueAction,
    appointment: AppointmentFull,
  ) => {
    const labels: Record<QueueAction, string> = {
      confirm: 'Confirm',
      cancel: 'Cancel',
      start_service: 'Call',
      complete_service: 'Complete',
    };

    const isCancel = action === 'cancel';
    const isCallBlocked =
      action === 'start_service' &&
      (hasActiveService || appointment.id !== nextCallableAppointmentId);
    const isBusy =
      runActionMutation.isPending &&
      runActionMutation.variables?.appointment.id === appointment.id &&
      runActionMutation.variables?.action === action;

    return (
      <AppButton
        key={action}
        title={labels[action]}
        variant={isCancel ? 'danger' : action === 'confirm' ? 'primary' : 'outline'}
        loading={isBusy}
        disabled={runActionMutation.isPending || isCallBlocked}
        style={styles.actionButton}
        textStyle={{ fontSize: typography.sizes.sm }}
        onPress={() => {
          if (isCancel) {
            setCancelTarget(appointment);
            return;
          }

          runActionMutation.mutate({ action, appointment });
        }}
      />
    );
  };

  const renderAppointment = ({ item }: { item: AppointmentFull }) => {
    const actions = getAvailableActions(item.status);

    return (
      <Card style={{ marginBottom: spacing.md }} variant="outlined">
        <View style={styles.appointmentHeader}>
          <View style={styles.appointmentTitleWrap}>
            <Text style={[styles.tokenText, { color: colors.primary, fontSize: typography.sizes.xl }]}>
              {typeof item.token_number === 'number' ? `#${item.token_number}` : 'No Token'}
            </Text>
            <Text style={[styles.patientName, { color: colors.text, fontSize: typography.sizes.md }]}>
              {item.patient_name ?? 'Patient'}
            </Text>
            <Text style={[styles.metaText, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
              {item.service_name ?? 'Service'} • {new Date(item.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <Badge label={statusLabel(item.status)} variant={getStatusVariant(item.status)} />
        </View>

        <View style={[styles.queueMetaRow, { marginTop: spacing.md }]}>
          <Text style={[styles.metaText, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
            Position: {item.current_position ?? '--'}
          </Text>
          <Text style={[styles.metaText, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
            Ahead: {item.people_ahead ?? '--'}
          </Text>
          <Text style={[styles.metaText, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
            Wait: {item.estimated_wait_mins ?? 0}m
          </Text>
        </View>

        {item.status === 'checked_in' && (
          <View
            style={[
              styles.arrivedStatus,
              {
                backgroundColor: `${colors.success}18`,
                borderColor: `${colors.success}55`,
                marginTop: spacing.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              },
            ]}
          >
            <CheckCircle2 color={colors.success} size={scaleFont(18)} />
            <Text
              style={{
                color: colors.success,
                fontSize: typography.sizes.sm,
                fontWeight: '700',
              }}
            >
              Arrived
            </Text>
          </View>
        )}

        {item.status === 'called' && (
          <View
            style={[
              styles.arrivedStatus,
              {
                backgroundColor: `${colors.info}18`,
                borderColor: `${colors.info}55`,
                marginTop: spacing.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              },
            ]}
          >
            <BellRing color={colors.info} size={scaleFont(18)} />
            <Text
              style={{
                color: colors.info,
                fontSize: typography.sizes.sm,
                fontWeight: '700',
              }}
            >
              Called
            </Text>
          </View>
        )}

        {actions.length ? (
          <View style={[styles.actionsRow, { gap: spacing.sm, marginTop: spacing.md }]}>
            {actions.map(action => renderActionButton(action, item))}
          </View>
        ) : (
          <Text style={[styles.readOnlyText, { color: colors.textSecondary, marginTop: spacing.md }]}>
            Read only
          </Text>
        )}
      </Card>
    );
  };

  if (isLoading) {
    return (
      <ScreenWrapper>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl }]}>
          Staff Dashboard
        </Text>
        <View style={{ gap: spacing.md }}>
          <Skeleton height={90} />
          <Skeleton height={90} />
          <Skeleton height={150} />
        </View>
      </ScreenWrapper>
    );
  }

  if (isError) {
    return (
      <ScreenWrapper>
        <ErrorState
          title="Dashboard Unavailable"
          message={error instanceof Error ? error.message : 'Please try again.'}
          buttonTitle="Retry"
          onRetry={refreshDashboard}
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper withPadding={false}>
      <FlatList
        data={filteredAppointments}
        keyExtractor={item => item.id}
        renderItem={renderAppointment}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            tintColor={colors.primary}
            onRefresh={refreshDashboard}
          />
        }
        contentContainerStyle={[styles.listContent, { paddingHorizontal: wp(4), paddingVertical: hp(2) }]}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View>
                <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl }]}>
                  Staff Dashboard
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.md }]}>
                  Queue control panel
                </Text>
              </View>
              <AppButton title="Logout" variant="outline" onPress={logout} style={styles.logoutButton} />
            </View>

            <View style={[styles.statsGrid, { gap: wp(3) }]}>
              {statCards.map(({ label, value, color, Icon }) => (
                <Card key={label} style={styles.statCard}>
                  <View style={styles.statHeader}>
                    <Icon color={color} size={scaleFont(20)} />
                    <Text style={[styles.statValue, { color, fontSize: typography.sizes.xl }]}>
                      {value}
                    </Text>
                  </View>
                  <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
                    {label}
                  </Text>
                </Card>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.lg, marginTop: spacing.xl }]}>
              {selectedScope === 'today'
                ? "Today's Queue"
                : selectedScope === 'upcoming'
                  ? 'Upcoming Appointments'
                  : 'Appointment History'}
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.filterRow, { gap: wp(2), marginTop: hp(1.4) }]}
            >
              {queueScopes.map(scope => {
                const selected = selectedScope === scope;
                const label =
                  scope === 'today'
                    ? 'Today'
                    : scope === 'upcoming'
                      ? 'Upcoming'
                      : 'History';

                return (
                  <Pressable
                    key={scope}
                    style={[
                      styles.filterChip,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primary : colors.surface,
                        borderRadius: radius.full,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.xs,
                      },
                    ]}
                    onPress={() => setSelectedScope(scope)}
                  >
                    <Text style={{
                      color: selected ? '#FFF' : colors.textSecondary,
                      fontSize: typography.sizes.sm,
                      fontWeight: '600',
                    }}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={[
              styles.searchBox,
              {
                borderColor: colors.border,
                borderRadius: radius.md,
                marginTop: spacing.md,
              },
            ]}>
              <Search color={colors.textSecondary} size={scaleFont(18)} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search patient or token"
                placeholderTextColor={colors.textSecondary}
                style={[styles.searchInput, { color: colors.text, fontSize: typography.sizes.md }]}
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.filterRow, { gap: wp(2), marginVertical: hp(1.6) }]}
            >
              {statusFilters.map(filter => {
                const selected = selectedStatus === filter;
                return (
                  <Pressable
                    key={filter}
                    style={[
                      styles.filterChip,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primary : colors.surface,
                        borderRadius: radius.full,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.xs,
                      },
                    ]}
                    onPress={() => setSelectedStatus(filter)}
                  >
                    <Text style={{
                      color: selected ? '#FFF' : colors.textSecondary,
                      fontSize: typography.sizes.sm,
                      fontWeight: '600',
                    }}>
                      {filter === 'all' ? 'All' : statusLabel(filter)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            Icon={AlertCircle}
            title="No Appointments"
            subtitle={
              selectedScope === 'today'
                ? 'No appointments match today or the selected filters.'
                : 'No appointments match this scope or the selected filters.'
            }
          />
        }
      />

      <Modal
        animationType="fade"
        transparent
        visible={!!cancelTarget}
        onRequestClose={() => setCancelTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg }]}>
            <Text style={[styles.modalTitle, { color: colors.text, fontSize: typography.sizes.lg }]}>
              Cancel Appointment
            </Text>
            <Text style={[styles.modalText, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
              Choose a cancellation reason.
            </Text>
            {cancelReasons.map(reason => (
              <Pressable
                key={reason}
                style={[styles.reasonButton, { borderColor: colors.border, borderRadius: radius.md, padding: spacing.md }]}
                onPress={() => {
                  if (!cancelTarget) {
                    return;
                  }

                  runActionMutation.mutate({
                    action: 'cancel',
                    appointment: cancelTarget,
                    reason,
                  });
                }}
              >
                <Text style={{ color: colors.text, fontSize: typography.sizes.md }}>
                  {reason}
                </Text>
              </Pressable>
            ))}
            <AppButton
              title="Close"
              variant="outline"
              onPress={() => setCancelTarget(null)}
              disabled={runActionMutation.isPending}
            />
          </View>
        </View>
      </Modal>

    </ScreenWrapper>
  );
};

export default StaffDashboardScreen;

const styles = StyleSheet.create({
  arrivedStatus: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: scaleFont(999),
    borderWidth: 1,
    flexDirection: 'row',
    gap: scaleFont(7),
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  actionButton: {
    flexGrow: 1,
    minWidth: '46%',
  },
  appointmentHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  appointmentTitleWrap: {
    flex: 1,
    paddingRight: wp(2),
  },
  filterChip: {
    borderWidth: 1,
  },
  filterRow: {
    paddingRight: wp(4),
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: wp(3),
    justifyContent: 'space-between',
    marginBottom: hp(2.4),
  },
  listContent: {
    flexGrow: 1,
  },
  logoutButton: {
    alignSelf: 'flex-start',
    minWidth: wp(28),
  },
  metaText: {
    lineHeight: scaleFont(20),
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: wp(5),
    paddingVertical: hp(3),
  },
  modalCard: {
    width: '100%',
    maxWidth: wp(92),
  },
  modalText: {
    marginBottom: hp(1.4),
  },
  modalTitle: {
    fontWeight: '700',
    marginBottom: hp(0.5),
  },
  patientName: {
    fontWeight: '700',
    marginTop: 2,
  },
  queueMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: wp(3),
  },
  readOnlyText: {
    fontWeight: '600',
  },
  reasonButton: {
    borderWidth: 1,
    marginTop: hp(1),
  },
  searchBox: {
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: wp(3),
  },
  searchInput: {
    flex: 1,
    minHeight: hp(5.4),
    paddingHorizontal: wp(2.5),
  },
  sectionTitle: {
    fontWeight: '700',
  },
  statCard: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  statHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statLabel: {
    marginTop: hp(0.8),
  },
  statValue: {
    fontWeight: 'bold',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  subtitle: {
    marginTop: 4,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  tokenText: {
    fontWeight: 'bold',
  },
});
