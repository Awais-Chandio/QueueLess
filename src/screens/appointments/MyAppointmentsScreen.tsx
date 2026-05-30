import React, { useCallback, useEffect, useState } from 'react';
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
import { appointmentsService } from '../../services/appointments/appointmentsService';

import { colors, spacing, typography } from '../../theme';

import type { AppointmentFull } from '../../types/appointment';

const MyAppointmentsScreen = () => {
  const user = useAuthStore(state => state.user);

  const [appointments, setAppointments] = useState<AppointmentFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAppointments = useCallback(async (isRefresh = false) => {
    if (!user?.id) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    console.log('[DEBUG] MyAppointmentsScreen: Fetching appointments for user:', user.id);
    if (!isRefresh) {
      setLoading(true);
    }

    try {
      const data = await appointmentsService.fetchUserAppointments(user.id);
      console.log('[DEBUG] MyAppointmentsScreen: Fetched appointments:', data.length);
      setAppointments(data);
    } catch (error) {
      console.error('[DEBUG] MyAppointmentsScreen: Failed to fetch appointments:', error);
    }

    setLoading(false);
    setRefreshing(false);
  }, [user?.id]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAppointments(true);
  };

  const formatDate = (scheduledAt: string) => {
    const date = new Date(scheduledAt);

    if (Number.isNaN(date.getTime())) {
      return scheduledAt;
    }

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (scheduledAt: string) => {
    const date = new Date(scheduledAt);

    if (Number.isNaN(date.getTime())) {
      return scheduledAt;
    }

    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: AppointmentFull['status']) => {
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

  const getStatusBackground = (status: AppointmentFull['status']) => {
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

  const formatStatus = (status: AppointmentFull['status']) =>
    status.charAt(0).toUpperCase() + status.slice(1);

  if (loading) {
    return (
      <ScreenWrapper>
        <Loader />
      </ScreenWrapper>
    );
  }

  if (appointments.length === 0) {
    return (
      <ScreenWrapper>
        <EmptyState
          title="No Appointments"
          subtitle="You don't have any appointments yet"
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>My Appointments</Text>

        <FlatList
          data={appointments}
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
                    {item.service_name ?? 'Selected Service'}
                  </Text>

                  <Text style={styles.centerName}>
                    {item.center_name ?? 'Assigned Center'}
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

              {typeof item.token_number === 'number' && (
                <View style={styles.tokenRow}>
                  <Text style={styles.tokenLabel}>Token</Text>
                  <Text style={styles.tokenValue}>
                    #{item.token_number}
                  </Text>
                </View>
              )}
            </View>
          )}
        />
      </View>
    </ScreenWrapper>
  );
};

export default MyAppointmentsScreen;

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

  tokenRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },

  tokenLabel: {
    color: colors.textSecondary,
    fontSize: typography.caption,
  },

  tokenValue: {
    color: colors.primary,
    fontSize: typography.small,
    fontWeight: '700',
  },
});
