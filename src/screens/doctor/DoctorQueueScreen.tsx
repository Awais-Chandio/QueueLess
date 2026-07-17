import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Alert,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
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
  LogOut,
  Calendar,
  User as UserIcon,
} from 'lucide-react-native';
import AppButton from '../../components/ui/AppButton';
import AppInput from '../../components/ui/AppInput';
import { StatusChip } from '../../components/ui/StatusChip';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import ScreenWrapper from '../../components/ui/ScreenWrapper';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { CardFadeIn } from '../../components/animations/CardFadeIn';
import { useAuth } from '../../hooks/useAuth';
import { useProfileStore } from '../../store/profileStore';
import { useTheme } from '../../hooks/useTheme';
import { useStaffQueueStore } from '../../store/queueStore';
import type {
  AppointmentFull,
  AppointmentStatus,
  CancelReason,
} from '../../types/appointment';
import { hp, scaleFont, wp } from '../../utils/responsive';
import { queueService } from '../../services/queueService';
import { centerService } from '../../services/centerService';
import { getAppointmentTimeLabel } from '../../features/appointments/utils/appointmentTime';
import { getAppointmentStatusState } from '../../services/bookingService';
import { getDisplayName } from '../../utils/getDisplayName';
import { toastService } from '../../services/toastService';

type QueueAction = 'confirm' | 'cancel' | 'start_service' | 'complete_service' | 'no_show';

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
      return ['complete_service', 'no_show'];
    default:
      return [];
  }
};

const DoctorQueueScreen = () => {
  const { colors, spacing, typography, radius } = useTheme();
  const { logout, doctorId } = useAuth();
  const navigation = useNavigation<any>();
  const profile = useProfileStore(state => state.profile);

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
    queryKey: ['staff-dashboard', 'today', doctorId],
    queryFn: () => queueService.fetchDashboard('today', doctorId),
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const appointments = useMemo(
    () => data?.appointments ?? [],
    [data?.appointments],
  );
  const stats = data?.stats;

  const nextPatient = useMemo(() => {
    const checkedIn = appointments.find(item => item.status === 'checked_in');
    if (checkedIn) return checkedIn;

    const confirmed = appointments.find(item => item.status === 'confirmed');
    if (confirmed) return confirmed;

    return null;
  }, [appointments]);

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

    const channel = queueService.subscribeToAppointments({
      channelName: `doctor-dashboard-today-${Date.now()}`,
      onChange: () => {
        queryClient.invalidateQueries({ queryKey: ['staff-dashboard', 'today', doctorId] });
      },
    });

    return () => {
      queueService.unsubscribeAppointments(channel);
    };
  }, [queryClient, isFocused, doctorId]);

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
        return queueService.confirmAppointment(appointment);
      }

      if (action === 'cancel') {
        return queueService.cancelAppointment(
          appointment,
          reason ?? 'Other',
        );
      }

      if (action === 'start_service') {
        return queueService.startService(appointment);
      }

      if (action === 'no_show') {
        return queueService.noShowAppointment(appointment);
      }

      return queueService.completeAppointment(appointment);
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
      } else if (variables.action === 'no_show') {
        successMsg = 'Appointment marked as No Show.';
      } else if (variables.action === 'complete_service') {
        successMsg = 'Appointment completed successfully.';
      }
      toastService.success(successMsg);

      queryClient.invalidateQueries({ queryKey: ['staff-dashboard', 'today', doctorId] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Action failed. Please try again.';
      toastService.error(message);
      if (message.includes('already updated')) {
        queryClient.invalidateQueries({ queryKey: ['staff-dashboard', 'today', doctorId] });
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
      }
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
      no_show: 'No Show',
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
          isCancel || action === 'no_show' ? 'danger' : action === 'confirm' ? 'primary' : 'outline'
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
            borderTopColor: colors.border + '50',
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
                    backgroundColor: `${colors.primary}10`,
                    borderColor: `${colors.primary}30`,
                    borderWidth: 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tokenText,
                    { color: colors.primary, fontSize: typography.sizes.sm },
                  ]}
                >
                  {typeof item.token_number === 'number'
                    ? `#${item.token_number}`
                    : 'No Token'}
                </Text>
              </View>
              <Text
                style={[
                  styles.patientNameText,
                  { color: colors.text, fontSize: typography.sizes.md },
                ]}
                numberOfLines={1}
              >
                {item.patient_name || 'Anonymous Patient'}
              </Text>
            </View>
            <View style={{ height: 4 }} />
            <Text
              style={[
                styles.serviceText,
                { color: colors.textSecondary, fontSize: typography.sizes.sm },
              ]}
            >
              {item.service_name || 'Consultation'}
            </Text>
          </View>
          <StatusChip
            status={resolvedStatus}
            label={statusLabel(resolvedStatus)}
          />
        </View>

        <View style={[styles.itemSubRow, { marginTop: spacing.sm }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Clock size={scaleFont(14)} color={colors.textSecondary} />
            <Text
              style={[
                styles.subRowText,
                { color: colors.textSecondary, marginLeft: spacing.xs, fontSize: typography.sizes.sm },
              ]}
            >
              {getAppointmentTimeLabel(item)}
            </Text>
          </View>
        </View>

        {/* Action Panel */}
        {actions.length > 0 && (
          <View style={[styles.actionsRow, { marginTop: spacing.md }]}>
            {actions.map(action => renderActionButton(action, item))}
          </View>
        )}
      </View>
    );
  };

  const renderStatsCard = (
    title: string,
    value: string | number,
    icon: React.ReactNode,
    color: string,
  ) => (
    <Card variant="elevated" style={styles.statsCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={[styles.statsTitle, { color: colors.textSecondary }]}>{title}</Text>
          <Text style={[styles.statsValue, { color: colors.text }]}>{value}</Text>
        </View>
        <View style={[styles.statsIconContainer, { backgroundColor: color + '15' }]}>
          {icon}
        </View>
      </View>
    </Card>
  );

  return (
    <ScreenWrapper scrollable>
      {/* Top Header */}
      <View style={[styles.header, { marginBottom: spacing.lg }]}>
        <View>
          <Text style={[styles.welcomeText, { color: colors.text }]}>
            Welcome Dr. {profile?.full_name?.split(' ')[0] || 'Doctor'}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>
            Your Practice Queue Today
          </Text>
        </View>
        
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => navigation.navigate('DoctorSchedule')}
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
          >
            <Calendar size={scaleFont(22)} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('DoctorProfile')}
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
          >
            <UserIcon size={scaleFont(22)} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={logout}
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
          >
             <LogOut size={scaleFont(22)} color={colors.error} />
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load queue.'}
          buttonTitle="Retry"
          onRetry={refetch}
        />
      ) : (
        <View>
          {/* Stats Bar */}
          <View style={[styles.statsGrid, { gap: spacing.md, marginBottom: spacing.lg }]}>
            {renderStatsCard(
              'Total Today',
              stats?.totalToday ?? 0,
              <ClipboardList size={scaleFont(20)} color={colors.primary} />,
              colors.primary,
            )}
            {renderStatsCard(
              'Active Queue',
              stats?.activeQueue ?? 0,
              <Users size={scaleFont(20)} color={colors.success} />,
              colors.success,
            )}
          </View>

          {/* Active Serving Panel */}
          {nextPatient && (
            <CardFadeIn delay={20}>
              <View style={{ marginBottom: spacing.lg }}>
                <Card variant="elevated" style={[styles.activeCard, { borderColor: colors.primary, borderWidth: 1 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
                    <Activity size={scaleFont(18)} color={colors.primary} />
                    <Text style={[styles.activeTitle, { color: colors.text, marginLeft: spacing.xs }]}>
                      Next Patient up / Active Service
                    </Text>
                  </View>
                  <View style={styles.activeDetails}>
                    <Text style={[styles.activeName, { color: colors.text }]}>
                      {nextPatient.patient_name || 'Anonymous'}
                    </Text>
                    <StatusChip status={nextPatient.status} label={statusLabel(nextPatient.status)} />
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: 4 }}>
                    Token: #{nextPatient.token_number} • {nextPatient.service_name}
                  </Text>
                  
                  {/* Immediate Actions */}
                  <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
                    {getAvailableActions(nextPatient.status).map(action => (
                      <AppButton
                        key={action}
                        title={action === 'start_service' ? 'Call Patient' : action === 'complete_service' ? 'Complete Consultation' : 'No Show'}
                        variant={action === 'no_show' ? 'danger' : 'primary'}
                        loading={runActionMutation.isPending && runActionMutation.variables?.appointment.id === nextPatient.id && runActionMutation.variables?.action === action}
                        disabled={runActionMutation.isPending}
                        style={{ flex: 1 }}
                        onPress={() => {
                          const actionTitle = action === 'start_service' ? 'Call' : action === 'complete_service' ? 'Complete' : 'No Show';
                          Alert.alert(
                            `${actionTitle} Patient`,
                            `Confirm action for ${nextPatient.patient_name}?`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Yes', onPress: () => runActionMutation.mutate({ action, appointment: nextPatient }) }
                            ]
                          );
                        }}
                      />
                    ))}
                  </View>
                </Card>
              </View>
            </CardFadeIn>
          )}

          {/* Pending Confirmations Section */}
          {pendingAppointments.length > 0 && (
            <CardFadeIn delay={40}>
              <View style={{ marginBottom: spacing.lg }}>
                <Card variant="elevated" style={styles.cardContent}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
                    <BellRing size={scaleFont(16)} color={colors.warning} />
                    <Text style={[styles.cardTitle, { color: colors.text, marginLeft: spacing.xs }]}>
                      Pending Confirmations ({pendingAppointments.length})
                    </Text>
                  </View>
                  <ScrollView style={{ maxHeight: 220 }}>
                    {pendingAppointments.map((item, idx) =>
                      renderAppointmentItem(item, idx, true),
                    )}
                  </ScrollView>
                </Card>
              </View>
            </CardFadeIn>
          )}

          {/* Core Queue List with search and filter tabs */}
          <CardFadeIn delay={60}>
            <Card variant="elevated" style={styles.cardContent}>
              <View style={styles.filterSection}>
                <AppInput
                  placeholder="Search patient, token..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  leftIcon={Search}
                />
                
                {/* Horizontal Scroll Tab Filter */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.sm }}
                >
                  {[
                    { id: 'queue', label: 'All Waiting' },
                    { id: 'checked_in', label: 'Checked In' },
                    { id: 'serving', label: 'In Progress' },
                    { id: 'completed', label: 'Completed' },
                    { id: 'cancelled', label: 'Cancelled/Skipped' },
                  ].map(tab => (
                    <Pressable
                      key={tab.id}
                      onPress={() => setStatusFilter(tab.id as any)}
                      style={({ pressed }) => [
                        styles.tabButton,
                        {
                          borderColor: statusFilter === tab.id ? colors.primary : colors.border + '50',
                          backgroundColor: statusFilter === tab.id ? colors.primary + '10' : 'transparent',
                        },
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      <Text style={{
                        color: statusFilter === tab.id ? colors.primary : colors.textSecondary,
                        fontWeight: '700',
                        fontSize: typography.sizes.sm,
                      }}>
                        {tab.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Main List */}
              <View style={{ marginTop: spacing.md }}>
                {filteredQueueAppointments.length === 0 ? (
                   <EmptyState
                    title="No Patients Found"
                    subtitle="No appointments match the filter criteria."
                  />
                ) : (
                  filteredQueueAppointments.map((item, idx) =>
                    renderAppointmentItem(item, idx, false),
                  )
                )}
              </View>
            </Card>
          </CardFadeIn>
        </View>
      )}

      {/* Cancellation Modal */}
      <Modal
        visible={cancelTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.lg }]}>
            <Text style={[styles.modalTitle, { color: colors.text, marginBottom: spacing.md }]}>
              Select Reason for Cancellation
            </Text>
            {cancelReasons.map(reason => (
              <Pressable
                key={reason}
                onPress={() => {
                  if (cancelTarget) {
                    runActionMutation.mutate({ action: 'cancel', appointment: cancelTarget, reason });
                  }
                }}
                style={({ pressed }) => [
                  styles.reasonItem,
                  { borderColor: colors.border },
                  pressed && { backgroundColor: colors.border + '30' }
                ]}
              >
                <Text style={{ color: colors.text, fontSize: typography.sizes.md }}>{reason}</Text>
              </Pressable>
            ))}
            <AppButton
              title="Close"
              variant="outline"
              onPress={() => setCancelTarget(null)}
              style={{ marginTop: spacing.md }}
            />
          </View>
        </View>
      </Modal>
    </ScreenWrapper>
  );
};

export default DoctorQueueScreen;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  welcomeText: {
    fontWeight: '800',
    fontSize: 22,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    padding: 8,
  },
  loadingContainer: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statsCard: {
    flex: 1,
    minWidth: 140,
    padding: 16,
  },
  statsTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  statsValue: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
  },
  statsIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeCard: {
    padding: 16,
  },
  activeTitle: {
    fontWeight: '700',
    fontSize: 14,
  },
  activeDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  activeName: {
    fontSize: 20,
    fontWeight: '800',
  },
  cardContent: {
    padding: 16,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: 15,
  },
  filterSection: {
    borderBottomWidth: 1.5,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 4,
  },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    borderWidth: 1.5,
  },
  itemContainer: {
    paddingVertical: 4,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemTitleWrap: {
    flex: 1,
    paddingRight: 10,
  },
  itemMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tokenPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tokenText: {
    fontWeight: '700',
  },
  patientNameText: {
    fontWeight: '700',
  },
  serviceText: {
    fontWeight: '500',
  },
  itemSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subRowText: {
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    height: 38,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  reasonItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
});
