import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
} from 'react-native';

import ScreenWrapper from '../../components/common/ScreenWrapper';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useAuthStore } from '../../store/authStore';
import { appointmentsService } from '../../services/appointments/appointmentsService';

import { colors, spacing, typography } from '../../theme';

import type { AppStackParamList } from '../../navigation/types';
import type {
  AppointmentFull,
  AppointmentStatus,
} from '../../types/appointment';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;
type StatusFilter = 'all' | AppointmentStatus;

const statusFilters: StatusFilter[] = [
  'all',
  'pending',
  'confirmed',
  'completed',
  'cancelled',
];

const MyAppointmentsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const user = useAuthStore(state => state.user);

  const [appointments, setAppointments] = useState<AppointmentFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStatus, setSelectedStatus] =
    useState<StatusFilter>('all');

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

  useFocusEffect(
    useCallback(() => {
      fetchAppointments();
    }, [fetchAppointments]),
  );

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

  const filteredAppointments =
    selectedStatus === 'all'
      ? appointments
      : appointments.filter(item => item.status === selectedStatus);

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

        <View style={styles.filterRow}>
          {statusFilters.map(status => {
            const selected = selectedStatus === status;

            return (
              <Pressable
                key={status}
                style={[
                  styles.filterButton,
                  selected && styles.filterButtonSelected,
                ]}
                onPress={() => setSelectedStatus(status)}
                accessibilityRole="button"
                accessibilityState={{ selected }}>
                <Text
                  style={[
                    styles.filterText,
                    selected && styles.filterTextSelected,
                  ]}>
                  {status === 'all' ? 'All' : formatStatus(status)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <FlatList
          data={filteredAppointments}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              title="No Matching Appointments"
              subtitle="No appointments found for this status."
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
              ]}
              onPress={() => navigation.navigate('AppointmentDetails', {
                appointmentId: item.id,
              })}
              accessibilityRole="button">
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
            </Pressable>
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

  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },

  filterButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },

  filterButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  filterText: {
    color: colors.textSecondary,
    fontSize: typography.caption,
    fontWeight: '700',
  },

  filterTextSelected: {
    color: colors.background,
  },

  card: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
  },

  cardPressed: {
    opacity: 0.85,
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
