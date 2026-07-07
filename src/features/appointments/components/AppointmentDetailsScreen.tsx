import React from 'react';
import { View, Text, StyleSheet, Alert, Pressable } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { Card } from '../../../components/ui/Card';
import { StatusChip } from '../../../components/ui/StatusChip';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import AppButton from '../../../components/ui/AppButton';
import { CardFadeIn } from '../../../components/animations/CardFadeIn';
import { useTheme } from '../../../hooks/useTheme';
import { appointmentsService } from '../api/appointmentsService';
import { useAppointmentsStore } from '../../../store/appointmentsStore';
import { useToastStore } from '../../../store/toastStore';
import type { AppStackParamList } from '../../../navigation/types';
import { getAppointmentStatusState, getStatusDisplayProperties } from '../../../services/bookingService';
import {
  AlignLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Hash,
  MapPin,
  XCircle,
  ChevronLeft,
} from 'lucide-react-native';
import { scaleFont } from '../../../utils/responsive';
import {
  getAppointmentDateLabel,
  getAppointmentTimeLabel,
} from '../utils/appointmentTime';

type AppointmentDetailsRouteProp = RouteProp<AppStackParamList, 'AppointmentDetails'>;
type NavigationProp = NativeStackNavigationProp<AppStackParamList, 'AppointmentDetails'>;

const AppointmentDetailsScreen = () => {
  const route = useRoute<AppointmentDetailsRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const appointmentId = route.params?.appointmentId;
  const { colors, spacing, typography, radius } = useTheme();
  const showToast = useToastStore(state => state.showToast);
  const checkInAppointment = useAppointmentsStore(
    state => state.checkInAppointment,
  );
  const checkingInId = useAppointmentsStore(state => state.checkingInId);
  const queryClient = useQueryClient();

  const { data: appointment, isLoading, isError, refetch } = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => appointmentsService.fetchAppointmentById(appointmentId!),
    enabled: !!appointmentId,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => appointmentsService.cancelAppointment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointment', appointmentId] });
      showToast('Appointment cancelled successfully', 'success');
      navigation.goBack();
    },
    onError: (error: Error) => {
      showToast(error.message, 'error');
    }
  });

  if (isLoading) {
    return (
      <ScreenWrapper>
        <View style={{ gap: spacing.md }}>
          <Skeleton height={150} borderRadius={radius.lg} />
          <Skeleton height={200} borderRadius={radius.lg} />
        </View>
      </ScreenWrapper>
    );
  }

  if (isError || !appointment || !appointmentId) {
    return (
      <ScreenWrapper>
        <EmptyState title="Not Found" subtitle="Failed to load appointment details." buttonTitle="Go Back" onButtonPress={() => navigation.goBack()} />
      </ScreenWrapper>
    );
  }

  const { isExpired, isNoShow, resolvedStatus } = getAppointmentStatusState(appointment);
  const canCancel = (appointment.status === 'pending' || appointment.status === 'confirmed') && !isExpired && !isNoShow;
  const canCheckIn = appointment.status === 'confirmed' && !isExpired && !isNoShow;
  const isCheckedIn = appointment.status === 'checked_in';
  const isCheckingIn = checkingInId === appointmentId;
  const { label: statusLabel } = getStatusDisplayProperties(resolvedStatus);

  const confirmCancel = () => {
    Alert.alert('Cancel Appointment', 'Are you sure you want to cancel this appointment?', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Cancel', style: 'destructive', onPress: () => cancelMutation.mutate(appointmentId) },
    ]);
  };

  const handleCheckIn = async () => {
    try {
      const updatedAppointment = await checkInAppointment(appointmentId);

      queryClient.setQueryData(
        ['appointment', appointmentId],
        updatedAppointment,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['appointments'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboardStats'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);

      showToast('Successfully checked in.', 'success');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to check in.';
      showToast(message, 'error');
    }
  };

  return (
    <ScreenWrapper scrollable onRefresh={refetch}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <ChevronLeft size={24} color={colors.primary} />
          <Text style={[styles.backButtonText, { color: colors.primary, fontSize: typography.sizes.md, marginLeft: spacing.xs }]}>
            Back
          </Text>
        </Pressable>
      </View>

      <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl, marginBottom: spacing.lg }]}>
        Appointment Details
      </Text>

      <CardFadeIn delay={0}>
        <Card style={{ marginBottom: spacing.md }}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.headerText}>
              <Text style={{ color: colors.text, fontSize: typography.sizes.xl, fontWeight: '700', marginBottom: spacing.xs }}>
                {appointment.service_name || 'Service'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: scaleFont(4) }}>
                <MapPin size={scaleFont(13)} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>
                  {appointment.center_name || 'Center'}
                </Text>
              </View>
            </View>
            <StatusChip status={resolvedStatus} label={statusLabel} />
          </View>

          <View style={{ height: 1, backgroundColor: colors.border + '50', marginVertical: spacing.md }} />

          <View style={{ gap: spacing.md }}>
            <View style={styles.detailRow}>
              <View style={[styles.detailIconPill, { backgroundColor: `${colors.primary}10` }]}>
                <Calendar color={colors.primary} size={scaleFont(16)} />
              </View>
              <Text style={{ flex: 1, color: colors.text, fontSize: typography.sizes.md, fontWeight: '500' }}>
                {getAppointmentDateLabel(appointment)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <View style={[styles.detailIconPill, { backgroundColor: `${colors.info}10` }]}>
                <Clock color={colors.info} size={scaleFont(16)} />
              </View>
              <Text style={{ flex: 1, color: colors.text, fontSize: typography.sizes.md, fontWeight: '500' }}>
                {getAppointmentTimeLabel(appointment)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <View style={[styles.detailIconPill, { backgroundColor: `${colors.primary}10` }]}>
                <Hash color={colors.primary} size={scaleFont(16)} />
              </View>
              <Text style={{ flex: 1, color: colors.text, fontSize: typography.sizes.md, fontWeight: '500' }}>
                Token #{appointment.token_number || 'N/A'}
              </Text>
            </View>
          </View>
        </Card>
      </CardFadeIn>

      {appointment.status === 'cancelled' && (
        <CardFadeIn delay={60}>
          <Card style={{ marginBottom: spacing.md, borderColor: colors.error + '50', borderWidth: 1 }}>
            <View style={styles.detailRow}>
              <View style={[styles.detailIconPill, { backgroundColor: `${colors.error}10` }]}>
                <XCircle color={colors.error} size={scaleFont(16)} />
              </View>
              <Text style={{ color: colors.error, fontSize: typography.sizes.md, fontWeight: '600' }}>Cancellation Reason</Text>
            </View>
            <Text style={{ color: colors.textSecondary, marginTop: spacing.sm, fontSize: typography.sizes.sm, lineHeight: 18 }}>
              {appointment.cancel_reason || 'No cancellation reason provided.'}
            </Text>
          </Card>
        </CardFadeIn>
      )}

      {appointment.notes && (
        <CardFadeIn delay={60}>
          <Card style={{ marginBottom: spacing.md }}>
            <View style={styles.detailRow}>
              <View style={[styles.detailIconPill, { backgroundColor: `${colors.warning}10` }]}>
                <AlignLeft color={colors.warning} size={scaleFont(16)} />
              </View>
              <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '600' }}>Notes</Text>
            </View>
            <Text style={{ color: colors.textSecondary, marginTop: spacing.sm, fontSize: typography.sizes.sm, lineHeight: 18 }}>
              {appointment.notes}
            </Text>
          </Card>
        </CardFadeIn>
      )}

      <AppButton
        title="View Queue Status"
        variant="primary"
        onPress={() => navigation.navigate('QueueStatus', { appointmentId })}
      />

      {(canCheckIn || isCheckedIn) && (
        <View style={{ marginTop: spacing.md }}>
          <AppButton
            title={isCheckedIn ? 'Checked In' : "I'm Here"}
            variant="outline"
            loading={isCheckingIn}
            disabled={isCheckedIn || isCheckingIn}
            onPress={handleCheckIn}
          />
          {isCheckedIn && (
            <View style={[styles.arrivedRow, { marginTop: spacing.sm }]}>
              <CheckCircle2
                color={colors.success}
                size={scaleFont(18)}
              />
              <Text
                style={{
                  color: colors.success,
                  fontSize: typography.sizes.sm,
                  fontWeight: '600',
                }}
              >
                Arrived at clinic
              </Text>
            </View>
          )}
        </View>
      )}

      {canCancel && (
        <AppButton
          title="Cancel Appointment"
          variant="danger"
          loading={cancelMutation.isPending}
          onPress={confirmCancel}
          style={{ marginTop: spacing.md }}
        />
      )}
    </ScreenWrapper>
  );
};

export default AppointmentDetailsScreen;

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  backButtonText: {
    fontWeight: '600',
  },
  title: {
    fontWeight: '800',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: scaleFont(8),
  },
  headerText: {
    flex: 1,
    minWidth: '60%',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(12),
  },
  detailIconPill: {
    width: scaleFont(34),
    height: scaleFont(34),
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrivedRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: scaleFont(8),
    justifyContent: 'center',
  },
});
