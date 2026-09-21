import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../../store/authStore';
import {
  doctorAvailabilityService,
  DaySchedulePayload,
  DoctorLeave,
} from '../services/doctorAvailabilityService';
import type { Doctor } from '../../../types/doctor';
import type { DoctorSchedule } from '../services/doctorDashboardService';
import { dateKeysBetween, toDateKey } from '../utils/doctorFormat';

export type ScheduleRow = DoctorSchedule & { id: string; is_available: boolean };

/** Days ahead covered by the booking counts shown on schedule and leave screens. */
const BOOKING_WINDOW_DAYS = 60;

export function useDoctorAvailability() {
  const userId = useAuthStore(state => state.user?.id);
  // Known from sign-in, so schedule, leave and booking queries start without
  // waiting for the profile request.
  const authDoctorId = useAuthStore(state => state.doctorId);
  const queryClient = useQueryClient();

  const profileKey = ['doctor-profile-availability', userId];
  const profileQuery = useQuery({
    queryKey: profileKey,
    queryFn: () => doctorAvailabilityService.getDoctorProfile(userId!),
    enabled: !!userId,
  });

  const doctorId = authDoctorId ?? profileQuery.data?.id ?? null;

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

  const bookingWindow = useMemo(() => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + BOOKING_WINDOW_DAYS);
    return { from: toDateKey(from), to: toDateKey(to) };
  }, []);

  const bookingsQuery = useQuery<Record<string, number>>({
    queryKey: ['doctor-booking-counts', doctorId, bookingWindow.from],
    queryFn: () => doctorAvailabilityService.getBookingCounts(doctorId!, bookingWindow.from, bookingWindow.to),
    enabled: !!doctorId,
  });

  const isLoading = profileQuery.isLoading || (!!doctorId && (scheduleQuery.isLoading || leavesQuery.isLoading));

  const error =
    profileQuery.error ?? scheduleQuery.error ?? leavesQuery.error ?? null;

  // Optimistic: a switch that lags a network round-trip feels broken.
  const toggleBreakModeMutation = useMutation({
    mutationFn: (status: boolean) => doctorAvailabilityService.updateBreakMode(doctorId!, status),
    onMutate: async status => {
      await queryClient.cancelQueries({ queryKey: profileKey });
      const previous = queryClient.getQueryData<Doctor>(profileKey);
      if (previous) {
        queryClient.setQueryData<Doctor>(profileKey, { ...previous, is_on_break: status });
      }
      return { previous };
    },
    onError: (_err, _status, context) => {
      if (context?.previous) {
        queryClient.setQueryData(profileKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: profileKey });
      queryClient.invalidateQueries({ queryKey: ['doctor-profile'] });
      queryClient.invalidateQueries({ queryKey: ['doctor-queue'] });
    },
  });

  const scheduleKey = ['doctor-schedule', doctorId];
  const saveDayMutation = useMutation({
    mutationFn: ({ dayOfWeek, updates }: { dayOfWeek: number; updates: DaySchedulePayload }) =>
      doctorAvailabilityService.upsertDay(doctorId!, dayOfWeek, updates),
    onMutate: async ({ dayOfWeek, updates }) => {
      await queryClient.cancelQueries({ queryKey: scheduleKey });
      const previous = queryClient.getQueryData<ScheduleRow[]>(scheduleKey);
      if (previous) {
        const exists = previous.some(row => row.day_of_week === dayOfWeek);
        const next = exists
          ? previous.map(row => (row.day_of_week === dayOfWeek ? { ...row, ...updates } : row))
          : [...previous, { id: `pending-${dayOfWeek}`, day_of_week: dayOfWeek, ...updates }];
        queryClient.setQueryData<ScheduleRow[]>(scheduleKey, next);
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(scheduleKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: scheduleKey });
      queryClient.invalidateQueries({ queryKey: ['doctor-dashboard-extras'] });
    },
  });

  const requestLeaveRangeMutation = useMutation({
    mutationFn: ({ startDate, endDate, reason }: { startDate: Date; endDate: Date; reason: string }) =>
      doctorAvailabilityService.addLeaves(doctorId!, dateKeysBetween(startDate, endDate), reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor-leaves', doctorId] });
    },
  });

  const cancelLeaveMutation = useMutation({
    mutationFn: (leaveIds: string[]) => doctorAvailabilityService.deleteLeaves(leaveIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor-leaves', doctorId] });
    },
  });

  const refresh = async () => {
    await Promise.all([
      profileQuery.refetch(),
      scheduleQuery.refetch(),
      leavesQuery.refetch(),
      bookingsQuery.refetch(),
    ]);
  };

  return {
    isLoading,
    isRefetching: profileQuery.isRefetching || scheduleQuery.isRefetching || leavesQuery.isRefetching,
    error,
    doctorId,
    isOnBreak: profileQuery.data?.is_on_break ?? false,
    isTogglingBreak: toggleBreakModeMutation.isPending,
    schedule: scheduleQuery.data ?? [],
    leaves: leavesQuery.data ?? [],
    bookingCounts: bookingsQuery.data ?? {},
    toggleBreakMode: (status: boolean) => toggleBreakModeMutation.mutateAsync(status),
    saveDay: (dayOfWeek: number, updates: DaySchedulePayload) =>
      saveDayMutation.mutateAsync({ dayOfWeek, updates }),
    requestLeaveRange: (startDate: Date, endDate: Date, reason: string) =>
      requestLeaveRangeMutation.mutateAsync({ startDate, endDate, reason }),
    isRequestingLeave: requestLeaveRangeMutation.isPending,
    cancelLeaves: (leaveIds: string[]) => cancelLeaveMutation.mutateAsync(leaveIds),
    cancellingLeaveIds: cancelLeaveMutation.isPending ? cancelLeaveMutation.variables ?? [] : [],
    refresh,
  };
}
