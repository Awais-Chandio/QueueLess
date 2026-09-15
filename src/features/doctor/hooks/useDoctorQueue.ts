import { useEffect, useMemo, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../hooks/useAuth';
import { useStaffQueueStore } from '../../../stores/queueStore';
import type {
  AppointmentFull,
  CancelReason,
} from '../../../types/appointment';
import { queueService } from '../../../services/queueService';
import { getAppointmentStatusState } from '../../../services/bookingService';
import { toastService } from '../../../services/toastService';

export type QueueAction = 'confirm' | 'cancel' | 'start_service' | 'complete_service' | 'no_show';

export function useDoctorQueue() {
  const { doctorId } = useAuth();
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const setStaffAppointments = useStaffQueueStore(state => state.setAppointments);

  const [cancelTarget, setCancelTarget] = useState<AppointmentFull | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'queue' | 'checked_in' | 'serving' | 'completed' | 'cancelled'
  >('queue');

  const { data, error, isError, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['doctor-queue', 'today', doctorId],
    queryFn: () => queueService.fetchDashboard('today', doctorId),
    enabled: !!doctorId,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const appointments = useMemo(() => data?.appointments ?? [], [data?.appointments]);
  const stats = data?.stats;

  const nextPatient = useMemo(() => {
    const checkedIn = appointments.find(item => item.status === 'checked_in');
    if (checkedIn) return checkedIn;

    const confirmed = appointments.find(item => item.status === 'confirmed');
    if (confirmed) return confirmed;

    return null;
  }, [appointments]);

  const hasActiveService = useMemo(
    () =>
      appointments.some(
        appointment => appointment.status === 'called' || appointment.status === 'in_progress',
      ),
    [appointments],
  );

  const nextCallableAppointmentId = useMemo(
    () =>
      appointments.find(appointment => appointment.status === 'checked_in')?.id ??
      appointments.find(appointment => appointment.status === 'confirmed')?.id,
    [appointments],
  );

  const pendingAppointments = useMemo(
    () =>
      appointments.filter(item => {
        const { resolvedStatus } = getAppointmentStatusState(item);
        return resolvedStatus === 'pending';
      }),
    [appointments],
  );

  const filteredQueueAppointments = useMemo(() => {
    return appointments.filter(item => {
      const { resolvedStatus } = getAppointmentStatusState(item);

      let matchesStatus = false;
      if (statusFilter === 'queue') {
        matchesStatus = ['confirmed', 'checked_in', 'called', 'in_progress'].includes(resolvedStatus);
      } else if (statusFilter === 'checked_in') {
        matchesStatus = resolvedStatus === 'checked_in';
      } else if (statusFilter === 'serving') {
        matchesStatus = ['called', 'in_progress'].includes(resolvedStatus);
      } else if (statusFilter === 'completed') {
        matchesStatus = resolvedStatus === 'completed';
      } else if (statusFilter === 'cancelled') {
        matchesStatus = ['cancelled', 'expired', 'no_show', 'skipped'].includes(resolvedStatus);
      }

      if (!matchesStatus) return false;

      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const patientName = item.patient_name?.toLowerCase() || '';
        const serviceName = item.service_name?.toLowerCase() || '';
        const tokenStr = item.token_number?.toString() || '';
        return (
          patientName.includes(query) ||
          serviceName.includes(query) ||
          tokenStr.includes(query)
        );
      }

      return true;
    });
  }, [appointments, statusFilter, searchQuery]);

  useEffect(() => {
    if (appointments.length || data) {
      setStaffAppointments(appointments);
    }
  }, [appointments, data, setStaffAppointments]);

  useEffect(() => {
    if (!isFocused || !doctorId) return;

    const channel = queueService.subscribeToAppointments({
      channelName: `doctor-queue-today-${Date.now()}`,
      onChange: () => {
        queryClient.invalidateQueries({ queryKey: ['doctor-queue', 'today', doctorId] });
      },
    });

    return () => {
      queueService.unsubscribeAppointments(channel);
    };
  }, [queryClient, isFocused, doctorId]);

  const runActionMutation = useMutation({
    mutationFn: async ({
      action,
      appointment,
      reason,
    }: {
      action: QueueAction;
      appointment: AppointmentFull;
      reason?: CancelReason;
    }) => {
      if (action === 'confirm') {
        return queueService.confirmAppointment(appointment);
      }
      if (action === 'cancel') {
        return queueService.cancelAppointment(appointment, reason ?? 'Other');
      }
      if (action === 'start_service') {
        return queueService.startService(appointment);
      }
      if (action === 'no_show') {
        return queueService.noShowAppointment(appointment);
      }
      return queueService.completeAppointment(appointment);
    },
    onSuccess: (_result, variables) => {
      setCancelTarget(null);

      let successMsg = 'Action completed successfully.';
      if (variables.action === 'confirm') {
        successMsg = 'Appointment confirmed successfully.';
      } else if (variables.action === 'cancel') {
        successMsg = 'Appointment cancelled successfully.';
      } else if (variables.action === 'start_service') {
        successMsg = 'Appointment service started.';
      } else if (variables.action === 'no_show') {
        successMsg = 'Appointment marked as No Show.';
      } else if (variables.action === 'complete_service') {
        successMsg = 'Appointment completed successfully.';
      }

      toastService.success(successMsg);
      queryClient.invalidateQueries({ queryKey: ['doctor-queue', 'today', doctorId] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Action failed. Please try again.';
      toastService.error(message);
      if (message.includes('already updated')) {
        queryClient.invalidateQueries({ queryKey: ['doctor-queue', 'today', doctorId] });
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
      }
    },
  });

  return {
    isLoading,
    isError,
    isRefetching,
    error,
    refetch,
    appointments,
    stats,
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
  };
}
