import { supabase } from '../../../lib/supabase';
import type { QueueSnapshot } from '../../../types/queue';

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

  const { data, error } = await supabase.rpc('get_appointment_queue_snapshot', {
    p_appointment_id: appointmentId,
  });

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

const getDayRange = (scheduledAt?: string | null) => {
  if (!scheduledAt) {
    return null;
  }

  const start = new Date(scheduledAt);
  if (Number.isNaN(start.getTime())) {
    return null;
  }

  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
};

const getCurrentTokenFromAppointments = async (
  scope?: QueueScope,
): Promise<number | null> => {
  const dayRange = getDayRange(scope?.scheduledAt);

  let query = supabase
    .from('appointments')
    .select('token_number')
    .in('status', ['called', 'in_progress'])
    .not('token_number', 'is', null)
    .order('token_number', { ascending: false })
    .limit(1);

  if (scope?.centerId) {
    query = query.eq('center_id', scope.centerId);
  }

  if (dayRange) {
    query = query
      .gte('scheduled_at', dayRange.start)
      .lt('scheduled_at', dayRange.end);
  }

  const { data, error } = await query.maybeSingle();

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

  const { data, error } = await supabase.rpc('get_current_token');

  if (error) {
    throw new Error(error.message);
  }

  return typeof data === 'number' ? data : 0;
};

export const getPeopleAhead = async (
  myToken: number,
  currentToken?: number,
): Promise<number> => {
  if (typeof currentToken === 'number') {
    return Math.max(0, myToken - currentToken);
  }

  const { data, error } = await supabase.rpc('people_ahead', {
    my_token: myToken,
  });

  if (error) {
    throw new Error(error.message);
  }

  return typeof data === 'number' ? data : 0;
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
  const peopleAhead = await getPeopleAhead(myToken, currentToken);

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
    .subscribe();
};

export const unsubscribeAppointments = (
  queueChannel: ReturnType<typeof supabase.channel>,
) => {
  supabase.removeChannel(queueChannel);
};
