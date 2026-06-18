import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import AppButton from '../../../components/ui/AppButton';
import { useTheme } from '../../../hooks/useTheme';
import { appointmentsService } from '../api/appointmentsService';
import { useToastStore } from '../../../store/toastStore';
import type { AppStackParamList } from '../../../navigation/types';
import { Calendar, CircleDot, Clock, AlignLeft } from 'lucide-react-native';
import { scaleFont } from '../../../utils/responsive';

type AppointmentDetailsRouteProp = RouteProp<AppStackParamList, 'AppointmentDetails'>;
type NavigationProp = NativeStackNavigationProp<AppStackParamList, 'AppointmentDetails'>;

const AppointmentDetailsScreen = () => {
  const route = useRoute<AppointmentDetailsRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const appointmentId = route.params?.appointmentId;
  const { colors, spacing, typography } = useTheme();
  const showToast = useToastStore(state => state.showToast);
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
          <Skeleton height={150} />
          <Skeleton height={200} />
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

  const formatStatus = (status: string) =>
    status
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  const canCancel = ['pending', 'confirmed'].includes(appointment.status);
  const statusVariant =
    appointment.status === 'completed'
      ? 'success'
      : appointment.status === 'cancelled'
        ? 'error'
        : appointment.status === 'confirmed'
          ? 'info'
          : 'warning';

  const confirmCancel = () => {
    Alert.alert('Cancel Appointment', 'Are you sure you want to cancel this appointment?', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Cancel', style: 'destructive', onPress: () => cancelMutation.mutate(appointmentId) },
    ]);
  };

  return (
    <ScreenWrapper scrollable onRefresh={refetch}>
      <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl, marginBottom: spacing.lg }]}>
        Appointment Details
      </Text>

      <Card style={{ marginBottom: spacing.md }}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={{ color: colors.text, fontSize: typography.sizes.xl, fontWeight: '700', marginBottom: spacing.xs }}>
              {appointment.service_name || 'Service'}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.md, marginBottom: spacing.md }}>
              {appointment.center_name || 'Center'}
            </Text>
          </View>
          <Badge 
            label={formatStatus(appointment.status)} 
            variant={statusVariant}
          />
        </View>

        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.md }} />

        <View style={{ gap: spacing.md }}>
          <View style={styles.detailRow}>
            <Calendar color={colors.primary} size={scaleFont(20)} />
            <Text style={{ flex: 1, color: colors.text, fontSize: typography.sizes.md }}>
              {new Date(appointment.scheduled_at).toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Clock color={colors.primary} size={scaleFont(20)} />
            <Text style={{ flex: 1, color: colors.text, fontSize: typography.sizes.md }}>
              {new Date(appointment.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <CircleDot color={colors.primary} size={scaleFont(20)} />
            <Text style={{ flex: 1, color: colors.text, fontSize: typography.sizes.md }}>
              Token #{appointment.token_number || 'N/A'}
            </Text>
          </View>
        </View>
      </Card>

      {appointment.notes && (
        <Card style={{ marginBottom: spacing.md }}>
          <View style={styles.detailRow}>
            <AlignLeft color={colors.primary} size={scaleFont(20)} />
            <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '600' }}>Notes</Text>
          </View>
          <Text style={{ color: colors.textSecondary, marginTop: spacing.sm, fontSize: typography.sizes.sm }}>
            {appointment.notes}
          </Text>
        </Card>
      )}

      <AppButton 
        title="View Queue Status" 
        variant="primary" 
        onPress={() => navigation.navigate('QueueStatus', { appointmentId })} 
      />

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
  title: {
    fontWeight: 'bold',
  },
  headerRow: {
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
  }
});
