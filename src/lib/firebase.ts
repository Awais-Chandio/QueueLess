import { getApps } from '@react-native-firebase/app';

/**
 * Whether the native Firebase app exists. It doesn't on iOS builds without
 * GoogleService-Info.plist (AppDelegate skips FirebaseApp.configure() so the
 * app still launches); push notifications are simply off there.
 */
export const isFirebaseReady = (): boolean => {
  try {
    return getApps().length > 0;
  } catch {
    return false;
  }
};
