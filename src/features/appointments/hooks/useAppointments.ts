import { useQuery } from '@tanstack/react-query';
import { appointmentsService } from '../api/appointmentsService';
import { useAuthStore } from '../../../store/authStore';

export const useAppointments = () => {
  const user = useAuthStore(state => state.user);

  return useQuery({
    queryKey: ['appointments', user?.id],
    queryFn: () => appointmentsService.fetchUserAppointments(user!.id),
    enabled: !!user?.id,
  });
};
