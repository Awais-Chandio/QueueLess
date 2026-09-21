import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Search, UserCheck, CheckCircle, ScanLine } from 'lucide-react-native';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import AppInput from '../../../components/ui/AppInput';
import AppButton from '../../../components/ui/AppButton';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import { StatusChip } from '../../../components/ui/StatusChip';
import { useTheme } from '../../../hooks/useTheme';
import { useAuth } from '../../../hooks/useAuth';
import { scaleFont } from '../../../utils/responsive';
import { staffQueueService } from '../api/staffQueueService';
import { appointmentService } from '../../../services/appointmentService';
import { getAppointmentTimeLabel } from '../../appointments/utils/appointmentTime';
import { toastService } from '../../../services/toastService';
import type { AppointmentFull } from '../../../types/appointment';
import { QrScannerView } from '../components/QrScannerView';
import { validateScannedAppointment } from '../utils/qrCheckIn';

type CheckInMode = 'list' | 'scan';

type ScanState =
  | { phase: 'scanning' }
  | { phase: 'validating' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; appointment: AppointmentFull };

const CheckInScreen = () => {
  const navigation = useNavigation();
  const { colors, spacing } = useTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isFocused = useIsFocused();
  const [searchQuery, setSearchQuery] = useState('');
  const [mode, setMode] = useState<CheckInMode>('list');
  const [scanState, setScanState] = useState<ScanState>({ phase: 'scanning' });
  // The scanner fires repeatedly for the same code; this gates it to one validation at a time.
  const scanLockRef = useRef(false);

  const resetScan = useCallback(() => {
    scanLockRef.current = false;
    setScanState({ phase: 'scanning' });
  }, []);

  const handleScan = useCallback(
    async (value: string) => {
      if (scanLockRef.current) return;
      scanLockRef.current = true;

      if (!user?.id) {
        setScanState({ phase: 'error', message: 'Please login again to continue.' });
        return;
      }

      setScanState({ phase: 'validating' });
      try {
        const result = await validateScannedAppointment(value, user.id);
        setScanState(
          result.ok
            ? { phase: 'ready', appointment: result.appointment }
            : { phase: 'error', message: result.message },
        );
      } catch (err) {
        setScanState({
          phase: 'error',
          message: err instanceof Error ? err.message : 'Could not verify this QR code.',
        });
      }
    },
    [user?.id],
  );

  const switchMode = (next: CheckInMode) => {
    setMode(next);
    resetScan();
  };

  const { data, error, isError, isLoading, refetch } = useQuery({
    queryKey: ['staff-dashboard', 'today'],
    queryFn: () => staffQueueService.fetchDashboard('today'),
    staleTime: 0,
  });

  const appointments = useMemo(() => data?.appointments ?? [], [data?.appointments]);

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

  const confirmMutation = useMutation({
    mutationFn: async (item: any) => {
      return staffQueueService.confirmAppointment(item);
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

      <View style={[styles.modeToggle, { backgroundColor: colors.surface, marginBottom: spacing.md }]}>
        {(['list', 'scan'] as const).map(option => {
          const selected = mode === option;
          const labelColor = selected ? '#FFFFFF' : colors.textSecondary;
          return (
            <Pressable
              key={option}
              onPress={() => switchMode(option)}
              style={[styles.modeOption, selected && { backgroundColor: colors.primary }]}
            >
              {option === 'scan' && (
                <ScanLine size={16} color={labelColor} />
              )}
              <Text style={[styles.modeLabel, { color: labelColor }]}>
                {option === 'list' ? 'Search' : 'Scan QR'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'scan' ? (
        <View style={{ gap: spacing.md }}>
          <QrScannerView
            active={isFocused && scanState.phase === 'scanning'}
            onScan={handleScan}
          />

          {scanState.phase === 'validating' && (
            <View style={styles.scanStatus}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>
                Verifying appointment...
              </Text>
            </View>
          )}

          {scanState.phase === 'error' && (
            <Card variant="elevated" style={styles.patientCard}>
              <Text style={[styles.scanError, { color: colors.error }]}>{scanState.message}</Text>
              <AppButton
                title="Scan Again"
                variant="outline"
                onPress={resetScan}
                style={{ marginTop: spacing.md }}
              />
            </Card>
          )}

          {scanState.phase === 'ready' && (
            <Card variant="elevated" style={styles.patientCard}>
              <View style={styles.cardHeader}>
                <View style={styles.tokenPillWrapper}>
                  <View style={[styles.tokenPill, { backgroundColor: colors.primary + '12' }]}>
                    <Text style={[styles.tokenText, { color: colors.primary }]}>
                      {scanState.appointment.token_number
                        ? `#${scanState.appointment.token_number}`
                        : 'No Token'}
                    </Text>
                  </View>
                  <Text style={[styles.patientName, { color: colors.text }]} numberOfLines={1}>
                    {scanState.appointment.patient_name || 'Anonymous'}
                  </Text>
                </View>
                <StatusChip
                  status={scanState.appointment.status}
                  label={scanState.appointment.status.toUpperCase()}
                />
              </View>

              <View style={[styles.cardDetails, { marginTop: spacing.sm }]}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                  Service:{' '}
                  <Text style={[styles.detailValue, { color: colors.text }]}>
                    {scanState.appointment.service_name}
                  </Text>
                </Text>
                <Text style={[styles.detailLabel, styles.detailLabelSpaced, { color: colors.textSecondary }]}>
                  Doctor:{' '}
                  <Text style={[styles.detailValue, { color: colors.text }]}>
                    Dr. {scanState.appointment.doctor_name || 'Any Doctor'}
                  </Text>
                </Text>
                <Text style={[styles.detailLabel, styles.detailLabelSpaced, { color: colors.textSecondary }]}>
                  Time Slot:{' '}
                  <Text style={[styles.detailValue, { color: colors.primary }]}>
                    {getAppointmentTimeLabel(scanState.appointment)}
                  </Text>
                </Text>
              </View>

              <View style={[styles.actions, { marginTop: spacing.md, gap: spacing.sm }]}>
                <AppButton
                  title="Cancel"
                  variant="outline"
                  disabled={checkInMutation.isPending}
                  onPress={resetScan}
                  style={styles.flexOne}
                />
                <AppButton
                  title="Confirm Check-in"
                  variant="success"
                  loading={checkInMutation.isPending}
                  disabled={checkInMutation.isPending}
                  leftIcon={<UserCheck size={16} color="#FFFFFF" />}
                  onPress={() =>
                    checkInMutation.mutate(scanState.appointment.id, { onSuccess: resetScan })
                  }
                  style={styles.flexOne}
                />
              </View>
            </Card>
          )}
        </View>
      ) : (
        <>
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
        </>
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
  modeToggle: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 12,
  },
  modeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modeLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  tokenText: {
    fontWeight: '800',
    fontSize: 13,
  },
  detailLabel: {
    fontSize: 13,
  },
  detailLabelSpaced: {
    marginTop: 2,
  },
  detailValue: {
    fontWeight: '700',
  },
  flexOne: {
    flex: 1,
  },
  scanStatus: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  scanError: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
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
