import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../../store/authStore';
import {
  doctorAvailabilityService,
  DoctorLeave,
} from '../services/doctorAvailabilityService';
import type { DoctorSchedule } from '../services/doctorDashboardService';

type ScheduleRow = DoctorSchedule & { id: string; is_available: boolean };

export function useDoctorAvailability() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ['doctor-profile-availability', user?.id],
    queryFn: () => doctorAvailabilityService.getDoctorProfile(user!.id),
    enabled: !!user?.id,
  });

  const doctorId = profileQuery.data?.id ?? null;

  const scheduleQuery = useQuery<ScheduleRow[]>({
    queryKey: ['doctor-schedule', doctorId],
    queryFn: () => doctorAvailabilityService.getWeeklySchedule(doctorId!),
    enabled: !!doctorId,
  });

  const leavesQuery = useQuery<DoctorLeave[]>({
    queryKey: ['doctor-leaves', doctorId],
    queryFn: () => doctorAvailabilityService.getLeaves(doctorId!),
    enabled: !!doctorId,
  });

  const isLoading =
    profileQuery.isLoading || scheduleQuery.isLoading || leavesQuery.isLoading;

  const error = !user?.id
    ? 'User not logged in.'
    : profileQuery.error instanceof Error
      ? profileQuery.error.message
      : scheduleQuery.error instanceof Error
        ? scheduleQuery.error.message
        : leavesQuery.error instanceof Error
          ? leavesQuery.error.message
          : null;

  const toggleBreakModeMutation = useMutation({
    mutationFn: (status: boolean) =>
      doctorAvailabilityService.updateBreakMode(doctorId!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor-profile-availability', user?.id] });
    },
  });

  const updateDayScheduleMutation = useMutation({
    mutationFn: ({
      availabilityId,
      updates,
    }: {
      availabilityId: string;
      updates: {
        start_time: string;
        end_time: string;
        slot_duration: number;
        is_available: boolean;
      };
    }) => doctorAvailabilityService.updateDayAvailability(availabilityId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor-schedule', doctorId] });
    },
  });

  const requestLeaveRangeMutation = useMutation({
    mutationFn: async ({
      startDate,
      endDate,
      reason,
    }: {
      startDate: string;
      endDate: string;
      reason: string;
    }) => {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const dates: string[] = [];

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const year = d.getFullYear();
        const month = `${d.getMonth() + 1}`.padStart(2, '0');
        const day = `${d.getDate()}`.padStart(2, '0');
        dates.push(`${year}-${month}-${day}`);
      }

      await Promise.all(
        dates.map(dateStr => doctorAvailabilityService.addLeave(doctorId!, dateStr, reason)),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor-leaves', doctorId] });
    },
  });

  const cancelLeaveMutation = useMutation({
    mutationFn: (leaveId: string) => doctorAvailabilityService.deleteLeave(leaveId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor-leaves', doctorId] });
    },
  });

  const refresh = async () => {
    await Promise.all([
      profileQuery.refetch(),
      scheduleQuery.refetch(),
      leavesQuery.refetch(),
    ]);
  };

  return {
    isLoading,
    error,
    doctorId,
    isOnBreak: profileQuery.data?.is_on_break ?? false,
    schedule: scheduleQuery.data ?? [],
    leaves: leavesQuery.data ?? [],
    toggleBreakMode: (status: boolean) => toggleBreakModeMutation.mutateAsync(status),
    updateDaySchedule: (
      availabilityId: string,
      updates: {
        start_time: string;
        end_time: string;
        slot_duration: number;
        is_available: boolean;
      },
    ) => updateDayScheduleMutation.mutateAsync({ availabilityId, updates }),
    requestLeaveRange: (startDate: string, endDate: string, reason: string) =>
      requestLeaveRangeMutation.mutateAsync({ startDate, endDate, reason }),
    cancelLeave: (leaveId: string) => cancelLeaveMutation.mutateAsync(leaveId),
    refresh,
  };
}
