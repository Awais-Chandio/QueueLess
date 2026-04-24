import { authService } from '../services/auth/authService';
import { useAuthStore } from '../store/authStore';
import { LoginPayload, SignupPayload } from '../types/auth';

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

  async function restoreSession() {
    setLoading(true);

    const { data, error } = await authService.getSession();

    if (error || !data.session) {
      clearAuth();
      return;
    }

    setAuth(data.session, data.session.user);
  }

  async function login(payload: LoginPayload) {
    setLoading(true);

    const { data, error } = await authService.signIn(payload);

    if (error || !data.session) {
      clearAuth();
      throw error;
    }

    setAuth(data.session, data.user);
  }

  async function signup(payload: SignupPayload) {
    setLoading(true);

    const { data, error } = await authService.signUp(payload);

    if (error) {
      clearAuth();
      throw error;
    }

    if (data.session) {
      setAuth(data.session, data.user);
      return;
    }

    setLoading(false);
  }

  async function logout() {
    setLoading(true);

    const { error } = await authService.signOut();

    if (error) {
      setLoading(false);
      throw error;
    }

    clearAuth();
  }

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