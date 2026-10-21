import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { Appointment, AppointmentFull } from '../types/appointment';
import { logger } from '../utils/logger';

const appointmentFullSelect =
  'id, user_id, patient_name, center_id, service_id, doctor_id, doctor_name, center_name, service_name, scheduled_at, appointment_date, appointment_time, status, token_number, created_at, estimated_wait_mins, estimated_wait_time, cancel_reason, cancelled_by, cancelled_at, checked_in_at, called_at, started_at, completed_at, skipped_at, duration_minutes, current_position, queue_position, people_ahead, queue_status, current_serving_token, current_token, doctor_average_time, average_consultation_time, is_on_break, break_start, break_end';

const appointmentFullLegacySelect =
  'id, user_id, center_id, service_id, center_name, service_name, scheduled_at, status, token_number, created_at';

const appointmentSelect =
  'id, user_id, center_id, service_id, doctor_id, scheduled_at, appointment_date, appointment_time, status, token_number, estimated_wait_mins, notes, cancel_reason, cancelled_by, cancelled_at, checked_in_at, called_at, started_at, completed_at, skipped_at, duration_minutes, created_at';

const appointmentLegacySelect =
  'id, user_id, center_id, service_id, scheduled_at, status, token_number, created_at';

const shouldFallbackFromAppointmentsFull = (code?: string) =>
  code === '42703' || code === '42501' || code === 'PGRST205';

const getAuthenticatedUserId = async (expectedUserId?: string) => {
  let {
    data: { session },
  } = await supabase.auth.getSession();

  const storedSession = useAuthStore.getState().session;

  if (!session && storedSession?.access_token && storedSession.refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: storedSession.access_token,
      refresh_token: storedSession.refresh_token,
    });

    if (error) {
      throw new Error('Please login again to continue.');
    }

    session = data.session;
  }

  if (!session?.user?.id) {
    throw new Error('Please login again to continue.');
  }

  if (expectedUserId && expectedUserId !== session.user.id) {
    throw new Error(
      'Your login session changed. Please reopen booking and try again.',
    );
  }

  return session.user.id;
};

const enrichAppointments = async (
  appointments: AppointmentFull[],
): Promise<AppointmentFull[]> => {
  const centerIds = [...new Set(appointments.map(item => item.center_id))];
  const serviceIds = [...new Set(appointments.map(item => item.service_id))];

  const [centersResult, servicesResult] = await Promise.all([
    centerIds.length
      ? supabase.from('service_centers').select('id, name').in('id', centerIds)
      : Promise.resolve({ data: [], error: null }),
    serviceIds.length
      ? supabase.from('services').select('id, name').in('id', serviceIds)
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

export const appointmentService = {
  async fetchUserAppointments(userId: string): Promise<AppointmentFull[]> {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    logger.log('[DEBUG] Fetching appointments for user:', authenticatedUserId);

    const response = await supabase
      .from('appointments_full')
      .select(appointmentFullSelect)
      .eq('user_id', authenticatedUserId)
      .order('scheduled_at', {
        ascending: false,
      });

    let data = response.data as AppointmentFull[] | null;
    let error = response.error;

    if (error?.code === '42703') {
      const fallback = await supabase
        .from('appointments_full')
        .select(appointmentFullLegacySelect)
        .eq('user_id', authenticatedUserId)
        .order('scheduled_at', {
          ascending: false,
        });

      data = fallback.data as AppointmentFull[] | null;
      error = fallback.error;
    }

    if (shouldFallbackFromAppointmentsFull(error?.code)) {
      const appointments = await fetchAppointmentsFromTable(
        authenticatedUserId,
      );
      logger.log('[DEBUG] Fetched appointments count:', appointments.length);
      return appointments;
    }

    if (error) {
      logger.error('[DEBUG] Failed to fetch appointments:', error.message);
      throw new Error(error.message);
    }

    logger.log('[DEBUG] Fetched appointments count:', data?.length ?? 0);
    return (data ?? []) as AppointmentFull[];
  },

  async fetchAppointmentById(
    appointmentId: string,
  ): Promise<AppointmentFull | null> {
    logger.log('[DEBUG] Fetching appointment by id:', appointmentId);

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
      logger.error(
        '[DEBUG] Failed to fetch appointment by id:',
        error.message,
      );
      throw new Error(error.message);
    }

    return data as AppointmentFull;
  },

  async checkInAppointment(appointmentId: string): Promise<AppointmentFull> {
    const authenticatedUserId = await getAuthenticatedUserId();
    const checkedInAt = new Date().toISOString();

    logger.log('[CHECK_IN] Starting patient check-in:', {
      appointmentId,
      userId: authenticatedUserId,
    });

    const { data, error } = await supabase
      .from('appointments')
      .update({
        status: 'checked_in',
        checked_in_at: checkedInAt,
      })
      .eq('id', appointmentId)
      .eq('user_id', authenticatedUserId)
      .eq('status', 'confirmed')
      .select(appointmentSelect)
      .maybeSingle();

    if (error) {
      logger.error('[CHECK_IN] Database update failed:', {
        appointmentId,
        code: error.code,
        message: error.message,
      });
      throw new Error(error.message);
    }

    if (!data) {
      const { data: currentAppointment, error: fetchError } = await supabase
        .from('appointments')
        .select('id, status')
        .eq('id', appointmentId)
        .eq('user_id', authenticatedUserId)
        .maybeSingle();

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      if (!currentAppointment) {
        throw new Error('Appointment not found.');
      }

      logger.warn('[CHECK_IN] Invalid status transition:', {
        appointmentId,
        currentStatus: currentAppointment.status,
      });
      throw new Error('Only confirmed appointments can be checked in.');
    }

    logger.log('[CHECK_IN] Appointment checked in successfully:', {
      appointmentId,
      status: data.status,
      checkedInAt: data.checked_in_at,
    });

    const [appointment] = await enrichAppointments([data as AppointmentFull]);
    return appointment;
  },

  async staffCheckInAppointment(appointmentId: string): Promise<AppointmentFull> {
    const checkedInAt = new Date().toISOString();
    logger.log('[STAFF_CHECK_IN] Counter staff check-in:', { appointmentId });

    const { data, error } = await supabase
      .from('appointments')
      .update({
        status: 'checked_in',
        checked_in_at: checkedInAt,
      })
      .eq('id', appointmentId)
      .eq('status', 'confirmed')
      .select(appointmentSelect)
      .maybeSingle();

    if (error) {
      logger.error('[STAFF_CHECK_IN] Database update failed:', error.message);
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error('Appointment not found or not in confirmed state.');
    }

    const [appointment] = await enrichAppointments([data as AppointmentFull]);
    return appointment;
  },

  async callAppointment(appointmentId: string): Promise<AppointmentFull> {
    await getAuthenticatedUserId();
    const calledAt = new Date().toISOString();

    logger.log('[CALL_TOKEN] Starting token call:', {
      appointmentId,
      calledAt,
    });

    // Attempt RPC call first
    const { error: rpcError } = await supabase.rpc('call_appointment', {
      p_appointment_id: appointmentId,
    });

    if (!rpcError) {
      logger.log('[CALL_TOKEN] RPC call_appointment succeeded');
      const appointment = await appointmentService.fetchAppointmentById(appointmentId);
      if (appointment) return appointment;
    } else {
      logger.warn('[CALL_TOKEN] RPC call_appointment skipped or failed, using table update fallback:', rpcError.message);
    }

    // Direct table update fallback supporting confirmed, checked_in, pending
    const { data, error } = await supabase
      .from('appointments')
      .update({
        status: 'called',
        called_at: calledAt,
      })
      .eq('id', appointmentId)
      .in('status', ['confirmed', 'checked_in', 'pending'])
      .select(appointmentSelect)
      .maybeSingle();

    if (error) {
      logger.error('[CALL_TOKEN] Database update failed:', {
        appointmentId,
        code: error.code,
        message: error.message,
      });
      throw new Error(error.message);
    }

    if (!data) {
      const { data: currentAppointment, error: fetchError } = await supabase
        .from('appointments')
        .select('id, status')
        .eq('id', appointmentId)
        .maybeSingle();

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      if (!currentAppointment) {
        throw new Error('Appointment not found.');
      }

      logger.warn('[CALL_TOKEN] Invalid status transition:', {
        appointmentId,
        currentStatus: currentAppointment.status,
      });
      throw new Error(`Cannot call token from current status: ${currentAppointment.status}`);
    }

    logger.log('[CALL_TOKEN] Token called successfully:', {
      appointmentId,
      status: data.status,
      calledAt: data.called_at,
      tokenNumber: data.token_number,
    });

    const [appointment] = await enrichAppointments([data as AppointmentFull]);
    return appointment;
  },

  async cancelAppointment(
    appointmentId: string,
    reason?: string,
  ): Promise<AppointmentFull> {
    try {
      logger.log(
        '[DEBUG] Cancelling appointment via RPC cancel_appointment:',
        appointmentId,
      );

      const authenticatedUserId = await getAuthenticatedUserId();

      // Try to cancel via security definer RPC function to bypass update limitations
      const { error: rpcError } = await supabase.rpc(
        'cancel_appointment',
        {
          p_appointment_id: appointmentId,
          p_reason: reason || 'User requested cancellation',
        },
      );

      if (rpcError) {
        logger.warn(
          '[DEBUG] RPC cancel_appointment failed, falling back to direct update:',
          rpcError.message,
        );

        const { error } = await supabase
          .from('appointments')
          .update({
            status: 'cancelled',
            cancel_reason: reason || 'User cancelled',
            cancelled_at: new Date().toISOString(),
          })
          .eq('id', appointmentId)
          .eq('user_id', authenticatedUserId)
          .in('status', ['pending', 'confirmed', 'checked_in', 'called', 'in_progress']);

        if (error) {
          logger.error(
            '[DEBUG] Direct cancel fallback failed:',
            error.message,
          );
          throw error;
        }
      }

      logger.log('[DEBUG] Appointment cancelled successfully');
      const appointment = await appointmentService.fetchAppointmentById(
        appointmentId,
      );
      if (!appointment)
        throw new Error('Appointment not found after cancellation');
      return appointment;
    } catch (err: any) {
      logger.error('[APPOINTMENTS] Cancel error:', err.message);
      throw err;
    }
  },

  async rescheduleAppointment(
    appointmentId: string,
    newDate: string,
  ): Promise<Appointment> {
    const { data, error } = await supabase
      .from('appointments')
      .update({ scheduled_at: new Date(newDate).toISOString() })
      .eq('id', appointmentId)
      .select(appointmentSelect)
      .single();

    if (error) {
      throw new Error(error.message);
    }
    return data as Appointment;
  },
};
