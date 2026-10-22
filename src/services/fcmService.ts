import {
    getMessaging,
    requestPermission,
    getToken,
    deleteToken,
    onTokenRefresh,
    AuthorizationStatus,
} from '@react-native-firebase/messaging';
import { logger } from '../utils/logger';
import { isFirebaseReady } from '../lib/firebase';

export const fcmService = {
    /**
     * Request permissions for push notifications on iOS and Android 13+.
     */
    async requestPermission(): Promise<boolean> {
        if (!isFirebaseReady()) return false;
        try {
            const authStatus = await requestPermission(getMessaging());
            const enabled =
                authStatus === AuthorizationStatus.AUTHORIZED ||
                authStatus === AuthorizationStatus.PROVISIONAL;

            if (__DEV__) {
                logger.log('[fcmService] Notification authorization status:', authStatus);
            }
            return enabled;
        } catch (error) {
            if (__DEV__) {
                logger.warn('[fcmService] Error requesting permission:', error);
            }
            return false;
        }
    },

    /**
     * Retrieve the device's FCM token.
     */
    async getToken(): Promise<string | null> {
        if (!isFirebaseReady()) return null;
        try {
            const token = await getToken(getMessaging());
            if (__DEV__) {
                logger.log('[fcmService] Retrieved FCM token:', token);
            }
            return token;
        } catch (error) {
            if (__DEV__) {
                logger.warn('[fcmService] Error retrieving FCM token:', error);
            }
            return null;
        }
    },

    /**
     * Delete the current FCM token.
     */
    async deleteToken(): Promise<void> {
        if (!isFirebaseReady()) return;
        try {
            await deleteToken(getMessaging());
            if (__DEV__) {
                logger.log('[fcmService] FCM token deleted locally.');
            }
        } catch (error) {
            if (__DEV__) {
                logger.warn('[fcmService] Error deleting FCM token:', error);
            }
        }
    },

    /**
     * Subscribe to token refresh events.
     * @param callback Function to call when a new token is generated.
     * @returns Unsubscribe function.
     */
    onTokenRefresh(callback: (token: string) => void): () => void {
        if (!isFirebaseReady()) return () => undefined;
        return onTokenRefresh(getMessaging(), (token) => {
            if (__DEV__) {
                logger.log('[fcmService] FCM token refreshed:', token);
            }
            callback(token);
        });
    }
};
