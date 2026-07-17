import { useQuery } from '@tanstack/react-query';
import { centerService } from '../services/centerService';

export const useCenters = () => {
  return useQuery({
    queryKey: ['centers'],
    queryFn: () => centerService.getCenters(),
    staleTime: 5 * 60 * 1000,
  });
};

export const useCenterDetails = (centerId: string) => {
  return useQuery({
    queryKey: ['center', centerId],
    queryFn: () => centerService.getCenterById(centerId),
    enabled: !!centerId,
    staleTime: 5 * 60 * 1000,
  });
};

export const useCenterServices = (centerId: string) => {
  return useQuery({
    queryKey: ['center-services', centerId],
    queryFn: () => centerService.getCenterServices(centerId),
    enabled: !!centerId,
    staleTime: 5 * 60 * 1000,
  });
};
