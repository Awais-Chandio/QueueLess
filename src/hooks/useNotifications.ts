import { useEffect, useCallback } from 'react';
import messaging from '@react-native-firebase/messaging';
import { fcmService } from '../services/fcmService';
import { useNotificationsStore } from '../store/notificationsStore';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { toastService } from '../services/toastService';
import type { Notification } from '../types/notification';

export const useNotifications = () => {
    const { user } = useAuthStore();
    const { 
        setFcmToken, 
        setPermissionGranted, 
        upsertNotification,
        fcmToken 
    } = useNotificationsStore();

    /**
     * Updates the fcm_token column in Supabase profiles table
     */
    const updateTokenInSupabase = useCallback(async (token: string | null) => {
        if (!user) return;
        
        try {
            if (__DEV__) {
                console.log('[useNotifications] Syncing FCM token to Supabase profiles...', { userId: user.id, hasToken: !!token });
            }
            const { error } = await supabase
                .from('profiles')
                .update({ fcm_token: token } as any)
                .eq('id', user.id);

            if (error) throw error;
        } catch (error) {
            if (__DEV__) {
                console.warn('[useNotifications] Failed to sync FCM token to Supabase:', error);
            }
        }
    }, [user]);

    /**
     * Initializes FCM, requests permissions, and retrieves token
     */
    const initializeFCM = useCallback(async () => {
        // 1. Request permission
        const hasPermission = await fcmService.requestPermission();
        setPermissionGranted(hasPermission);
        
        if (!hasPermission) {
            if (__DEV__) console.log('[useNotifications] Notification permission denied.');
            return;
        }

        // 2. Retrieve token
        const token = await fcmService.getToken();
        setFcmToken(token);
        
        if (token && user) {
            await updateTokenInSupabase(token);
        }
    }, [user, setFcmToken, setPermissionGranted, updateTokenInSupabase]);

    useEffect(() => {
        // Initialize permissions and token on mount
        initializeFCM();

        // 3. Listen to token refreshes
        const unsubscribeTokenRefresh = fcmService.onTokenRefresh(async (newToken) => {
            setFcmToken(newToken);
            if (user) {
                await updateTokenInSupabase(newToken);
            }
        });

        // 4. Handle Foreground Notifications
        const unsubscribeOnMessage = messaging().onMessage(async (remoteMessage) => {
            if (__DEV__) {
                console.log('[useNotifications] Foreground message received:', remoteMessage);
            }

            const title = remoteMessage.notification?.title || remoteMessage.data?.title as string || 'New Notification';
            const body = remoteMessage.notification?.body || remoteMessage.data?.body as string || '';

            // Add to Zustand store using standard Notification type
            const newNotif: Notification = {
                id: remoteMessage.messageId || Math.random().toString(36).substring(7),
                user_id: user?.id || 'anonymous',
                type: (remoteMessage.data?.type as string) || 'push',
                title,
                message: body,
                is_read: false,
                created_at: new Date().toISOString(),
                data: remoteMessage.data,
            };

            upsertNotification(newNotif);

            // Display standard toast notification
            toastService.success(`${title}\n${body}`);
        });

        // 5. Handle Background/Quit state notification clicks (when app is opened from notification)
        const unsubscribeOnNotificationOpened = messaging().onNotificationOpenedApp((remoteMessage) => {
            if (__DEV__) {
                console.log('[useNotifications] App opened from background state by notification click:', remoteMessage);
            }
            // Optional: Implement custom navigation or state change based on remoteMessage.data here
        });

        // Check if app was opened from completely quit state by notification click
        messaging()
            .getInitialNotification()
            .then((remoteMessage) => {
                if (remoteMessage) {
                    if (__DEV__) {
                        console.log('[useNotifications] App opened from quit state by notification click:', remoteMessage);
                    }
                    // Optional: Implement custom navigation or state change here
                }
            })
            .catch((err) => {
                if (__DEV__) console.warn('[useNotifications] Error getting initial notification:', err);
            });

        return () => {
            unsubscribeTokenRefresh();
            unsubscribeOnMessage();
            unsubscribeOnNotificationOpened();
        };
    }, [user, initializeFCM, setFcmToken, upsertNotification, updateTokenInSupabase]);

    return {
        fcmToken,
        initializeFCM,
        updateTokenInSupabase,
    };
};
