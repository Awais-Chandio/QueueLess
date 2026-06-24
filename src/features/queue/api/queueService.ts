import { supabase } from '../../../lib/supabase';
import type { QueueSnapshot } from '../../../types/queue';

export type QueueScope = {
  centerId?: string | null;
  scheduledAt?: string | null;
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
    .eq('status', 'called')
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

export const getCurrentToken = async (
  scope?: QueueScope,
): Promise<number> => {
  const directCurrentToken = await getCurrentTokenFromAppointments(scope);

  if (directCurrentToken != null) {
    return directCurrentToken;
  }

  const { data, error } = await supabase
    .rpc('get_current_token');

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

  const { data, error } = await supabase
    .rpc('people_ahead', {
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

export const subscribeToQueueChanges = (
  callback: () => void,
) => {
  return supabase
    .channel(`queue-live-${Date.now()}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'appointments',
      },
      payload => {
        console.log('[QUEUE APPOINTMENT CHANGE]', payload.eventType);
        callback();
      },
    )
    .subscribe();
};

export const unsubscribeQueue = (
  queueChannel: ReturnType<typeof supabase.channel>,
) => {
  supabase.removeChannel(queueChannel);
};
