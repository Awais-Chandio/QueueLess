import { supabase } from '../supabase/client';
import {
  Appointment,
  AppointmentFull,
} from '../../types/appointment';

const appointmentFullSelect =
  'id, user_id, center_id, service_id, center_name, service_name, scheduled_at, status, token_number, created_at, estimated_wait_mins, current_position, people_ahead, queue_status';

const appointmentFullLegacySelect =
  'id, user_id, center_id, service_id, center_name, service_name, scheduled_at, status, token_number, created_at';

const appointmentSelect =
  'id, user_id, center_id, service_id, scheduled_at, status, token_number, estimated_wait_mins, notes, created_at';

const appointmentLegacySelect =
  'id, user_id, center_id, service_id, scheduled_at, status, token_number, created_at';

type CreateAppointmentPayload = {
  user_id: string;
  center_id: string;
  service_id: string;
  scheduled_at: string;
};

const shouldFallbackFromAppointmentsFull = (
  code?: string,
) => code === '42703' || code === '42501' || code === 'PGRST205';

const enrichAppointments = async (
  appointments: AppointmentFull[],
): Promise<AppointmentFull[]> => {
  const centerIds = [...new Set(appointments.map(item => item.center_id))];
  const serviceIds = [...new Set(appointments.map(item => item.service_id))];

  const [centersResult, servicesResult] = await Promise.all([
    centerIds.length
      ? supabase
        .from('service_centers')
        .select('id, name')
        .in('id', centerIds)
      : Promise.resolve({ data: [], error: null }),
    serviceIds.length
      ? supabase
        .from('services')
        .select('id, name')
        .in('id', serviceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (centersResult.error) {
    throw new Error(centersResult.error.message);
  }

  if (servicesResult.error) {
    throw new Error(servicesResult.error.message);
  }

  const centerNames = new Map(
    (centersResult.data ?? []).map(item => [item.id, item.name]),
  );
  const serviceNames = new Map(
    (servicesResult.data ?? []).map(item => [item.id, item.name]),
  );

  return appointments.map(item => ({
    ...item,
    center_name: item.center_name ?? centerNames.get(item.center_id),
    service_name: item.service_name ?? serviceNames.get(item.service_id),
  }));
};

const fetchAppointmentsFromTable = async (
  userId: string,
): Promise<AppointmentFull[]> => {
  const response = await supabase
    .from('appointments')
    .select(appointmentSelect)
    .eq('user_id', userId)
    .order('scheduled_at', {
      ascending: true,
    });

  let data = response.data as AppointmentFull[] | null;
  let error = response.error;

  if (error?.code === '42703') {
    const fallback = await supabase
      .from('appointments')
      .select(appointmentLegacySelect)
      .eq('user_id', userId)
      .order('scheduled_at', {
        ascending: true,
      });

    data = fallback.data as AppointmentFull[] | null;
    error = fallback.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  return enrichAppointments(data ?? []);
};

const fetchAppointmentFromTable = async (
  appointmentId: string,
): Promise<AppointmentFull | null> => {
  const response = await supabase
    .from('appointments')
    .select(appointmentSelect)
    .eq('id', appointmentId)
    .single();

  let data = response.data as AppointmentFull | null;
  let error = response.error;

  if (error?.code === '42703') {
    const fallback = await supabase
      .from('appointments')
      .select(appointmentLegacySelect)
      .eq('id', appointmentId)
      .single();

    data = fallback.data as AppointmentFull | null;
    error = fallback.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  const [appointment] = await enrichAppointments(data ? [data] : []);
  return appointment ?? null;
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
      .select('id, user_id, center_id, service_id, scheduled_at, status, token_number, estimated_wait_mins, notes, created_at')
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
    
    const response = await supabase
      .from('appointments_full')
      .select(appointmentFullSelect)
      .eq('user_id', userId)
      .order('scheduled_at', {
        ascending: true,
      });

    let data = response.data as AppointmentFull[] | null;
    let error = response.error;

    if (error?.code === '42703') {
      const fallback = await supabase
        .from('appointments_full')
        .select(appointmentFullLegacySelect)
        .eq('user_id', userId)
        .order('scheduled_at', {
          ascending: true,
        });

      data = fallback.data as AppointmentFull[] | null;
      error = fallback.error;
    }

    if (shouldFallbackFromAppointmentsFull(error?.code)) {
      const appointments = await fetchAppointmentsFromTable(userId);
      console.log('[DEBUG] Fetched appointments count:', appointments.length);
      return appointments;
    }

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

    const response = await supabase
      .from('appointments_full')
      .select(appointmentFullSelect)
      .eq('id', appointmentId)
      .single();

    let data = response.data as AppointmentFull | null;
    let error = response.error;

    if (error?.code === '42703') {
      const fallback = await supabase
        .from('appointments_full')
        .select(appointmentFullLegacySelect)
        .eq('id', appointmentId)
        .single();

      data = fallback.data as AppointmentFull | null;
      error = fallback.error;
    }

    if (shouldFallbackFromAppointmentsFull(error?.code)) {
      return fetchAppointmentFromTable(appointmentId);
    }

    if (error) {
      console.error('[DEBUG] Failed to fetch appointment by id:', error.message);
      throw new Error(error.message);
    }

    return data as AppointmentFull;
  },

  async cancelAppointment(
    appointmentId: string,
  ): Promise<Appointment> {
    console.log('[DEBUG] Cancelling appointment:', appointmentId);

    const { data, error } = await supabase
      .from('appointments')
      .update({
        status: 'cancelled',
      })
      .eq('id', appointmentId)
      .select(appointmentSelect)
      .single();

    if (error) {
      console.error('[DEBUG] Failed to cancel appointment:', error.message);
      throw new Error(error.message);
    }

    console.log('[DEBUG] Appointment cancelled successfully:', data?.id);
    return data as Appointment;
  },
};
