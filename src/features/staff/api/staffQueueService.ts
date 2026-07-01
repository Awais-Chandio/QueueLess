import { supabase } from '../../../lib/supabase';
import type {
  AppointmentFull,
  AppointmentStatus,
  CancelReason,
} from '../../../types/appointment';
import type { CreateAuditLogPayload } from '../../../types/audit';
import { getSlotDateTime } from '../../appointments/utils/appointmentTime';

export type StaffDashboardStats = {
  totalToday: number;
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  activeQueue: number;
};

export type StaffDashboardData = {
  stats: StaffDashboardStats;
  appointments: AppointmentFull[];
};

export type StaffDashboardScope = 'today' | 'upcoming' | 'history';

const activeStatuses: AppointmentStatus[] = [
  'confirmed',
  'checked_in',
  'called',
  'in_progress',
];

const appointmentSelect =
  'id, user_id, patient_name, center_id, service_id, doctor_id, center_name, service_name, scheduled_at, appointment_date, appointment_time, status, token_number, estimated_wait_mins, estimated_wait_time, cancel_reason, cancelled_by, cancelled_at, checked_in_at, called_at, started_at, completed_at, skipped_at, duration_minutes, current_position, queue_position, people_ahead, queue_status, current_serving_token, current_token, doctor_average_time, average_consultation_time, is_on_break, break_start, break_end, created_at';

const appointmentFallbackSelect =
  'id, user_id, center_id, service_id, scheduled_at, status, token_number, estimated_wait_mins, cancel_reason, cancelled_by, cancelled_at, completed_at, created_at';

const baseAppointmentSelect =
  'id, user_id, center_id, service_id, doctor_id, scheduled_at, appointment_date, appointment_time, status, token_number, estimated_wait_mins, checked_in_at, called_at, started_at, completed_at, skipped_at, duration_minutes, created_at';

const baseAppointmentLegacySelect =
  'id, user_id, center_id, service_id, scheduled_at, status, token_number, estimated_wait_mins, checked_in_at, called_at, completed_at, created_at';

const shouldFallback = (code?: string) =>
  code === '42703' || code === '42501' || code === 'PGRST205';

const getTodayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
};

const applyScopeRange = <T extends { gte: Function; lt: Function }>(
  query: T,
  scope: StaffDashboardScope,
) => {
  const { start, end } = getTodayRange();

  if (scope === 'today') {
    return query.gte('scheduled_at', start).lt('scheduled_at', end);
  }

  if (scope === 'upcoming') {
    return query.gte('scheduled_at', end);
  }

  return query.lt('scheduled_at', start);
};

const getCurrentUserId = async () => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.user?.id) {
    throw new Error('Please login again to continue.');
  }

  return session.user.id;
};

const queueStatusPriority: Partial<Record<AppointmentStatus, number>> = {
  checked_in: 0,
  confirmed: 1,
  pending: 2,
};

export const sortStaffQueueAppointments = (appointments: AppointmentFull[]) =>
  [...appointments].sort((a, b) => {
    const appointmentTimeA = new Date(a.scheduled_at).getTime();
    const appointmentTimeB = new Date(b.scheduled_at).getTime();

    if (appointmentTimeA !== appointmentTimeB) {
      return appointmentTimeA - appointmentTimeB;
    }

    const statusPriorityA = queueStatusPriority[a.status] ?? 3;
    const statusPriorityB = queueStatusPriority[b.status] ?? 3;

    if (statusPriorityA !== statusPriorityB) {
      return statusPriorityA - statusPriorityB;
    }

    const tokenA =
      typeof a.token_number === 'number'
        ? a.token_number
        : Number.MAX_SAFE_INTEGER;
    const tokenB =
      typeof b.token_number === 'number'
        ? b.token_number
        : Number.MAX_SAFE_INTEGER;

    if (tokenA !== tokenB) {
      return tokenA - tokenB;
    }

    return (
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    );
  });

const enrichAppointments = async (appointments: AppointmentFull[]) => {
  const userIds = [
    ...new Set(
      appointments
        .map(appointment => appointment.user_id)
        .filter((id): id is string => !!id),
    ),
  ];
  const centerIds = [...new Set(appointments.map(item => item.center_id))];
  const serviceIds = [...new Set(appointments.map(item => item.service_id))];

  const [profilesResult, centersResult, servicesResult] = await Promise.all([
    userIds.length
      ? supabase.from('profiles').select('id, full_name').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
    centerIds.length
      ? supabase.from('service_centers').select('id, name').in('id', centerIds)
      : Promise.resolve({ data: [], error: null }),
    serviceIds.length
      ? supabase.from('services').select('id, name').in('id', serviceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profilesResult.error) {
    throw new Error(profilesResult.error.message);
  }

  if (centersResult.error) {
    throw new Error(centersResult.error.message);
  }

  if (servicesResult.error) {
    throw new Error(servicesResult.error.message);
  }

  const patientNames = new Map(
    (profilesResult.data ?? []).map(profile => [profile.id, profile.full_name]),
  );
  const centerNames = new Map(
    (centersResult.data ?? []).map(center => [center.id, center.name]),
  );
  const serviceNames = new Map(
    (servicesResult.data ?? []).map(service => [service.id, service.name]),
  );

  return appointments.map(appointment => ({
    ...appointment,
    patient_name:
      appointment.patient_name ??
      (appointment.user_id ? patientNames.get(appointment.user_id) : undefined),
    center_name:
      appointment.center_name ?? centerNames.get(appointment.center_id),
    service_name:
      appointment.service_name ?? serviceNames.get(appointment.service_id),
  }));
};

const fetchScopedAppointments = async (
  scope: StaffDashboardScope,
): Promise<AppointmentFull[]> => {
  const { start, end } = getTodayRange();

  console.log('[STAFF_QUEUE] Fetching appointments:', {
    scope,
    todayStart: start,
    todayEnd: end,
  });

  const response = await applyScopeRange(
    supabase.from('appointments_full').select(appointmentSelect),
    scope,
  ).order('scheduled_at', { ascending: scope !== 'history' });

  let data = response.data as AppointmentFull[] | null;
  let error = response.error;

  if (error?.code === '42703') {
    console.warn(
      '[STAFF_QUEUE] appointments_full column mismatch, retrying legacy select:',
      {
        code: error.code,
        message: error.message,
        scope,
      },
    );

    const fallback = await applyScopeRange(
      supabase.from('appointments_full').select(appointmentFallbackSelect),
      scope,
    ).order('scheduled_at', { ascending: scope !== 'history' });

    data = fallback.data as AppointmentFull[] | null;
    error = fallback.error;
  }

  if (shouldFallback(error?.code)) {
    console.warn('[STAFF_QUEUE] Falling back to appointments table:', {
      code: error?.code,
      message: error?.message,
      scope,
    });

    let fallback = await applyScopeRange(
      supabase.from('appointments').select(baseAppointmentSelect),
      scope,
    ).order('scheduled_at', { ascending: scope !== 'history' });

    if (fallback.error?.code === '42703') {
      fallback = await applyScopeRange(
        supabase.from('appointments').select(baseAppointmentLegacySelect),
        scope,
      ).order('scheduled_at', { ascending: scope !== 'history' });
    }

    if (fallback.error) {
      console.error('[STAFF_QUEUE] Staff appointments fallback failed:', {
        code: fallback.error.code,
        message: fallback.error.message,
        scope,
      });
      throw new Error(fallback.error.message);
    }

    console.log('[STAFF_QUEUE] Fallback appointments fetched:', {
      scope,
      count: fallback.data?.length ?? 0,
    });
    return enrichAppointments((fallback.data ?? []) as AppointmentFull[]);
  }

  if (error) {
    console.error('[STAFF_QUEUE] Staff appointments fetch failed:', {
      code: error.code,
      message: error.message,
      scope,
    });
    throw new Error(error.message);
  }

  console.log('[STAFF_QUEUE] Appointments fetched:', {
    scope,
    count: data?.length ?? 0,
  });

  return enrichAppointments((data ?? []) as AppointmentFull[]);
};

const buildStats = (appointments: AppointmentFull[]): StaffDashboardStats => ({
  totalToday: appointments.length,
  pending: appointments.filter(item => item.status === 'pending').length,
  confirmed: appointments.filter(item => item.status === 'confirmed').length,
  completed: appointments.filter(item => item.status === 'completed').length,
  cancelled: appointments.filter(item => item.status === 'cancelled').length,
  activeQueue: appointments.filter(item => activeStatuses.includes(item.status))
    .length,
});

const insertAuditLog = async (payload: CreateAuditLogPayload) => {
  const { error } = await supabase.from('audit_logs').insert(payload);

  if (error) {
    throw new Error(error.message);
  }
};

const updateAppointment = async (
  appointment: AppointmentFull,
  nextStatus: AppointmentStatus,
  updates: Record<string, unknown>,
  action: string,
  allowedCurrentStatuses?: AppointmentStatus[],
) => {
  const staffUserId = await getCurrentUserId();

  const runUpdate = async (select: string) => {
    let query = supabase
      .from('appointments')
      .update({
        ...updates,
        status: nextStatus,
      })
      .eq('id', appointment.id);

    if (allowedCurrentStatuses?.length) {
      query = query.in('status', allowedCurrentStatuses);
    }

    return query.select(select).maybeSingle();
  };

  const response = await runUpdate(baseAppointmentSelect);

  let data = response.data;
  let error = response.error;

  if (error?.code === '42703') {
    const fallback = await runUpdate(baseAppointmentLegacySelect);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    console.warn('[STAFF_QUEUE] Invalid status transition:', {
      appointmentId: appointment.id,
      action,
      currentStatus: appointment.status,
      allowedCurrentStatuses,
      nextStatus,
    });
    throw new Error(
      `Cannot ${action.replace('_', ' ')} this appointment from ${
        appointment.status
      }.`,
    );
  }

  await insertAuditLog({
    staff_user_id: staffUserId,
    appointment_id: appointment.id,
    action,
    old_status: appointment.status,
    new_status: nextStatus,
  });

  return data as unknown as AppointmentFull;
};

export const staffQueueService = {
  async fetchDashboard(
    scope: StaffDashboardScope = 'today',
  ): Promise<StaffDashboardData> {
    const appointments = sortStaffQueueAppointments(
      await fetchScopedAppointments(scope),
    );
    console.log(
      '[STAFF_QUEUE] Sorted appointment order:',
      appointments.map(item => ({
        id: item.id,
        status: item.status,
        token: item.token_number,
      })),
    );

    return {
      stats: buildStats(appointments),
      appointments,
    };
  },

  async confirmAppointment(appointment: AppointmentFull) {
    const updatedAppointment = await updateAppointment(
      appointment,
      'confirmed',
      {},
      'confirm',
    );

    return updatedAppointment;
  },

  async cancelAppointment(appointment: AppointmentFull, reason: CancelReason) {
    const staffUserId = await getCurrentUserId();
    const updatedAppointment = await updateAppointment(
      appointment,
      'cancelled',
      {
        cancel_reason: reason,
        cancelled_by: staffUserId,
        cancelled_at: new Date().toISOString(),
      },
      'cancel',
    );

    return updatedAppointment;
  },

  async startService(appointment: AppointmentFull) {
    const calledAt = new Date().toISOString();
    console.log('[STAFF_QUEUE] Calling token:', {
      appointmentId: appointment.id,
      tokenNumber: appointment.token_number,
      previousStatus: appointment.status,
      calledAt,
    });

    const updatedAppointment = await updateAppointment(
      appointment,
      'called',
      {
        called_at: calledAt,
        started_at: calledAt,
      },
      'call_next',
      ['confirmed', 'checked_in'],
    );

    return updatedAppointment;
  },

  async completeAppointment(appointment: AppointmentFull) {
    const updatedAppointment = await updateAppointment(
      appointment,
      'completed',
      {
        completed_at: new Date().toISOString(),
      },
      'complete_service',
    );

    return updatedAppointment;
  },
};
