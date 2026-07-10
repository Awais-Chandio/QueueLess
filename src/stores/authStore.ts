import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import {
  UserRole,
  normalizeUserRole,
} from '../utils/roleMapping';

export type AuthRole = UserRole;

interface AuthState {
  session: Session | null;
  user: User | null;
  role: AuthRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isPasswordRecovery: boolean;
  setSession: (session: Session | null) => void;
  setRole: (role: unknown) => void;
  setPasswordRecovery: (isPasswordRecovery: boolean) => void;
  clearAuth: () => void;
  setLoading: (isLoading: boolean) => void;
}

export const useAuthStore = create<AuthState>(set => ({
  session: null,
  user: null,
  role: null,
  isAuthenticated: false,
  isLoading: true,
  isPasswordRecovery: false,

  setSession: session =>
    set({
      session,
      user: session?.user ?? null,
      role: null,
      isAuthenticated: !!session,
      isLoading: false,
    }),

  setRole: role =>
    set(state => {
      const normalizedRole = normalizeUserRole(role);

      if (__DEV__ && state.user?.id) {
        console.log(
          `[authStore] Session set for user: ${state.user.id} role: ${normalizedRole}`,
        );
      }

      return {
        role: normalizedRole,
      };
    }),

  setPasswordRecovery: isPasswordRecovery =>
    set({
      isPasswordRecovery,
    }),

  clearAuth: () =>
    set({
      session: null,
      user: null,
      role: null,
      isAuthenticated: false,
      isLoading: false,
      isPasswordRecovery: false,
    }),

  setLoading: isLoading =>
    set({
      isLoading,
    }),
}));
