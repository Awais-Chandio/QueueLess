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
import { Bell, CheckCheck, CalendarClock, CheckCircle, BellRing, XCircle, Stethoscope, Info } from 'lucide-react-native';
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
import { CardFadeIn } from '../../../components/animations/CardFadeIn';

// Category metadata per notification type
type NotifMeta = { icon: any; color: string; category: string };
const getNotifMeta = (
  type: string,
  colors: any,
): NotifMeta => {
  switch (type) {
    case 'appointment_booked':
      return { icon: CalendarClock, color: colors.primary, category: 'Appointment' };
    case 'appointment_confirmed':
      return { icon: CheckCircle, color: colors.success, category: 'Appointment' };
    case 'token_called':
      return { icon: BellRing, color: '#8B5CF6', category: 'Queue' };
    case 'appointment_completed':
      return { icon: CheckCheck, color: colors.success, category: 'Appointment' };
    case 'appointment_cancelled':
      return { icon: XCircle, color: colors.error, category: 'Appointment' };
    case 'system':
      return { icon: Stethoscope, color: colors.info, category: 'System' };
    case 'info':
      return { icon: Info, color: colors.info || '#0EA5E9', category: 'Info' };
    default:
      return { icon: Bell, color: colors.primary, category: 'General' };
  }
};

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

  const renderNotification = (item: Notification) => {
    const notificationType = item?.type ?? 'info';
    const notificationData = item?.data ?? {};
    const { icon: NotifIcon, color, category } = getNotifMeta(notificationType, colors);
    const activeColor = item?.is_read ? colors.textSecondary : color;

    return (
      <CardFadeIn delay={100} key={item.id}>
        <Pressable
          onPress={() => {
            if (!item.is_read) {
              handleMarkAsRead(item.id);
            }
          }}
          style={({ pressed }) => pressed ? { opacity: 0.85 } : {}}
        >
          <Card
            style={[
              styles.notificationCard,
              {
                marginBottom: spacing.md,
                backgroundColor: item.is_read ? colors.surface : colors.primary + '06',
                borderLeftWidth: 3,
                borderLeftColor: activeColor + (item.is_read ? '40' : 'CC'),
                overflow: 'hidden',
              },
            ]}
          >
            <View style={[styles.notificationRow, { gap: spacing.md }]}>
              {/* Icon in circle pill */}
              <View
                style={[
                  styles.iconPill,
                  {
                    backgroundColor: activeColor + '18',
                    width: scaleFont(40),
                    height: scaleFont(40),
                    borderRadius: scaleFont(20),
                  },
                ]}
              >
                <NotifIcon size={scaleFont(19)} color={activeColor} />
              </View>

              <View style={styles.notificationBody}>
                {/* Category chip */}
                <View style={[styles.categoryChip, { backgroundColor: activeColor + '14', borderColor: activeColor + '30', marginBottom: scaleFont(4) }]}>
                  <Text style={{ color: activeColor, fontSize: scaleFont(10), fontWeight: '600' }}>
                    {category}
                  </Text>
                </View>

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
                      color: colors.textTertiary,
                      fontSize: typography.sizes.xs,
                      marginTop: spacing.sm,
                    },
                  ]}
                >
                  {new Date(item.created_at).toLocaleString()}
                </Text>
              </View>

              {/* Unread indicator bar */}
              {!item.is_read && (
                <View
                  style={{
                    width: scaleFont(6),
                    height: scaleFont(6),
                    borderRadius: scaleFont(3),
                    backgroundColor: color,
                    alignSelf: 'flex-start',
                    marginTop: scaleFont(4),
                  }}
                />
              )}
            </View>
          </Card>
        </Pressable>
      </CardFadeIn>
    );
  };

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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: scaleFont(8) }}>
          <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl }]}>
            Notifications
          </Text>
          {unreadCount > 0 && (
            <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
              <Text style={{ color: '#FFF', fontSize: scaleFont(11), fontWeight: '700' }}>
                {unreadCount}
              </Text>
            </View>
          )}
        </View>
        {unreadCount > 0 && (
          <Pressable
            onPress={handleMarkAllAsRead}
            style={({ pressed }) => [styles.markAllButton, pressed && { opacity: 0.7 }]}
          >
            <CheckCheck size={scaleFont(15)} color={colors.primary} />
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
  unreadBadge: {
    borderRadius: scaleFont(10),
    paddingHorizontal: scaleFont(7),
    paddingVertical: scaleFont(2),
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    alignItems: 'flex-start',
  },
  notificationTime: {},
  notificationTitle: {},
  readNotificationTitle: {
    fontWeight: '500',
  },
  title: {
    fontWeight: 'bold',
  },
  unreadNotificationTitle: {
    fontWeight: '700',
  },
  iconPill: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  categoryChip: {
    alignSelf: 'flex-start',
    borderRadius: scaleFont(4),
    borderWidth: 1,
    paddingHorizontal: scaleFont(6),
    paddingVertical: scaleFont(2),
  },
});
