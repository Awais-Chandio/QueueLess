import {
    getMessaging,
    requestPermission,
    getToken,
    deleteToken,
    onTokenRefresh,
    AuthorizationStatus,
} from '@react-native-firebase/messaging';

export const fcmService = {
    /**
     * Request permissions for push notifications on iOS and Android 13+.
     */
    async requestPermission(): Promise<boolean> {
        try {
            const authStatus = await requestPermission(getMessaging());
            const enabled =
                authStatus === AuthorizationStatus.AUTHORIZED ||
                authStatus === AuthorizationStatus.PROVISIONAL;

            if (__DEV__) {
                console.log('[fcmService] Notification authorization status:', authStatus);
            }
            return enabled;
        } catch (error) {
            if (__DEV__) {
                console.warn('[fcmService] Error requesting permission:', error);
            }
            return false;
        }
    },

    /**
     * Retrieve the device's FCM token.
     */
    async getToken(): Promise<string | null> {
        try {
            const token = await getToken(getMessaging());
            if (__DEV__) {
                console.log('[fcmService] Retrieved FCM token:', token);
            }
            return token;
        } catch (error) {
            if (__DEV__) {
                console.warn('[fcmService] Error retrieving FCM token:', error);
            }
            return null;
        }
    },

    /**
     * Delete the current FCM token.
     */
    async deleteToken(): Promise<void> {
        try {
            await deleteToken(getMessaging());
            if (__DEV__) {
                console.log('[fcmService] FCM token deleted locally.');
            }
        } catch (error) {
            if (__DEV__) {
                console.warn('[fcmService] Error deleting FCM token:', error);
            }
        }
    },

    /**
     * Subscribe to token refresh events.
     * @param callback Function to call when a new token is generated.
     * @returns Unsubscribe function.
     */
    onTokenRefresh(callback: (token: string) => void): () => void {
        return onTokenRefresh(getMessaging(), (token) => {
            if (__DEV__) {
                console.log('[fcmService] FCM token refreshed:', token);
            }
            callback(token);
        });
    }
};
