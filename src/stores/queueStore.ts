import { create } from 'zustand';
import { Center, CenterService } from '../types/center';
import { AppointmentFull } from '../types/appointment';
import { centerService } from '../services/centerService';
import { queueService, StaffDashboardStats } from '../services/queueService';

// ==========================================
// Centers Store State & Definition
// ==========================================
interface CentersState {
  centers: Center[];
  selectedCenter: Center | null;
  centerServices: CenterService[];

  loading: boolean;
  error: string | null;

  fetchCenters: () => Promise<void>;
  fetchCenterById: (centerId: string) => Promise<void>;
  fetchCenterServices: (centerId: string) => Promise<void>;
  reset: () => void;
}

export const useCentersStore = create<CentersState>(set => ({
  centers: [],
  selectedCenter: null,
  centerServices: [],
  loading: false,
  error: null,

  fetchCenters: async () => {
    try {
      set({ loading: true, error: null });
      const centers = await centerService.getCenters();
      set({ centers, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch centers',
      });
    }
  },

  fetchCenterById: async (centerId: string) => {
    try {
      set({ loading: true, error: null });
      const center = await centerService.getCenterById(centerId);
      set({ selectedCenter: center, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch center',
      });
    }
  },

  fetchCenterServices: async (centerId: string) => {
    try {
      set({ loading: true, error: null });
      const services = await centerService.getCenterServices(centerId);
      set({ centerServices: services, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch services',
      });
    }
  },

  reset: () => {
    set({
      centers: [],
      selectedCenter: null,
      centerServices: [],
      loading: false,
      error: null,
    });
  },
}));

// ==========================================
// Staff Queue Store State & Definition
// ==========================================
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
    ['confirmed', 'checked_in', 'called', 'in_progress'].includes(item.status),
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
      const dashboard = await queueService.fetchDashboard();
      set({
        appointments: dashboard.appointments,
        stats: dashboard.stats,
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load staff dashboard',
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

// Alias for singular naming convention
export const useQueueStore = useStaffQueueStore;
