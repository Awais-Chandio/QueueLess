import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Doctor } from '../types/doctor';

export function useDoctorsByService(centerId: string, serviceId: string) {
  return useQuery({
    queryKey: ['doctors', centerId, serviceId],
    queryFn: async () => {
      if (!centerId || !serviceId) return [];
      
      const { data, error } = await supabase
        .from('doctor_services')
        .select('doctors!inner(*)')
        .eq('service_id', serviceId)
        .eq('doctors.center_id', centerId)
        .eq('doctors.is_active', true);
        
      if (error) {
        console.error('Error fetching doctors by service:', error);
        throw error;
      }
      
      // PostgREST returns doctor_services as an array where doctors is nested
      return (data as any[]).map(row => row.doctors) as Doctor[];
    },
    staleTime: 60_000,
    enabled: !!centerId && !!serviceId,
  });
}
