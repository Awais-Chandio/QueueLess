import { supabase } from '../../../lib/supabase';
import type { QueueSnapshot } from '../../../types/queue';

export const getCurrentToken = async (): Promise<number> => {
  const { data, error } = await supabase
    .rpc('get_current_token');

  if (error) {
    throw new Error(error.message);
  }

  return typeof data === 'number' ? data : 0;
};

export const getPeopleAhead = async (
  myToken: number,
): Promise<number> => {
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
): Promise<QueueSnapshot> => {
  const [currentToken, peopleAhead] = await Promise.all([
    getCurrentToken(),
    getPeopleAhead(myToken),
  ]);

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
