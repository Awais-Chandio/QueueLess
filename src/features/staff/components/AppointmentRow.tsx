import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CheckCircle2, BellRing } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import { StatusChip } from '../../../components/ui/StatusChip';
import { ActionButton } from './ActionButton';
import { getAppointmentTimeLabel } from '../../appointments/utils/appointmentTime';
import { getAppointmentStatusState } from '../../../services/bookingService';
import { scaleFont, wp, hp } from '../../../utils/responsive';
import type { AppointmentFull, AppointmentStatus } from '../../../types/appointment';
import type { QueueAction } from '../screens/StaffDashboardScreen';

const statusLabel = (status: string) =>
  status
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const getAvailableActions = (status: AppointmentStatus): QueueAction[] => {
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

const actionLabels: Record<QueueAction, string> = {
  confirm: 'Confirm',
  cancel: 'Cancel',
  start_service: 'Call',
  complete_service: 'Complete',
  no_show: 'No Show',
};

interface AppointmentRowProps {
  appointment: AppointmentFull;
  isFirst: boolean;
  isPendingSection: boolean;
  isCallBlocked: boolean;
  disabledAll: boolean;
  busyAction: QueueAction | null;
  onConfirm: (appointment: AppointmentFull) => void;
  onCancel: (appointment: AppointmentFull) => void;
  onCall: (appointment: AppointmentFull) => void;
  onComplete: (appointment: AppointmentFull) => void;
  onNoShow: (appointment: AppointmentFull) => void;
}

const AppointmentRowComponent = ({
  appointment,
  isFirst,
  isPendingSection,
  isCallBlocked,
  disabledAll,
  busyAction,
  onConfirm,
  onCancel,
  onCall,
  onComplete,
  onNoShow,
}: AppointmentRowProps) => {
  const { colors, spacing, typography } = useTheme();
  const { resolvedStatus } = getAppointmentStatusState(appointment);
  const actions = getAvailableActions(resolvedStatus);

  const handlerFor = (action: QueueAction) => {
    switch (action) {
      case 'confirm':
        return () => onConfirm(appointment);
      case 'cancel':
        return () => onCancel(appointment);
      case 'start_service':
        return () => onCall(appointment);
      case 'complete_service':
        return () => onComplete(appointment);
      case 'no_show':
        return () => onNoShow(appointment);
    }
  };

  return (
    <View
      style={[
        styles.itemContainer,
        !isFirst && {
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
            <View
              style={[
                styles.tokenPill,
                { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}30`, borderWidth: 1 },
              ]}
            >
              <Text style={[styles.tokenText, { color: colors.primary, fontSize: typography.sizes.sm }]}>
                {typeof appointment.token_number === 'number' ? `#${appointment.token_number}` : 'No Token'}
              </Text>
            </View>
            <Text style={[styles.patientName, { color: colors.text, fontSize: typography.sizes.md }]}>
              {appointment.patient_name ?? 'Patient'}
            </Text>
          </View>
          <Text
            style={[
              styles.metaText,
              { color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: scaleFont(4) },
            ]}
          >
            {appointment.service_name ?? 'Service'} • {getAppointmentTimeLabel(appointment)} •{' '}
            {appointment.doctor_name ? `Dr. ${appointment.doctor_name}` : 'Any Available'}
          </Text>
        </View>
        {!isPendingSection && <StatusChip status={resolvedStatus} label={statusLabel(resolvedStatus)} size="sm" />}
      </View>

      {resolvedStatus === 'checked_in' && (
        <View
          style={[styles.statusAlert, { backgroundColor: `${colors.success}10`, borderColor: `${colors.success}30`, marginTop: spacing.sm }]}
        >
          <CheckCircle2 color={colors.success} size={scaleFont(12)} />
          <Text style={{ color: colors.success, fontSize: typography.sizes.xs, fontWeight: '700' }}>Arrived</Text>
        </View>
      )}

      {resolvedStatus === 'called' && (
        <View
          style={[styles.statusAlert, { backgroundColor: `${colors.info}10`, borderColor: `${colors.info}30`, marginTop: spacing.sm }]}
        >
          <BellRing color={colors.info} size={scaleFont(12)} />
          <Text style={{ color: colors.info, fontSize: typography.sizes.xs, fontWeight: '700' }}>Called</Text>
        </View>
      )}

      {actions.length > 0 && (
        <View style={[styles.actionsRow, { gap: spacing.sm, marginTop: spacing.md }]}>
          {actions.map(action => {
            const isCancel = action === 'cancel';
            const isBlocked = action === 'start_service' && isCallBlocked;

            return (
              <ActionButton
                key={action}
                action={action}
                label={actionLabels[action]}
                variant={isCancel || action === 'no_show' ? 'danger' : action === 'confirm' ? 'primary' : 'outline'}
                loading={busyAction === action}
                disabled={disabledAll || isBlocked}
                onPress={handlerFor(action)!}
              />
            );
          })}
        </View>
      )}
    </View>
  );
};

export const AppointmentRow = React.memo(AppointmentRowComponent);

const styles = StyleSheet.create({
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
});
