import { create } from 'zustand';
import type { Notification } from '../types/notification';
import { notificationService } from '../services/notificationService';

type NotificationsState = {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  fetchNotifications: (userId: string) => Promise<void>;
  setNotifications: (notifications: Notification[]) => void;
  upsertNotification: (notification: Notification) => void;
  removeNotification: (notificationId: string) => void;
  reset: () => void;

  // FCM state variables
  fcmToken: string | null;
  permissionGranted: boolean;
  setFcmToken: (token: string | null) => void;
  setPermissionGranted: (granted: boolean) => void;
};

const getUnreadCount = (notifications: Notification[]) =>
  notifications.filter(notification => !notification.is_read).length;

const sortNotifications = (notifications: Notification[]) =>
  [...notifications].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

const upsertNotificationIntoList = (
  notifications: Notification[],
  notification: Notification,
) =>
  sortNotifications([
    notification,
    ...notifications.filter(item => item.id !== notification.id),
  ]);

export const useNotificationsStore = create<NotificationsState>(set => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,

  // FCM state variables default values
  fcmToken: null,
  permissionGranted: false,

  fetchNotifications: async userId => {
    set({ loading: true, error: null });
    try {
      const response = await notificationService.fetchNotifications(userId);
      const notificationsList = Array.isArray(response) ? response : [];
      if (__DEV__) {
        console.log('[NOTIFICATIONS_STORE] fetched count:', notificationsList.length);
      }
      set({
        notifications: notificationsList,
        unreadCount: getUnreadCount(notificationsList),
        loading: false,
      });
    } catch (error) {
      const err = error as any;
      console.error('[NOTIFICATIONS_STORE] fetch error:', {
        code: err?.code ?? 'N/A',
        message: err?.message || 'Failed to load notifications',
      });
      set({
        loading: false,
        error: err?.message || 'Failed to load notifications',
      });
    }
  },

  setNotifications: notifications =>
    set({
      notifications: sortNotifications(notifications),
      unreadCount: getUnreadCount(notifications),
      error: null,
      loading: false,
    }),

  upsertNotification: notification =>
    set(state => {
      const notifications = upsertNotificationIntoList(
        state.notifications,
        notification,
      );

      return {
        notifications,
        unreadCount: getUnreadCount(notifications),
        error: null,
        loading: false,
      };
    }),

  removeNotification: notificationId =>
    set(state => {
      const notifications = state.notifications.filter(
        notification => notification.id !== notificationId,
      );

      return {
        notifications,
        unreadCount: getUnreadCount(notifications),
      };
    }),

  reset: () =>
    set({
      notifications: [],
      unreadCount: 0,
      loading: false,
      error: null,
      fcmToken: null,
      permissionGranted: false,
    }),

  // FCM action setters
  setFcmToken: token => set({ fcmToken: token }),
  setPermissionGranted: granted => set({ permissionGranted: granted }),
}));

// Alias for singular naming convention
export const useNotificationStore = useNotificationsStore;
