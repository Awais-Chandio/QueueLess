import { supabase } from '../lib/supabase';
import type { QueueSnapshot } from '../types/queue';
import type {
  AppointmentFull,
  AppointmentStatus,
  CancelReason,
} from '../types/appointment';
import type { CreateAuditLogPayload } from '../types/audit';

export type QueueScope = {
  appointmentId?: string | null;
  centerId?: string | null;
  scheduledAt?: string | null;
};

type BackendQueueSnapshot = {
  current_token?: number | string | null;
  next_token?: number | string | null;
  your_token?: number | string | null;
  token_number?: number | string | null;
  queue_position?: number | string | null;
  current_position?: number | string | null;
  people_ahead?: number | string | null;
  estimated_wait_time?: number | string | null;
  estimated_wait_mins?: number | string | null;
  doctor_average_time?: number | string | null;
  average_consultation_time?: number | string | null;
  is_on_break?: boolean | null;
  break_start?: string | null;
  break_end?: string | null;
  status?: string | null;
};

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
  'id, user_id, patient_name, center_id, service_id, doctor_id, doctor_name, center_name, service_name, scheduled_at, appointment_date, appointment_time, status, token_number, estimated_wait_mins, estimated_wait_time, cancel_reason, cancelled_by, cancelled_at, checked_in_at, called_at, started_at, completed_at, skipped_at, duration_minutes, current_position, queue_position, people_ahead, queue_status, current_serving_token, current_token, doctor_average_time, average_consultation_time, is_on_break, break_start, break_end, created_at';

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
  doctorId?: string | null,
): Promise<AppointmentFull[]> => {
  const { start, end } = getTodayRange();

  console.log('[STAFF_QUEUE] Fetching appointments:', {
    scope,
    todayStart: start,
    todayEnd: end,
    doctorId,
  });

  const userId = await getCurrentUserId();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, center_id')
    .eq('id', userId)
    .maybeSingle();

  const centerId = profile?.role === 'staff' ? profile?.center_id : null;

  let query = supabase.from('appointments_full').select(appointmentSelect);
  if (centerId) {
    query = query.eq('center_id', centerId);
  }
  if (doctorId) {
    query = query.eq('doctor_id', doctorId);
  }

  const response = await applyScopeRange(
    query,
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

    let fallbackQuery = supabase.from('appointments_full').select(appointmentFallbackSelect);
    if (centerId) {
      fallbackQuery = fallbackQuery.eq('center_id', centerId);
    }
    if (doctorId) {
      fallbackQuery = fallbackQuery.eq('doctor_id', doctorId);
    }

    const fallback = await applyScopeRange(
      fallbackQuery,
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

    let tableQuery = supabase.from('appointments').select(baseAppointmentSelect);
    if (centerId) {
      tableQuery = tableQuery.eq('center_id', centerId);
    }
    if (doctorId) {
      tableQuery = tableQuery.eq('doctor_id', doctorId);
    }

    let fallback = await applyScopeRange(
      tableQuery,
      scope,
    ).order('scheduled_at', { ascending: scope !== 'history' });

    if (fallback.error?.code === '42703') {
      let legacyQuery = supabase.from('appointments').select(baseAppointmentLegacySelect);
      if (centerId) {
        legacyQuery = legacyQuery.eq('center_id', centerId);
      }
      if (doctorId) {
        legacyQuery = legacyQuery.eq('doctor_id', doctorId);
      }

      fallback = await applyScopeRange(
        legacyQuery,
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
    } else {
      query = query.eq('status', appointment.status);
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
    console.warn('[STAFF_QUEUE] Mismatch or invalid status transition:', {
      appointmentId: appointment.id,
      action,
      currentStatus: appointment.status,
      allowedCurrentStatuses,
      nextStatus,
    });
    throw new Error(
      'This appointment has already been updated by another staff member. Refreshing...'
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

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normalizeBackendSnapshot = (
  snapshot: BackendQueueSnapshot,
): QueueSnapshot => {
  const currentToken = toNumberOrNull(snapshot.current_token) ?? 0;
  const peopleAhead = toNumberOrNull(snapshot.people_ahead) ?? 0;
  const estimatedWaitMins =
    toNumberOrNull(snapshot.estimated_wait_time) ??
    toNumberOrNull(snapshot.estimated_wait_mins) ??
    0;
  const currentPosition =
    toNumberOrNull(snapshot.queue_position) ??
    toNumberOrNull(snapshot.current_position) ??
    peopleAhead + 1;

  return {
    currentToken,
    nextToken: toNumberOrNull(snapshot.next_token),
    yourToken:
      toNumberOrNull(snapshot.your_token) ??
      toNumberOrNull(snapshot.token_number),
    peopleAhead,
    estimatedWaitMins,
    currentPosition,
    averageConsultationTime:
      toNumberOrNull(snapshot.doctor_average_time) ??
      toNumberOrNull(snapshot.average_consultation_time),
    isOnBreak: Boolean(snapshot.is_on_break),
    breakStart: snapshot.break_start ?? null,
    breakEnd: snapshot.break_end ?? null,
    queueStatus: snapshot.status ?? null,
  };
};

const getBackendQueueSnapshot = async (
  appointmentId?: string | null,
): Promise<QueueSnapshot | null> => {
  if (!appointmentId) {
    return null;
  }

  // 1. Try to fetch directly from queue_updates table first
  try {
    const { data: qUpdate, error: qError } = await supabase
      .from('queue_updates')
      .select('*')
      .eq('appointment_id', appointmentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!qError && qUpdate) {
      console.log('[QUEUE] Loaded directly from queue_updates table:', qUpdate);
      return {
        currentToken: qUpdate.current_serving_token ?? 0,
        nextToken: null,
        yourToken: null,
        peopleAhead: qUpdate.people_ahead,
        estimatedWaitMins: qUpdate.estimated_wait_mins,
        currentPosition: qUpdate.current_position,
        averageConsultationTime: null,
        isOnBreak: false,
        breakStart: null,
        breakEnd: null,
        queueStatus: qUpdate.status,
      };
    }
  } catch (err) {
    console.warn('[QUEUE] Direct queue_updates query error:', err);
  }

  // 2. Fallback to RPC
  console.log("RPC: get_appointment_queue_snapshot");
  console.log("RPC:", appointmentId);
  const { data, error } = await supabase.rpc('get_appointment_queue_snapshot', {
    p_appointment_id: appointmentId,
  });
  console.log(data, error);

  if (error) {
    console.warn('[QUEUE] Backend queue snapshot unavailable, falling back:', {
      code: error.code,
      message: error.message,
    });
    return null;
  }

  if (!data || typeof data !== 'object') {
    return null;
  }

  return normalizeBackendSnapshot(data as BackendQueueSnapshot);
};

const getCurrentTokenFromAppointments = async (
  scope?: QueueScope,
): Promise<number | null> => {
  if (!scope?.centerId) {
    return null;
  }

  const dateStr = scope?.scheduledAt
    ? scope.scheduledAt.split('T')[0]
    : new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('appointments')
    .select('token_number')
    .eq('center_id', scope.centerId)
    .eq('appointment_date', dateStr)
    .in('status', ['called', 'in_progress'])
    .not('token_number', 'is', null)
    .order('token_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[QUEUE] Direct current token lookup failed:', {
      code: error.code,
      message: error.message,
    });
    return null;
  }

  return typeof data?.token_number === 'number' ? data.token_number : 0;
};

export const getCurrentToken = async (scope?: QueueScope): Promise<number> => {
  const directCurrentToken = await getCurrentTokenFromAppointments(scope);

  if (directCurrentToken != null) {
    return directCurrentToken;
  }

  if (!scope?.centerId) {
    return 0;
  }

  const dateStr = scope?.scheduledAt
    ? scope.scheduledAt.split('T')[0]
    : new Date().toISOString().split('T')[0];

  console.log("RPC: get_current_token");
  console.log("RPC:", scope.centerId);
  const { data, error } = await supabase.rpc('get_current_token', {
    p_center_id: scope.centerId,
    p_queue_date: dateStr,
  });
  console.log(data, error);

  if (error) {
    console.warn('[QUEUE] RPC get_current_token failed:', error.message);
    return 0;
  }

  return typeof data === 'number' ? data : 0;
};

export const getPeopleAhead = async (
  myToken: number,
  currentToken?: number,
  appointmentId?: string | null,
): Promise<number> => {
  if (typeof currentToken === 'number') {
    return Math.max(0, myToken - currentToken);
  }

  if (appointmentId) {
    console.log("RPC: people_ahead");
    console.log("RPC:", appointmentId);
    const { data, error } = await supabase.rpc('people_ahead', {
      p_appointment_id: appointmentId,
    });
    console.log(data, error);

    if (!error && typeof data === 'number') {
      return data;
    }
  }

  return 0;
};

export const getQueueSnapshot = async (
  myToken: number,
  scope?: QueueScope,
): Promise<QueueSnapshot> => {
  const backendSnapshot = await getBackendQueueSnapshot(scope?.appointmentId);

  if (backendSnapshot) {
    console.log('[QUEUE] Backend queue snapshot loaded:', {
      appointmentId: scope?.appointmentId ?? null,
      currentToken: backendSnapshot.currentToken,
      peopleAhead: backendSnapshot.peopleAhead,
      estimatedWaitMins: backendSnapshot.estimatedWaitMins,
      isOnBreak: backendSnapshot.isOnBreak ?? false,
    });

    return backendSnapshot;
  }

  const currentToken = await getCurrentToken(scope);
  const peopleAhead = await getPeopleAhead(myToken, currentToken, scope?.appointmentId);

  console.log('[QUEUE] Queue snapshot calculated:', {
    myToken,
    currentToken,
    peopleAhead,
    centerId: scope?.centerId ?? null,
    scheduledAt: scope?.scheduledAt ?? null,
  });

  return {
    currentToken,
    peopleAhead,
    estimatedWaitMins: peopleAhead * 5,
    currentPosition: peopleAhead + 1,
  };
};

type AppointmentsSubscriptionOptions = {
  channelName?: string;
  onChange: () => void;
};

export const subscribeToAppointments = ({
  channelName,
  onChange,
}: AppointmentsSubscriptionOptions) => {
  return supabase
    .channel(channelName ?? `appointments-live-${Date.now()}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'appointments',
      },
      payload => {
        console.log('[QUEUE APPOINTMENT INSERT]', payload.new?.id);
        onChange();
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'appointments',
      },
      payload => {
        console.log('[QUEUE APPOINTMENT UPDATE]', payload.new?.id);
        onChange();
      },
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'queue_updates',
      },
      payload => {
        console.log('[QUEUE QUEUE_UPDATES EVENT]', (payload.new as any)?.id);
        onChange();
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'center_queue_settings',
      },
      payload => {
        console.log('[QUEUE CENTER_SETTINGS UPDATE]', payload.new?.center_id);
        onChange();
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'doctor_queue_settings',
      },
      payload => {
        console.log('[QUEUE DOCTOR_SETTINGS UPDATE]', payload.new?.doctor_id);
        onChange();
      },
    )
    .subscribe((status, err) => {
      console.log(`[REALTIME_STATUS] ${channelName ?? 'appointments-live'}: ${status}`, err ? err : '');
      if (status === 'CHANNEL_ERROR') {
        console.warn(`[REALTIME] Channel error on ${channelName}, reconnecting...`);
      }
      if (status === 'TIMED_OUT') {
        console.warn(`[REALTIME] Channel timed out on ${channelName}, reconnecting...`);
      }
    });
};

export const unsubscribeAppointments = (
  queueChannel: ReturnType<typeof supabase.channel>,
) => {
  supabase.removeChannel(queueChannel);
};

export const queueService = {
  // Client Queue Functions
  getCurrentToken,
  getPeopleAhead,
  getQueueSnapshot,
  subscribeToAppointments,
  unsubscribeAppointments,

  // Staff Queue Functions
  async fetchDashboard(
    scope: StaffDashboardScope = 'today',
    doctorId?: string | null,
  ): Promise<StaffDashboardData> {
    const appointments = sortStaffQueueAppointments(
      await fetchScopedAppointments(scope, doctorId),
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
      ['pending'],
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
      ['pending', 'confirmed', 'checked_in', 'called', 'in_progress'],
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

    const { error: rpcError } = await supabase.rpc('call_appointment', {
      p_appointment_id: appointment.id,
    });

    if (!rpcError) {
      console.log('[STAFF_QUEUE] RPC call_appointment succeeded for appointment:', appointment.id);
    } else {
      console.warn('[STAFF_QUEUE] RPC call_appointment unavailable, using table update fallback:', rpcError.message);
    }

    const updatedAppointment = await updateAppointment(
      appointment,
      'called',
      {
        called_at: calledAt,
        started_at: calledAt,
      },
      'call_next',
      ['confirmed', 'checked_in', 'called'],
    );

    return updatedAppointment;
  },

  async noShowAppointment(appointment: AppointmentFull) {
    const updatedAppointment = await updateAppointment(
      appointment,
      'no_show',
      {
        skipped_at: new Date().toISOString(),
      },
      'no_show',
      ['called', 'in_progress'],
    );

    return updatedAppointment;
  },

  async completeAppointment(appointment: AppointmentFull) {
    const { error: rpcError } = await supabase.rpc('complete_appointment', {
      p_appointment_id: appointment.id,
    });

    if (!rpcError) {
      console.log('[STAFF_QUEUE] RPC complete_appointment succeeded for appointment:', appointment.id);
    } else {
      console.warn('[STAFF_QUEUE] RPC complete_appointment unavailable, using table update fallback:', rpcError.message);
    }

    const updatedAppointment = await updateAppointment(
      appointment,
      'completed',
      {
        completed_at: new Date().toISOString(),
      },
      'complete_service',
      ['called', 'in_progress'],
    );

    return updatedAppointment;
  },

  async fetchCenterSettings(centerId: string, date: string) {
    try {
      const { data, error } = await supabase
        .from('center_queue_settings')
        .select('*')
        .eq('center_id', centerId)
        .eq('appointment_date', date)
        .maybeSingle();
        
      if (error?.code === '42703' || error?.code === 'PGRST204') {
        console.warn('[STAFF_QUEUE] appointment_date column absent in center_queue_settings, trying fallback:', error.message);
        const fallback = await supabase
          .from('center_queue_settings')
          .select('*')
          .eq('center_id', centerId)
          .maybeSingle();
        return fallback.data;
      }

      if (error) {
        console.warn('[STAFF_QUEUE] Failed to fetch center settings:', error.message);
      }
      return data;
    } catch (err: any) {
      console.warn('[STAFF_QUEUE] Error fetching center settings:', err?.message || err);
      return null;
    }
  },

  async setCenterBreak(
    centerId: string,
    date: string,
    isOnBreak: boolean,
    breakStart: string | null,
    breakEnd: string | null,
  ) {
    const { data: rpcData, error: rpcError } = await supabase.rpc('set_center_break', {
      p_center_id: centerId,
      p_queue_date: date,
      p_break_start: breakStart,
      p_break_end: breakEnd,
      p_is_on_break: isOnBreak,
    });

    if (!rpcError && rpcData) {
      return rpcData;
    }

    if (rpcError) {
      console.warn('[STAFF_QUEUE] RPC set_center_break failed/unavailable, falling back to table upsert:', rpcError.message);
    }

    const payloadWithDate = {
      center_id: centerId,
      appointment_date: date,
      is_on_break: isOnBreak,
      break_start: breakStart,
      break_end: breakEnd,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('center_queue_settings')
      .upsert(payloadWithDate)
      .select()
      .maybeSingle();

    if (error?.code === '42703' || error?.code === 'PGRST204') {
      const payloadLegacy = {
        center_id: centerId,
        is_on_break: isOnBreak,
        break_start: breakStart,
        break_end: breakEnd,
        updated_at: new Date().toISOString(),
      };
      const fallback = await supabase
        .from('center_queue_settings')
        .upsert(payloadLegacy)
        .select()
        .maybeSingle();

      if (fallback.error) throw new Error(fallback.error.message);
      return fallback.data;
    }

    if (error) {
      throw new Error(error.message);
    }
    return data;
  },

  async updateCenterAverageConsultationTime(centerId: string, date: string, avgMins: number) {
    const { data: rpcData, error: rpcError } = await supabase.rpc('update_center_average_consultation_time', {
      p_center_id: centerId,
      p_queue_date: date,
      p_avg_mins: avgMins,
    });

    if (!rpcError && rpcData) {
      return rpcData;
    }

    if (rpcError) {
      console.warn('[STAFF_QUEUE] RPC update_center_average_consultation_time failed/unavailable, falling back to table upsert:', rpcError.message);
    }

    const payloadWithDate = {
      center_id: centerId,
      appointment_date: date,
      average_consultation_time: avgMins,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('center_queue_settings')
      .upsert(payloadWithDate)
      .select()
      .maybeSingle();

    if (error?.code === '42703' || error?.code === 'PGRST204') {
      const payloadLegacy = {
        center_id: centerId,
        average_consultation_time: avgMins,
        updated_at: new Date().toISOString(),
      };
      const fallback = await supabase
        .from('center_queue_settings')
        .upsert(payloadLegacy)
        .select()
        .maybeSingle();

      if (fallback.error) throw new Error(fallback.error.message);
      return fallback.data;
    }

    if (error) {
      throw new Error(error.message);
    }
    return data;
  },
};
