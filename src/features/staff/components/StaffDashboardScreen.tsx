import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Alert,
  ScrollView,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BellRing,
  CheckCircle2,
  Users,
  Clock,
  XCircle,
  ClipboardList,
  Activity,
  Search,
  SlidersHorizontal,
  LogOut,
} from 'lucide-react-native';
import AppButton from '../../../components/ui/AppButton';
import AppInput from '../../../components/ui/AppInput';
import { StatusChip } from '../../../components/ui/StatusChip';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { CardFadeIn } from '../../../components/animations/CardFadeIn';
import { useAuth } from '../../../hooks/useAuth';
import { useProfileStore } from '../../../store/profileStore';
import { useTheme } from '../../../hooks/useTheme';
import { useStaffQueueStore } from '../../../store/staffQueueStore';
import type {
  AppointmentFull,
  AppointmentStatus,
  CancelReason,
} from '../../../types/appointment';
import { hp, scaleFont, wp } from '../../../utils/responsive';
import { staffQueueService } from '../api/staffQueueService';
import { getAppointmentTimeLabel } from '../../appointments/utils/appointmentTime';
import {
  subscribeToAppointments,
  unsubscribeAppointments,
} from '../../queue/api/queueService';
import { getAppointmentStatusState } from '../../../services/bookingService';

import { getDisplayName } from '../../../utils/getDisplayName';
import { toastService } from '../../../services/toastService';

type QueueAction = 'confirm' | 'cancel' | 'start_service' | 'complete_service';

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
  const { logout, user } = useAuth();
  const profile = useProfileStore(state => state.profile);
  const fetchProfile = useProfileStore(state => state.fetchProfile);

  useEffect(() => {
    if (user?.id && (!profile || profile.id !== user.id)) {
      fetchProfile(user.id);
    }
  }, [user?.id, profile?.id, fetchProfile]);

  const staffName = useMemo(() => {
    return getDisplayName(profile);
  }, [profile]);

  const queryClient = useQueryClient();
  const setStaffAppointments = useStaffQueueStore(
    state => state.setAppointments,
  );

  const [cancelTarget, setCancelTarget] = useState<AppointmentFull | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'queue' | 'checked_in' | 'serving' | 'completed' | 'cancelled'
  >('queue');
  const isFocused = useIsFocused();

  const { data, error, isError, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['staff-dashboard', 'today'],
    queryFn: () => staffQueueService.fetchDashboard('today'),
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const appointments = useMemo(
    () => data?.appointments ?? [],
    [data?.appointments],
  );
  const stats = data?.stats;

  const hasActiveService = useMemo(
    () =>
      appointments.some(
        appointment =>
          appointment.status === 'called' ||
          appointment.status === 'in_progress',
      ),
    [appointments],
  );

  const nextCallableAppointmentId = useMemo(
    () =>
      appointments.find(appointment => appointment.status === 'checked_in')
        ?.id ??
      appointments.find(appointment => appointment.status === 'confirmed')?.id,
    [appointments],
  );

  useEffect(() => {
    if (appointments.length || data) {
      setStaffAppointments(appointments);
    }
  }, [appointments, data, setStaffAppointments]);

  useEffect(() => {
    if (!isFocused) return;

    const channel = subscribeToAppointments({
      channelName: `staff-dashboard-today-${Date.now()}`,
      onChange: () => {
        queryClient.invalidateQueries({ queryKey: ['staff-dashboard'] });
      },
    });

    return () => {
      unsubscribeAppointments(channel);
    };
  }, [queryClient, isFocused]);

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
    onSuccess: (data, variables) => {
      setCancelTarget(null);

      let successMsg = 'Action completed successfully.';
      if (variables.action === 'confirm') {
        successMsg = 'Appointment confirmed successfully.';
      } else if (variables.action === 'cancel') {
        successMsg = 'Appointment cancelled successfully.';
      } else if (variables.action === 'start_service') {
        successMsg = 'Appointment service started.';
      } else if (variables.action === 'complete_service') {
        successMsg = 'Appointment completed successfully.';
      }
      toastService.success(successMsg);

      queryClient.invalidateQueries({ queryKey: ['staff-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Action failed. Please try again.';
      toastService.error(message);
    },
  });

  const pendingAppointments = useMemo(
    () =>
      appointments.filter(item => {
        const { resolvedStatus } = getAppointmentStatusState(item);
        return resolvedStatus === 'pending';
      }),
    [appointments],
  );

  const queueAppointments = useMemo(
    () =>
      appointments.filter(item => {
        const { resolvedStatus } = getAppointmentStatusState(item);
        return ['confirmed', 'checked_in', 'called', 'in_progress'].includes(
          resolvedStatus,
        );
      }),
    [appointments],
  );

  const filteredQueueAppointments = useMemo(() => {
    return appointments.filter(item => {
      const { resolvedStatus } = getAppointmentStatusState(item);

      // 1. Filter by status
      let matchesStatus = false;
      if (statusFilter === 'queue') {
        matchesStatus = [
          'confirmed',
          'checked_in',
          'called',
          'in_progress',
        ].includes(resolvedStatus);
      } else if (statusFilter === 'checked_in') {
        matchesStatus = resolvedStatus === 'checked_in';
      } else if (statusFilter === 'serving') {
        matchesStatus = ['called', 'in_progress'].includes(resolvedStatus);
      } else if (statusFilter === 'completed') {
        matchesStatus = resolvedStatus === 'completed';
      } else if (statusFilter === 'cancelled') {
        matchesStatus = ['cancelled', 'expired', 'no_show', 'skipped'].includes(
          resolvedStatus,
        );
      }

      if (!matchesStatus) return false;

      // 2. Filter by search query
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const patientName = item.patient_name?.toLowerCase() || '';
        const serviceName = item.service_name?.toLowerCase() || '';
        const tokenStr = item.token_number?.toString() || '';
        return (
          patientName.includes(query) ||
          serviceName.includes(query) ||
          tokenStr.includes(query)
        );
      }

      return true;
    });
  }, [appointments, statusFilter, searchQuery]);

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
        variant={
          isCancel ? 'danger' : action === 'confirm' ? 'primary' : 'outline'
        }
        loading={isBusy}
        disabled={runActionMutation.isPending || isCallBlocked}
        style={styles.actionButton}
        textStyle={{ fontSize: typography.sizes.sm }}
        onPress={() => {
          if (isCancel) {
            setCancelTarget(appointment);
            return;
          }

          const actionLabel = labels[action];
          Alert.alert(
            `${actionLabel} Appointment`,
            `Are you sure you want to ${actionLabel.toLowerCase()} this appointment?`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Yes',
                onPress: () =>
                  runActionMutation.mutate({ action, appointment }),
              },
            ],
          );
        }}
      />
    );
  };

  const renderAppointmentItem = (
    item: AppointmentFull,
    index: number,
    isPendingSection: boolean,
  ) => {
    const { resolvedStatus } = getAppointmentStatusState(item);
    const actions = getAvailableActions(resolvedStatus);

    return (
      <View
        key={item.id}
        style={[
          styles.itemContainer,
          index > 0 && {
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingTop: spacing.md,
            marginTop: spacing.md,
          },
        ]}
      >
        <View style={styles.itemHeader}>
          <View style={styles.itemTitleWrap}>
            <View style={styles.itemMainRow}>
              {/* Token badge pill */}
              <View
                style={[
                  styles.tokenPill,
                  {
                    backgroundColor: `${colors.primary}15`,
                    borderColor: `${colors.primary}30`,
                    borderWidth: 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tokenText,
                    { color: colors.primary, fontSize: typography.sizes.md },
                  ]}
                >
                  {typeof item.token_number === 'number'
                    ? `#${item.token_number}`
                    : 'No Token'}
                </Text>
              </View>
              <Text
                style={[
                  styles.patientName,
                  { color: colors.text, fontSize: typography.sizes.md },
                ]}
              >
                {item.patient_name ?? 'Patient'}
              </Text>
            </View>
            <Text
              style={[
                styles.metaText,
                {
                  color: colors.textSecondary,
                  fontSize: typography.sizes.sm,
                  marginTop: scaleFont(2),
                },
              ]}
            >
              {item.service_name ?? 'Service'} • {getAppointmentTimeLabel(item)}
            </Text>
          </View>
          {!isPendingSection && (
            <StatusChip
              status={resolvedStatus}
              label={statusLabel(resolvedStatus)}
              size="sm"
            />
          )}
        </View>

        {resolvedStatus === 'checked_in' && (
          <View
            style={[
              styles.statusAlert,
              {
                backgroundColor: `${colors.success}10`,
                borderColor: `${colors.success}30`,
                marginTop: spacing.sm,
              },
            ]}
          >
            <CheckCircle2 color={colors.success} size={scaleFont(13)} />
            <Text
              style={{
                color: colors.success,
                fontSize: typography.sizes.xs,
                fontWeight: '700',
              }}
            >
              Arrived
            </Text>
          </View>
        )}

        {resolvedStatus === 'called' && (
          <View
            style={[
              styles.statusAlert,
              {
                backgroundColor: `${colors.info}10`,
                borderColor: `${colors.info}30`,
                marginTop: spacing.sm,
              },
            ]}
          >
            <BellRing color={colors.info} size={scaleFont(13)} />
            <Text
              style={{
                color: colors.info,
                fontSize: typography.sizes.xs,
                fontWeight: '700',
              }}
            >
              Called
            </Text>
          </View>
        )}

        {actions.length > 0 && (
          <View
            style={[
              styles.actionsRow,
              { gap: spacing.sm, marginTop: spacing.md },
            ]}
          >
            {actions.map(action => renderActionButton(action, item))}
          </View>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <ScreenWrapper scrollable>
        <View style={styles.header}>
          <Text
            style={[
              styles.title,
              { color: colors.text, fontSize: typography.sizes.xxl },
            ]}
          >
            Staff Dashboard
          </Text>
        </View>
        <View style={{ gap: spacing.md }}>
          <Skeleton height={120} />
          <Skeleton height={150} />
          <Skeleton height={150} />
        </View>
      </ScreenWrapper>
    );
  }

  if (isError) {
    return (
      <ScreenWrapper scrollable>
        <ErrorState
          title="Dashboard Unavailable"
          message={error instanceof Error ? error.message : 'Please try again.'}
          buttonTitle="Retry"
          onRetry={refreshDashboard}
        />
      </ScreenWrapper>
    );
  }

  const totalToday = stats?.totalToday ?? 0;
  const activeQueue = stats?.activeQueue ?? 0;
  const queueProgress = totalToday > 0 ? activeQueue / totalToday : 0;

  const statItems = [
    {
      label: 'Total Today',
      value: totalToday,
      color: colors.primary,
      Icon: ClipboardList,
    },
    {
      label: 'Pending',
      value: stats?.pending ?? 0,
      color: colors.warning,
      Icon: Clock,
    },
    {
      label: 'Active Queue',
      value: activeQueue,
      color: colors.info,
      Icon: Users,
      showProgress: true,
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
  ];

  return (
    <ScreenWrapper
      scrollable
      onRefresh={refreshDashboard}
      refreshing={isRefetching}
    >
      <View style={styles.header}>
        <View>
          <Text
            style={[
              styles.title,
              { color: colors.text, fontSize: typography.sizes.xxl },
            ]}
          >
            Welcome, {staffName}
          </Text>
          <Text
            style={[
              styles.subtitle,
              {
                color: colors.textSecondary,
                fontSize: typography.sizes.sm,
              },
            ]}
          >
            Today's Queue Control
          </Text>
        </View>
        <Pressable
          onPress={() => {
            Alert.alert('Logout', 'Are you sure you want to logout?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Logout', style: 'destructive', onPress: logout },
            ]);
          }}
          style={({ pressed }) => [
            styles.logoutIconButton,
            {
              backgroundColor: pressed ? colors.border + '30' : 'transparent',
              borderColor: colors.border,
            },
          ]}
        >
          <LogOut color={colors.text} size={20} />
        </Pressable>
      </View>

      {/* Card 1: Today's Stats */}
      <CardFadeIn delay={0}>
        <View style={{ marginBottom: spacing.lg }}>
          <Card variant="elevated" style={styles.cardContent}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: spacing.md,
              }}
            >
              <View
                style={[
                  styles.cardTitleIconPill,
                  { backgroundColor: `${colors.primary}12` },
                ]}
              >
                <Activity size={scaleFont(16)} color={colors.primary} />
              </View>
              <Text
                style={[
                  styles.cardTitle,
                  {
                    color: colors.text,
                    fontSize: typography.sizes.lg,
                    marginLeft: spacing.sm,
                  },
                ]}
              >
                Today's Stats
              </Text>
            </View>

            <View style={styles.statsGrid}>
              {statItems.map(item => {
                const Icon = item.Icon;
                return (
                  <View
                    key={item.label}
                    style={[
                      styles.statGridItem,
                      {
                        backgroundColor: item.color + '08',
                        borderColor: item.color + '25',
                        borderRadius: scaleFont(10),
                        borderWidth: 1,
                        borderTopWidth: 3,
                        borderTopColor: item.color,
                        overflow: 'hidden',
                      },
                    ]}
                  >
                    <View style={styles.statGridHeader}>
                      <View
                        style={[
                          styles.statGridIconPill,
                          { backgroundColor: item.color + '20' },
                        ]}
                      >
                        <Icon size={scaleFont(13)} color={item.color} />
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.statGridValue,
                        { color: item.color, fontSize: typography.sizes.xl },
                      ]}
                    >
                      {item.value}
                    </Text>
                    <Text
                      style={[
                        styles.statGridLabel,
                        {
                          color: colors.textSecondary,
                          fontSize: typography.caption,
                        },
                      ]}
                    >
                      {item.label}
                    </Text>
                    {(item as any).showProgress && totalToday > 0 && (
                      <View style={{ marginTop: scaleFont(4) }}>
                        <ProgressBar
                          progress={queueProgress}
                          color={item.color}
                          height={scaleFont(3)}
                          trackColor={item.color + '20'}
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </Card>
        </View>
      </CardFadeIn>

      {/* Card 2: Pending Appointments */}
      <CardFadeIn delay={60}>
        <View style={{ marginBottom: spacing.lg }}>
          <Card variant="elevated" style={styles.cardContent}>
            <Text
              style={[
                styles.cardTitle,
                {
                  color: colors.text,
                  fontSize: typography.sizes.lg,
                  marginBottom: spacing.md,
                },
              ]}
            >
              Pending Appointments
            </Text>
            {pendingAppointments.length === 0 ? (
              <EmptyState
                Icon={ClipboardList}
                title="All Clear"
                subtitle="No pending appointments today."
              />
            ) : (
              pendingAppointments.map((appt, idx) =>
                renderAppointmentItem(appt, idx, true),
              )
            )}
          </Card>
        </View>
      </CardFadeIn>

      {/* Card 3: Queue List */}
      <CardFadeIn delay={120}>
        <View style={{ marginBottom: spacing.lg }}>
          <Card variant="elevated" style={styles.cardContent}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: spacing.md,
              }}
            >
              <Text
                style={[
                  styles.cardTitle,
                  { color: colors.text, fontSize: typography.sizes.lg },
                ]}
              >
                Queue List
              </Text>
              <View
                style={[
                  styles.cardTitleIconPill,
                  {
                    backgroundColor: `${colors.textSecondary}12`,
                    width: scaleFont(32),
                    height: scaleFont(32),
                  },
                ]}
              >
                <Clock size={scaleFont(16)} color={colors.textSecondary} />
              </View>
            </View>

            {/* Search Input */}
            <View style={{ marginBottom: spacing.md }}>
              <AppInput
                placeholder="Search patient, service, or token..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                leftIcon={Search}
              />
            </View>

            {/* Status Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ maxHeight: scaleFont(44), marginBottom: spacing.md }}
              contentContainerStyle={{
                gap: spacing.sm,
                paddingRight: spacing.lg,
              }}
            >
              {[
                {
                  key: 'queue' as const,
                  label: 'Active Queue',
                  color: colors.primary,
                },
                {
                  key: 'checked_in' as const,
                  label: 'Checked In',
                  color: colors.success,
                },
                {
                  key: 'serving' as const,
                  label: 'Serving',
                  color: colors.warning,
                },
                {
                  key: 'completed' as const,
                  label: 'Completed',
                  color: colors.info,
                },
                {
                  key: 'cancelled' as const,
                  label: 'Cancelled',
                  color: colors.error,
                },
              ].map(filter => {
                const isSelected = statusFilter === filter.key;
                const filterColor = filter.color;
                return (
                  <Pressable
                    key={filter.key}
                    onPress={() => setStatusFilter(filter.key)}
                    style={({ pressed }) => [
                      {
                        borderColor: isSelected ? filterColor : colors.border,
                        backgroundColor: isSelected
                          ? filterColor + '15'
                          : colors.surface,
                        borderRadius: radius.full,
                        borderWidth: 1,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.xs,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: scaleFont(5),
                        height: scaleFont(30),
                      },
                      pressed && { opacity: 0.75 },
                    ]}
                  >
                    <View
                      style={{
                        width: scaleFont(6),
                        height: scaleFont(6),
                        borderRadius: scaleFont(3),
                        backgroundColor: isSelected
                          ? filterColor
                          : colors.textSecondary + '60',
                      }}
                    />
                    <Text
                      style={{
                        color: isSelected ? filterColor : colors.textSecondary,
                        fontSize: typography.sizes.sm,
                        fontWeight: isSelected ? '700' : '500',
                      }}
                    >
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {filteredQueueAppointments.length === 0 ? (
              <EmptyState
                Icon={Search}
                title={appointments.length === 0 ? 'Queue Empty' : 'No Results'}
                subtitle={
                  appointments.length === 0
                    ? 'No active queue appointments today.'
                    : 'No matching appointments found.'
                }
              />
            ) : (
              filteredQueueAppointments.map((appt, idx) =>
                renderAppointmentItem(appt, idx, false),
              )
            )}
          </Card>
        </View>
      </CardFadeIn>

      <Modal
        animationType="fade"
        transparent
        visible={!!cancelTarget}
        onRequestClose={() => setCancelTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderRadius: radius.lg,
                padding: spacing.lg,
              },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: colors.text, fontSize: typography.sizes.lg },
              ]}
            >
              Cancel Appointment
            </Text>
            <Text
              style={[
                styles.modalText,
                { color: colors.textSecondary, fontSize: typography.sizes.sm },
              ]}
            >
              Choose a cancellation reason.
            </Text>
            {cancelReasons.map(reason => (
              <Pressable
                key={reason}
                style={({ pressed }) => [
                  styles.reasonButton,
                  {
                    borderColor: colors.border,
                    borderRadius: radius.md,
                    padding: spacing.md,
                    backgroundColor: pressed
                      ? colors.background
                      : colors.surface,
                  },
                ]}
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
                <Text
                  style={{ color: colors.text, fontSize: typography.sizes.md }}
                >
                  {reason}
                </Text>
              </Pressable>
            ))}
            <AppButton
              title="Close"
              variant="outline"
              onPress={() => setCancelTarget(null)}
              disabled={runActionMutation.isPending}
              style={{ marginTop: spacing.md }}
            />
          </View>
        </View>
      </Modal>
    </ScreenWrapper>
  );
};

export default StaffDashboardScreen;

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: hp(2.4),
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 2,
  },
  subtitle: {
    fontWeight: '500',
  },
  logoutIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    padding: wp(4),
  },
  cardTitle: {
    fontWeight: '700',
  },
  cardTitleIconPill: {
    width: scaleFont(30),
    height: scaleFont(30),
    borderRadius: scaleFont(15),
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: wp(2),
  },
  statGridItem: {
    flexBasis: '30%',
    flexGrow: 1,
    paddingHorizontal: wp(2.5),
    paddingVertical: hp(1),
  },
  statGridHeader: {
    alignItems: 'flex-start',
    marginBottom: scaleFont(4),
  },
  statGridIconPill: {
    width: scaleFont(26),
    height: scaleFont(26),
    borderRadius: scaleFont(13),
    alignItems: 'center',
    justifyContent: 'center',
  },
  statGridValue: {
    fontWeight: 'bold',
  },
  statGridLabel: {
    fontWeight: '500',
    marginTop: scaleFont(2),
  },
  itemContainer: {
    flexDirection: 'column',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemTitleWrap: {
    flex: 1,
    paddingRight: wp(2),
  },
  itemMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(8),
  },
  tokenPill: {
    borderRadius: scaleFont(6),
    paddingHorizontal: scaleFont(8),
    paddingVertical: scaleFont(3),
  },
  tokenText: {
    fontWeight: 'bold',
  },
  patientName: {
    fontWeight: '700',
  },
  metaText: {
    fontWeight: '500',
  },
  statusAlert: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: scaleFont(999),
    borderWidth: 1,
    flexDirection: 'row',
    gap: scaleFont(5),
    paddingHorizontal: wp(2.5),
    paddingVertical: hp(0.4),
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  actionButton: {
    flexGrow: 1,
    minWidth: '45%',
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
  reasonButton: {
    borderWidth: 1,
    marginBottom: hp(1),
  },
});
