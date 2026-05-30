import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
} from 'react-native';

import ScreenWrapper from '../../components/common/ScreenWrapper';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';

import { useAuthStore } from '../../store/authStore';
import { bookingsService } from '../../services/bookings/bookingsService';

import { colors, spacing, typography } from '../../theme';

import type { Booking } from '../../types/booking';

const MyBookingsScreen = () => {
  const user = useAuthStore(state => state.user);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async (isRefresh = false) => {
    if (!user?.id) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    console.log('[DEBUG] MyBookingsScreen: Fetching bookings for user:', user.id);
    if (!isRefresh) {
      setLoading(true);
    }

    try {
      const data = await bookingsService.fetchUserBookings(user.id);
      console.log('[DEBUG] MyBookingsScreen: Fetched bookings:', data.length);
      setBookings(data);
    } catch (error) {
      console.error('[DEBUG] MyBookingsScreen: Failed to fetch bookings:', error);
    }

    setLoading(false);
    setRefreshing(false);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchBookings(true);
  };

  const formatDate = (scheduledAt: string) => {
    const date = new Date(scheduledAt);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (scheduledAt: string) => {
    const date = new Date(scheduledAt);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: Booking['status']) => {
    switch (status) {
      case 'confirmed':
        return colors.success;
      case 'completed':
        return colors.textSecondary;
      case 'cancelled':
        return colors.error;
      case 'pending':
      default:
        return colors.warning;
    }
  };

  const getStatusBackground = (status: Booking['status']) => {
    switch (status) {
      case 'confirmed':
        return '#DCFCE7';
      case 'completed':
        return '#E2E8F0';
      case 'cancelled':
        return '#FEE2E2';
      case 'pending':
      default:
        return '#FEF3C7';
    }
  };

  const formatStatus = (status: Booking['status']) =>
    status.charAt(0).toUpperCase() + status.slice(1);

  if (loading) {
    return (
      <ScreenWrapper>
        <Loader />
      </ScreenWrapper>
    );
  }

  if (bookings.length === 0) {
    return (
      <ScreenWrapper>
        <EmptyState
          title="No Bookings"
          subtitle="You haven't booked anything yet"
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>My Bookings</Text>

        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.titleBlock}>
                  <Text style={styles.serviceName}>
                    {item.service?.name ?? 'Selected Service'}
                  </Text>

                  <Text style={styles.centerName}>
                    {item.center?.name ?? 'Assigned Center'}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusBackground(item.status) },
                  ]}>
                  <Text
                    style={[
                      styles.statusText,
                      { color: getStatusColor(item.status) },
                    ]}>
                    {formatStatus(item.status)}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.detailsRow}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Date</Text>
                  <Text style={styles.detailValue}>
                    {formatDate(item.scheduled_at)}
                  </Text>
                </View>

                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Time</Text>
                  <Text style={styles.detailValue}>
                    {formatTime(item.scheduled_at)}
                  </Text>
                </View>
              </View>

              <View style={styles.footerRow}>
                <Text style={styles.footerText}>
                  {item.service?.duration_minutes
                    ? `${item.service.duration_minutes} min`
                    : 'Duration pending'}
                </Text>

                <Text style={styles.footerText}>
                  {typeof item.service?.price === 'number'
                    ? `Rs. ${item.service.price}`
                    : 'Price pending'}
                </Text>
              </View>

              {!!item.center?.address && (
                <Text style={styles.address}>
                  {item.center.address}
                </Text>
              )}
            </View>
          )}
        />
      </View>
    </ScreenWrapper>
  );
};

export default MyBookingsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  title: {
    fontSize: typography.h1,
    fontWeight: 'bold',
    marginBottom: spacing.lg,
    color: colors.text,
  },

  listContent: {
    paddingBottom: spacing.xl,
  },

  card: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
  },

  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },

  titleBlock: {
    flex: 1,
  },

  serviceName: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },

  centerName: {
    fontSize: typography.small,
    color: colors.textSecondary,
  },

  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },

  statusText: {
    fontSize: typography.caption,
    fontWeight: '700',
  },

  divider: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: spacing.md,
  },

  detailsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },

  detailItem: {
    flex: 1,
  },

  detailLabel: {
    color: colors.textSecondary,
    fontSize: typography.caption,
    marginBottom: spacing.xs,
  },

  detailValue: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '600',
  },

  footerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },

  footerText: {
    color: colors.primary,
    fontSize: typography.small,
    fontWeight: '700',
  },

  address: {
    color: colors.textSecondary,
    fontSize: typography.caption,
    marginTop: spacing.sm,
  },
});
