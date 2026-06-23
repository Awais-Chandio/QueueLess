import { supabase } from '../../../lib/supabase';
import type {
  AppointmentFull,
  AppointmentStatus,
  CancelReason,
} from '../../../types/appointment';
import type { CreateAuditLogPayload } from '../../../types/audit';

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

const activeStatuses: AppointmentStatus[] = [
  'confirmed',
  'checked_in',
  'called',
  'in_progress',
];

const appointmentSelect =
  'id, user_id, patient_name, center_id, service_id, center_name, service_name, scheduled_at, status, token_number, estimated_wait_mins, cancel_reason, cancelled_by, cancelled_at, checked_in_at, called_at, started_at, completed_at, current_position, people_ahead, queue_status, current_serving_token, created_at';

const appointmentFallbackSelect =
  'id, user_id, center_id, service_id, scheduled_at, status, token_number, estimated_wait_mins, cancel_reason, cancelled_by, cancelled_at, completed_at, created_at';

const baseAppointmentSelect =
  'id, user_id, center_id, service_id, scheduled_at, status, token_number, estimated_wait_mins, created_at';

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

export const sortStaffQueueAppointments = (
  appointments: AppointmentFull[],
) =>
  [...appointments].sort((a, b) => {
    const statusPriorityA = queueStatusPriority[a.status] ?? 3;
    const statusPriorityB = queueStatusPriority[b.status] ?? 3;

    if (statusPriorityA !== statusPriorityB) {
      return statusPriorityA - statusPriorityB;
    }

    const tokenA =
      typeof a.token_number === 'number' ? a.token_number : Number.MAX_SAFE_INTEGER;
    const tokenB =
      typeof b.token_number === 'number' ? b.token_number : Number.MAX_SAFE_INTEGER;

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
    center_name: appointment.center_name ?? centerNames.get(appointment.center_id),
    service_name:
      appointment.service_name ?? serviceNames.get(appointment.service_id),
  }));
};

const fetchTodayAppointments = async (): Promise<AppointmentFull[]> => {
  const { start, end } = getTodayRange();
  const response = await supabase
    .from('appointments_full')
    .select(appointmentSelect)
    .gte('scheduled_at', start)
    .lt('scheduled_at', end)
    .order('scheduled_at', { ascending: true });

  let data = response.data as AppointmentFull[] | null;
  let error = response.error;

  if (error?.code === '42703') {
    const fallback = await supabase
      .from('appointments_full')
      .select(appointmentFallbackSelect)
      .gte('scheduled_at', start)
      .lt('scheduled_at', end)
      .order('scheduled_at', { ascending: true });

    data = fallback.data as AppointmentFull[] | null;
    error = fallback.error;
  }

  if (shouldFallback(error?.code)) {
    const fallback = await supabase
      .from('appointments')
      .select(baseAppointmentSelect)
      .gte('scheduled_at', start)
      .lt('scheduled_at', end)
      .order('scheduled_at', { ascending: true });

    if (fallback.error) {
      throw new Error(fallback.error.message);
    }

    return enrichAppointments((fallback.data ?? []) as AppointmentFull[]);
  }

  if (error) {
    throw new Error(error.message);
  }

  return enrichAppointments((data ?? []) as AppointmentFull[]);
};

const buildStats = (appointments: AppointmentFull[]): StaffDashboardStats => ({
  totalToday: appointments.length,
  pending: appointments.filter(item => item.status === 'pending').length,
  confirmed: appointments.filter(item => item.status === 'confirmed').length,
  completed: appointments.filter(item => item.status === 'completed').length,
  cancelled: appointments.filter(item => item.status === 'cancelled').length,
  activeQueue: appointments.filter(item => activeStatuses.includes(item.status)).length,
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
) => {
  const staffUserId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('appointments')
    .update({
      ...updates,
      status: nextStatus,
    })
    .eq('id', appointment.id)
    .select(baseAppointmentSelect)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await insertAuditLog({
    staff_user_id: staffUserId,
    appointment_id: appointment.id,
    action,
    old_status: appointment.status,
    new_status: nextStatus,
  });

  return data as AppointmentFull;
};

export const staffQueueService = {
  async fetchDashboard(): Promise<StaffDashboardData> {
    const appointments = sortStaffQueueAppointments(
      await fetchTodayAppointments(),
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

  async cancelAppointment(
    appointment: AppointmentFull,
    reason: CancelReason,
  ) {
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
    const updatedAppointment = await updateAppointment(
      appointment,
      'called',
      {
        called_at: new Date().toISOString(),
      },
      'call_next',
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
