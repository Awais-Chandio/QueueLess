import { useCallback } from "react";
import { useShallow } from 'zustand/react/shallow';
import { InAppBrowser } from 'react-native-inappbrowser-reborn';
import { User } from '@supabase/supabase-js';
import { authService } from '../services/authService';
import { useAuthStore } from '../stores/authStore';
import { useProfileStore } from '../stores/profileStore';
import { LoginPayload, SignupPayload } from '../types/auth';
import { profileService } from '../services/profileService';
import { firebasePhoneAuth } from '../services/firebasePhoneAuth';
import { fcmService } from '../services/fcmService';
import { useNotificationsStore } from '../stores/notificationStore';
import { supabase } from '../lib/supabase';
import { normalizeUserRole } from '../utils/roleMapping';
import { queryClient } from '../lib/react-query';
import { queryPersister } from '../lib/queryPersister';
import { useAppointmentsStore } from '../stores/appointmentStore';

const toAuthError = (error: unknown, fallbackMessage: string) => {
  if (error instanceof Error) {
    return error;
  }

  return new Error(fallbackMessage);
};

const setAuthState = (payload: {
  profile: any;
  role: any;
  doctorId: string | null;
}) => {
  useProfileStore.setState({ profile: payload.profile, isLoading: false, error: null });
  useAuthStore.setState({
    role: normalizeUserRole(payload.role),
    doctorId: payload.doctorId,
  });
};

// ROLE ARCHITECTURE SAFETY:
// - Roles are read from the `profiles` table (DB truth), never from JWT claims.
// - Changing a user's role does NOT transfer their appointments.
//   Appointments belong to the user_id that booked them, permanently.
// - Staff and admin accounts must be SEPARATE accounts.
//   Do NOT convert a client account into a staff account by changing the role field.
//   The client's historical appointments would remain attached to that user_id,
//   giving the staff member access to their own client appointment history.
const fetchStaffDoctorId = async (): Promise<string | null> => {
  try {
    const __t = Date.now(); console.log('[TMP] staff ctx start');
    const { data } = await supabase.rpc('get_my_staff_context');
    console.log('[TMP] staff ctx done', Date.now() - __t);
    return (data as any)?.[0]?.doctor_id ?? null;
  } catch (err) {
    if (__DEV__) console.warn('[useAuth] getStaffContext error:', err);
    return null;
  }
};

const fetchVerifiedProfileRole = async (
  user: User,
) => {
  // Started alongside the profile read instead of after it, so doctors and
  // staff wait for one round trip at sign-in rather than two.
  const staffContext = fetchStaffDoctorId();
  const { data: profile } =
    await profileService.getProfileById(user.id);

  const isGoogle = user.app_metadata?.provider === 'google' || user.app_metadata?.providers?.includes('google');
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || '';
  const avatar = user.user_metadata?.avatar_url || user.user_metadata?.picture || '';

  if (isGoogle) {
    console.log('GOOGLE_NAME:', fullName);
    console.log('GOOGLE_AVATAR:', avatar);
  }

  let finalProfile = profile;

  if (profile) {
    // If profile already exists and full_name is empty/missing, update it
    if (isGoogle && (!profile.full_name || profile.full_name.trim() === '')) {
      const { data: updated } = await profileService.updateProfile(user.id, {
        full_name: fullName,
        avatar_url: avatar,
        auth_provider: 'google',
      } as any);
      if (updated) {
        finalProfile = updated;
      }
    }
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
      finalProfile = created;
    }
  }

  if (!finalProfile) {
    await useProfileStore.getState().fetchProfile(user.id);
    finalProfile = useProfileStore.getState().profile;
  }

  const profileToUse = finalProfile || { id: user.id, role: 'client' };

  const isStaffRole =
    profileToUse.role === 'doctor' || profileToUse.role === 'staff' || profileToUse.role === 'admin';
  const doctorId = isStaffRole ? await staffContext : null;

  console.log('[TMP] before setAuthState');
  setAuthState({
    profile: profileToUse,
    role: profileToUse.role,
    doctorId,
  });

  console.log('[TMP] after setAuthState');
  return profileToUse.role ?? 'client';
};

export const useAuth = () => {
  const {
    session,
    user,
    role,
    doctorId,
    isAuthenticated,
    isLoading,
    setSession,
    setRole,
    clearAuth,
    setLoading,
  } = useAuthStore(
    // Shallow-selected: App.tsx calls this hook at the root, and taking the
    // whole store re-rendered the entire app on every auth store change.
    useShallow(state => ({
      session: state.session,
      user: state.user,
      role: state.role,
      doctorId: state.doctorId,
      isAuthenticated: state.isAuthenticated,
      isLoading: state.isLoading,
      setSession: state.setSession,
      setRole: state.setRole,
      clearAuth: state.clearAuth,
      setLoading: state.setLoading,
    })),
  );

  const restoreSession = useCallback(async () => {
    if (__DEV__) console.log('[AUTH] restoreSession started');
    setLoading(true);
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
          // fetchVerifiedProfileRole already stored the profile and doctorId.
          setRole(verifiedRole);
          if (__DEV__) console.log('[useAuth] Auth state changed: SIGNED_IN');
          if (__DEV__) console.log('[AUTH] restoreSession complete');
        } catch (e) {
          if (__DEV__) console.warn('[AUTH] Profile fetch/restore warning:', e);
          setRole('client');
        }
      }
    } catch {
      clearAuth();
      useProfileStore.getState().clearProfile();
    } finally {
      // The splash screen enforces its own intro length, so there is no
      // artificial minimum here; it only delayed Google sign-in and reloads.
      setLoading(false);
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
    const userId = user?.id;

    try {
      // These used to run one after another (profile update, FCM delete,
      // Supabase sign-out, Firebase sign-out), so sign-out waited on four
      // network calls. The token clear and the sign-out now run together:
      // the profile update is sent with the current access token, which stays
      // valid until it expires even after the refresh token is revoked.
      const clearServerToken = userId
        ? Promise.resolve(
            supabase.from('profiles').update({ fcm_token: null } as any).eq('id', userId),
          ).catch(dbError => {
            if (__DEV__) console.warn('[useAuth] Failed to clear FCM token from profiles on logout:', dbError);
          })
        : Promise.resolve();

      const [, signOutResult] = await Promise.all([clearServerToken, authService.signOut()]);
      if (signOutResult.error) {
        throw signOutResult.error;
      }

      // Device-local cleanup does not need to hold the UI.
      // The notifications store reset below already clears the token in state.
      fcmService
        .deleteToken()
        .catch(fcmError => {
          if (__DEV__) console.warn('[useAuth] Failed to delete FCM token on logout:', fcmError);
        });
      firebasePhoneAuth.logoutFirebase().catch(fbSignOutError => {
        if (__DEV__) console.warn('[AUTH] Firebase sign out error:', fbSignOutError);
      });

      clearAuth();
      useProfileStore.getState().clearProfile();
      useNotificationsStore.getState().reset();
      useAppointmentsStore.getState().reset();
      // Drop the previous user's cached queries in memory and on disk, so the
      // next account neither sees them nor pays to rehydrate them.
      queryClient.clear();
      queryPersister.removeClient();
      if (__DEV__) console.log('[AUTH] logout complete, profile cleared');
    } catch (error) {
      setLoading(false);
      throw toAuthError(error, 'Logout failed. Please try again.');
    }
  }, [user?.id, clearAuth, setLoading]);

  const sendPhoneOtp = useCallback(async (phone: string) => {
    if (__DEV__) console.log('[AUTH] sendPhoneOtp (Firebase) started', phone);
    try {
      await firebasePhoneAuth.sendOTP(phone);
      if (__DEV__) console.log('[AUTH] Firebase OTP confirmation result stored');
    } catch (error) {
      throw toAuthError(error, 'Failed to send OTP via Firebase. Please check the phone number.');
    }
  }, []);

  const verifyPhoneOtp = useCallback(async (phone: string, token: string) => {
    if (__DEV__) console.log('[AUTH] verifyPhoneOtp (Firebase) started', phone);
    setLoading(true);
    try {
      const userCredential = await firebasePhoneAuth.verifyOTP(token);
      if (!userCredential || !userCredential.user) {
        throw new Error('Verification failed. Invalid OTP code.');
      }

      const fbUser = userCredential.user;
      if (__DEV__) {
        console.log('[AUTH] Firebase user authenticated:', fbUser.uid);
      }

      const { data, error } = await authService.bridgeFirebaseUserToSupabase(fbUser.uid, fbUser.phoneNumber, fbUser.displayName);
      if (error) throw error;

      if (!data || !data.session || !data.user) {
        throw new Error('Verification failed. Unable to establish Supabase session.');
      }

      setSession(data.session);

      // Verify authorization role from profiles table, not JWT claims.
      try {
        const verifiedRole = await fetchVerifiedProfileRole(data.user);
        setRole(verifiedRole);
        if (__DEV__) console.log('[useAuth] Auth state changed: SIGNED_IN (Phone/Firebase Bridge)');
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

  const loginWithPhone = useCallback(async (phone: string) => {
    if (__DEV__) console.log('[AUTH] loginWithPhone started', phone);
    try {
      const success = await firebasePhoneAuth.sendOTP(phone);
      return success;
    } catch (error) {
      throw toAuthError(error, 'Failed to send OTP via Firebase.');
    }
  }, []);

  const verifyPhoneOTP = useCallback(async (code: string) => {
    if (__DEV__) console.log('[AUTH] verifyPhoneOTP started', code);
    try {
      const userCredential = await firebasePhoneAuth.verifyOTP(code);
      if (__DEV__) console.log('[AUTH] verifyPhoneOTP success, returning Firebase user');
      return userCredential.user;
    } catch (error) {
      throw toAuthError(error, 'Failed to verify OTP via Firebase.');
    }
  }, []);

  return {
    session,
    user,
    role,
    doctorId,
    isAuthenticated,
    isLoading,
    restoreSession,
    login,
    loginWithGoogle,
    sendPhoneOtp,
    verifyPhoneOtp,
    signup,
    logout,
    loginWithPhone,
    verifyPhoneOTP,
  };
};
