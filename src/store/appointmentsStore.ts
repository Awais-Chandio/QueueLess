import { create } from 'zustand';

import {
  Appointment,
  AppointmentFull,
} from '../types/appointment';
import { appointmentsService } from '../features/appointments/api/appointmentsService';

const sortAppointments = (appointments: AppointmentFull[]) =>
  [...appointments].sort(
    (a, b) =>
      new Date(a.scheduled_at).getTime() -
      new Date(b.scheduled_at).getTime(),
  );

const toAppointmentFull = (appointment: Appointment): AppointmentFull => ({
  ...appointment,
  center_name: undefined,
  service_name: undefined,
});

interface AppointmentsState {
  appointments: AppointmentFull[];

  loading: boolean;
  error: string | null;

  createAppointment: (payload: {
    user_id: string;
    center_id: string;
    service_id: string;
    scheduled_at: string;
  }) => Promise<Appointment>;

  fetchUserAppointments: (userId: string) => Promise<AppointmentFull[]>;

  reset: () => void;
}

export const useAppointmentsStore = create<AppointmentsState>((set) => ({
  appointments: [],
  loading: false,
  error: null,

  createAppointment: async (payload) => {
    try {
      console.log('[DEBUG] Store: Creating appointment with payload:', payload);
      set({ loading: true, error: null });

      const newAppointment =
        await appointmentsService.createAppointment(payload);

      set(state => ({
        appointments: sortAppointments([
          toAppointmentFull(newAppointment),
          ...state.appointments.filter(
            appointment => appointment.id !== newAppointment.id,
          ),
        ]),
        loading: false,
      }));
      console.log('[DEBUG] Store: Appointment created:', newAppointment.id);
      return newAppointment;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to create appointment';

      console.error('[DEBUG] Store: Failed to create appointment:', message);
      set({
        loading: false,
        error: message,
      });

      throw new Error(message);
    }
  },

  fetchUserAppointments: async (userId) => {
    try {
      console.log('[DEBUG] Store: Fetching appointments for user:', userId);
      set({ loading: true, error: null });

      const appointments =
        await appointmentsService.fetchUserAppointments(userId);

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

  reset: () => {
    set({
      appointments: [],
      loading: false,
      error: null,
    });
  },
}));
