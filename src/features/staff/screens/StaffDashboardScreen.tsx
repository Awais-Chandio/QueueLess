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
} from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Clock,
  ClipboardList,
  Search,
  Coffee,
  ClipboardCheck,
  CheckCircle2,
  MapPin,
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
import { useStaffQueueStore } from '../../../store/queueStore';
import type {
  AppointmentFull,
  CancelReason,
} from '../../../types/appointment';
import { hp, scaleFont, wp } from '../../../utils/responsive';
import { buildStats, getStaffCenterIds, queueService } from '../../../services/queueService';
import { centerService } from '../../../services/centerService';
import { getAppointmentStatusState } from '../../../services/bookingService';
import { getDisplayName } from '../../../utils/getDisplayName';
import { toastService } from '../../../services/toastService';
import { AppointmentRow } from '../components/AppointmentRow';
import StaffLogoutButton from '../components/StaffLogoutButton';
import type { StaffStackParamList } from '../navigation/StaffNavigator';

// Staff never complete a visit -- only the assigned doctor can (see the
// restrict_appointment_completion_to_doctor migration).
export type QueueAction = 'confirm' | 'cancel' | 'start_service' | 'no_show';

const cancelReasons: CancelReason[] = [
  'Patient Requested',
  'No Show',
  'Duplicate Booking',
  'Center Closed',
  'Other',
];

const StaffDashboardScreen = () => {
  const { colors, spacing, typography, radius } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<StaffStackParamList>>();
  const profile = useProfileStore(state => state.profile);
  const fetchProfile = useProfileStore(state => state.fetchProfile);

  useEffect(() => {
    if (user?.id && (!profile || profile.id !== user.id)) {
      fetchProfile(user.id);
    }
  }, [user?.id, profile, fetchProfile]);

  // staff_centers is the source of truth for which centers this staff member runs.
  const { data: assignedCenters = [], isLoading: centersLoading } = useQuery({
    queryKey: ['staff-centers', user?.id],
    enabled: !!user?.id && profile?.role === 'staff',
    queryFn: async () => {
      const centerIds = await getStaffCenterIds(user!.id);
      const centers = await Promise.all(centerIds.map(id => centerService.getCenterById(id)));
      return centers
        .map(center => ({ id: center.id, name: center.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);

  useEffect(() => {
    if (!assignedCenters.some(center => center.id === selectedCenterId)) {
      setSelectedCenterId(assignedCenters[0]?.id ?? null);
    }
  }, [assignedCenters, selectedCenterId]);

  const centerName = assignedCenters.find(center => center.id === selectedCenterId)?.name ?? null;

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

  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const [doctorSettings, setDoctorSettings] = useState<any>(null);

  const loadCenterSettings = useCallback(async () => {
    if (!selectedCenterId) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const settings = await queueService.fetchCenterSettings(selectedCenterId, todayStr);
      setDoctorSettings(settings);
    } catch (err) {
      console.warn('Failed to load center settings:', err);
    }
  }, [selectedCenterId]);

  useEffect(() => {
    loadCenterSettings();
  }, [loadCenterSettings]);

  const handleToggleBreak = async () => {
    if (!selectedCenterId) return;
    try {
      const nextBreakState = !doctorSettings?.is_on_break;
      const start = nextBreakState ? new Date().toISOString() : null;
      const end = nextBreakState ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null;
      const todayStr = new Date().toISOString().split('T')[0];

      const updated = await queueService.setCenterBreak(
        selectedCenterId,
        todayStr,
        nextBreakState,
        start,
        end,
      );
      setDoctorSettings(updated);
      toastService.success(nextBreakState ? 'Center queue is now on break.' : 'Center queue is back from break.');
      queryClient.invalidateQueries({ queryKey: ['staff-dashboard'] });
    } catch (err: any) {
      toastService.error(err.message || 'Failed to update break settings.');
    }
  };

  const handleUpdateAvgTime = async (mins: number) => {
    if (!selectedCenterId) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const updated = await queueService.updateCenterAverageConsultationTime(
        selectedCenterId,
        todayStr,
        mins,
      );
      setDoctorSettings(updated);
      toastService.success(`Average consultation time updated to ${mins} mins.`);
      queryClient.invalidateQueries({ queryKey: ['staff-dashboard'] });
    } catch (err: any) {
      toastService.error(err.message || 'Failed to update average time.');
    }
  };

  const { data, error, isError, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['staff-dashboard', 'today'],
    queryFn: () => queueService.fetchDashboard('today'),
    refetchOnMount: 'always',
    staleTime: 0,
  });

  // The server already limits staff to all assigned centers; narrow to the one being managed.
  const appointments = useMemo(
    () =>
      (data?.appointments ?? []).filter(
        item => !selectedCenterId || item.center_id === selectedCenterId,
      ),
    [data?.appointments, selectedCenterId],
  );
  const stats = useMemo(() => (data ? buildStats(appointments) : undefined), [appointments, data]);

  const uniqueDoctors = useMemo(() => {
    const map = new Map<string, string>();
    appointments.forEach(item => {
      if (item.doctor_id) {
        map.set(item.doctor_id, item.doctor_name || 'Doctor');
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [appointments]);

  const getNextPatientToCall = () => {
    const list = selectedDoctorId
      ? appointments.filter(item => item.doctor_id === selectedDoctorId)
      : appointments;

    const checkedIn = list.find(item => item.status === 'checked_in');
    if (checkedIn) return checkedIn;

    const confirmed = list.find(item => item.status === 'confirmed');
    if (confirmed) return confirmed;

    return null;
  };

  const nextPatient = getNextPatientToCall();

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
      channelName: `staff-dashboard-today-${Date.now()}`,
      onChange: () => {
        queryClient.invalidateQueries({ queryKey: ['staff-dashboard'] });
      },
    });

    return () => {
      queueService.unsubscribeAppointments(channel);
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
        return queueService.confirmAppointment(appointment);
      }

      if (action === 'cancel') {
        return queueService.cancelAppointment(
          appointment,
          reason ?? 'Other',
        );
      }

      if (action === 'no_show') {
        return queueService.noShowAppointment(appointment);
      }

      return queueService.startService(appointment);
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
      }
      toastService.success(successMsg);

      queryClient.invalidateQueries({ queryKey: ['staff-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Action failed. Please try again.';
      toastService.error(message);
      if (message.includes('already updated')) {
        queryClient.invalidateQueries({ queryKey: ['staff-dashboard'] });
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
      // 0. Filter by doctor
      if (selectedDoctorId && item.doctor_id !== selectedDoctorId) {
        return false;
      }

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
  }, [appointments, statusFilter, searchQuery, selectedDoctorId]);

  const confirmAction = useCallback(
    (action: QueueAction, appointment: AppointmentFull) => {
      const labels: Record<QueueAction, string> = {
        confirm: 'Confirm',
        cancel: 'Cancel',
        start_service: 'Call',
        no_show: 'No Show',
      };
      const actionLabel = labels[action];
      Alert.alert(
        `${actionLabel} Appointment`,
        `Are you sure you want to ${actionLabel.toLowerCase()} this appointment?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Yes', onPress: () => runActionMutation.mutate({ action, appointment }) },
        ],
      );
    },
    [runActionMutation],
  );

  const handleConfirm = useCallback(
    (appointment: AppointmentFull) => confirmAction('confirm', appointment),
    [confirmAction],
  );
  const handleCancel = useCallback(
    (appointment: AppointmentFull) => setCancelTarget(appointment),
    [],
  );
  const handleCall = useCallback(
    (appointment: AppointmentFull) => confirmAction('start_service', appointment),
    [confirmAction],
  );
  const handleNoShow = useCallback(
    (appointment: AppointmentFull) => confirmAction('no_show', appointment),
    [confirmAction],
  );

  const busyActionFor = (appointmentId: string): QueueAction | null => {
    if (
      runActionMutation.isPending &&
      runActionMutation.variables?.appointment.id === appointmentId
    ) {
      return runActionMutation.variables.action;
    }
    return null;
  };

  const renderAppointmentItem = (
    item: AppointmentFull,
    index: number,
    isPendingSection: boolean,
  ) => (
    <AppointmentRow
      key={item.id}
      appointment={item}
      isFirst={index === 0}
      isPendingSection={isPendingSection}
      isCallBlocked={hasActiveService || item.id !== nextCallableAppointmentId}
      disabledAll={runActionMutation.isPending}
      busyAction={busyActionFor(item.id)}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      onCall={handleCall}
      onNoShow={handleNoShow}
    />
  );

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
          <StaffLogoutButton />
        </View>
        <View style={{ gap: spacing.md }}>
          <Skeleton height={120} borderRadius={radius.lg} />
          <Skeleton height={150} borderRadius={radius.lg} />
          <Skeleton height={150} borderRadius={radius.lg} />
        </View>
      </ScreenWrapper>
    );
  }

  if (isError) {
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
          <StaffLogoutButton />
        </View>
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
      label: 'Appointments',
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
  ];

  return (
    <ScreenWrapper
      scrollable
      onRefresh={refreshDashboard}
      refreshing={isRefetching}
    >
      <View style={styles.header}>
        <View style={[styles.headerCopy, { marginRight: spacing.sm }]}>
          <Text
            style={[
              styles.title,
              { color: colors.text, ...typography.roles.heading },
            ]}
            numberOfLines={1}
          >
            Staff Dashboard
          </Text>
          <Text
            style={[
              styles.subtitle,
              {
                color: colors.textSecondary,
                fontSize: typography.sizes.sm,
                fontWeight: '500',
              },
            ]}
            numberOfLines={1}
          >
            Hi {staffName} · Today’s queue
          </Text>
        </View>
        <StaffLogoutButton />
      </View>

      {profile?.role === 'staff' && !centersLoading && assignedCenters.length === 0 && (
        <View style={{ marginBottom: spacing.lg }}>
          <EmptyState
            title="No Centers Assigned"
            subtitle="Ask an administrator to assign you to a service center to manage its queue."
          />
        </View>
      )}

      {/* Current workplace and the staff's most common action. */}
      <CardFadeIn delay={0}>
        <View style={{ marginBottom: spacing.lg }}>
          <Card variant="outlined" style={styles.centerCard}>
            <View style={styles.centerHeaderRow}>
              <View
                style={[
                  styles.centerIcon,
                  {
                    backgroundColor: colors.tint.primary,
                    borderRadius: radius.md,
                    marginRight: spacing.sm,
                  },
                ]}
              >
                <MapPin size={20} color={colors.primary} />
              </View>
              <View style={styles.centerCopy}>
                <Text style={[styles.eyebrow, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>MANAGING CENTER</Text>
                <Text style={[styles.centerName, { color: colors.text, fontSize: typography.sizes.md }]} numberOfLines={2}>
                  {centerName ?? (centersLoading ? 'Loading center…' : 'No center selected')}
                </Text>
              </View>
            </View>

            {assignedCenters.length > 1 && (
              <View style={[styles.centerOptions, { marginTop: spacing.md }]}>
                <Text style={[styles.helperLabel, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>Switch center</Text>
                <View style={[styles.centerGrid, { gap: spacing.xs, marginTop: spacing.xs }]}>
                  {assignedCenters.map(center => {
                    const selected = center.id === selectedCenterId;
                    return (
                      <Pressable
                        key={center.id}
                        onPress={() => setSelectedCenterId(center.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={({ pressed }) => [
                          styles.centerOption,
                          {
                            borderRadius: radius.md,
                            borderColor: selected ? colors.primary : colors.border,
                            backgroundColor: selected ? colors.tint.primary : colors.surface,
                            opacity: pressed ? 0.75 : 1,
                          },
                        ]}
                      >
                        <View style={[styles.selectionDot, { borderColor: selected ? colors.primary : colors.textTertiary }]}>
                          {selected && <View style={[styles.selectionDotFill, { backgroundColor: colors.primary }]} />}
                        </View>
                        <Text
                          style={{
                            flex: 1,
                            color: selected ? colors.primary : colors.text,
                            fontSize: typography.sizes.xs,
                            fontWeight: selected ? '700' : '600',
                          }}
                          numberOfLines={2}
                        >
                          {center.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            <AppButton
              title="Open Patient Check-In"
              variant="primary"
              size="sm"
              leftIcon={<ClipboardCheck color={colors.onPrimary} size={17} />}
              onPress={() => navigation.navigate('CheckIn')}
              containerStyle={{ marginTop: spacing.md }}
            />
          </Card>
        </View>
      </CardFadeIn>

      <View style={[styles.sectionHeader, { marginBottom: spacing.sm }]}>
        <Text style={[styles.sectionTitle, { color: colors.text, ...typography.roles.section }]}>Today at a glance</Text>
        <Text style={[styles.sectionHint, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>Live</Text>
      </View>

      <CardFadeIn delay={40}>
        <View style={[styles.statsGrid, { gap: spacing.sm, marginBottom: spacing.lg }]}>
          {statItems.map(item => {
            const Icon = item.Icon;
            return (
              <View
                key={item.label}
                style={[
                  styles.statGridItem,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderRadius: radius.lg,
                    padding: spacing.md,
                  },
                ]}
              >
                <View style={styles.statTopRow}>
                  <View style={[styles.statGridIconPill, { backgroundColor: item.color + '12' }]}>
                    <Icon size={scaleFont(14)} color={item.color} />
                  </View>
                  <Text style={[styles.statGridValue, { color: item.color, fontSize: typography.sizes.xl }]}>{item.value}</Text>
                </View>
                <Text
                  style={[styles.statGridLabel, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}
                  numberOfLines={2}
                >
                  {item.label}
                </Text>
                {(item as any).showProgress && totalToday > 0 && (
                  <View style={{ marginTop: spacing.xs }}>
                    <ProgressBar progress={queueProgress} color={item.color} height={3} trackColor={item.color + '12'} />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </CardFadeIn>

      {nextPatient && (
        <CardFadeIn delay={60}>
          <View style={{ marginBottom: spacing.lg }}>
            <Card
              variant="outlined"
              style={[
                styles.nextPatientCard,
                { backgroundColor: colors.tint.primary, borderColor: colors.primary + '55' },
              ]}
            >
              <Text style={[styles.eyebrow, { color: colors.primary, fontSize: typography.sizes.xs }]}>NEXT PATIENT</Text>
              <View style={[styles.nextPatientRow, { marginTop: spacing.xs }]}>
                <View style={styles.nextPatientCopy}>
                  <Text style={[styles.nextToken, { color: colors.text, fontSize: typography.sizes.xl }]}>Token #{nextPatient.token_number ?? '—'}</Text>
                  <Text style={[styles.nextPatientName, { color: colors.textSecondary, fontSize: typography.sizes.sm }]} numberOfLines={1}>
                    {getDisplayName(nextPatient)}
                  </Text>
                </View>
                <AppButton
                  title={hasActiveService ? 'In Service' : 'Call Now'}
                  variant="primary"
                  size="sm"
                  fullWidth={false}
                  disabled={hasActiveService || runActionMutation.isPending}
                  onPress={() => {
                    Alert.alert(
                      'Call Next Patient',
                      `Call Token #${nextPatient.token_number} (${getDisplayName(nextPatient)}) now?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Call Patient',
                          onPress: () => runActionMutation.mutate({ action: 'start_service', appointment: nextPatient }),
                        },
                      ],
                    );
                  }}
                />
              </View>
            </Card>
          </View>
        </CardFadeIn>
      )}

      {pendingAppointments.length > 0 && (
        <CardFadeIn delay={80}>
          <View style={{ marginBottom: spacing.lg }}>
            <Card variant="elevated" style={styles.cardContent}>
              <View style={[styles.sectionHeader, { marginBottom: spacing.md }]}>
                <Text style={[styles.cardTitle, { color: colors.text, fontSize: typography.sizes.md }]}>Needs confirmation</Text>
                <View style={[styles.countBadge, { backgroundColor: colors.tint.warning, borderRadius: radius.full }]}>
                  <Text style={{ color: colors.status.pending.fg, fontSize: typography.sizes.xs, fontWeight: '800' }}>{pendingAppointments.length}</Text>
                </View>
              </View>
              {pendingAppointments.map((appt, idx) => renderAppointmentItem(appt, idx, true))}
            </Card>
          </View>
        </CardFadeIn>
      )}

      {/* Main operational queue */}
      <CardFadeIn delay={100}>
        <View style={{ marginBottom: spacing.lg }}>
          <Card variant="elevated" style={styles.cardContent}>
            <View style={[styles.sectionHeader, { marginBottom: spacing.md }]}>
              <View>
                <Text style={[styles.cardTitle, { color: colors.text, fontSize: typography.sizes.md }]}>Today’s Queue</Text>
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginTop: 2 }}>
                  Search and manage patient status
                </Text>
              </View>
              <View style={[styles.countBadge, { backgroundColor: colors.tint.neutral, borderRadius: radius.full }]}>
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, fontWeight: '800' }}>{filteredQueueAppointments.length}</Text>
              </View>
            </View>

            <View style={{ marginBottom: spacing.sm }}>
              <AppInput
                placeholder="Search patient, service, or token"
                value={searchQuery}
                onChangeText={setSearchQuery}
                leftIcon={Search}
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ maxHeight: 44, marginBottom: spacing.md }}
              contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
            >
              {[
                { key: 'queue' as const, label: 'Active', color: colors.primary },
                { key: 'checked_in' as const, label: 'Checked In', color: colors.success },
                { key: 'serving' as const, label: 'Serving', color: colors.warning },
                { key: 'completed' as const, label: 'Completed', color: colors.info },
                { key: 'cancelled' as const, label: 'Cancelled', color: colors.error },
              ].map(filter => {
                const isSelected = statusFilter === filter.key;
                return (
                  <Pressable
                    key={filter.key}
                    onPress={() => setStatusFilter(filter.key)}
                    style={({ pressed }) => [
                      styles.filterChip,
                      {
                        borderColor: isSelected ? filter.color : colors.border,
                        backgroundColor: isSelected ? filter.color + '12' : colors.surface,
                        borderRadius: radius.full,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}
                  >
                    <View style={[styles.filterDot, { backgroundColor: isSelected ? filter.color : colors.textTertiary }]} />
                    <Text
                      style={{ color: isSelected ? filter.color : colors.textSecondary, fontSize: typography.sizes.xs, fontWeight: isSelected ? '700' : '600' }}
                    >
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {uniqueDoctors.length > 1 && (
              <View style={{ marginBottom: spacing.md }}>
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginBottom: 6, fontWeight: '600' }}>
                  Doctor
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: spacing.xs }}
                >
                  <Pressable
                    onPress={() => setSelectedDoctorId(null)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 20,
                      borderWidth: 1.5,
                      borderColor: selectedDoctorId === null ? colors.primary : colors.border,
                      backgroundColor: selectedDoctorId === null ? `${colors.primary}10` : 'transparent',
                    }}
                  >
                    <Text style={{ color: selectedDoctorId === null ? colors.primary : colors.text, fontSize: 12, fontWeight: '700' }}>
                      All Doctors
                    </Text>
                  </Pressable>
                  {uniqueDoctors.map(({ id: docId, name: docName }) => (
                    <Pressable
                      key={docId}
                      onPress={() => setSelectedDoctorId(docId)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 20,
                        borderWidth: 1.5,
                        borderColor: selectedDoctorId === docId ? colors.primary : colors.border,
                        backgroundColor: selectedDoctorId === docId ? `${colors.primary}10` : 'transparent',
                      }}
                    >
                      <Text style={{ color: selectedDoctorId === docId ? colors.primary : colors.text, fontSize: 12, fontWeight: '700' }}>
                        {docName}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

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

      {/* Less frequent controls stay below the daily queue work. */}
      {profile?.role === 'staff' && (
        <CardFadeIn delay={120}>
          <View style={{ marginBottom: spacing.xl }}>
            <Card variant="outlined" style={styles.cardContent}>
              <View style={[styles.sectionHeader, { marginBottom: spacing.md }]}>
                <View style={styles.settingsTitleRow}>
                  <View style={[styles.cardTitleIconPill, { backgroundColor: colors.tint.warning, marginRight: spacing.sm }]}>
                    <Coffee size={scaleFont(16)} color={colors.warning} />
                  </View>
                  <View>
                    <Text style={[styles.cardTitle, { color: colors.text, fontSize: typography.sizes.md }]}>Queue Settings</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginTop: 2 }}>Break mode and service time</Text>
                  </View>
                </View>
                <StatusChip
                  status={doctorSettings?.is_on_break ? 'cancelled' : 'confirmed'}
                  label={doctorSettings?.is_on_break ? 'On Break' : 'Active'}
                />
              </View>

              <Text style={[styles.helperLabel, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>Average service time</Text>
              <View style={[styles.timeOptions, { gap: spacing.xs, marginTop: spacing.xs, marginBottom: spacing.md }]}>
                {[10, 15, 20, 30].map(mins => {
                  const selected = doctorSettings?.avg_consultation_mins === mins;
                  return (
                    <Pressable
                      key={mins}
                      onPress={() => handleUpdateAvgTime(mins)}
                      style={({ pressed }) => [
                        styles.timeOption,
                        {
                          borderRadius: radius.md,
                          borderColor: selected ? colors.primary : colors.border,
                          backgroundColor: selected ? colors.tint.primary : colors.surface,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Text style={{ color: selected ? colors.primary : colors.text, fontSize: typography.sizes.sm, fontWeight: '700' }}>{mins} min</Text>
                    </Pressable>
                  );
                })}
              </View>

              <AppButton
                title={doctorSettings?.is_on_break ? 'Resume Queue' : 'Pause Queue for Break'}
                variant={doctorSettings?.is_on_break ? 'primary' : 'outline'}
                onPress={handleToggleBreak}
              />
            </Card>
          </View>
        </CardFadeIn>
      )}

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
                borderRadius: radius.xl,
                padding: spacing.lg,
                borderColor: colors.border,
                borderWidth: Platform.OS === 'ios' ? 0 : 1,
                elevation: 10,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.25,
                shadowRadius: 20,
              },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: colors.text, fontSize: typography.sizes.lg, fontWeight: '800' },
              ]}
            >
              Cancel Appointment
            </Text>
            <Text
              style={[
                styles.modalText,
                { color: colors.textSecondary, fontSize: typography.sizes.sm, marginBottom: spacing.md },
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
                      ? colors.border + '15'
                      : colors.surface,
                    borderWidth: 1.5,
                    marginBottom: spacing.xs,
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
                  style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '600' }}
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
    marginBottom: scaleFont(16),
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    marginBottom: 2,
  },
  subtitle: {
  },
  centerCard: {
    padding: scaleFont(16),
  },
  centerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  centerIcon: {
    width: scaleFont(42),
    height: scaleFont(42),
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  centerName: {
    fontWeight: '700',
    marginTop: 2,
  },
  centerOptions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(100, 116, 139, 0.24)',
    paddingTop: scaleFont(12),
  },
  helperLabel: {
    fontWeight: '700',
  },
  centerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  centerOption: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: scaleFont(46),
    borderWidth: 1,
    paddingHorizontal: scaleFont(10),
    paddingVertical: scaleFont(8),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(7),
  },
  selectionDot: {
    width: scaleFont(16),
    height: scaleFont(16),
    borderRadius: scaleFont(8),
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionDotFill: {
    width: scaleFont(8),
    height: scaleFont(8),
    borderRadius: scaleFont(4),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    flex: 1,
  },
  sectionHint: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardContent: {
    padding: scaleFont(16),
  },
  cardTitle: {
    fontWeight: '700',
  },
  cardTitleIconPill: {
    width: scaleFont(30),
    height: scaleFont(30),
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statGridItem: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: scaleFont(88),
    borderWidth: 1,
  },
  statTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statGridIconPill: {
    width: scaleFont(26),
    height: scaleFont(26),
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statGridValue: {
    fontWeight: '800',
  },
  statGridLabel: {
    fontWeight: '600',
    marginTop: scaleFont(8),
  },
  nextPatientCard: {
    padding: scaleFont(16),
    borderWidth: 1,
  },
  nextPatientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(12),
  },
  nextPatientCopy: {
    flex: 1,
    minWidth: 0,
  },
  nextToken: {
    fontWeight: '800',
  },
  nextPatientName: {
    fontWeight: '600',
    marginTop: 2,
  },
  countBadge: {
    minWidth: scaleFont(30),
    height: scaleFont(30),
    paddingHorizontal: scaleFont(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChip: {
    minHeight: scaleFont(34),
    borderWidth: 1,
    paddingHorizontal: scaleFont(12),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(6),
  },
  filterDot: {
    width: scaleFont(6),
    height: scaleFont(6),
    borderRadius: scaleFont(3),
  },
  settingsTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  timeOption: {
    flexBasis: '22%',
    flexGrow: 1,
    minHeight: scaleFont(44),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scaleFont(6),
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
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
  },
  modalTitle: {
    marginBottom: hp(0.5),
  },
  reasonButton: {
  },
});
