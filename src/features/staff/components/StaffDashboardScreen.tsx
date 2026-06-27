import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Alert,
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
} from 'lucide-react-native';
import AppButton from '../../../components/ui/AppButton';
import { StatusChip } from '../../../components/ui/StatusChip';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { CardFadeIn } from '../../../components/animations/CardFadeIn';
import { useAuth } from '../../../hooks/useAuth';
import { useTheme } from '../../../hooks/useTheme';
import { useStaffQueueStore } from '../../../store/staffQueueStore';
import type {
  AppointmentFull,
  AppointmentStatus,
  CancelReason,
} from '../../../types/appointment';
import { hp, scaleFont, wp } from '../../../utils/responsive';
import { staffQueueService } from '../api/staffQueueService';
import {
  getAppointmentTimeLabel,
} from '../../appointments/utils/appointmentTime';
import {
  subscribeToAppointments,
  unsubscribeAppointments,
} from '../../queue/api/queueService';
import { getAppointmentStatusState } from '../../../services/bookingService';

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
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const setStaffAppointments = useStaffQueueStore(
    state => state.setAppointments,
  );

  const [cancelTarget, setCancelTarget] = useState<AppointmentFull | null>(
    null,
  );
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
    () => appointments.some(
      appointment =>
        appointment.status === 'called' || appointment.status === 'in_progress',
    ),
    [appointments]
  );

  const nextCallableAppointmentId = useMemo(
    () => appointments.find(appointment => appointment.status === 'checked_in')?.id ??
      appointments.find(appointment => appointment.status === 'confirmed')?.id,
    [appointments]
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
    onSuccess: () => {
      setCancelTarget(null);
      queryClient.invalidateQueries({ queryKey: ['staff-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  const pendingAppointments = useMemo(
    () => appointments.filter(item => {
      const { resolvedStatus } = getAppointmentStatusState(item);
      return resolvedStatus === 'pending';
    }),
    [appointments]
  );

  const queueAppointments = useMemo(
    () => appointments.filter(item => {
      const { resolvedStatus } = getAppointmentStatusState(item);
      return ['confirmed', 'checked_in', 'called', 'in_progress'].includes(resolvedStatus);
    }),
    [appointments]
  );

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

  const renderAppointmentItem = (item: AppointmentFull, index: number, isPendingSection: boolean) => {
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
              <View style={[styles.tokenPill, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30`, borderWidth: 1 }]}>
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
                { color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: scaleFont(2) },
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
    { label: 'Total Today', value: totalToday, color: colors.primary, Icon: ClipboardList },
    { label: 'Pending', value: stats?.pending ?? 0, color: colors.warning, Icon: Clock },
    { label: 'Active Queue', value: activeQueue, color: colors.info, Icon: Users, showProgress: true },
    { label: 'Completed', value: stats?.completed ?? 0, color: colors.success, Icon: CheckCircle2 },
    { label: 'Cancelled', value: stats?.cancelled ?? 0, color: colors.error, Icon: XCircle },
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
            Staff Dashboard
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
        <AppButton
          title="Logout"
          variant="outline"
          onPress={logout}
          style={styles.logoutButton}
        />
      </View>

      {/* Card 1: Today's Stats */}
      <CardFadeIn delay={0}>
        <View style={{ marginBottom: spacing.lg }}>
          <Card variant="elevated" style={styles.cardContent}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
              <View style={[styles.cardTitleIconPill, { backgroundColor: `${colors.primary}12` }]}>
                <Activity size={scaleFont(16)} color={colors.primary} />
              </View>
              <Text
                style={[
                  styles.cardTitle,
                  { color: colors.text, fontSize: typography.sizes.lg, marginLeft: spacing.sm },
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
                      <View style={[styles.statGridIconPill, { backgroundColor: item.color + '20' }]}>
                        <Icon size={scaleFont(13)} color={item.color} />
                      </View>
                    </View>
                    <Text style={[styles.statGridValue, { color: item.color, fontSize: typography.sizes.xl }]}>
                      {item.value}
                    </Text>
                    <Text style={[styles.statGridLabel, { color: colors.textSecondary, fontSize: typography.caption }]}>
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
                { color: colors.text, fontSize: typography.sizes.lg, marginBottom: spacing.md },
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
              pendingAppointments.map((appt, idx) => renderAppointmentItem(appt, idx, true))
            )}
          </Card>
        </View>
      </CardFadeIn>

      {/* Card 3: Queue List */}
      <CardFadeIn delay={120}>
        <View style={{ marginBottom: spacing.lg }}>
          <Card variant="elevated" style={styles.cardContent}>
            <Text
              style={[
                styles.cardTitle,
                { color: colors.text, fontSize: typography.sizes.lg, marginBottom: spacing.md },
              ]}
            >
              Queue List
            </Text>
            {queueAppointments.length === 0 ? (
              <EmptyState
                Icon={Users}
                title="Queue Empty"
                subtitle="No active queue appointments today."
              />
            ) : (
              queueAppointments.map((appt, idx) => renderAppointmentItem(appt, idx, false))
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
                    backgroundColor: pressed ? colors.background : colors.surface,
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
  logoutButton: {
    minWidth: wp(24),
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
