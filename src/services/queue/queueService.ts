import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';

let queueChannel: RealtimeChannel | null = null;

export const getLatestQueueUpdate = async (
  appointmentId: string,
) => {
  const { data, error } = await supabase
    .from('queue_updates')
    .select('*')
    .eq('appointment_id', appointmentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const subscribeToQueueUpdates = (
  appointmentId: string,
  callback: (payload: any) => void,
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

        callback(payload);
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