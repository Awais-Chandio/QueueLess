import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Platform,
  RefreshControl,
  Modal,
  Pressable,
  ScrollView,
  Alert,
} from 'react-native';
import { Users, AlertCircle, BellRing, Activity, Search } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import { useDoctorQueue, QueueAction } from '../hooks/useDoctorQueue';
import {
  QueueAppointmentRow,
  getAvailableActions,
  statusLabel,
} from '../components/QueueAppointmentRow';
import AppButton from '../../../components/ui/AppButton';
import AppInput from '../../../components/ui/AppInput';
import { Card } from '../../../components/ui/Card';
import { StatusChip } from '../../../components/ui/StatusChip';
import type { AppointmentFull, CancelReason } from '../../../types/appointment';

const cancelReasons: CancelReason[] = [
  'Patient Requested',
  'No Show',
  'Duplicate Booking',
  'Center Closed',
  'Other',
];

export default function PatientsScreen() {
  const { colors, spacing, typography, radius } = useTheme();
  const {
    isLoading,
    isError,
    isRefetching,
    error,
    refetch,
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

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const confirmAction = useCallback(
    (action: QueueAction, appointment: AppointmentFull) => {
      const label = action === 'confirm' ? 'Confirm' : action === 'start_service' ? 'Call' : action === 'complete_service' ? 'Complete' : 'No Show';
      Alert.alert(
        `${label} Appointment`,
        `Are you sure you want to ${label.toLowerCase()} this appointment?`,
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
    [setCancelTarget],
  );
  const handleCall = useCallback(
    (appointment: AppointmentFull) => confirmAction('start_service', appointment),
    [confirmAction],
  );
  const handleComplete = useCallback(
    (appointment: AppointmentFull) => confirmAction('complete_service', appointment),
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

  const renderRow = useCallback(
    ({ item, index }: { item: AppointmentFull; index: number }) => {
      const busyAction =
        runActionMutation.isPending && runActionMutation.variables?.appointment.id === item.id
          ? runActionMutation.variables.action
          : null;

      return (
        <QueueAppointmentRow
          appointment={item}
          isFirst={index === 0}
          isCallBlocked={hasActiveService || item.id !== nextCallableAppointmentId}
          disabledAll={runActionMutation.isPending}
          busyAction={busyAction}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          onCall={handleCall}
          onComplete={handleComplete}
          onNoShow={handleNoShow}
        />
      );
    },
    [
      hasActiveService,
      nextCallableAppointmentId,
      runActionMutation.isPending,
      runActionMutation.variables,
      handleConfirm,
      handleCancel,
      handleCall,
      handleComplete,
      handleNoShow,
    ],
  );

  if (isLoading && filteredQueueAppointments.length === 0 && pendingAppointments.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError && filteredQueueAppointments.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.lg }]}>
        <AlertCircle size={48} color={colors.error} style={{ marginBottom: spacing.md }} />
        <Text style={[styles.errorText, { color: colors.text, fontSize: typography.sizes.sm }]}>
          {error instanceof Error ? error.message : 'Failed to load queue.'}
        </Text>
      </View>
    );
  }

  const listHeader = (
    <View>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.lg }]}>
          Today's Patients
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
          Manage your live queue: confirm, call, complete, or mark no-show.
        </Text>
      </View>

      {nextPatient && (
        <View style={{ marginBottom: spacing.lg }}>
          <Card variant="elevated" style={[styles.activeCard, { borderColor: colors.primary, borderWidth: 1 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
              <Activity size={18} color={colors.primary} />
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

            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              {getAvailableActions(nextPatient.status).map(action => (
                <AppButton
                  key={action}
                  title={
                    action === 'start_service'
                      ? 'Call Patient'
                      : action === 'complete_service'
                        ? 'Complete Consultation'
                        : 'No Show'
                  }
                  variant={action === 'no_show' ? 'danger' : 'primary'}
                  loading={busyActionFor(nextPatient.id) === action}
                  disabled={runActionMutation.isPending}
                  style={{ flex: 1 }}
                  onPress={() => confirmAction(action, nextPatient)}
                />
              ))}
            </View>
          </Card>
        </View>
      )}

      {pendingAppointments.length > 0 && (
        <View style={{ marginBottom: spacing.lg }}>
          <Card variant="elevated" style={styles.cardContent}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
              <BellRing size={16} color={colors.warning} />
              <Text style={[styles.cardTitle, { color: colors.text, marginLeft: spacing.xs }]}>
                Pending Confirmations ({pendingAppointments.length})
              </Text>
            </View>
            <ScrollView style={{ maxHeight: 220 }}>
              {pendingAppointments.map((item, idx) => (
                <QueueAppointmentRow
                  key={item.id}
                  appointment={item}
                  isFirst={idx === 0}
                  isCallBlocked={hasActiveService || item.id !== nextCallableAppointmentId}
                  disabledAll={runActionMutation.isPending}
                  busyAction={busyActionFor(item.id)}
                  onConfirm={handleConfirm}
                  onCancel={handleCancel}
                  onCall={handleCall}
                  onComplete={handleComplete}
                  onNoShow={handleNoShow}
                />
              ))}
            </ScrollView>
          </Card>
        </View>
      )}

      <View style={styles.filterSection}>
        <AppInput
          placeholder="Search patient, token..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIcon={Search}
        />
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
              <Text
                style={{
                  color: statusFilter === tab.id ? colors.primary : colors.textSecondary,
                  fontWeight: '700',
                  fontSize: typography.sizes.sm,
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={filteredQueueAppointments}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: spacing.xl * 2 }]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} colors={[colors.primary]} />
        }
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.border + '40', borderRadius: radius.xl }]}>
            <Users size={32} color={colors.textSecondary} style={{ marginBottom: spacing.sm }} />
            <Text style={[styles.emptyText, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
              No appointments match the filter criteria.
            </Text>
          </View>
        }
        renderItem={renderRow}
      />

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
                  pressed && { backgroundColor: colors.border + '30' },
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    textAlign: 'center',
    fontWeight: '500',
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    fontWeight: '500',
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
    marginBottom: 12,
  },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    borderWidth: 1.5,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    borderWidth: 1,
    marginTop: 10,
  },
  emptyText: {
    fontWeight: '500',
    textAlign: 'center',
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
