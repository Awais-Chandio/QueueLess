import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../../store/authStore';
import {
  doctorAvailabilityService,
  DoctorLeave,
} from '../services/doctorAvailabilityService';
import type { DoctorSchedule } from '../services/doctorDashboardService';

export function useDoctorAvailability() {
  const { user } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [schedule, setSchedule] = useState<(DoctorSchedule & { id: string; is_available: boolean })[]>([]);
  const [leaves, setLeaves] = useState<DoctorLeave[]>([]);

  const loadData = useCallback(async (showLoading = true) => {
    if (!user?.id) {
      setError('User not logged in.');
      setIsLoading(false);
      return;
    }

    if (showLoading) setIsLoading(true);
    setError(null);

    try {
      // 1. Get Doctor Profile to resolve doctorId and break status
      const profile = await doctorAvailabilityService.getDoctorProfile(user.id);
      setDoctorId(profile.id);
      setIsOnBreak(profile.is_on_break);

      // 2. Fetch schedule and leaves concurrently
      const [scheduleData, leavesData] = await Promise.all([
        doctorAvailabilityService.getWeeklySchedule(profile.id),
        doctorAvailabilityService.getLeaves(profile.id),
      ]);

      setSchedule(scheduleData);
      setLeaves(leavesData);
    } catch (err: any) {
      console.error('[useDoctorAvailability] Error loading data:', err);
      setError(err?.message || 'Failed to load availability data.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleBreakMode = async (status: boolean) => {
    if (!doctorId) return;
    try {
      setIsLoading(true);
      await doctorAvailabilityService.updateBreakMode(doctorId, status);
      setIsOnBreak(status);
    } catch (err: any) {
      console.error('[useDoctorAvailability] Error toggling break mode:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const updateDaySchedule = async (
    availabilityId: string,
    updates: {
      start_time: string;
      end_time: string;
      slot_duration: number;
      is_available: boolean;
    }
  ) => {
    try {
      setIsLoading(true);
      await doctorAvailabilityService.updateDayAvailability(availabilityId, updates);
      await loadData(false);
    } catch (err: any) {
      console.error('[useDoctorAvailability] Error updating day schedule:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const requestLeaveRange = async (startDate: string, endDate: string, reason: string) => {
    if (!doctorId) return;
    try {
      setIsLoading(true);
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
        dates.map(dateStr => doctorAvailabilityService.addLeave(doctorId, dateStr, reason))
      );
      await loadData(false);
    } catch (err: any) {
      console.error('[useDoctorAvailability] Error requesting leave range:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const cancelLeave = async (leaveId: string) => {
    try {
      setIsLoading(true);
      await doctorAvailabilityService.deleteLeave(leaveId);
      await loadData(false);
    } catch (err: any) {
      console.error('[useDoctorAvailability] Error cancelling leave:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    error,
    doctorId,
    isOnBreak,
    schedule,
    leaves,
    toggleBreakMode,
    updateDaySchedule,
    requestLeaveRange,
    cancelLeave,
    refresh: () => loadData(false),
  };
}
