import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { Appointment, AppointmentFull } from '../types/appointment';
import {
  APPOINTMENT_SLOT_LABELS,
  getScheduledAtFromSlot,
  isPastAppointmentDate,
  isPastAppointmentSlot,
  normalizeAppointmentTimeSlot,
  timeToMinutes,
  getPakistanDayOfWeek,
} from '../features/appointments/utils/appointmentTime';

const appointmentFullSelect =
  'id, user_id, patient_name, center_id, service_id, doctor_id, doctor_name, center_name, service_name, scheduled_at, appointment_date, appointment_time, status, token_number, created_at, estimated_wait_mins, estimated_wait_time, cancel_reason, cancelled_by, cancelled_at, checked_in_at, called_at, started_at, completed_at, skipped_at, duration_minutes, current_position, queue_position, people_ahead, queue_status, current_serving_token, current_token, doctor_average_time, average_consultation_time, is_on_break, break_start, break_end';

const appointmentFullLegacySelect =
  'id, user_id, center_id, service_id, center_name, service_name, scheduled_at, status, token_number, created_at';

const appointmentSelect =
  'id, user_id, center_id, service_id, doctor_id, scheduled_at, appointment_date, appointment_time, status, token_number, estimated_wait_mins, notes, cancel_reason, cancelled_by, cancelled_at, checked_in_at, called_at, started_at, completed_at, skipped_at, duration_minutes, created_at';

const appointmentLegacySelect =
  'id, user_id, center_id, service_id, scheduled_at, status, token_number, created_at';

type CreateAppointmentPayload = {
  user_id: string;
  center_id: string;
  service_id: string;
  scheduled_at: string;
  appointment_date?: string;
  appointment_time?: string;
  doctor_id?: string;
  notes?: string;
};

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

const minutesToSlotLabel = (mins: number): string => {
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  const displayMin = `${minutes}`.padStart(2, '0');
  const displayHrStr = `${displayHour}`.padStart(2, '0');
  return `${displayHrStr}:${displayMin} ${period}`;
};

const getBookedSlotsByDate = async (
  appointmentDate: string,
  centerId?: string,
  doctorId?: string,
) => {
  const start = getScheduledAtFromSlot(appointmentDate, '12:00 AM');
  const end = new Date(`${appointmentDate}T00:00:00`);
  end.setDate(end.getDate() + 1);

  let fallbackQuery = supabase
    .from('appointments')
    .select('scheduled_at, status')
    .gte('scheduled_at', start)
    .lt('scheduled_at', end.toISOString())
    .neq('status', 'cancelled');

  if (doctorId) {
    fallbackQuery = fallbackQuery.eq('doctor_id', doctorId);
  } else if (centerId) {
    fallbackQuery = fallbackQuery.eq('center_id', centerId);
  }

  const fallback = await fallbackQuery;

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  return new Set(
    (fallback.data ?? []).map(item => {
      const slot = new Date(item.scheduled_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      return normalizeAppointmentTimeSlot(slot) ?? slot;
    }),
  );
};

export const appointmentService = {
  async triggerCleanup(): Promise<void> {
    try {
      await supabase.rpc('cleanup_stale_appointments');
    } catch (cleanupError) {
      console.warn(
        '[CLEANUP] Failed to trigger stale appointments cleanup:',
        cleanupError,
      );
    }
  },

  async getAvailableSlots(
    appointmentDate: string,
    centerId?: string,
    doctorId?: string,
  ): Promise<string[]> {
    console.log('[SLOTS] Fetching available slots:', {
      appointmentDate,
      centerId: centerId ?? null,
      doctorId: doctorId ?? null,
    });

    await appointmentService.triggerCleanup();

    let openMin = 0;
    let closeMin = 1440; // End of day
    let doctorSlots: string[] | null = null;

    if (doctorId) {
      const dayOfWeek = getPakistanDayOfWeek(appointmentDate);
      try {
        const { data: doctorData, error: docErr } = await supabase
          .from('doctors')
          .select(`
            id,
            status,
            is_active,
            doctor_schedules (
              start_time,
              end_time,
              day_of_week
            )
          `)
          .eq('id', doctorId)
          .eq('status', 'active')
          .eq('is_active', true)
          .maybeSingle();

        if (docErr) {
          console.warn('[SLOTS] Failed to load doctor availability:', docErr);
        } else if (doctorData) {
          // Find the availability for the day of week
          const availabilityList = (doctorData.doctor_schedules || []) as any[];
          const todayAvail = availabilityList.find(avail => avail.day_of_week === dayOfWeek);

          if (todayAvail) {
            const startMin = timeToMinutes(todayAvail.start_time);
            const endMin = timeToMinutes(todayAvail.end_time);
            const duration = 15; // default 15 mins slot
            
            const generated: string[] = [];
            for (let min = startMin; min <= endMin - duration; min += duration) {
              generated.push(minutesToSlotLabel(min));
            }
            doctorSlots = generated;
          } else {
            console.log('[SLOTS] Doctor is not working today (day of week):', dayOfWeek);
            return [];
          }
        }
      } catch (err) {
        console.warn('[SLOTS] Exception while loading doctor availability:', err);
      }
    }

    if (centerId && !doctorSlots) {
      try {
        const { data: center } = await supabase
          .from('service_centers')
          .select('open_time, close_time')
          .eq('id', centerId)
          .maybeSingle();

        if (center) {
          if (center.open_time) openMin = timeToMinutes(center.open_time);
          if (center.close_time) closeMin = timeToMinutes(center.close_time);
        }
      } catch (centerErr) {
        console.warn(
          '[SLOTS] Failed to load center operating hours:',
          centerErr,
        );
      }
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id;

    // Fetch other users' unexpired slot locks
    let activeLocks: Set<string> = new Set();
    if (centerId) {
      try {
        const { data: locks } = await supabase
          .from('slot_locks')
          .select('appointment_time, user_id')
          .eq('center_id', centerId)
          .eq('appointment_date', appointmentDate)
          .gt('expires_at', new Date().toISOString());

        if (locks) {
          locks.forEach(lock => {
            if (lock.user_id !== currentUserId) {
              activeLocks.add(lock.appointment_time);
            }
          });
        }
      } catch (lockError) {
        console.warn('[SLOTS] Failed to fetch active slot locks:', lockError);
      }
    }

    const bookedSlots = await getBookedSlotsByDate(appointmentDate, centerId, doctorId);
    
    const slotsSource = doctorSlots ?? (APPOINTMENT_SLOT_LABELS as readonly string[]);

    const availableSlots = slotsSource.filter(slot => {
      const slotMin = timeToMinutes(slot);
      const isWithinHours = doctorSlots ? true : (slotMin >= openMin && slotMin <= closeMin);
      return (
        isWithinHours &&
        !bookedSlots.has(slot) &&
        !activeLocks.has(slot) &&
        !isPastAppointmentDate(appointmentDate) &&
        !isPastAppointmentSlot(appointmentDate, slot)
      );
    });

    console.log('[SLOTS] Available slots calculated:', {
      appointmentDate,
      bookedSlots: [...bookedSlots],
      activeLocks: [...activeLocks],
      availableSlots,
    });

    return availableSlots;
  },

  async lockSlot(
    centerId: string,
    appointmentDate: string,
    appointmentTime: string,
  ): Promise<void> {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) throw new Error('Please login to lock a slot.');

    // 1. Delete any existing locks for this user to prevent multiple slots locking
    await supabase.from('slot_locks').delete().eq('user_id', userId);

    // 2. Insert new lock
    const { error } = await supabase.from('slot_locks').insert({
      user_id: userId,
      center_id: centerId,
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
    });

    if (error) {
      throw new Error('Failed to lock slot: ' + error.message);
    }
  },

  async unlockSlot(): Promise<void> {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (userId) {
      await supabase.from('slot_locks').delete().eq('user_id', userId);
    }
  },

  async createAppointment(
    payload: CreateAppointmentPayload,
  ): Promise<Appointment> {
    const authenticatedUserId = await getAuthenticatedUserId(payload.user_id);
    const appointmentDate = payload.appointment_date;
    const appointmentTime = payload.appointment_time;

    if (appointmentDate && appointmentTime) {
      if (
        isPastAppointmentDate(appointmentDate) ||
        isPastAppointmentSlot(appointmentDate, appointmentTime)
      ) {
        console.warn('[SLOTS] Past slot booking prevented:', {
          centerId: payload.center_id,
          appointmentDate,
          appointmentTime,
        });
        throw new Error('Please select a future time slot.');
      }

      const availableSlots = await this.getAvailableSlots(
        appointmentDate,
        payload.center_id,
      );

      if (!availableSlots.includes(appointmentTime)) {
        console.warn('[SLOTS] Duplicate slot prevented before insert:', {
          centerId: payload.center_id,
          appointmentDate,
          appointmentTime,
        });
        throw new Error('This slot is already booked.');
      }
    }

    const insertPayload = {
      user_id: authenticatedUserId,
      center_id: payload.center_id,
      service_id: payload.service_id,
      scheduled_at: new Date(payload.scheduled_at).toISOString(),
      appointment_date: payload.appointment_date || null,
      appointment_time: payload.appointment_time || null,
      doctor_id: payload.doctor_id || null,
      notes: payload.notes || null,
    };

    console.log('[DEBUG USER]', authenticatedUserId);
    console.log('[DEBUG PAYLOAD]', insertPayload);

    const response = await supabase
      .from('appointments')
      .insert(insertPayload)
      .select(
        'id, user_id, center_id, service_id, scheduled_at, status, token_number, estimated_wait_mins, notes, created_at',
      )
      .single();

    let data = response.data as Appointment | null;
    let error = response.error;

    if (error?.code === '42703') {
      const fallbackPayload = {
        user_id: authenticatedUserId,
        center_id: payload.center_id,
        service_id: payload.service_id,
        scheduled_at: new Date(payload.scheduled_at).toISOString(),
        appointment_date: payload.appointment_date || null,
        appointment_time: payload.appointment_time || null,
        doctor_id: payload.doctor_id || null,
        notes: payload.notes || null,
      };

      const fallback = await supabase
        .from('appointments')
        .insert(fallbackPayload)
        .select(
          'id, user_id, center_id, service_id, scheduled_at, status, token_number, estimated_wait_mins, notes, created_at',
        )
        .single();

      data = fallback.data as Appointment | null;
      error = fallback.error;
    }

    if (error) {
      if (
        error.code === '23505' ||
        error.message.toLowerCase().includes('duplicate')
      ) {
        const err = new Error('Slot just taken');
        (err as any).code = '23505';
        throw err;
      }

      console.error('[DEBUG] Failed to create appointment:', error.message);
      throw new Error(error.message);
    }

    // Clean up our slot lock on successful booking
    await this.unlockSlot();

    console.log('[DEBUG] Appointment created successfully:', data);
    return data as Appointment;
  },

  async fetchUserAppointments(userId: string): Promise<AppointmentFull[]> {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    console.log('[DEBUG] Fetching appointments for user:', authenticatedUserId);

    await appointmentService.triggerCleanup();

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

    await appointmentService.triggerCleanup();

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
      console.error(
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

    console.log('[CHECK_IN] Starting patient check-in:', {
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
      console.error('[CHECK_IN] Database update failed:', {
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

      console.warn('[CHECK_IN] Invalid status transition:', {
        appointmentId,
        currentStatus: currentAppointment.status,
      });
      throw new Error('Only confirmed appointments can be checked in.');
    }

    console.log('[CHECK_IN] Appointment checked in successfully:', {
      appointmentId,
      status: data.status,
      checkedInAt: data.checked_in_at,
    });

    const [appointment] = await enrichAppointments([data as AppointmentFull]);
    return appointment;
  },

  async staffCheckInAppointment(appointmentId: string): Promise<AppointmentFull> {
    const checkedInAt = new Date().toISOString();
    console.log('[STAFF_CHECK_IN] Counter staff check-in:', { appointmentId });

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
      console.error('[STAFF_CHECK_IN] Database update failed:', error.message);
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

    console.log('[CALL_TOKEN] Starting token call:', {
      appointmentId,
      calledAt,
    });

    // Attempt RPC call first
    const { error: rpcError } = await supabase.rpc('call_appointment', {
      p_appointment_id: appointmentId,
    });

    if (!rpcError) {
      console.log('[CALL_TOKEN] RPC call_appointment succeeded');
      const appointment = await appointmentService.fetchAppointmentById(appointmentId);
      if (appointment) return appointment;
    } else {
      console.warn('[CALL_TOKEN] RPC call_appointment skipped or failed, using table update fallback:', rpcError.message);
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
      console.error('[CALL_TOKEN] Database update failed:', {
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

      console.warn('[CALL_TOKEN] Invalid status transition:', {
        appointmentId,
        currentStatus: currentAppointment.status,
      });
      throw new Error(`Cannot call token from current status: ${currentAppointment.status}`);
    }

    console.log('[CALL_TOKEN] Token called successfully:', {
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
      console.log(
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
        console.warn(
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
          console.error(
            '[DEBUG] Direct cancel fallback failed:',
            error.message,
          );
          throw error;
        }
      }

      console.log('[DEBUG] Appointment cancelled successfully');
      const appointment = await appointmentService.fetchAppointmentById(
        appointmentId,
      );
      if (!appointment)
        throw new Error('Appointment not found after cancellation');
      return appointment;
    } catch (err: any) {
      console.error('[APPOINTMENTS] Cancel error:', err.message);
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
