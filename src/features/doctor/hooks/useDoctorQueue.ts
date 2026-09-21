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
import { toastService } from '../../../services/toastService';
import { doctorDashboardService } from '../services/doctorDashboardService';

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
    queryFn: async () => {
      const [dashboard, todayRows] = await Promise.all([
        queueService.fetchDashboard('today', doctorId),
        doctorDashboardService.getTodayAppointments(doctorId!),
      ]);
      // RLS hides patient profiles from doctors, so appointments_full returns no
      // patient_name. The doctor-scoped RPC resolves names server-side.
      const names = new Map(todayRows.map(row => [row.appointment_id, row.patient_name]));
      return {
        ...dashboard,
        appointments: dashboard.appointments.map(item => ({
          ...item,
          patient_name: item.patient_name ?? names.get(item.id) ?? undefined,
        })),
      };
    },
    enabled: !!doctorId,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const appointments = useMemo(() => data?.appointments ?? [], [data?.appointments]);
  const stats = data?.stats;

  // The patient currently with the doctor, if any. Kept separate from the next
  // patient so the queue card never hides an in-progress consultation.
  const currentPatient = useMemo(
    () =>
      appointments.find(item => item.status === 'in_progress') ??
      appointments.find(item => item.status === 'called') ??
      null,
    [appointments],
  );

  const nextPatient = useMemo(
    () =>
      appointments.find(item => item.status === 'checked_in') ??
      appointments.find(item => item.status === 'confirmed') ??
      null,
    [appointments],
  );

  const hasActiveService = currentPatient !== null;

  const nextCallableAppointmentId = nextPatient?.id;

  const pendingAppointments = useMemo(
    () =>
      appointments.filter(item => item.status === 'pending'),
    [appointments],
  );

  const filteredQueueAppointments = useMemo(() => {
    // The doctor works from the database status. getAppointmentStatusState
    // guesses "expired" 30 minutes after the slot, which hid late-running and
    // in-room patients from the queue and removed their actions.
    return appointments.filter(item => {
      const resolvedStatus = item.status;

      let matchesStatus = false;
      if (statusFilter === 'queue') {
        // The patient in the room is shown in the Now Serving card, not the waiting list.
        matchesStatus = ['confirmed', 'checked_in'].includes(resolvedStatus);
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
      doctorId,
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
    onSuccess: async (_result, variables) => {
      // Keep the action's spinner up until the refreshed queue is on screen, so
      // the toast and the moved card arrive together instead of seconds apart.
      await queryClient.invalidateQueries({ queryKey: ['doctor-queue', 'today', doctorId] });
      setCancelTarget(null);

      let successMsg = 'Action completed successfully.';
      if (variables.action === 'confirm') {
        successMsg = 'Appointment confirmed successfully.';
      } else if (variables.action === 'cancel') {
        successMsg = 'Appointment cancelled successfully.';
      } else if (variables.action === 'start_service') {
        successMsg = `Token #${variables.appointment.token_number ?? ''} called in.`;
      } else if (variables.action === 'no_show') {
        successMsg = 'Appointment marked as No Show.';
      } else if (variables.action === 'complete_service') {
        successMsg = 'Appointment completed successfully.';
      }

      toastService.success(successMsg);
      queryClient.invalidateQueries({ queryKey: ['doctor-dashboard-extras'] });
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
    currentPatient,
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
