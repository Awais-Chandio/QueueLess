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
import { scaleFont } from '../../../utils/responsive';
import {
  QueueMetricsInput,
  staffQueueService,
} from '../api/staffQueueService';

type StatusFilter =
  | 'all'
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

type QueueAction =
  | 'confirm'
  | 'cancel'
  | 'check_in'
  | 'start_service'
  | 'complete_service';

const statusFilters: StatusFilter[] = [
  'all',
  'pending',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
  'cancelled',
];

const cancelReasons: CancelReason[] = [
  'Patient Requested',
  'No Show',
  'Duplicate Booking',
  'Center Closed',
  'Other',
];

const activeQueueStatuses: AppointmentStatus[] = [
  'confirmed',
  'checked_in',
  'in_progress',
];

const statusLabel = (status: string) =>
  status
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const getStatusVariant = (status: AppointmentStatus): BadgeVariant => {
  switch (status) {
    case 'confirmed':
    case 'checked_in':
      return 'info';
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

const getQueueMetrics = (
  appointment: AppointmentFull,
  appointments: AppointmentFull[],
): QueueMetricsInput => {
  const activeQueue = appointments.filter(item =>
    activeQueueStatuses.includes(item.status),
  );
  const index = activeQueue.findIndex(item => item.id === appointment.id);
  const peopleAhead = Math.max(index, 0);

  return {
    current_position: peopleAhead + 1,
    people_ahead: peopleAhead,
    estimated_wait_mins: peopleAhead * 15,
  };
};

const getAvailableActions = (status: AppointmentStatus): QueueAction[] => {
  switch (status) {
    case 'pending':
      return ['confirm', 'cancel'];
    case 'confirmed':
      return ['check_in', 'cancel'];
    case 'checked_in':
      return ['start_service'];
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
  const [cancelTarget, setCancelTarget] = useState<AppointmentFull | null>(null);
  const [queueTarget, setQueueTarget] = useState<AppointmentFull | null>(null);
  const [queuePosition, setQueuePosition] = useState('');
  const [queuePeopleAhead, setQueuePeopleAhead] = useState('');
  const [queueWait, setQueueWait] = useState('');

  const {
    data,
    error,
    isError,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['staff-dashboard'],
    queryFn: staffQueueService.fetchDashboard,
    refetchInterval: 30000,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const appointments = useMemo(() => data?.appointments ?? [], [data?.appointments]);
  const stats = data?.stats;

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
        { event: '*', schema: 'public', table: 'queue_updates' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['staff-dashboard'] });
        },
      )
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
      const queueMetrics = getQueueMetrics(appointment, appointments);

      if (action === 'confirm') {
        return staffQueueService.confirmAppointment(appointment, queueMetrics);
      }

      if (action === 'cancel') {
        return staffQueueService.cancelAppointment(
          appointment,
          reason ?? 'Other',
          queueMetrics,
        );
      }

      if (action === 'check_in') {
        return staffQueueService.checkInAppointment(appointment, queueMetrics);
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

  const updateQueueMutation = useMutation({
    mutationFn: () => {
      if (!queueTarget) {
        throw new Error('No appointment selected.');
      }

      return staffQueueService.updateQueueMetrics(queueTarget, {
        current_position: Number(queuePosition) || 0,
        people_ahead: Number(queuePeopleAhead) || 0,
        estimated_wait_mins: Number(queueWait) || 0,
      });
    },
    onSuccess: () => {
      setQueueTarget(null);
      queryClient.invalidateQueries({ queryKey: ['staff-dashboard'] });
    },
  });

  const openQueueModal = (appointment: AppointmentFull) => {
    setQueueTarget(appointment);
    setQueuePosition(String(appointment.current_position ?? ''));
    setQueuePeopleAhead(String(appointment.people_ahead ?? ''));
    setQueueWait(String(appointment.estimated_wait_mins ?? 0));
  };

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
      label: 'Total Today',
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
      check_in: 'Check In',
      start_service: 'Start Service',
      complete_service: 'Complete',
    };

    const isCancel = action === 'cancel';
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
        disabled={runActionMutation.isPending}
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

        {actions.length ? (
          <View style={[styles.actionsRow, { gap: spacing.sm, marginTop: spacing.md }]}>
            {actions.map(action => renderActionButton(action, item))}
          </View>
        ) : (
          <Text style={[styles.readOnlyText, { color: colors.textSecondary, marginTop: spacing.md }]}>
            Read only
          </Text>
        )}
        {!['completed', 'cancelled'].includes(item.status) && (
          <AppButton
            title="Update Queue"
            variant="secondary"
            onPress={() => openQueueModal(item)}
            style={styles.queueButton}
          />
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
        contentContainerStyle={[styles.listContent, { padding: spacing.lg }]}
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

            <View style={[styles.statsGrid, { gap: spacing.md }]}>
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
              Today's Queue
            </Text>

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
              contentContainerStyle={[styles.filterRow, { gap: spacing.sm, marginVertical: spacing.md }]}
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
            subtitle="No appointments match the selected filters."
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

      <Modal
        animationType="fade"
        transparent
        visible={!!queueTarget}
        onRequestClose={() => setQueueTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg }]}>
            <Text style={[styles.modalTitle, { color: colors.text, fontSize: typography.sizes.lg }]}>
              Update Queue
            </Text>
            <Text style={[styles.modalText, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
              These values update the live client queue screen.
            </Text>

            <Text style={[styles.inputLabel, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
              Current Position
            </Text>
            <TextInput
              value={queuePosition}
              keyboardType="number-pad"
              onChangeText={setQueuePosition}
              style={[styles.modalInput, { borderColor: colors.border, color: colors.text, borderRadius: radius.md }]}
            />

            <Text style={[styles.inputLabel, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
              People Ahead
            </Text>
            <TextInput
              value={queuePeopleAhead}
              keyboardType="number-pad"
              onChangeText={setQueuePeopleAhead}
              style={[styles.modalInput, { borderColor: colors.border, color: colors.text, borderRadius: radius.md }]}
            />

            <Text style={[styles.inputLabel, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
              Estimated Wait Minutes
            </Text>
            <TextInput
              value={queueWait}
              keyboardType="number-pad"
              onChangeText={setQueueWait}
              style={[styles.modalInput, { borderColor: colors.border, color: colors.text, borderRadius: radius.md }]}
            />

            <AppButton
              title="Save Queue Update"
              loading={updateQueueMutation.isPending}
              onPress={() => updateQueueMutation.mutate()}
            />
            <AppButton
              title="Close"
              variant="outline"
              onPress={() => setQueueTarget(null)}
              disabled={updateQueueMutation.isPending}
            />
          </View>
        </View>
      </Modal>
    </ScreenWrapper>
  );
};

export default StaffDashboardScreen;

const styles = StyleSheet.create({
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
    paddingRight: 8,
  },
  filterChip: {
    borderWidth: 1,
  },
  filterRow: {
    paddingRight: 16,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  listContent: {
    flexGrow: 1,
  },
  logoutButton: {
    alignSelf: 'flex-start',
    width: 110,
  },
  metaText: {
    lineHeight: 20,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
  },
  modalText: {
    marginBottom: 12,
  },
  modalTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  inputLabel: {
    fontWeight: '600',
    marginTop: 10,
  },
  modalInput: {
    borderWidth: 1,
    marginTop: 6,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  patientName: {
    fontWeight: '700',
    marginTop: 2,
  },
  queueMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  queueButton: {
    marginTop: 10,
  },
  readOnlyText: {
    fontWeight: '600',
  },
  reasonButton: {
    borderWidth: 1,
    marginTop: 8,
  },
  searchBox: {
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 10,
  },
  sectionTitle: {
    fontWeight: '700',
  },
  statCard: {
    flexBasis: '47%',
  },
  statHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statLabel: {
    marginTop: 6,
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
