import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Clock, Stethoscope } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppButton from '../../../components/ui/AppButton';
import AppText from '../../../components/ui/AppText';
import { Card } from '../../../components/ui/Card';
import { StatusChip } from '../../../components/ui/StatusChip';
import { getAppointmentTimeLabel } from '../../appointments/utils/appointmentTime';
import type { AppointmentFull, AppointmentStatus } from '../../../types/appointment';
import type { QueueAction } from '../hooks/useDoctorQueue';

export const statusLabel = (status: string) =>
  status
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

/**
 * Actions a doctor may take from each status. These mirror the database's
 * validate_appointment_status_transition trigger: confirmed may only move to
 * checked_in, called or cancelled, so "Complete" is never offered before the
 * patient has been called in.
 */
export const getAvailableActions = (status: AppointmentStatus): QueueAction[] => {
  switch (status) {
    case 'pending':
      return ['confirm', 'cancel'];
    case 'confirmed':
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
  start_service: 'Call In',
  complete_service: 'Complete',
  no_show: 'No Show',
};

interface QueueAppointmentRowProps {
  appointment: AppointmentFull;
  isCallBlocked: boolean;
  disabledAll: boolean;
  busyAction: QueueAction | null;
  onAction: (action: QueueAction, appointment: AppointmentFull) => void;
}

const QueueAppointmentRowComponent = ({
  appointment,
  isCallBlocked,
  disabledAll,
  busyAction,
  onAction,
}: QueueAppointmentRowProps) => {
  const { colors, spacing, radius } = useTheme();
  // Database status, not the patient-facing expiry guess (see useDoctorQueue).
  const resolvedStatus = appointment.status;
  const actions = getAvailableActions(resolvedStatus);

  return (
    <Card variant="outlined" padding="md" style={{ marginBottom: spacing.sm }}>
      <View style={styles.header}>
        <View
          style={[
            styles.token,
            { backgroundColor: colors.tint.primary, borderRadius: radius.md },
          ]}
        >
          <AppText variant="caption" tone="brand" weight="600">
            TOKEN
          </AppText>
          <AppText variant="subtitle" tone="brand" weight="800">
            {typeof appointment.token_number === 'number' ? appointment.token_number : '—'}
          </AppText>
        </View>

        <View style={styles.titleWrap}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {appointment.patient_name || 'Patient'}
          </AppText>
          <View style={[styles.metaRow, { marginTop: 2 }]}>
            <Stethoscope size={12} color={colors.textSecondary} />
            <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.metaText}>
              {appointment.service_name || 'Consultation'}
            </AppText>
          </View>
          <View style={styles.metaRow}>
            <Clock size={12} color={colors.textSecondary} />
            <AppText variant="caption" tone="secondary" style={styles.metaText}>
              {getAppointmentTimeLabel(appointment)}
            </AppText>
          </View>
        </View>

        <StatusChip status={resolvedStatus} label={statusLabel(resolvedStatus)} />
      </View>

      {actions.length > 0 && (
        <View style={[styles.actions, { marginTop: spacing.md, gap: spacing.sm }]}>
          {actions.map(action => {
            const isDanger = action === 'cancel' || action === 'no_show';
            const isBlocked = action === 'start_service' && isCallBlocked;
            return (
              <AppButton
                key={action}
                title={actionLabels[action]}
                size="sm"
                variant={
                  isDanger
                    ? 'ghost'
                    : action === 'complete_service'
                      ? 'success'
                      : action === 'confirm'
                        ? 'primary'
                        : 'outline'
                }
                textStyle={isDanger ? { color: colors.error } : undefined}
                loading={busyAction === action}
                disabled={disabledAll || isBlocked}
                containerStyle={styles.actionButton}
                onPress={() => onAction(action, appointment)}
                accessibilityHint={
                  isBlocked ? 'Finish the current consultation or call the next patient in order first.' : undefined
                }
              />
            );
          })}
        </View>
      )}
    </Card>
  );
};

export const QueueAppointmentRow = React.memo(QueueAppointmentRowComponent);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  token: {
    minWidth: 56,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    marginRight: 12,
  },
  titleWrap: {
    flex: 1,
    marginRight: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  metaText: {
    marginLeft: 4,
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
  },
  actionButton: {
    flex: 1,
  },
});
