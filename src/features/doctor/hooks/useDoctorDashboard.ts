import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../../store/authStore';
import {
  doctorDashboardService,
  TodayAppointment,
  RecentPatient,
  IncomeSummary,
  DoctorSchedule,
} from '../services/doctorDashboardService';
import type { Doctor } from '../../../types/doctor';

export function useDoctorDashboard() {
  const { user } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [doctorProfile, setDoctorProfile] = useState<(Doctor & { center_name?: string; email?: string; phone?: string }) | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<TodayAppointment[]>([]);
  const [availability, setAvailability] = useState<{ status: string; tokens_ahead: number; estimated_wait_minutes: number } | null>(null);
  const [recentPatients, setRecentPatients] = useState<RecentPatient[]>([]);
  const [incomeSummary, setIncomeSummary] = useState<IncomeSummary | null>(null);
  const [schedule, setSchedule] = useState<DoctorSchedule[]>([]);

  const loadData = useCallback(async (showLoading = true) => {
    if (!user?.id) {
      setError('User not logged in.');
      setIsLoading(false);
      return;
    }

    if (showLoading) setIsLoading(true);
    setError(null);

    try {
      const profile = await doctorDashboardService.getDoctorProfile(user.id);
      setDoctorProfile(profile);

      const doctorId = profile.id;

      const [
        appointmentsData,
        availData,
        patientsData,
        incomeData,
        scheduleData,
      ] = await Promise.all([
        doctorDashboardService.getTodayAppointments(doctorId),
        doctorDashboardService.getDoctorAvailability(doctorId),
        doctorDashboardService.getRecentPatients(doctorId),
        doctorDashboardService.getIncomeSummary(doctorId),
        doctorDashboardService.getDoctorSchedule(doctorId),
      ]);

      setTodayAppointments(appointmentsData);
      setAvailability(availData);
      setRecentPatients(patientsData);
      setIncomeSummary(incomeData);
      setSchedule(scheduleData);
    } catch (err: any) {
      console.error('[useDoctorDashboard] Error loading data:', err);
      setError(err?.message || 'Failed to load dashboard data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refresh = useCallback(() => {
    return loadData(false);
  }, [loadData]);

  return {
    isLoading,
    error,
    doctorProfile,
    todayAppointments,
    availability,
    recentPatients,
    incomeSummary,
    schedule,
    refresh,
  };
}
