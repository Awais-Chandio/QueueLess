import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { appointmentsService } from '../api/appointmentsService';
import { useAuthStore } from '../../../store/authStore';
import { useAppointmentsStore } from '../../../store/appointmentsStore';

export const useAppointments = () => {
  const userId = useAuthStore(state => state.user?.id);
  const session = useAuthStore(state => state.session);
  const role = useAuthStore(state => state.role);
  const isAuthLoading = useAuthStore(state => state.isLoading);

  // Auth is fully settled when: session exists, userId exists, role is resolved,
  // and isLoading is false (session restore completed).
  const isAuthReady = !!session && !!userId && !!role && !isAuthLoading;

  // Prevent duplicate in-flight fetches: track whether a fetch is already running.
  const isFetchingRef = useRef(false);

  const query = useQuery({
    queryKey: ['appointments', userId, session?.access_token],
    queryFn: async () => {
      if (isFetchingRef.current) {
        // Return whatever is currently cached to avoid duplicate calls.
        return useAppointmentsStore.getState().appointments;
      }

      isFetchingRef.current = true;
      try {
        const appointments = await appointmentsService.fetchUserAppointments(
          userId!,
        );

        useAppointmentsStore.setState({
          appointments,
          error: null,
          loading: false,
        });

        return appointments;
      } finally {
        isFetchingRef.current = false;
      }
    },
    // Wait until auth is fully settled before fetching appointments.
    // This prevents fetch-before-auth race conditions on first load.
    enabled: isAuthReady,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const { refetch } = query;
  const subscribeToAppointments = useAppointmentsStore(
    state => state.subscribeToAppointments,
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', appState => {
      if (appState === 'active' && isAuthReady) {
        refetch();
      }
    });

    return () => subscription.remove();
  }, [refetch, isAuthReady]);

  useEffect(() => {
    if (!userId || !isAuthReady) return;

    return subscribeToAppointments(userId, () => {
      refetch().catch(() => undefined);
    });
  }, [refetch, subscribeToAppointments, userId, isAuthReady]);

  return query;
};
