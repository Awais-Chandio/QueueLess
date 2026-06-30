import { useCallback } from "react";
import { InAppBrowser } from 'react-native-inappbrowser-reborn';
import { User } from '@supabase/supabase-js';
import { authService } from '../features/auth/api/authService';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';
import { LoginPayload, SignupPayload } from '../types/auth';
import { profileService } from '../features/profile/api/profileService';

const toAuthError = (error: unknown, fallbackMessage: string) => {
  if (error instanceof Error) {
    return error;
  }

  return new Error(fallbackMessage);
};

// ROLE ARCHITECTURE SAFETY:
// - Roles are read from the `profiles` table (DB truth), never from JWT claims.
// - Changing a user's role does NOT transfer their appointments.
//   Appointments belong to the user_id that booked them, permanently.
// - Staff and admin accounts must be SEPARATE accounts.
//   Do NOT convert a client account into a staff account by changing the role field.
//   The client's historical appointments would remain attached to that user_id,
//   giving the staff member access to their own client appointment history.
const fetchVerifiedProfileRole = async (
  user: User,
) => {
  const { data: profile, error: profileError } =
    await profileService.getProfileById(user.id);

  const isGoogle = user.app_metadata?.provider === 'google' || user.app_metadata?.providers?.includes('google');
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || '';
  const avatar = user.user_metadata?.avatar_url || user.user_metadata?.picture || '';

  if (isGoogle) {
    console.log('GOOGLE_NAME:', fullName);
    console.log('GOOGLE_AVATAR:', avatar);
  }

  if (profile) {
    // If profile already exists and full_name is empty/missing, update it
    if (isGoogle && (!profile.full_name || profile.full_name.trim() === '')) {
      const { data: updated } = await profileService.updateProfile(user.id, {
        full_name: fullName,
        avatar_url: avatar,
        auth_provider: 'google',
      } as any);
      if (updated) {
        useProfileStore.setState({ profile: updated, isLoading: false, error: null });
        return updated.role ?? 'client';
      }
    }
    // Populate the store directly from this fetch — no second read needed.
    useProfileStore.setState({ profile, isLoading: false, error: null });
    return profile.role ?? 'client';
  } else {
    // Profile exists in auth but not in profiles table — create it.
    const createPayload: any = {
      id: user.id,
      full_name: isGoogle ? fullName : (user.user_metadata?.full_name || ''),
      email: user.email || '',
      role: 'client',
    };

    const isPhone = !!user.phone;
    if (isGoogle) {
      createPayload.avatar_url = avatar;
      createPayload.auth_provider = 'google';
    } else if (isPhone) {
      createPayload.auth_provider = 'phone';
    } else {
      createPayload.auth_provider = 'email';
    }

    const { data: created } = await profileService.createProfile(createPayload);
    if (created) {
      useProfileStore.setState({ profile: created, isLoading: false, error: null });
      return created.role ?? 'client';
    }
  }

  // Profile fetch or creation failed — fall back gracefully.
  await useProfileStore.getState().fetchProfile(user.id);
  return useProfileStore.getState().profile?.role ?? 'client';
};

export const useAuth = () => {
  const {
    session,
    user,
    role,
    isAuthenticated,
    isLoading,
    setSession,
    setRole,
    clearAuth,
    setLoading,
  } = useAuthStore();

  const restoreSession = useCallback(async () => {
    if (__DEV__) console.log('[AUTH] restoreSession started');
    setLoading(true);
    const startTime = Date.now();

    const delayIfNeeded = async () => {
      const elapsed = Date.now() - startTime;
      const remaining = 2000 - elapsed;
      if (remaining > 0) {
        await new Promise<void>(resolve => setTimeout(() => resolve(), remaining));
      }
    };

    try {
      const { data, error } = await authService.getSession();
      if (__DEV__) {
        console.log('[AUTH] getSession result:', { sessionExists: !!data.session, error: error?.message });
      }

      if (error || !data.session) {
        clearAuth();
        useProfileStore.getState().clearProfile();
      } else {
        const currentSession = data.session;
        setSession(currentSession);

        // Verify authorization role from profiles table, not JWT claims.
        try {
          const verifiedRole = await fetchVerifiedProfileRole(currentSession.user);
          setRole(verifiedRole);
          console.log('PROFILE_LOADED');
          console.log('ROLE_SET');
          if (__DEV__) console.log('[useAuth] Auth state changed: SIGNED_IN');
          if (__DEV__) console.log('[AUTH] restoreSession complete');
        } catch (e) {
          if (__DEV__) console.warn('[AUTH] Profile fetch/restore warning:', e);
          setRole('client');
          console.log('ROLE_SET');
        }
      }
    } catch {
      clearAuth();
      useProfileStore.getState().clearProfile();
    } finally {
      await delayIfNeeded();
      setLoading(false);
      console.log('SET_LOADING_FALSE');
      console.log('RESTORE_COMPLETE');
    }
  }, [clearAuth, setRole, setSession, setLoading]);

  const login = useCallback(async (payload: LoginPayload) => {
    if (__DEV__) console.log('[AUTH] login started');
    setLoading(true);

    try {
      const { data, error } = await authService.signIn(payload);
      if (__DEV__) {
        console.log('[AUTH] login result:', { userId: data.user?.id, sessionExists: !!data.session, error: error?.message });
      }

      if (error) {
        throw error;
      }

      if (!data.session || !data.user) {
        throw new Error('Login failed. Please check your email and password.');
      }

      setSession(data.session);

      // Verify authorization role from profiles table, not JWT claims.
      try {
        const verifiedRole = await fetchVerifiedProfileRole(data.user);
        setRole(verifiedRole);
        if (__DEV__) console.log('[useAuth] Auth state changed: SIGNED_IN');
        if (__DEV__) console.log('[AUTH] login complete');
      } catch (e) {
        if (__DEV__) console.warn('[LOGIN] Profile fetch/restore warning:', e);
        setRole('client');
      }
    } catch (error) {
      clearAuth();
      throw toAuthError(error, 'Login failed. Please try again.');
    }
  }, [clearAuth, setRole, setSession, setLoading]);

  const signup = useCallback(async (payload: SignupPayload) => {
    if (__DEV__) console.log('[AUTH] signup started');
    setLoading(true);

    try {
      const { data, error } = await authService.signUp(payload);
      if (__DEV__) {
        console.log('[AUTH] signup result:', { userId: data.user?.id, sessionExists: !!data.session, error: error?.message });
      }

      if (error) {
        throw error;
      }

      if (data.session && data.user) {
        if (__DEV__) console.log('[AUTH] signup success — setting auth');
        setSession(data.session);
        try {
          const verifiedRole = await fetchVerifiedProfileRole(data.user);
          setRole(verifiedRole);
          if (__DEV__) console.log('[useAuth] Auth state changed: SIGNED_IN');
        } catch (e) {
          if (__DEV__) console.warn('[SIGNUP] Profile fetch warning:', e);
          setRole('client');
        }
        return;
      }

      setLoading(false);
    } catch (error) {
      clearAuth();
      throw toAuthError(error, 'Signup failed. Please try again.');
    }
  }, [clearAuth, setRole, setSession, setLoading]);

  const loginWithGoogle = useCallback(async () => {
    if (__DEV__) console.log('[AUTH] loginWithGoogle started');
    setLoading(true);

    try {
      const { data, error } = await authService.signInWithGoogle();
      if (error) {
        throw error;
      }

      if (!data.url) {
        throw new Error('No login URL returned from Supabase.');
      }

      if (await InAppBrowser.isAvailable()) {
        const result = await InAppBrowser.openAuth(
          data.url,
          'queueless://auth/callback',
          {
            // iOS Properties
            dismissButtonStyle: 'cancel',
            preferredBarTintColor: '#0F172A',
            preferredControlTintColor: '#FFFFFF',
            readerMode: false,
            animated: true,
            modalPresentationStyle: 'fullScreen',
            modalTransitionStyle: 'coverVertical',
            modalEnabled: true,
            enableBarCollapsing: true,
            // Android Properties
            showTitle: true,
            toolbarColor: '#0F172A',
            secondaryToolbarColor: '#0F172A',
            navigationBarColor: '#0F172A',
            navigationBarDividerColor: '#0F172A',
            enableUrlBarHiding: true,
            enableDefaultShare: false,
            forceCloseOnRedirection: true,
            showInRecents: true,
          }
        );

        if (result.type === 'success' && result.url) {
          const urlToParse = result.url.includes('#') ? result.url.replace('#', '?') : result.url;
          const parsedUrl = new URL(urlToParse);
          const code = parsedUrl.searchParams.get('code');
          const accessToken = parsedUrl.searchParams.get('access_token');
          const refreshToken = parsedUrl.searchParams.get('refresh_token');

          if (code) {
            const { error: exchangeError } = await authService.exchangeCodeForSession(code);
            if (exchangeError) {
              throw exchangeError;
            }
          } else if (accessToken && refreshToken) {
            const { error: setSessionError } = await authService.setRecoverySession(accessToken, refreshToken);
            if (setSessionError) {
              throw setSessionError;
            }
          }

          await restoreSession();
        } else {
          // If browser flow completed or was dismissed, check if we got a session anyway
          const sessionResult = await authService.getSession();
          if (sessionResult.data.session) {
            await restoreSession();
          }
        }
      } else {
        throw new Error('In-app browser is not supported on this device.');
      }
    } catch (error) {
      // Check if session was successfully established (e.g. via deep link listener) before throwing
      const sessionResult = await authService.getSession();
      if (sessionResult.data.session) {
        if (__DEV__) console.log('[AUTH] Google Sign-In caught error but session exists, restoring session.');
        await restoreSession();
      } else {
        throw toAuthError(error, 'Google Sign-In failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [restoreSession, setLoading]);

  const logout = useCallback(async () => {
    if (__DEV__) console.log('[AUTH] logout started');
    setLoading(true);

    try {
      const { error } = await authService.signOut();

      if (error) {
        throw error;
      }

      clearAuth();
      useProfileStore.getState().clearProfile();
      if (__DEV__) console.log('[AUTH] logout complete, profile cleared');
    } catch (error) {
      setLoading(false);
      throw toAuthError(error, 'Logout failed. Please try again.');
    }
  }, [clearAuth, setLoading]);

  const sendPhoneOtp = useCallback(async (phone: string) => {
    if (__DEV__) console.log('[AUTH] sendPhoneOtp started', phone);
    setLoading(true);
    try {
      const { error } = await authService.signInWithOtp(phone);
      if (error) throw error;
    } catch (error) {
      throw toAuthError(error, 'Failed to send OTP. Please check the phone number.');
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  const verifyPhoneOtp = useCallback(async (phone: string, token: string) => {
    if (__DEV__) console.log('[AUTH] verifyPhoneOtp started', phone);
    setLoading(true);
    try {
      const { data, error } = await authService.verifyOtp(phone, token);
      if (error) throw error;

      if (!data.session || !data.user) {
        throw new Error('Verification failed. Invalid OTP code.');
      }

      setSession(data.session);

      // Verify authorization role from profiles table, not JWT claims.
      try {
        const verifiedRole = await fetchVerifiedProfileRole(data.user);
        setRole(verifiedRole);
        if (__DEV__) console.log('[useAuth] Auth state changed: SIGNED_IN (Phone)');
      } catch (e) {
        if (__DEV__) console.warn('[OTP VERIFY] Profile fetch/restore warning:', e);
        setRole('client');
      }
    } catch (error) {
      clearAuth();
      throw toAuthError(error, 'Verification failed. Please check the OTP and try again.');
    } finally {
      setLoading(false);
    }
  }, [clearAuth, setRole, setSession, setLoading]);

  return {
    session,
    user,
    role,
    isAuthenticated,
    isLoading,
    restoreSession,
    login,
    loginWithGoogle,
    sendPhoneOtp,
    verifyPhoneOtp,
    signup,
    logout,
  };
};
