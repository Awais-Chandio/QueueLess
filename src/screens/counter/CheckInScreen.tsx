import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Search, UserCheck, CheckCircle } from 'lucide-react-native';
import ScreenWrapper from '../../components/ui/ScreenWrapper';
import AppInput from '../../components/ui/AppInput';
import AppButton from '../../components/ui/AppButton';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import { StatusChip } from '../../components/ui/StatusChip';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont } from '../../utils/responsive';
import { queueService } from '../../services/queueService';
import { appointmentService } from '../../services/appointmentService';
import { getAppointmentTimeLabel } from '../../features/appointments/utils/appointmentTime';
import { toastService } from '../../services/toastService';

const CheckInScreen = () => {
  const navigation = useNavigation();
  const { colors, spacing, typography, radius } = useTheme();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch today's appointments
  const { data, error, isError, isLoading, refetch } = useQuery({
    queryKey: ['staff-dashboard', 'today'],
    queryFn: () => queueService.fetchDashboard('today'),
    staleTime: 0,
  });

  const appointments = useMemo(
    () => data?.appointments ?? [],
    [data?.appointments],
  );

  // Filter appointments to show pending (not confirmed yet) or confirmed (ready to check in)
  const checkInQueue = useMemo(() => {
    return appointments.filter(item => {
      const isPendingOrConfirmed = item.status === 'pending' || item.status === 'confirmed';
      if (!isPendingOrConfirmed) return false;

      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const patientName = item.patient_name?.toLowerCase() || '';
        const tokenStr = item.token_number?.toString() || '';
        return patientName.includes(query) || tokenStr.includes(query);
      }

      return true;
    });
  }, [appointments, searchQuery]);

  // Mutation for staff checking in a patient
  const checkInMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      return appointmentService.staffCheckInAppointment(appointmentId);
    },
    onSuccess: () => {
      toastService.success('Patient checked in successfully!');
      queryClient.invalidateQueries({ queryKey: ['staff-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (err: any) => {
      toastService.error(err.message || 'Failed to check in patient.');
    },
  });

  // Mutation for confirming a pending appointment
  const confirmMutation = useMutation({
    mutationFn: async (item: any) => {
      return queueService.confirmAppointment(item);
    },
    onSuccess: () => {
      toastService.success('Appointment confirmed successfully!');
      queryClient.invalidateQueries({ queryKey: ['staff-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (err: any) => {
      toastService.error(err.message || 'Failed to confirm appointment.');
    },
  });

  return (
    <ScreenWrapper scrollable>
      {/* Header */}
      <View style={[styles.header, { marginBottom: spacing.md }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
        >
          <ChevronLeft size={scaleFont(24)} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Patient Check-In Desk</Text>
        <View style={{ width: 40 }} />
      </View>

      <AppInput
        placeholder="Search patient by name or token..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        leftIcon={Search}
      />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to fetch appointments.'}
          buttonTitle="Retry"
          onRetry={refetch}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {checkInQueue.length === 0 ? (
            <EmptyState
              title="No Patients to Check In"
              subtitle={
                searchQuery.trim() !== ''
                  ? 'No matching pending/confirmed appointments found.'
                  : 'All patients for today are either checked in or completed.'
              }
            />
          ) : (
            checkInQueue.map(item => {
              const isPending = item.status === 'pending';
              const isBusy = 
                (checkInMutation.isPending && checkInMutation.variables === item.id) ||
                (confirmMutation.isPending && confirmMutation.variables?.id === item.id);

              return (
                <Card key={item.id} variant="elevated" style={styles.patientCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.tokenPillWrapper}>
                      <View style={[styles.tokenPill, { backgroundColor: colors.primary + '12' }]}>
                        <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>
                          {item.token_number ? `#${item.token_number}` : 'No Token'}
                        </Text>
                      </View>
                      <Text style={[styles.patientName, { color: colors.text }]} numberOfLines={1}>
                        {item.patient_name || 'Anonymous'}
                      </Text>
                    </View>
                    <StatusChip status={item.status} label={item.status.toUpperCase()} />
                  </View>

                  <View style={[styles.cardDetails, { marginTop: spacing.sm }]}>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                      Service: <Text style={{ color: colors.text, fontWeight: '700' }}>{item.service_name}</Text>
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                      Doctor: <Text style={{ color: colors.text, fontWeight: '700' }}>Dr. {item.doctor_name || 'Any Doctor'}</Text>
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                      Time Slot: <Text style={{ color: colors.primary, fontWeight: '700' }}>{getAppointmentTimeLabel(item)}</Text>
                    </Text>
                  </View>

                  {/* Actions Block */}
                  <View style={[styles.actions, { marginTop: spacing.md }]}>
                    {isPending ? (
                      <AppButton
                        title="Confirm Appointment"
                        variant="primary"
                        loading={isBusy}
                        disabled={isBusy}
                        leftIcon={<CheckCircle size={16} color="#FFFFFF" />}
                        onPress={() => confirmMutation.mutate(item)}
                        style={{ flex: 1 }}
                      />
                    ) : (
                      <AppButton
                        title="Check In Patient"
                        variant="success"
                        loading={isBusy}
                        disabled={isBusy}
                        leftIcon={<UserCheck size={16} color="#FFFFFF" />}
                        onPress={() => checkInMutation.mutate(item.id)}
                        style={{ flex: 1 }}
                      />
                    )}
                  </View>
                </Card>
              );
            })
          )}
        </View>
      )}
    </ScreenWrapper>
  );
};

export default CheckInScreen;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  loadingContainer: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  patientCard: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tokenPillWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  tokenPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '800',
  },
  cardDetails: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
  },
  actions: {
    flexDirection: 'row',
  },
});
