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
      // get_doctor_availability is not called: it reads a doctor_availability
      // table that does not exist, so it always errored. Live queue numbers are
      // derived from today's appointments instead.
      const [appointmentsData, patientsData, incomeData, scheduleData] =
        await Promise.all([
          doctorDashboardService.getTodayAppointments(doctorId!),
          doctorDashboardService.getRecentPatients(doctorId!),
          doctorDashboardService.getIncomeSummary(doctorId!),
          doctorDashboardService.getDoctorSchedule(doctorId!),
        ]);

      return {
        todayAppointments: appointmentsData,
        recentPatients: patientsData,
        incomeSummary: incomeData,
        schedule: scheduleData,
      };
    },
    enabled: !!doctorId,
  });

  const isLoading = profileQuery.isLoading || (!!doctorId && extrasQuery.isLoading);

  const error = profileQuery.error ?? extrasQuery.error ?? null;

  const refresh = async () => {
    await Promise.all([profileQuery.refetch(), extrasQuery.refetch()]);
  };

  return {
    isLoading,
    isRefetching: profileQuery.isRefetching || extrasQuery.isRefetching,
    error,
    doctorProfile: (profileQuery.data ?? null) as
      | (Doctor & { center_name?: string; email?: string; phone?: string })
      | null,
    todayAppointments: extrasQuery.data?.todayAppointments ?? [],
    recentPatients: extrasQuery.data?.recentPatients ?? [],
    incomeSummary: extrasQuery.data?.incomeSummary ?? null,
    schedule: extrasQuery.data?.schedule ?? [],
    refresh,
  };
}
