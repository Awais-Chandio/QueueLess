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
  LogOut,
  Coffee,
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
import { supabase } from '../../../lib/supabase';

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
  const { colors, spacing, typography, radius, isDarkMode } = useTheme();
  const { logout, user } = useAuth();
  const profile = useProfileStore(state => state.profile);
  const fetchProfile = useProfileStore(state => state.fetchProfile);

  useEffect(() => {
    if (user?.id && (!profile || profile.id !== user.id)) {
      fetchProfile(user.id);
    }
  }, [user?.id, profile, fetchProfile]);

  const [centerName, setCenterName] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.role === 'staff' && profile?.center_id) {
      const fetchCenterName = async () => {
        try {
          const { data } = await supabase
            .from('service_centers')
            .select('name')
            .eq('id', profile.center_id)
            .maybeSingle();
          if (data?.name) {
            setCenterName(data.name);
          }
        } catch (err) {
          console.warn('Failed to fetch assigned center name:', err);
        }
      };
      fetchCenterName();
    } else {
      setCenterName(null);
    }
  }, [profile]);

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
    if (!profile?.center_id) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const settings = await staffQueueService.fetchCenterSettings(profile.center_id, todayStr);
      setDoctorSettings(settings);
    } catch (err) {
      console.warn('Failed to load center settings:', err);
    }
  }, [profile?.center_id]);

  useEffect(() => {
    loadCenterSettings();
  }, [loadCenterSettings]);

  const handleToggleBreak = async () => {
    if (!profile?.center_id) return;
    try {
      const nextBreakState = !doctorSettings?.is_on_break;
      const start = nextBreakState ? new Date().toISOString() : null;
      const end = nextBreakState ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null;
      const todayStr = new Date().toISOString().split('T')[0];

      const updated = await staffQueueService.setCenterBreak(
        profile.center_id,
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
    if (!profile?.center_id) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const updated = await staffQueueService.updateCenterAverageConsultationTime(
        profile.center_id,
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
    queryFn: () => staffQueueService.fetchDashboard('today'),
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const appointments = useMemo(
    () => data?.appointments ?? [],
    [data?.appointments],
  );
  const stats = data?.stats;

  const uniqueDoctorIds = useMemo(() => {
    const ids = new Set<string>();
    appointments.forEach(item => {
      if (item.doctor_id) ids.add(item.doctor_id);
    });
    return Array.from(ids);
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
                  marginTop: scaleFont(4),
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
            <CheckCircle2 color={colors.success} size={scaleFont(12)} />
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
            <BellRing color={colors.info} size={scaleFont(12)} />
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
              { color: colors.text, fontSize: typography.sizes.xxl, fontWeight: '800' },
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
                fontWeight: '500',
              },
            ]}
          >
            {centerName ? `Center: ${centerName}` : "Today's Queue Control"}
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
              backgroundColor: pressed ? colors.border + '30' : colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <LogOut color={colors.text} size={18} />
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
                  { backgroundColor: `${colors.primary}10` },
                ]}
              >
                <Activity size={scaleFont(16)} color={colors.primary} />
              </View>
              <Text
                style={[
                  styles.cardTitle,
                  {
                    color: colors.text,
                    fontSize: typography.sizes.md,
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
                        backgroundColor: colors.border + '08',
                        borderColor: colors.border,
                        borderRadius: radius.lg,
                        borderWidth: 1,
                        borderTopWidth: 3.5,
                        borderTopColor: item.color,
                        overflow: 'hidden',
                      },
                    ]}
                  >
                    <View style={styles.statGridHeader}>
                      <View
                        style={[
                          styles.statGridIconPill,
                          { backgroundColor: item.color + '12' },
                        ]}
                      >
                        <Icon size={scaleFont(13)} color={item.color} />
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.statGridValue,
                        { color: item.color, fontSize: typography.sizes.xl, fontWeight: '800' },
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
                          trackColor={item.color + '12'}
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

      {/* Doctor Break Settings Card */}
      {profile?.role === 'staff' && (
        <CardFadeIn delay={100}>
          <View style={{ marginBottom: spacing.lg }}>
            <Card variant="elevated" style={styles.cardContent}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[styles.cardTitleIconPill, { backgroundColor: `${colors.warning}10` }]}>
                    <Coffee size={scaleFont(16)} color={colors.warning} />
                  </View>
                  <Text style={[styles.cardTitle, { color: colors.text, fontSize: typography.sizes.md, marginLeft: spacing.sm }]}>
                    Service Break & Settings
                  </Text>
                </View>
                <StatusChip
                  status={doctorSettings?.is_on_break ? 'cancelled' : 'confirmed'}
                  label={doctorSettings?.is_on_break ? 'On Break' : 'Active'}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', flexWrap: 'wrap' }}>
                <AppButton
                  title={doctorSettings?.is_on_break ? 'Resume Work' : 'Go On Break'}
                  variant={doctorSettings?.is_on_break ? 'primary' : 'outline'}
                  onPress={handleToggleBreak}
                  style={{ flex: 1, minWidth: 140 }}
                />
                
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginBottom: 4, fontWeight: '600' }}>
                    Avg Service Time (mins):
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    {[10, 15, 20, 30].map(mins => (
                      <Pressable
                        key={mins}
                        onPress={() => handleUpdateAvgTime(mins)}
                        style={({ pressed }) => [
                          {
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: radius.sm,
                            borderWidth: 1.5,
                            borderColor: doctorSettings?.avg_consultation_mins === mins ? colors.primary : colors.border,
                            backgroundColor: doctorSettings?.avg_consultation_mins === mins ? `${colors.primary}10` : 'transparent',
                            opacity: pressed ? 0.7 : 1,
                          }
                        ]}
                      >
                        <Text style={{ color: doctorSettings?.avg_consultation_mins === mins ? colors.primary : colors.text, fontSize: 12, fontWeight: '700' }}>
                          {mins}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            </Card>
          </View>
        </CardFadeIn>
      )}

      {/* Card 2: Pending Appointments */}
      <CardFadeIn delay={60}>
        <View style={{ marginBottom: spacing.lg }}>
          <Card variant="elevated" style={styles.cardContent}>
            <Text
              style={[
                styles.cardTitle,
                {
                  color: colors.text,
                  fontSize: typography.sizes.md,
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
        <View style={{ marginBottom: spacing.xl }}>
          <Card variant="elevated" style={styles.cardContent}>
            {/* Doctor Filter Tabs */}
            {uniqueDoctorIds.length > 1 && (
              <View style={{ marginBottom: spacing.md }}>
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginBottom: 6, fontWeight: '600' }}>
                  Filter by Counter:
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
                      All Counters
                    </Text>
                  </Pressable>
                  {uniqueDoctorIds.map((docId, idx) => (
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
                        Counter #{idx + 1}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Auto Call Next Button */}
            {nextPatient && (
              <AppButton
                title={`Call Next: Token #${nextPatient.token_number} (${getDisplayName(nextPatient)})`}
                variant="primary"
                onPress={() => {
                  Alert.alert(
                    'Call Next Client',
                    `Are you sure you want to call Token #${nextPatient.token_number} (${getDisplayName(nextPatient)}) to the counter?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Call Client',
                        onPress: () => runActionMutation.mutate({ action: 'start_service', appointment: nextPatient }),
                      },
                    ]
                  );
                }}
                style={{ marginBottom: spacing.md }}
              />
            )}

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
                  { color: colors.text, fontSize: typography.sizes.md },
                ]}
              >
                Queue List
              </Text>
              <View
                style={[
                  styles.cardTitleIconPill,
                  {
                    backgroundColor: `${colors.textSecondary}10`,
                    width: scaleFont(32),
                    height: scaleFont(32),
                  },
                ]}
              >
                <Clock size={scaleFont(16)} color={colors.textSecondary} />
              </View>
            </View>

            {/* Search Input */}
            <View style={{ marginBottom: spacing.sm }}>
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
                          ? filterColor + '10'
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
    marginBottom: hp(2.4),
  },
  title: {
    marginBottom: 2,
  },
  subtitle: {
  },
  logoutIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    padding: wp(4.5),
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
    gap: wp(2),
  },
  statGridItem: {
    flexBasis: '30%',
    flexGrow: 1,
    paddingHorizontal: wp(2.5),
    paddingVertical: hp(1.2),
  },
  statGridHeader: {
    alignItems: 'flex-start',
    marginBottom: scaleFont(4),
  },
  statGridIconPill: {
    width: scaleFont(26),
    height: scaleFont(26),
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statGridValue: {
  },
  statGridLabel: {
    fontWeight: '600',
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
    borderRadius: scaleFont(8),
    paddingHorizontal: scaleFont(8),
    paddingVertical: scaleFont(3),
  },
  tokenText: {
    fontWeight: '800',
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
