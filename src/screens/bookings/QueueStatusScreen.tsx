import React, { useEffect, useState } from 'react';

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

type Booking = {
  id: string;

  scheduled_at: string;

  status: string;
};

const QueueStatusScreen = () => {
  const route =
    useRoute<QueueStatusRouteProp>();

  const { bookingId } = route.params;

  const [booking, setBooking] =
    useState<Booking | null>(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    fetchBooking();
  }, []);

  const fetchBooking = async () => {
    console.log('[DEBUG] QueueStatusScreen: Fetching booking:', bookingId);
    const { data, error } = await supabase
      .from('bookings')
      .select('id, scheduled_at, status')
      .eq('id', bookingId)
      .single();

    if (error) {
      console.error('[DEBUG] QueueStatusScreen: Failed to fetch booking:', error.message);
    } else {
      console.log('[DEBUG] QueueStatusScreen: Booking fetched:', data);
      setBooking(data);
    }

    setLoading(false);
  };

  const formatScheduledAt = (scheduledAt: string) => {
    const date = new Date(scheduledAt);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
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

  if (!booking) {
    return (
      <ScreenWrapper>
        <EmptyState
          title="Booking Not Found"
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
            Booking Status
          </Text>

          <Text style={styles.value}>
            {booking.status}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>
            Appointment Date & Time
          </Text>

          <Text style={styles.value}>
            {formatScheduledAt(booking.scheduled_at)}
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
