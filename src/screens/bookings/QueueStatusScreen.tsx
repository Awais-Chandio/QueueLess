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

  booking_date: string;

  booking_time: string;

  status: string;

  queue_number: number | null;
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
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (error) {
      console.log(error.message);
    } else {
      setBooking(data);
    }

    setLoading(false);
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
            Queue Number
          </Text>

          <Text style={styles.queue}>
            {booking.queue_number ?? '--'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>
            Appointment Date
          </Text>

          <Text style={styles.value}>
            {booking.booking_date}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>
            Appointment Time
          </Text>

          <Text style={styles.value}>
            {booking.booking_time}
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

  queue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.primary,
  },
});