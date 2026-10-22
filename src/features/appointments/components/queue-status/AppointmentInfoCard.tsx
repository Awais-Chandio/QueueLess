import React from 'react';
import { View } from 'react-native';
import { Calendar, Hash, Info, MapPin, Stethoscope } from 'lucide-react-native';
import { useTheme } from '../../../../hooks/useTheme';
import AnimatedCard from '../../../../components/ui/AnimatedCard';
import AppText from '../../../../components/ui/AppText';
import { Card } from '../../../../components/ui/Card';
import type { AppointmentFull, AppointmentStatus } from '../../../../types/appointment';
import { getAppointmentDateLabel, getAppointmentTimeLabel } from '../../utils/appointmentTime';
import { MetricRow } from './MetricRow';

export const AppointmentInfoCard = ({ appointment, status }: { appointment: AppointmentFull; status: AppointmentStatus }) => {
  const { colors, spacing } = useTheme();
  return (
    <AnimatedCard delay={180}>
      <Card padding="md" style={{ marginBottom: spacing.xl }}>
        <AppText variant="subtitle" weight="800" style={{ marginBottom: spacing.md }}>
          Appointment Details
        </AppText>
        <View style={{ gap: spacing.md }}>
          <MetricRow stacked icon={Hash} label="Token Number" value={`#${appointment.token_number || 'N/A'}`} />
          <MetricRow
            stacked
            icon={Calendar}
            label="Date & Time"
            value={`${getAppointmentDateLabel(appointment)} • ${getAppointmentTimeLabel(appointment)}`}
          />
          <MetricRow stacked icon={MapPin} label="Clinic" value={appointment.center_name ?? ''} />
          {!!appointment.doctor_name && (
            <MetricRow stacked icon={Stethoscope} label="Doctor" value={appointment.doctor_name} tone={colors.info} />
          )}
          {status === 'cancelled' && !!appointment.cancel_reason && (
            <MetricRow stacked icon={Info} label="Cancellation Reason" value={appointment.cancel_reason} tone={colors.error} />
          )}
        </View>
      </Card>
    </AnimatedCard>
  );
};
