import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { appointmentsService } from '../api/appointmentsService';
import { useAuthStore } from '../../../store/authStore';
import { useAppointmentsStore } from '../../../store/appointmentsStore';

export const useAppointments = () => {
  const user = useAuthStore(state => state.user);
  const userId = user?.id;

  const query = useQuery({
    queryKey: ['appointments', userId],
    queryFn: async () => {
      const appointments = await appointmentsService.fetchUserAppointments(
        userId!,
      );

      useAppointmentsStore.setState({
        appointments,
        error: null,
        loading: false,
      });

      return appointments;
    },
    enabled: !!userId,
    refetchOnMount: 'always',
    staleTime: 0,
  });
  const { refetch } = query;
  const subscribeToAppointments = useAppointmentsStore(
    state => state.subscribeToAppointments,
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && userId) {
        refetch();
      }
    });

    return () => subscription.remove();
  }, [refetch, userId]);

  useEffect(() => {
    if (!userId) return;

    return subscribeToAppointments(userId, () => {
      refetch().catch(() => undefined);
    });
  }, [refetch, subscribeToAppointments, userId]);

  return query;
};
