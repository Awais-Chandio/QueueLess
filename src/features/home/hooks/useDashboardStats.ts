import { useQuery } from '@tanstack/react-query';
import { fetchDashboardStats } from '../api/dashboardService';
import { useAuthStore } from '../../../store/authStore';

export const useDashboardStats = () => {
  const user = useAuthStore(state => state.user);

  return useQuery({
    queryKey: ['dashboardStats', user?.id],
    queryFn: () => fetchDashboardStats(user!.id),
    enabled: !!user?.id,
  });
};
