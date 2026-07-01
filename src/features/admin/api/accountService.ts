import { supabase } from '../../../lib/supabase';
import type { CreateManagedAccountPayload } from '../../../types/profile';
import { useAuthStore } from '../../../store/authStore';

export const accountService = {
  createManagedAccount: async (payload: CreateManagedAccountPayload) => {
    // Save current session before signing up a new user,
    // to prevent the current admin session from being overwritten.
    const currentSession = useAuthStore.getState().session;

    try {
      // 1. Sign up the new user
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: payload.email,
        password: payload.password || Math.random().toString(36).slice(-10) + 'A1!', // Generate if not provided
        options: {
          data: {
            full_name: payload.name,
            role: payload.role,
          },
        },
      });

      if (signUpError) {
        throw new Error(signUpError.message);
      }

      const newUserId = signUpData.user?.id;
      if (!newUserId) {
        throw new Error('Failed to retrieve new user ID.');
      }

      // 2. Insert or update the profile with the specified role
      // Usually, a trigger might create the profile on sign up, so we upsert it.
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: newUserId,
          full_name: payload.name,
          email: payload.email,
          role: payload.role,
        });

      if (profileError) {
        throw new Error(`Failed to assign role: ${profileError.message}`);
      }

      return {
        userId: newUserId,
        email: payload.email,
        role: payload.role,
      };
    } finally {
      // 3. Restore the original admin session if it was affected
      if (currentSession) {
        const { error: restoreError } = await supabase.auth.setSession({
          access_token: currentSession.access_token,
          refresh_token: currentSession.refresh_token,
        });
        
        if (restoreError) {
           console.error('[ADMIN] Failed to restore admin session:', restoreError);
        }
      }
    }
  },
};
