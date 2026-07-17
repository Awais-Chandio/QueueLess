import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Doctor } from '../types/doctor';
import { getPakistanDayOfWeek } from '../features/appointments/utils/appointmentTime';

export function useDoctorsByService(centerId: string, serviceId: string) {
  return useQuery({
    queryKey: ['doctors', centerId, serviceId],
    queryFn: async () => {
      if (!centerId || !serviceId) return [];
      
      const today = getPakistanDayOfWeek();
      
      const { data, error } = await supabase
        .from('doctor_services')
        .select(`
          doctors!inner(
            *,
            doctor_schedules!inner(*)
          )
        `)
        .eq('service_id', serviceId)
        .eq('doctors.center_id', centerId)
        .eq('doctors.is_active', true)
        .eq('doctors.status', 'active')
        .eq('doctors.doctor_schedules.day_of_week', today);
        
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

