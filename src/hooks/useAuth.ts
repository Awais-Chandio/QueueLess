import { useCallback } from 'react';
import { authService } from '../services/auth/authService';
import { useAuthStore } from '../store/authStore';
import { LoginPayload, SignupPayload } from '../types/auth';

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
    setLoading(true);

    try {
      const { data, error } = await authService.getSession();

      if (error || !data.session) {
        clearAuth();
        return;
      }

      setAuth(data.session, data.session.user);
    } catch {
      clearAuth();
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
    } catch (error) {
      clearAuth();
      throw toAuthError(error, 'Login failed. Please try again.');
    }
  }, [clearAuth, setAuth, setLoading]);

  const signup = useCallback(async (payload: SignupPayload) => {
    setLoading(true);

    try {
      const { data, error } = await authService.signUp(payload);

      if (error) {
        throw error;
      }

      if (data.session) {
        setAuth(data.session, data.user);
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
