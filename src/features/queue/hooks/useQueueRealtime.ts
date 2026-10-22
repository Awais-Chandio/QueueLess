import { useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { supabase } from '../../../lib/supabase';

type Options = {
  /** Reception: the center's TV key. The database broadcasts "changed" on display:<key> for every queue change. */
  displayKey?: string | null;
  /** Doctor: their own appointments and doctor row (RLS lets them see these). */
  doctorId?: string | null;
  onChange: () => void;
};

let channelSeq = 0;

/**
 * Refetches when the queue changes. Bursts (call next = two updates) are
 * collapsed into one refetch. Screens also poll every 20s, so a dropped
 * socket only delays an update. Only subscribes while the screen is focused.
 */
export const useQueueRealtime = ({ displayKey, doctorId, onChange }: Options) => {
  const isFocused = useIsFocused();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!isFocused || (!displayKey && !doctorId)) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const nudge = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current(), 250);
    };

    const channel = displayKey
      ? supabase.channel(`display:${displayKey}`).on('broadcast', { event: 'changed' }, nudge)
      : supabase
          .channel(`doctor-queue-${doctorId}-${++channelSeq}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `doctor_id=eq.${doctorId}` }, nudge)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'doctors', filter: `id=eq.${doctorId}` }, nudge);

    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [displayKey, doctorId, isFocused]);
};
