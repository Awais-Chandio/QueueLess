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
            center_id: payload.role === 'doctor' ? payload.centerId : undefined,
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

      // signUp signs the client in as the new user when email confirmation is off.
      // Restore the admin session now so the writes below run with admin RLS.
      if (currentSession && signUpData.session) {
        const { error: restoreError } = await supabase.auth.setSession({
          access_token: currentSession.access_token,
          refresh_token: currentSession.refresh_token,
        });
        if (restoreError) {
          throw new Error(`Account created, but admin session could not be restored: ${restoreError.message}`);
        }
      }

      // 2. handle_new_user() has already created the profile row; update it as admin.
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: payload.name,
          email: payload.email,
          role: payload.role,
          // Staff centers live only in staff_centers; profiles.center_id is doctor-only.
          center_id: payload.role === 'doctor' ? payload.centerId ?? null : null,
          ...(payload.phone ? { phone: payload.phone } : {}),
        })
        .eq('id', newUserId)
        .select('id')
        .single();

      if (profileError) {
        throw new Error(`Failed to assign role: ${profileError.message}`);
      }

      if (payload.role === 'staff') {
        const centerIds = [...new Set(payload.centerIds ?? [])];
        const { error: assignmentError } = await supabase.from('staff_centers').insert(
          centerIds.map(centerId => ({ profile_id: newUserId, center_id: centerId })),
        );
        if (assignmentError) {
          throw new Error(`Staff account created, but center assignment failed: ${assignmentError.message}`);
        }
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
