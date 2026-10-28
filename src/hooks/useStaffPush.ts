import { useEffect } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { fcmService } from '../services/fcmService';
import { notificationService } from '../services/notificationService';
import { useAuthStore } from '../store/authStore';
import { useNotificationsStore } from '../store/notificationStore';
import { isFirebaseReady } from '../lib/firebase';
import { logger } from '../utils/logger';

/** Push types sent to clinic staff (supabase/migrations 20261028120100_staff_push.sql). */
export type StaffPushType = 'fee_claim' | 'paid_waiting';
export const isStaffPush = (data: Record<string, unknown> | undefined): boolean =>
  data?.type === 'fee_claim' || data?.type === 'paid_waiting';

/** Android 13+ asks for POST_NOTIFICATIONS (Firebase messaging doesn't); older Android and iOS go through Firebase. */
export const askNotificationPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    if (result !== PermissionsAndroid.RESULTS.GRANTED) return false;
  }
  return fcmService.requestPermission();
};

/**
 * Reception and doctors work from pushes: a new online payment to verify,
 * a paid patient waiting. Asks for permission when the desk or the doctor app
 * opens (the system shows its prompt once), then saves this phone's FCM
 * token for the signed-in user. Patients are asked in context instead
 * (useNotifications).
 */
export const useStaffPush = () => {
  const userId = useAuthStore(state => state.user?.id);
  const setFcmToken = useNotificationsStore(state => state.setFcmToken);
  const setPermissionGranted = useNotificationsStore(state => state.setPermissionGranted);

  useEffect(() => {
    if (!userId || !isFirebaseReady()) return;
    let cancelled = false;
    (async () => {
      try {
        const granted = await askNotificationPermission();
        if (cancelled) return;
        setPermissionGranted(granted);
        if (!granted) return;
        const token = await fcmService.getToken();
        if (!token || cancelled) return;
        setFcmToken(token);
        await notificationService.syncFcmToken(userId, token);
      } catch (error) {
        if (__DEV__) logger.warn('[useStaffPush] could not set up push:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, setFcmToken, setPermissionGranted]);
};
