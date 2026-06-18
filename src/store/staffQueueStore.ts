import { create } from 'zustand';
import type { AppointmentFull } from '../types/appointment';
import type { StaffDashboardStats } from '../features/staff/api/staffQueueService';
import { staffQueueService } from '../features/staff/api/staffQueueService';

type StaffQueueState = {
  appointments: AppointmentFull[];
  stats: StaffDashboardStats;
  loading: boolean;
  error: string | null;
  fetchDashboard: () => Promise<void>;
  setAppointments: (appointments: AppointmentFull[]) => void;
  reset: () => void;
};

const emptyStats: StaffDashboardStats = {
  totalToday: 0,
  pending: 0,
  confirmed: 0,
  completed: 0,
  cancelled: 0,
  activeQueue: 0,
};

const calculateStats = (appointments: AppointmentFull[]): StaffDashboardStats => ({
  totalToday: appointments.length,
  pending: appointments.filter(item => item.status === 'pending').length,
  confirmed: appointments.filter(item => item.status === 'confirmed').length,
  completed: appointments.filter(item => item.status === 'completed').length,
  cancelled: appointments.filter(item => item.status === 'cancelled').length,
  activeQueue: appointments.filter(item =>
    ['confirmed', 'in_progress'].includes(item.status),
  ).length,
});

export const useStaffQueueStore = create<StaffQueueState>(set => ({
  appointments: [],
  stats: emptyStats,
  loading: false,
  error: null,

  fetchDashboard: async () => {
    set({ loading: true, error: null });
    try {
      const dashboard = await staffQueueService.fetchDashboard();
      set({
        appointments: dashboard.appointments,
        stats: dashboard.stats,
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load staff dashboard',
      });
    }
  },

  setAppointments: appointments =>
    set({
      appointments,
      stats: calculateStats(appointments),
      error: null,
      loading: false,
    }),

  reset: () =>
    set({
      appointments: [],
      stats: emptyStats,
      loading: false,
      error: null,
    }),
}));
