import { supabase } from '../supabase/client';
import {
  Appointment,
  AppointmentFull,
} from '../../types/appointment';

const appointmentFullSelect =
  'id, user_id, center_id, service_id, center_name, service_name, scheduled_at, status, token_number, created_at';

type CreateAppointmentPayload = {
  user_id: string;
  center_id: string;
  service_id: string;
  scheduled_at: string;
};

export const appointmentsService = {
  async createAppointment(
    payload: CreateAppointmentPayload,
  ): Promise<Appointment> {
    const insertPayload = {
      user_id: payload.user_id,
      center_id: payload.center_id,
      service_id: payload.service_id,
      scheduled_at: new Date(payload.scheduled_at).toISOString(),
    };

    console.log('[DEBUG] Creating appointment with payload:', insertPayload);
    
    const { data, error } = await supabase
      .from('appointments')
      .insert(insertPayload)
      .select('id, user_id, center_id, service_id, scheduled_at, status, token_number, created_at')
      .single();

    if (error) {
      console.error('[DEBUG] Failed to create appointment:', error.message);
      throw new Error(error.message);
    }

    console.log('[DEBUG] Appointment created successfully:', data);
    return data as Appointment;
  },

  async fetchUserAppointments(
    userId: string,
  ): Promise<AppointmentFull[]> {
    console.log('[DEBUG] Fetching appointments for user:', userId);
    
    const { data, error } = await supabase
      .from('appointments_full')
      .select(appointmentFullSelect)
      .eq('user_id', userId)
      .order('scheduled_at', {
        ascending: true,
      });

    if (error) {
      console.error('[DEBUG] Failed to fetch appointments:', error.message);
      throw new Error(error.message);
    }

    console.log('[DEBUG] Fetched appointments count:', data?.length ?? 0);
    return (data ?? []) as AppointmentFull[];
  },

  async fetchAppointmentById(
    appointmentId: string,
  ): Promise<AppointmentFull | null> {
    console.log('[DEBUG] Fetching appointment by id:', appointmentId);

    const { data, error } = await supabase
      .from('appointments_full')
      .select(appointmentFullSelect)
      .eq('id', appointmentId)
      .single();

    if (error) {
      console.error('[DEBUG] Failed to fetch appointment by id:', error.message);
      throw new Error(error.message);
    }

    return data as AppointmentFull;
  },
};
