import { create } from 'zustand';
import type { Notification } from '../types/notification';
import { notificationsService } from '../features/notifications/api/notificationsService';

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

  fetchNotifications: async userId => {
    set({ loading: true, error: null });
    try {
      const notifications = await notificationsService.fetchNotifications(userId);
      console.log('[NOTIFICATIONS_STORE] fetched count:', notifications.length);
      set({
        notifications,
        unreadCount: getUnreadCount(notifications),
        loading: false,
      });
    } catch (error) {
      console.error('[NOTIFICATIONS_STORE] fetch error:', error);
      set({
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load notifications',
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
    }),
}));
