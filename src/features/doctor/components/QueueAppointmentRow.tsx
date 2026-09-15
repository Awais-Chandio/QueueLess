import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Clock } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppButton from '../../../components/ui/AppButton';
import { StatusChip } from '../../../components/ui/StatusChip';
import { getAppointmentTimeLabel } from '../../appointments/utils/appointmentTime';
import { getAppointmentStatusState } from '../../../services/bookingService';
import { scaleFont } from '../../../utils/responsive';
import type { AppointmentFull, AppointmentStatus } from '../../../types/appointment';
import type { QueueAction } from '../hooks/useDoctorQueue';

export const statusLabel = (status: string) =>
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

interface QueueAppointmentRowProps {
  appointment: AppointmentFull;
  isFirst: boolean;
  isCallBlocked: boolean;
  disabledAll: boolean;
  busyAction: QueueAction | null;
  onConfirm: (appointment: AppointmentFull) => void;
  onCancel: (appointment: AppointmentFull) => void;
  onCall: (appointment: AppointmentFull) => void;
  onComplete: (appointment: AppointmentFull) => void;
  onNoShow: (appointment: AppointmentFull) => void;
}

const QueueAppointmentRowComponent = ({
  appointment,
  isFirst,
  isCallBlocked,
  disabledAll,
  busyAction,
  onConfirm,
  onCancel,
  onCall,
  onComplete,
  onNoShow,
}: QueueAppointmentRowProps) => {
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
                {
                  backgroundColor: `${colors.primary}10`,
                  borderColor: `${colors.primary}30`,
                  borderWidth: 1,
                },
              ]}
            >
              <Text style={[styles.tokenText, { color: colors.primary, fontSize: typography.sizes.sm }]}>
                {typeof appointment.token_number === 'number' ? `#${appointment.token_number}` : 'No Token'}
              </Text>
            </View>
            <Text
              style={[styles.patientNameText, { color: colors.text, fontSize: typography.sizes.md }]}
              numberOfLines={1}
            >
              {appointment.patient_name || 'Anonymous Patient'}
            </Text>
          </View>
          <View style={{ height: 4 }} />
          <Text style={[styles.serviceText, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
            {appointment.service_name || 'Consultation'}
          </Text>
        </View>
        <StatusChip status={resolvedStatus} label={statusLabel(resolvedStatus)} />
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
            {getAppointmentTimeLabel(appointment)}
          </Text>
        </View>
      </View>

      {actions.length > 0 && (
        <View style={[styles.actionsRow, { marginTop: spacing.md }]}>
          {actions.map(action => {
            const isCancel = action === 'cancel';
            const isBlocked = action === 'start_service' && isCallBlocked;
            const isBusy = busyAction === action;

            return (
              <AppButton
                key={action}
                title={actionLabels[action]}
                variant={isCancel || action === 'no_show' ? 'danger' : action === 'confirm' ? 'primary' : 'outline'}
                loading={isBusy}
                disabled={disabledAll || isBlocked}
                style={styles.actionButton}
                textStyle={{ fontSize: typography.sizes.sm }}
                onPress={handlerFor(action)}
              />
            );
          })}
        </View>
      )}
    </View>
  );
};

export const QueueAppointmentRow = React.memo(QueueAppointmentRowComponent);

const styles = StyleSheet.create({
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
});
