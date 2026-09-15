import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../../store/authStore';
import {
  doctorDashboardService,
  TodayAppointment,
  RecentPatient,
  IncomeSummary,
  DoctorSchedule,
} from '../services/doctorDashboardService';
import type { Doctor } from '../../../types/doctor';

interface DashboardExtras {
  todayAppointments: TodayAppointment[];
  availability: { status: string; tokens_ahead: number; estimated_wait_minutes: number };
  recentPatients: RecentPatient[];
  incomeSummary: IncomeSummary;
  schedule: DoctorSchedule[];
}

export function useDoctorDashboard() {
  const { user } = useAuthStore();

  const profileQuery = useQuery({
    queryKey: ['doctor-profile', user?.id],
    queryFn: () => doctorDashboardService.getDoctorProfile(user!.id),
    enabled: !!user?.id,
  });

  const doctorId = profileQuery.data?.id;

  const extrasQuery = useQuery<DashboardExtras>({
    queryKey: ['doctor-dashboard-extras', doctorId],
    queryFn: async () => {
      const [appointmentsData, availData, patientsData, incomeData, scheduleData] =
        await Promise.all([
          doctorDashboardService.getTodayAppointments(doctorId!),
          doctorDashboardService.getDoctorAvailability(doctorId!),
          doctorDashboardService.getRecentPatients(doctorId!),
          doctorDashboardService.getIncomeSummary(doctorId!),
          doctorDashboardService.getDoctorSchedule(doctorId!),
        ]);

      return {
        todayAppointments: appointmentsData,
        availability: availData,
        recentPatients: patientsData,
        incomeSummary: incomeData,
        schedule: scheduleData,
      };
    },
    enabled: !!doctorId,
  });

  const isLoading = profileQuery.isLoading || (!!doctorId && extrasQuery.isLoading);

  const error = !user?.id
    ? 'User not logged in.'
    : profileQuery.error instanceof Error
      ? profileQuery.error.message
      : extrasQuery.error instanceof Error
        ? extrasQuery.error.message
        : null;

  const refresh = async () => {
    await Promise.all([profileQuery.refetch(), extrasQuery.refetch()]);
  };

  return {
    isLoading,
    error,
    doctorProfile: (profileQuery.data ?? null) as
      | (Doctor & { center_name?: string; email?: string; phone?: string })
      | null,
    todayAppointments: extrasQuery.data?.todayAppointments ?? [],
    availability: extrasQuery.data?.availability ?? null,
    recentPatients: extrasQuery.data?.recentPatients ?? [],
    incomeSummary: extrasQuery.data?.incomeSummary ?? null,
    schedule: extrasQuery.data?.schedule ?? [],
    refresh,
  };
}
