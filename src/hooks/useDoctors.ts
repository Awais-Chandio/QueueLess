import { useQuery } from '@tanstack/react-query';
import { doctorService } from '../services/doctorService';

export const useDoctors = (serviceId?: string, activeOnly = true) => {
  return useQuery({
    queryKey: ['doctors', serviceId, activeOnly],
    queryFn: () => {
      if (!serviceId) return [];
      return doctorService.getByServiceId(serviceId, activeOnly);
    },
    enabled: !!serviceId,
    staleTime: 5 * 60 * 1000,
  });
};
