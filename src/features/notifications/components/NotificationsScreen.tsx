import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Bell, CheckCheck } from 'lucide-react-native';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useTheme } from '../../../hooks/useTheme';
import { useAuthStore } from '../../../store/authStore';
import { useNotificationsStore } from '../../../store/notificationsStore';
import { toastService } from '../../../services/toastService';
import type { Notification } from '../../../types/notification';
import { scaleFont } from '../../../utils/responsive';
import { notificationsService } from '../api/notificationsService';

const NotificationsScreen = () => {
  const { colors, spacing, typography } = useTheme();
  const userId = useAuthStore(state => state.user?.id);
  const storeNotifications = useNotificationsStore(state => state.notifications);
  const loading = useNotificationsStore(state => state.loading);
  const error = useNotificationsStore(state => state.error);
  const fetchNotifications = useNotificationsStore(state => state.fetchNotifications);
  const setNotifications = useNotificationsStore(state => state.setNotifications);
  const [refreshing, setRefreshing] = useState(false);

  const unreadCount = useMemo(
    () =>
      storeNotifications.filter(notification => !notification.is_read).length,
    [storeNotifications],
  );

  const loadNotifications = useCallback(async () => {
    if (!userId) {
      return;
    }

    await fetchNotifications(userId);
  }, [fetchNotifications, userId]);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [loadNotifications]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadNotifications();
    } finally {
      setRefreshing(false);
    }
  }, [loadNotifications]);

  const handleMarkAsRead = useCallback(
    async (notificationId: string) => {
      try {
        await notificationsService.markAsRead(notificationId);
        const nextNotifications = storeNotifications.map(notification =>
          notification.id === notificationId
            ? { ...notification, is_read: true }
            : notification,
        );
        setNotifications(nextNotifications);
      } catch (markError) {
        toastService.error(
          markError instanceof Error
            ? markError.message
            : 'Failed to mark notification as read',
        );
      }
    },
    [setNotifications, storeNotifications],
  );

  const handleMarkAllAsRead = useCallback(async () => {
    if (!userId) {
      return;
    }

    try {
      await notificationsService.markAllAsRead(userId);
      const nextNotifications = storeNotifications.map(notification => ({
        ...notification,
        is_read: true,
      }));
      setNotifications(nextNotifications);
      toastService.success('All notifications marked as read');
    } catch (markError) {
      toastService.error(
        markError instanceof Error
          ? markError.message
          : 'Failed to mark notifications as read',
      );
    }
  }, [setNotifications, storeNotifications, userId]);

  const renderNotification = (item: Notification) => (
    <Pressable
      key={item.id}
      onPress={() => {
        if (!item.is_read) {
          handleMarkAsRead(item.id);
        }
      }}
    >
      <Card
        style={[
          styles.notificationCard,
          {
            marginBottom: spacing.md,
            backgroundColor: item.is_read ? colors.surface : colors.primary + '10',
          },
        ]}
      >
        <View style={[styles.notificationRow, { gap: spacing.md }]}>
          <Bell
            size={scaleFont(20)}
            color={item.is_read ? colors.textSecondary : colors.primary}
          />
          <View style={styles.notificationBody}>
            <Text
              style={[
                styles.notificationTitle,
                {
                  color: colors.text,
                  fontSize: typography.sizes.md,
                },
                item.is_read
                  ? styles.readNotificationTitle
                  : styles.unreadNotificationTitle,
              ]}
            >
              {item.title}
            </Text>
            <Text
              style={[
                styles.notificationMessage,
                {
                  color: colors.textSecondary,
                  fontSize: typography.sizes.sm,
                  marginTop: spacing.xs,
                },
              ]}
            >
              {item.message}
            </Text>
            <Text
              style={[
                styles.notificationTime,
                {
                  color: colors.textSecondary,
                  fontSize: typography.sizes.xs,
                  marginTop: spacing.sm,
                },
              ]}
            >
              {new Date(item.created_at).toLocaleString()}
            </Text>
            {!!item.appointment_id && (
              <Text
                style={[
                  styles.appointmentLink,
                  {
                    color: colors.textSecondary,
                    fontSize: typography.sizes.xs,
                    marginTop: spacing.xs,
                  },
                ]}
              >
                Appointment linked
              </Text>
            )}
          </View>
          {!item.is_read && (
            <View
              style={[
                styles.unreadDot,
                {
                  backgroundColor: colors.primary,
                  borderRadius: scaleFont(4),
                  height: scaleFont(8),
                  marginTop: spacing.sm,
                  width: scaleFont(8),
                },
              ]}
            />
          )}
        </View>
      </Card>
    </Pressable>
  );

  if (error) {
    return (
      <ScreenWrapper>
        <ErrorState
          title="Notifications Unavailable"
          message={error}
          buttonTitle="Retry"
          onRetry={handleRefresh}
        />
      </ScreenWrapper>
    );
  }

  if (!userId) {
    return (
      <ScreenWrapper>
        <EmptyState
          Icon={Bell}
          title="Login Required"
          subtitle="Please login to view alerts."
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <View style={[styles.header, { marginBottom: spacing.lg }]}>
        <View>
          <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl }]}>
            Notifications
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>
            {unreadCount} unread
          </Text>
        </View>
        {unreadCount > 0 && (
          <Pressable
            onPress={handleMarkAllAsRead}
            style={styles.markAllButton}
          >
            <CheckCheck size={scaleFont(16)} color={colors.primary} />
            <Text
              style={[
                styles.markAllText,
                {
                  color: colors.primary,
                  fontSize: typography.sizes.sm,
                  marginLeft: spacing.xs,
                },
              ]}
            >
              Mark all read
            </Text>
          </Pressable>
        )}
      </View>

      {loading && storeNotifications.length === 0 ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={100} />
          <Skeleton height={100} />
          <Skeleton height={100} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.primary}
              onRefresh={handleRefresh}
            />
          }
          contentContainerStyle={styles.listContent}
        >
          {storeNotifications.length === 0 ? (
            <EmptyState
              Icon={Bell}
              title="No Notifications"
              subtitle="You're all caught up!"
            />
          ) : (
            storeNotifications.map(renderNotification)
          )}
        </ScrollView>
      )}
    </ScreenWrapper>
  );
};

export default NotificationsScreen;

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  appointmentLink: {},
  listContent: {
    flexGrow: 1,
  },
  markAllButton: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  markAllText: {
    fontWeight: '600',
  },
  notificationBody: {
    flex: 1,
  },
  notificationCard: {},
  notificationMessage: {
    lineHeight: 20,
  },
  notificationRow: {
    flexDirection: 'row',
  },
  notificationTime: {},
  notificationTitle: {},
  readNotificationTitle: {
    fontWeight: '500',
  },
  title: {
    fontWeight: 'bold',
  },
  unreadDot: {},
  unreadNotificationTitle: {
    fontWeight: '700',
  },
});
