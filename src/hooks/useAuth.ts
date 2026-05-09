import { useCallback } from 'react';
import { authService } from '../services/auth/authService';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';
import { LoginPayload, SignupPayload } from '../types/auth';
import { profileService } from '../services/profile/profileService';

const toAuthError = (error: unknown, fallbackMessage: string) => {
  if (error instanceof Error) {
    return error;
  }

  return new Error(fallbackMessage);
};

export const useAuth = () => {
  const {
    session,
    user,
    isAuthenticated,
    isLoading,
    setAuth,
    clearAuth,
    setLoading,
  } = useAuthStore();

  const restoreSession = useCallback(async () => {
    console.log('[AUTH] restoreSession started');
    setLoading(true);

    try {
      const { data, error } = await authService.getSession();
      console.log('[AUTH] getSession result:', { sessionExists: !!data.session, error: error?.message });

      if (error || !data.session) {
        clearAuth();
        useProfileStore.getState().clearProfile();
        return;
      }

      setAuth(data.session, data.session.user);

      // Ensure profile exists (fallback for users created before trigger)
      try {
        const { error: profileError } = await profileService.getProfileById(data.session.user.id);
        if (profileError) {
          console.log('[AUTH] Profile missing during restore, creating fallback...');
          await profileService.createProfile({
            id: data.session.user.id,
            full_name: data.session.user.user_metadata?.full_name || '',
            email: data.session.user.email || '',
          });
        }
        await useProfileStore.getState().fetchProfile(data.session.user.id);
      } catch (e) {
        console.warn('[AUTH] Profile fetch/restore warning:', e);
      }
    } catch {
      clearAuth();
      useProfileStore.getState().clearProfile();
    }
  }, [clearAuth, setAuth, setLoading]);

  const login = useCallback(async (payload: LoginPayload) => {
    setLoading(true);

    try {
      const { data, error } = await authService.signIn(payload);

      if (error) {
        throw error;
      }

      if (!data.session || !data.user) {
        throw new Error('Login failed. Please check your email and password.');
      }

      setAuth(data.session, data.user);

      // Ensure profile exists (fallback for users created before trigger)
      try {
        const { error: profileError } = await profileService.getProfileById(data.user.id);
        if (profileError) {
          console.log('[LOGIN] Profile missing, creating fallback...');
          await profileService.createProfile({
            id: data.user.id,
            full_name: data.user.user_metadata?.full_name || '',
            email: data.user.email || '',
          });
        }
        await useProfileStore.getState().fetchProfile(data.user.id);
      } catch (e) {
        console.warn('[LOGIN] Profile fetch/restore warning:', e);
      }
    } catch (error) {
      clearAuth();
      throw toAuthError(error, 'Login failed. Please try again.');
    }
  }, [clearAuth, setAuth, setLoading]);

  const signup = useCallback(async (payload: SignupPayload) => {
    setLoading(true);

    try {
      console.log('[SIGNUP] Calling authService.signUp...');
      const { data, error } = await authService.signUp(payload);
      console.log('[SIGNUP] auth result:', { userId: data.user?.id, sessionExists: !!data.session, error: error?.message });

      if (error) {
        throw error;
      }

      if (data.session && data.user) {
        console.log('[SIGNUP] Success — setting auth');
        setAuth(data.session, data.user);
        try {
          await useProfileStore.getState().fetchProfile(data.user.id);
        } catch (e) {
          console.warn('[SIGNUP] Profile fetch warning:', e);
        }
        return;
      }

      setLoading(false);
    } catch (error) {
      clearAuth();
      throw toAuthError(error, 'Signup failed. Please try again.');
    }
  }, [clearAuth, setAuth, setLoading]);

  const logout = useCallback(async () => {
    setLoading(true);

    try {
      const { error } = await authService.signOut();

      if (error) {
        throw error;
      }

      clearAuth();
      useProfileStore.getState().clearProfile();
    } catch (error) {
      setLoading(false);
      throw toAuthError(error, 'Logout failed. Please try again.');
    }
  }, [clearAuth, setLoading]);

  return {
    session,
    user,
    isAuthenticated,
    isLoading,
    restoreSession,
    login,
    signup,
    logout,
  };
};
