import { useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
    getMessaging,
    onMessage,
    onNotificationOpenedApp,
    getInitialNotification,
    AuthorizationStatus,
} from '@react-native-firebase/messaging';
import { fcmService } from '../services/fcmService';
import { useNotificationsStore } from '../store/notificationsStore';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { toastService } from '../services/toastService';
import type { Notification } from '../types/notification';
import type { AppStackParamList } from '../navigation/types';

export const useNotifications = () => {
    const { user } = useAuthStore();
    const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
    const {
        setFcmToken,
        setPermissionGranted,
        upsertNotification,
        fcmToken
    } = useNotificationsStore();

    /**
     * Updates the fcm_token in Supabase device_tokens table
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
                console.log('[useNotifications] Syncing FCM token to Supabase device_tokens...', { userId: activeUserId, tokenLength: token.length });
            }

            // Primary: Attempt update via device_tokens table
            const { error: tokenError } = await supabase
                .from('device_tokens')
                .upsert({
                    user_id: activeUserId,
                    fcm_token: token,
                    platform: Platform.OS,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'fcm_token' });

            if (!tokenError) {
                if (__DEV__) console.log('[useNotifications] FCM token synced successfully via device_tokens table.');
                return;
            }

            if (__DEV__) {
                console.warn('[useNotifications] device_tokens upsert failed, trying direct profiles fallback:', tokenError.message);
            }

            // Fallback: Direct table update to profiles
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ fcm_token: token, updated_at: new Date().toISOString() } as any)
                .eq('id', activeUserId);

            if (updateError) {
                console.error('[useNotifications] Direct profile update for FCM token failed:', {
                    code: updateError.code,
                    message: updateError.message,
                });
                throw updateError;
            }

            if (__DEV__) console.log('[useNotifications] FCM token synced successfully via direct profiles update.');
        } catch (error) {
            if (__DEV__) {
                console.warn('[useNotifications] Failed to sync FCM token to Supabase:', error);
            }
        }
    }, [user]);

    /**
     * Initializes FCM, requests permissions contextually, and retrieves token
     */
    const initializeFCM = useCallback(async (requestIfDenied = false) => {
        let hasPermission = false;
        try {
            // Check current authorization status first
            const authStatus = await getMessaging().hasPermission();
            hasPermission =
                authStatus === AuthorizationStatus.AUTHORIZED ||
                authStatus === AuthorizationStatus.PROVISIONAL;

            if (!hasPermission && requestIfDenied) {
                // Trigger native prompt contextually
                const requestStatus = await fcmService.requestPermission();
                hasPermission = requestStatus;
            }
        } catch (err) {
            if (__DEV__) {
                console.warn('[useNotifications] Permission check error:', err);
            }
        }

        setPermissionGranted(hasPermission);

        if (!hasPermission) {
            if (__DEV__) console.log('[useNotifications] Notification permission not active/granted.');
            return;
        }

        // 2. Retrieve token
        const token = await fcmService.getToken();
        setFcmToken(token);

        if (token && user) {
            await updateTokenInSupabase(token);
        }
    }, [user, setFcmToken, setPermissionGranted, updateTokenInSupabase]);

    const requestPermission = useCallback(async () => {
        await initializeFCM(true);
    }, [initializeFCM]);

    const handleNotificationClick = useCallback((remoteMessage: any) => {
        const appointmentId = remoteMessage?.data?.appointmentId || remoteMessage?.data?.appointment_id;
        if (appointmentId) {
            if (__DEV__) {
                console.log('[useNotifications] App clicked notification for appointment:', appointmentId);
            }
            navigation.navigate('QueueStatus', { appointmentId });
        }
    }, [navigation]);

    useEffect(() => {
        // Initialize permission check (don't request yet if denied/undetermined)
        initializeFCM(false);

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
            handleNotificationClick(remoteMessage);
        });

        // Check if app was opened from completely quit state by notification click
        getInitialNotification(getMessaging())
            .then((remoteMessage) => {
                if (remoteMessage) {
                    if (__DEV__) {
                        console.log('[useNotifications] App opened from quit state by notification click:', remoteMessage);
                    }
                    handleNotificationClick(remoteMessage);
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
    }, [user, initializeFCM, setFcmToken, upsertNotification, updateTokenInSupabase, handleNotificationClick]);

    return {
        fcmToken,
        initializeFCM,
        requestPermission,
        updateTokenInSupabase,
    };
};
