import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { DoctorAvailability } from '../types/doctor';

export function useDoctorAvailability(doctorId: string) {
  const queryClient = useQueryClient();
  const isUuid = typeof doctorId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(doctorId);

  useEffect(() => {
    if (!isUuid) return;

    const channel = supabase
      .channel(`doctor-availability-${doctorId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'doctors', filter: `id=eq.${doctorId}` },
        () => queryClient.invalidateQueries({ queryKey: ['doctor-availability', doctorId] })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `doctor_id=eq.${doctorId}` },
        () => queryClient.invalidateQueries({ queryKey: ['doctor-availability', doctorId] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [doctorId, queryClient, isUuid]);

  return useQuery({
    queryKey: ['doctor-availability', doctorId],
    queryFn: async () => {
      if (!isUuid) return null;
      
      console.log("RPC: get_doctor_availability");
      console.log("RPC:", doctorId);
      const { data, error } = await supabase.rpc('get_doctor_availability', {
        p_doctor_id: doctorId,
      });
      console.log(data, error);
      
      if (error) {
        console.error('Error fetching doctor availability:', error);
        throw error;
      }
      return (data && data.length > 0 ? data[0] : null) as DoctorAvailability | null;
    },
    retry: false,
    refetchInterval: 30_000, // fallback poll in case a realtime event is missed
    enabled: isUuid,
  });
}
