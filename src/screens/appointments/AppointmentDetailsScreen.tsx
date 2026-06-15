import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useNavigation,
  useRoute,
} from '@react-navigation/native';

import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import AppButton from '../../components/common/AppButton';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Loader from '../../components/common/Loader';
import ScreenWrapper from '../../components/common/ScreenWrapper';

import { appointmentsService } from '../../services/appointments/appointmentsService';
import { useToastStore } from '../../store/toastStore';

import {
  colors,
  radius,
  spacing,
  typography,
} from '../../theme';

import type { AppStackParamList } from '../../navigation/types';
import type { AppointmentFull } from '../../types/appointment';

type NavigationProp = NativeStackNavigationProp<
  AppStackParamList,
  'AppointmentDetails'
>;

type AppointmentDetailsRouteProp = RouteProp<
  AppStackParamList,
  'AppointmentDetails'
>;

const cancellableStatuses = ['pending', 'confirmed'];

const AppointmentDetailsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<AppointmentDetailsRouteProp>();
  const appointmentId = route.params?.appointmentId;
  const showToast = useToastStore(state => state.showToast);

  const [appointment, setAppointment] =
    useState<AppointmentFull | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  const fetchAppointment = useCallback(async () => {
    if (!appointmentId) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setLoading(true);

      const data =
        await appointmentsService.fetchAppointmentById(appointmentId);

      setAppointment(data);
    } catch (fetchError) {
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : 'Failed to load appointment details';

      setError(message);
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    fetchAppointment();
  }, [fetchAppointment]);

  const formatDate = (scheduledAt: string) => {
    const date = new Date(scheduledAt);

    if (Number.isNaN(date.getTime())) {
      return scheduledAt;
    }

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (scheduledAt: string) => {
    const date = new Date(scheduledAt);

    if (Number.isNaN(date.getTime())) {
      return scheduledAt;
    }

    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatStatus = (status: string) =>
    status.charAt(0).toUpperCase() + status.slice(1);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return colors.success;
      case 'completed':
        return colors.textSecondary;
      case 'cancelled':
        return colors.error;
      case 'pending':
      default:
        return colors.warning;
    }
  };

  const getStatusBackground = (status: string) => {
    switch (status) {
      case 'confirmed':
        return '#DCFCE7';
      case 'completed':
        return '#E2E8F0';
      case 'cancelled':
        return '#FEE2E2';
      case 'pending':
      default:
        return '#FEF3C7';
    }
  };

  const handleCancelAppointment = async () => {
    if (!appointmentId || !appointment) {
      return;
    }

    try {
      setCancelLoading(true);
      await appointmentsService.cancelAppointment(appointmentId);

      setAppointment({
        ...appointment,
        status: 'cancelled',
      });

      showToast('Appointment cancelled successfully', 'success');
    } catch (cancelError) {
      const message =
        cancelError instanceof Error
          ? cancelError.message
          : 'Failed to cancel appointment';

      showToast(message, 'error');
    } finally {
      setCancelLoading(false);
    }
  };

  const confirmCancel = () => {
    Alert.alert(
      'Cancel Appointment',
      'Are you sure you want to cancel this appointment?',
      [
        {
          text: 'Keep Appointment',
          style: 'cancel',
        },
        {
          text: 'Cancel Appointment',
          style: 'destructive',
          onPress: handleCancelAppointment,
        },
      ],
    );
  };

  if (loading) {
    return (
      <ScreenWrapper>
        <Loader />
      </ScreenWrapper>
    );
  }

  if (!appointmentId) {
    return (
      <ScreenWrapper>
        <EmptyState
          title="Appointment Missing"
          subtitle="Please select an appointment to view details."
          buttonTitle="Go Back"
          onButtonPress={navigation.goBack}
        />
      </ScreenWrapper>
    );
  }

  if (error) {
    return (
      <ScreenWrapper>
        <ErrorState
          title="Failed To Load Appointment"
          message={error}
          buttonTitle="Retry"
          onRetry={fetchAppointment}
        />
      </ScreenWrapper>
    );
  }

  if (!appointment) {
    return (
      <ScreenWrapper>
        <EmptyState
          title="Appointment Not Found"
          subtitle="This appointment could not be found."
          buttonTitle="Go Back"
          onButtonPress={navigation.goBack}
        />
      </ScreenWrapper>
    );
  }

  const canCancel = cancellableStatuses.includes(appointment.status);

  return (
    <ScreenWrapper>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>
        <Text style={styles.title}>Appointment Details</Text>

        <View style={styles.summaryCard}>
          <Text style={styles.serviceName}>
            {appointment.service_name ?? 'Selected Service'}
          </Text>

          <Text style={styles.centerName}>
            {appointment.center_name ?? 'Assigned Center'}
          </Text>

          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: getStatusBackground(appointment.status),
              },
            ]}>
            <Text
              style={[
                styles.statusText,
                {
                  color: getStatusColor(appointment.status),
                },
              ]}>
              {formatStatus(appointment.status)}
            </Text>
          </View>
        </View>

        <View style={styles.detailsCard}>
          <DetailRow
            label="Center Name"
            value={appointment.center_name ?? 'Not available'}
          />

          <DetailRow
            label="Service Name"
            value={appointment.service_name ?? 'Not available'}
          />

          <DetailRow
            label="Date"
            value={formatDate(appointment.scheduled_at)}
          />

          <DetailRow
            label="Time"
            value={formatTime(appointment.scheduled_at)}
          />

          <DetailRow
            label="Token Number"
            value={
              typeof appointment.token_number === 'number'
                ? `#${appointment.token_number}`
                : 'Not assigned yet'
            }
          />

          <DetailRow
            label="Status"
            value={formatStatus(appointment.status)}
          />

          <DetailRow
            label="Estimated Wait"
            value={
              typeof appointment.estimated_wait_mins === 'number'
                ? `${appointment.estimated_wait_mins} mins`
                : 'Calculating'
            }
            isLast
          />
        </View>

        <AppButton
          title="View Queue Status"
          onPress={() =>
            navigation.navigate('QueueStatus', {
              appointmentId,
            })
          }
        />

        <Pressable
          style={({ pressed }) => [
            styles.cancelButton,
            pressed && !cancelLoading && canCancel && styles.cancelPressed,
            (!canCancel || cancelLoading) && styles.disabledButton,
          ]}
          disabled={!canCancel || cancelLoading}
          onPress={confirmCancel}
          accessibilityRole="button"
          accessibilityState={{
            busy: cancelLoading,
            disabled: !canCancel || cancelLoading,
          }}>
          <Text style={styles.cancelText}>
            {cancelLoading ? 'Cancelling...' : 'Cancel Appointment'}
          </Text>
        </Pressable>
      </ScrollView>
    </ScreenWrapper>
  );
};

type DetailRowProps = {
  label: string;
  value: string;
  isLast?: boolean;
};

const DetailRow = ({
  label,
  value,
  isLast = false,
}: DetailRowProps) => (
  <View style={[styles.detailRow, isLast && styles.lastDetailRow]}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

export default AppointmentDetailsScreen;

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xl,
  },

  title: {
    color: colors.text,
    fontSize: typography.h1,
    fontWeight: 'bold',
    marginBottom: spacing.lg,
  },

  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },

  serviceName: {
    color: colors.text,
    fontSize: typography.h3,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },

  centerName: {
    color: colors.textSecondary,
    fontSize: typography.body,
    marginBottom: spacing.md,
  },

  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },

  statusText: {
    fontSize: typography.caption,
    fontWeight: '700',
  },

  detailsCard: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },

  detailRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: spacing.md,
  },

  lastDetailRow: {
    borderBottomWidth: 0,
  },

  detailLabel: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginBottom: spacing.xs,
  },

  detailValue: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '600',
  },

  cancelButton: {
    alignItems: 'center',
    borderColor: colors.error,
    borderRadius: radius.borderRadius,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: spacing.sm,
    padding: spacing.md,
    width: '100%',
  },

  cancelPressed: {
    backgroundColor: '#FEF2F2',
  },

  disabledButton: {
    opacity: 0.5,
  },

  cancelText: {
    color: colors.error,
    fontWeight: 'bold',
  },
});
