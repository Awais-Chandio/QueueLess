import { create } from 'zustand';
import { AppointmentFull } from '../types/appointment';
import { appointmentService } from '../services/appointmentService';
import {
  subscribeToAppointments as subscribeToAppointmentsRealtime,
  unsubscribeAppointments,
} from '../services/queueService';
import { useAuthStore } from './authStore';

const sortAppointments = (appointments: AppointmentFull[]) =>
  [...appointments].sort(
    (a, b) =>
      new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime(),
  );

let appointmentsRealtimeChannel: ReturnType<
  typeof subscribeToAppointmentsRealtime
> | null = null;

interface AppointmentsState {
  appointments: AppointmentFull[];

  loading: boolean;
  error: string | null;

  fetchUserAppointments: (userId: string) => Promise<AppointmentFull[]>;

  checkInAppointment: (id: string) => Promise<AppointmentFull>;
  checkingInId: string | null;

  cancelAppointment: (id: string, reason?: string) => Promise<AppointmentFull>;
  cancellingId: string | null;

  callAppointment: (id: string) => Promise<AppointmentFull>;
  callingId: string | null;

  subscribeToAppointments: (
    userId?: string | null,
    onChange?: () => void,
  ) => () => void;

  reset: () => void;
}

export const useAppointmentsStore = create<AppointmentsState>((set, get) => ({
  appointments: [],
  loading: false,
  error: null,
  checkingInId: null,
  cancellingId: null,
  callingId: null,

  fetchUserAppointments: async userId => {
    try {
      console.log('[DEBUG] Store: Fetching appointments for user:', userId);
      set({ loading: true, error: null });

      const appointments = await appointmentService.fetchUserAppointments(
        userId,
      );

      set({
        appointments,
        loading: false,
      });
      console.log('[DEBUG] Store: Appointments fetched and updated in state');
      return appointments;
    } catch (error) {
      console.error('[DEBUG] Store: Failed to fetch appointments:', error);
      set({
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch appointments',
      });
      return [];
    }
  },

  checkInAppointment: async id => {
    const userId = useAuthStore.getState().user?.id;

    if (!userId) {
      throw new Error('Please login again to check in.');
    }

    try {
      console.log('[CHECK_IN_STORE] Checking in appointment:', id);
      set({ checkingInId: id, error: null });

      const updatedAppointment = await appointmentService.checkInAppointment(
        id,
      );

      set(state => ({
        appointments: sortAppointments(
          state.appointments.map(appointment =>
            appointment.id === id ? updatedAppointment : appointment,
          ),
        ),
        checkingInId: null,
        error: null,
      }));

      try {
        const appointments = await appointmentService.fetchUserAppointments(
          userId,
        );

        set({
          appointments,
          checkingInId: null,
          error: null,
        });

        console.log(
          '[CHECK_IN_STORE] Check-in completed and appointments refreshed:',
          {
            appointmentId: id,
            appointmentsCount: appointments.length,
          },
        );
      } catch (refreshError) {
        console.warn(
          '[CHECK_IN_STORE] Check-in succeeded but refresh failed:',
          {
            appointmentId: id,
            message:
              refreshError instanceof Error
                ? refreshError.message
                : 'Unknown refresh error',
          },
        );
      }

      return updatedAppointment;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to check in';

      console.error('[CHECK_IN_STORE] Check-in failed:', {
        appointmentId: id,
        message,
      });
      set({
        checkingInId: null,
        error: message,
      });
      throw new Error(message);
    }
  },

  cancelAppointment: async (id, reason) => {
    try {
      set({ cancellingId: id, error: null });
      const updatedAppointment = await appointmentService.cancelAppointment(
        id,
        reason,
      );

      set(state => ({
        appointments: sortAppointments(
          state.appointments.map(appointment =>
            appointment.id === id ? updatedAppointment : appointment,
          ),
        ),
        cancellingId: null,
      }));
      return updatedAppointment;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to cancel appointment';
      set({ cancellingId: null, error: message });
      throw new Error(message);
    }
  },

  callAppointment: async id => {
    const userId = useAuthStore.getState().user?.id;

    if (!userId) {
      throw new Error('Please login again to call token.');
    }

    try {
      console.log('[CALL_TOKEN_STORE] Calling appointment token:', id);
      set({ callingId: id, error: null });

      const updatedAppointment = await appointmentService.callAppointment(id);

      set(state => ({
        appointments: sortAppointments(
          state.appointments.map(appointment =>
            appointment.id === id ? updatedAppointment : appointment,
          ),
        ),
        callingId: null,
        error: null,
      }));

      try {
        const appointments = await appointmentService.fetchUserAppointments(
          userId,
        );

        set({
          appointments,
          callingId: null,
          error: null,
        });

        console.log(
          '[CALL_TOKEN_STORE] Call completed and appointments refreshed:',
          {
            appointmentId: id,
            appointmentsCount: appointments.length,
          },
        );
      } catch (refreshError) {
        console.warn('[CALL_TOKEN_STORE] Call succeeded but refresh failed:', {
          appointmentId: id,
          message:
            refreshError instanceof Error
              ? refreshError.message
              : 'Unknown refresh error',
        });
      }

      return updatedAppointment;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to call token';

      console.error('[CALL_TOKEN_STORE] Call failed:', {
        appointmentId: id,
        message,
      });
      set({
        callingId: null,
        error: message,
      });
      throw new Error(message);
    }
  },

  subscribeToAppointments: (userId, onChange) => {
    if (appointmentsRealtimeChannel) {
      unsubscribeAppointments(appointmentsRealtimeChannel);
      appointmentsRealtimeChannel = null;
    }

    const channel = subscribeToAppointmentsRealtime({
      channelName: `appointments-store-${userId ?? 'all'}-${Date.now()}`,
      onChange: () => {
        if (onChange) {
          onChange();
          return;
        }

        if (userId) {
          get()
            .fetchUserAppointments(userId)
            .catch(() => undefined);
        }
      },
    });

    appointmentsRealtimeChannel = channel;

    return () => {
      if (appointmentsRealtimeChannel === channel) {
        appointmentsRealtimeChannel = null;
      }

      unsubscribeAppointments(channel);
    };
  },

  reset: () => {
    if (appointmentsRealtimeChannel) {
      unsubscribeAppointments(appointmentsRealtimeChannel);
      appointmentsRealtimeChannel = null;
    }

    set({
      appointments: [],
      loading: false,
      error: null,
      checkingInId: null,
      callingId: null,
      cancellingId: null,
    });
  },
}));

// Alias for singular naming convention
export const useAppointmentStore = useAppointmentsStore;
