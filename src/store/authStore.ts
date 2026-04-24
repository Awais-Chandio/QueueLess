import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';

type AuthState = {
  session: Session | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (session: Session | null, user: User | null) => void;
  clearAuth: () => void;
  setLoading: (isLoading: boolean) => void;
};

export const useAuthStore = create<AuthState>(set => ({
  session: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: (session, user) =>
    set({
      session,
      user,
      isAuthenticated: !!session,
      isLoading: false,
    }),

  clearAuth: () =>
    set({
      session: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
    }),

  setLoading: isLoading =>
    set({
      isLoading,
    }),
}));