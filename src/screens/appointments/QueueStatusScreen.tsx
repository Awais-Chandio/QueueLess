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

import { supabase } from '../../services/supabase/client';

import type { AppStackParamList } from '../../navigation/types';

type QueueStatusRouteProp = RouteProp<
  AppStackParamList,
  'QueueStatus'
>;

type Appointment = {
  id: string;

  center_id: string;

  service_id: string;

  scheduled_at: string;

  status: string;
};

const QueueStatusScreen = () => {
  const route =
    useRoute<QueueStatusRouteProp>();

  const { appointmentId } = route.params;

  const [appointment, setAppointment] =
    useState<Appointment | null>(null);

  const [loading, setLoading] =
    useState(true);

  const fetchAppointment = useCallback(async () => {
    console.log('[DEBUG] QueueStatusScreen: Fetching appointment:', appointmentId);
    const { data, error } = await supabase
      .from('appointments_full')
      .select('id, user_id, center_id, service_id, scheduled_at, status')
      .eq('id', appointmentId)
      .single();

    if (error) {
      console.error('[DEBUG] QueueStatusScreen: Failed to fetch appointment:', error.message);
    } else {
      console.log('[DEBUG] QueueStatusScreen: Appointment fetched:', data);
      setAppointment(data);
    }

    setLoading(false);
  }, [appointmentId]);

  useEffect(() => {
    fetchAppointment();
  }, [fetchAppointment]);

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
