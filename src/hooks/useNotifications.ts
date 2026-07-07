import { useEffect, useCallback } from 'react';
import {
    getMessaging,
    onMessage,
    onNotificationOpenedApp,
    getInitialNotification,
} from '@react-native-firebase/messaging';
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
        if (!token) return;

        try {
            let activeUserId = user?.id;

            // Ensure active session headers are configured
            const { data: sessionData } = await supabase.auth.getSession();
            const activeSession = sessionData?.session;

            if (activeSession?.user?.id) {
                activeUserId = activeSession.user.id;
            }

            if (!activeUserId) {
                if (__DEV__) console.log('[useNotifications] No active authenticated user found for FCM sync.');
                return;
            }

            if (__DEV__) {
                console.log('[useNotifications] Syncing FCM token to Supabase profiles...', { userId: activeUserId, tokenLength: token.length });
            }

            // Primary: Attempt update via SECURITY DEFINER RPC
            const { error: rpcError } = await supabase.rpc('update_user_fcm_token', {
                p_token: token,
            });

            if (!rpcError) {
                if (__DEV__) console.log('[useNotifications] FCM token synced successfully via RPC.');
                return;
            }

            if (__DEV__) {
                console.warn('[useNotifications] RPC update_user_fcm_token unavailable, trying direct table update:', rpcError.message);
            }

            // Fallback: Direct table update
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ fcm_token: token, updated_at: new Date().toISOString() } as any)
                .eq('id', activeUserId);

            if (updateError) {
                console.error('[useNotifications] Direct profile update for FCM token failed:', {
                    code: updateError.code,
                    message: updateError.message,
                    details: updateError.details,
                    hint: updateError.hint,
                });
                throw updateError;
            }

            if (__DEV__) console.log('[useNotifications] FCM token synced successfully via direct table update.');
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
        const unsubscribeOnMessage = onMessage(getMessaging(), async (remoteMessage) => {
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
        const unsubscribeOnNotificationOpened = onNotificationOpenedApp(getMessaging(), (remoteMessage) => {
            if (__DEV__) {
                console.log('[useNotifications] App opened from background state by notification click:', remoteMessage);
            }
            // Optional: Implement custom navigation or state change based on remoteMessage.data here
        });

        // Check if app was opened from completely quit state by notification click
        getInitialNotification(getMessaging())
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
