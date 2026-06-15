import React, { useCallback, useEffect, useState } from 'react';

import {
  View,
  Text,
  StyleSheet,
} from 'react-native';

import {
  useRoute,
} from '@react-navigation/native';

import type { RouteProp } from '@react-navigation/native';

import ScreenWrapper from '../../components/common/ScreenWrapper';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';

import {
  colors,
  spacing,
  typography,
  radius,
} from '../../theme';

import { appointmentsService } from '../../services/appointments/appointmentsService';
import { useRealtimeQueue } from '../../hooks/useRealtimeQueue';

import type { AppStackParamList } from '../../navigation/types';
import type { AppointmentFull } from '../../types/appointment';

type QueueStatusRouteProp = RouteProp<
  AppStackParamList,
  'QueueStatus'
>;

const QueueStatusScreen = () => {
  const route =
    useRoute<QueueStatusRouteProp>();

  const { appointmentId } = route.params;

  const [appointment, setAppointment] =
    useState<AppointmentFull | null>(null);

  const [loading, setLoading] =
    useState(true);

  const fetchAppointment = useCallback(async () => {
    console.log('[DEBUG] QueueStatusScreen: Fetching appointment:', appointmentId);

    try {
      const data = await appointmentsService.fetchAppointmentById(appointmentId);
      console.log('[DEBUG] QueueStatusScreen: Appointment fetched:', data);
      setAppointment(data);
    } catch (error) {
      console.error(
        '[DEBUG] QueueStatusScreen: Failed to fetch appointment:',
        error instanceof Error ? error.message : error,
      );
    }

    setLoading(false);
  }, [appointmentId]);

  useEffect(() => {
    fetchAppointment();
  }, [fetchAppointment]);

  const {
    queueData,
    loading: queueLoading,
  } = useRealtimeQueue(appointmentId);

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

  const formatNumber = (
    value: number | null | undefined,
    fallback = 'Not available',
  ) => {
    if (typeof value === 'number') {
      return String(value);
    }

    return fallback;
  };

  if (loading) {
    return (
      <ScreenWrapper>
        <Loader />
      </ScreenWrapper>
    );
  }

  if (!appointment) {
    return (
      <ScreenWrapper>
        <EmptyState
          title="Appointment Not Found"
          subtitle="Unable to load queue status."
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>
          Queue Status
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>
            Token Number
          </Text>

          <Text style={styles.value}>
            {appointment.token_number
              ? `#${appointment.token_number}`
              : 'Not assigned yet'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>
            Appointment Date
          </Text>

          <Text style={styles.value}>
            {formatDate(appointment.scheduled_at)}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>
            Appointment Time
          </Text>

          <Text style={styles.value}>
            {formatTime(appointment.scheduled_at)}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>
            Appointment Status
          </Text>

          <Text style={styles.value}>
            {appointment.status}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>
            People Ahead
          </Text>

          <Text style={styles.value}>
            {formatNumber(
              queueData?.people_ahead,
              queueLoading ? 'Loading queue...' : 'Queue pending',
            )}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>
            Estimated Wait
          </Text>

          <Text style={styles.value}>
            {typeof queueData?.estimated_wait_mins === 'number'
              ? `${queueData.estimated_wait_mins} mins`
              : 'Calculating'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>
            Current Position
          </Text>

          <Text style={styles.value}>
            {formatNumber(
              queueData?.current_position,
              queueLoading ? 'Loading queue...' : 'Queue pending',
            )}
          </Text>
        </View>
      </View>
    </ScreenWrapper>
  );
};

export default QueueStatusScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  title: {
    fontSize: typography.h1,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.lg,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },

  label: {
    fontSize: typography.small,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },

  value: {
    fontSize: typography.body,
    color: colors.text,
    fontWeight: '600',
  },

});
