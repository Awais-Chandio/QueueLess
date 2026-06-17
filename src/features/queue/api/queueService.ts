import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';
import type { QueueUpdate } from '../../../types/queue';

let queueChannel: RealtimeChannel | null = null;

export const getLatestQueueUpdate = async (
  appointmentId: string,
): Promise<QueueUpdate | null> => {
  const { data, error } = await supabase
    .from('queue_updates')
    .select('*')
    .eq('appointment_id', appointmentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as QueueUpdate | null;
};

export const subscribeToQueueUpdates = (
  appointmentId: string,
  callback: (queueUpdate: QueueUpdate) => void,
) => {
  queueChannel = supabase
    .channel(`queue-${appointmentId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'queue_updates',
        filter: `appointment_id=eq.${appointmentId}`,
      },
      payload => {
        console.log(
          '[QUEUE UPDATE RECEIVED]',
          payload,
        );

        if (payload.new && 'id' in payload.new) {
          callback(payload.new as QueueUpdate);
        }
      },
    )
    .subscribe();

  return queueChannel;
};

export const unsubscribeQueue = () => {
  if (queueChannel) {
    supabase.removeChannel(queueChannel);
    queueChannel = null;
  }
};
