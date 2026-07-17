import { useQuery } from '@tanstack/react-query';
import { serviceService } from '../services/serviceService';

export const useServices = () => {
  return useQuery({
    queryKey: ['services'],
    queryFn: () => serviceService.getServices(),
    staleTime: 5 * 60 * 1000,
  });
};
